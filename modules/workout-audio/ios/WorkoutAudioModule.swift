import AVFoundation
import ExpoModulesCore
import os
import UIKit
import Darwin

struct CueRecord: Record {
  @Field var at: Double = 0
  @Field var type: String = "phase"
  @Field var text: String = ""
  @Field var validUntil: Double = 0
  @Field var recoveryName: String?

  var cue: WorkoutCue {
    WorkoutCue(at: at, type: type, text: text, validUntil: validUntil, recoveryName: recoveryName)
  }
}

public final class WorkoutAudioModule: Module {
  private lazy var controller = WorkoutAudioController { [weak self] name, body in
    self?.sendEvent(name, body)
  }

  public func definition() -> ModuleDefinition {
    Name("WorkoutAudio")
    Events("onState", "onDiagnostic")

    AsyncFunction("start") { (cues: [CueRecord], total: Double, voice: String?, rate: Double, mode: String) in
      try self.controller.start(cues: cues.map(\.cue), total: total, voice: voice, rate: rate, mode: mode)
    }.runOnQueue(.main)
    AsyncFunction("pause") { self.controller.pause() }.runOnQueue(.main)
    AsyncFunction("resume") { try self.controller.resume() }.runOnQueue(.main)
    AsyncFunction("stop") { self.controller.stop() }.runOnQueue(.main)
    AsyncFunction("seek") { (target: Double) in self.controller.seek(to: target) }.runOnQueue(.main)
    AsyncFunction("getState") { self.controller.state }.runOnQueue(.main)
    AsyncFunction("configure") { (voice: String?, rate: Double, mode: String) in
      self.controller.configure(voice: voice, rate: rate, mode: mode)
    }.runOnQueue(.main)
    AsyncFunction("preview") { (text: String, voice: String?, rate: Double, mode: String) in
      try self.controller.preview(text: text, voice: voice, rate: rate, mode: mode)
    }.runOnQueue(.main)
    OnDestroy {
      let controller = self.controller
      DispatchQueue.main.async { controller.stop() }
    }
  }
}

// One owner, one serial (main) queue for the clock, speech and audio session.
// No async JS handoffs during focus release; the loop restarts in the same
// native turn so deactivation cannot strand a background JS timer.
private final class WorkoutAudioController: NSObject, AVSpeechSynthesizerDelegate {
  private let emit: (String, [String: Any]) -> Void
  private let log = Logger(subsystem: "com.udi.intervals", category: "WorkoutAudio")
  private var schedule = CueSchedule()
  private var timer: DispatchSourceTimer?
  private var silence: AVAudioPlayer?
  private var synthesizer = AVSpeechSynthesizer()
  private var observers: [NSObjectProtocol] = []
  private var voice: String?
  private var rate = 0.5
  private var mode = "pause"
  private var focused = false
  private var sessionActive = false
  private var interrupted = false
  private var activeCue: WorkoutCue?
  private var activeUtterance: AVSpeechUtterance?
  private var interruptedCue: WorkoutCue?
  private var interruptedCueExpires = 0.0
  private var speechDeadline = 0.0
  private var speechStarted = false
  private var retried = false
  private var nextRecovery = 0.0
  private var lastStateSent = 0.0
  private let secondsPerTick: Double = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return Double(info.numer) / Double(info.denom) / 1_000_000_000
  }()
  // Unlike wall time (user-adjustable) or uptime (which can exclude sleep),
  // continuous time also advances during device sleep and system interruptions.
  private var now: Double { Double(mach_continuous_time()) * secondsPerTick }

  var state: [String: Any] {
    ["status": schedule.status, "elapsed": schedule.elapsed(now: now), "interrupted": interrupted]
  }

  init(emit: @escaping (String, [String: Any]) -> Void) {
    self.emit = emit
    super.init()
    synthesizer.delegate = self
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] in
      self?.handleInterruption($0)
    })
    observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self else { return }
      self.retainInterruptedCue()
      self.cancelSpeech()
      self.silence = nil
      self.synthesizer = AVSpeechSynthesizer()
      self.synthesizer.delegate = self
      self.focused = false
      self.sessionActive = false
      self.interrupted = false
      self.recoverAudio()
    })
    observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] notification in
      // Our own focus changes also post route notifications. Recovering on a
      // category change would undo ducking before the new utterance starts.
      if let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
        AVAudioSession.RouteChangeReason(rawValue: raw) == .categoryChange { return }
      self?.recoverAudio()
    })
    observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      // Some interruptions suspend the app without delivering an end event.
      guard let self else { return }
      self.interrupted = false
      self.recoverAudio()
      self.tick()
    })
  }

  deinit { observers.forEach(NotificationCenter.default.removeObserver) }

  func configure(voice: String?, rate: Double, mode: String) {
    self.voice = voice
    self.rate = max(0.1, min(2, rate))
    self.mode = ["pause", "duck", "over"].contains(mode) ? mode : "pause"
  }

  func start(cues: [WorkoutCue], total: Double, voice: String?, rate: Double, mode: String) throws {
    stop(publish: false)
    configure(voice: voice, rate: rate, mode: mode)
    // Complete setup before starting the clock; a failed activation is surfaced
    // to the user instead of silently starting a workout without audio.
    do {
      try activateMixingLoop()
    } catch {
      releaseFocus(keepRunning: false)
      throw error
    }
    schedule.start(cues: cues, total: total, now: now)
    startTimer()
    tick()
    publishState()
  }

  func preview(text: String, voice: String?, rate: Double, mode: String) throws {
    // Preview must not alter a running workout's speech or audio session.
    guard !["running", "paused"].contains(schedule.status) else { return }
    cancelSpeech()
    configure(voice: voice, rate: rate, mode: mode)
    try activateMixingLoop()
    speak(WorkoutCue(at: schedule.elapsed(now: now), type: "preview", text: text,
                     validUntil: .greatestFiniteMagnitude, recoveryName: nil))
    startTimer()
  }

  func pause() {
    schedule.pause(now: now)
    interruptedCue = nil
    cancelSpeech()
    releaseFocus(keepRunning: false)
    timer?.cancel()
    timer = nil
    publishState()
  }

  func resume() throws {
    guard schedule.status == "paused" else { return }
    do {
      try activateMixingLoop()
    } catch {
      releaseFocus(keepRunning: false)
      throw error
    }
    schedule.resume(now: now)
    startTimer()
    tick()
    publishState()
  }

  func seek(to target: Double) {
    guard ["running", "paused"].contains(schedule.status) else { return }
    cancelSpeech()
    interruptedCue = nil
    schedule.seek(to: target, now: now)
    releaseFocus(keepRunning: schedule.status == "running")
    if schedule.status == "running" { tick() } else { publishState() }
  }

  func stop(publish: Bool = true) {
    timer?.cancel()
    timer = nil
    schedule.stop()
    interruptedCue = nil
    cancelSpeech()
    releaseFocus(keepRunning: false)
    interrupted = false
    if publish { publishState() }
  }

  private func startTimer() {
    timer?.cancel()
    let source = DispatchSource.makeTimerSource(queue: .main)
    source.schedule(deadline: .now(), repeating: .milliseconds(100), leeway: .milliseconds(20))
    source.setEventHandler { [weak self] in self?.tick() }
    timer = source
    source.resume()
  }

  private func tick() {
    let e = schedule.elapsed(now: now)
    if !interrupted {
      if schedule.status == "running", silence?.isPlaying != true, now >= nextRecovery {
        recoverAudio()
      }
      if let cue = activeCue, (e >= cue.validUntil || now >= speechDeadline) {
        let retry = !speechStarted && !retried && cue.isRelevant(at: e)
        diagnostic(retry ? "speechRetry" : "speechExpired", cue: cue)
        cancelSpeech()
        if retry {
          synthesizer.delegate = nil
          synthesizer = AVSpeechSynthesizer()
          synthesizer.delegate = self
          speak(cue, retry: true)
        } else {
          releaseFocus(keepRunning: schedule.status == "running")
        }
      }
      let due = schedule.nextCue(now: now)
      let recovery = interruptedCue.flatMap { cue in
        now < interruptedCueExpires && cue.isRelevant(at: e) ? cue : nil
      }
      interruptedCue = nil
      if let cue = due ?? recovery {
        // A phase transition wins over any earlier unfinished speech.
        cancelSpeech()
        speak(cue)
      }
      if !["running", "paused"].contains(schedule.status), activeCue == nil {
        releaseFocus(keepRunning: false)
        timer?.cancel()
        timer = nil
      }
    }
    if now - lastStateSent >= 0.25 || schedule.status == "done" { publishState() }
  }

  private func makeSilence() throws -> AVAudioPlayer {
    let host = Bundle(for: WorkoutAudioController.self)
    let resources = host.url(forResource: "WorkoutAudioResources", withExtension: "bundle")
      .flatMap(Bundle.init(url:))
    guard let url = resources?.url(forResource: "silence", withExtension: "wav") else {
      throw NSError(domain: "WorkoutAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Background audio resource is missing."])
    }
    let player = try AVAudioPlayer(contentsOf: url)
    player.numberOfLoops = -1
    player.prepareToPlay()
    return player
  }

  private func activateMixingLoop() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try session.setActive(true)
    sessionActive = true
    if silence == nil { silence = try makeSilence() }
    guard silence?.play() == true else {
      throw NSError(domain: "WorkoutAudio", code: 2, userInfo: [NSLocalizedDescriptionKey: "Background audio could not start."])
    }
    interrupted = false
  }

  private func enterFocus() throws {
    let session = AVAudioSession.sharedInstance()
    var options: AVAudioSession.CategoryOptions = [.mixWithOthers]
    if mode != "over" { options.insert(.duckOthers) }
    if mode == "pause" { options.insert(.interruptSpokenAudioAndMixWithOthers) }
    // Remain mixable: exclusive focus can be denied when already backgrounded.
    // Pause targets spoken-audio sessions (podcasts); music is ducked.
    try session.setCategory(.playback, mode: .default, options: options)
    try session.setActive(true)
    sessionActive = true
    focused = true
  }

  private func releaseFocus(keepRunning: Bool) {
    guard !interrupted else { silence?.pause(); return }
    guard sessionActive || focused || keepRunning else { return }
    // Stop our audio before notifying other apps, then immediately restart
    // the background loop in mixing mode, entirely on the native queue.
    if focused || !keepRunning {
      silence?.pause()
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        sessionActive = false
      } catch {
        // iOS can report "busy" as speech tears down its audio unit. Restart
        // the loop anyway; never leave background recovery waiting on a timer.
        diagnostic("audioReleaseFailed", error: error)
      }
    }
    focused = false
    guard keepRunning else { return }
    do {
      try activateMixingLoop()
    } catch {
      nextRecovery = now + 2
      diagnostic("audioRecoveryFailed", error: error)
    }
  }

  private func recoverAudio() {
    guard schedule.status == "running", !interrupted else { return }
    do {
      if activeUtterance != nil {
        try enterFocus()
        if silence == nil { silence = try makeSilence() }
        silence?.play()
      } else {
        try activateMixingLoop()
      }
    } catch {
      nextRecovery = now + 2
      diagnostic("audioRecoveryFailed", error: error)
    }
  }

  private func speak(_ cue: WorkoutCue, retry: Bool = false) {
    activeCue = cue
    speechStarted = false
    retried = retry
    speechDeadline = now + 3
    do {
      try enterFocus()
      let utterance = AVSpeechUtterance(string: cue.spokenText(at: schedule.elapsed(now: now)))
      utterance.voice = voice.flatMap(AVSpeechSynthesisVoice.init(identifier:)) ?? AVSpeechSynthesisVoice(language: "en-US")
      // Match the installed expo-speech's rate conversion.
      utterance.rate = Float(rate) * AVSpeechUtteranceDefaultSpeechRate
      activeUtterance = utterance
      synthesizer.usesApplicationAudioSession = true
      diagnostic("cueScheduled", cue: cue)
      synthesizer.speak(utterance)
    } catch {
      // The start watchdog retries once; future cues always get a fresh attempt.
      diagnostic("audioFocusFailed", cue: cue, error: error)
    }
  }

  private func cancelSpeech() {
    // Invalidate identity before stop: delayed callbacks from an old utterance
    // must not release the new cue's focus or advance a speech queue.
    activeUtterance = nil
    activeCue = nil
    synthesizer.stopSpeaking(at: .immediate)
  }

  private func retainInterruptedCue() {
    guard let cue = activeCue else { return }
    interruptedCue = cue
    interruptedCueExpires = now + max(0, cue.validUntil - schedule.elapsed(now: now))
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in self?.speechSynthesizer(synthesizer, didStart: utterance) }
      return
    }
    guard utterance === activeUtterance else { return }
    speechStarted = true
    // Accommodate slow voices and long custom labels, but bound every utterance.
    speechDeadline = now + min(90, max(10, Double(utterance.speechString.count) / (8 * rate) + 5))
    diagnostic("cueStarted", cue: activeCue)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    finishSpeech(utterance)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    finishSpeech(utterance)
  }

  private func finishSpeech(_ utterance: AVSpeechUtterance) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in self?.finishSpeech(utterance) }
      return
    }
    guard utterance === activeUtterance else { return }
    activeUtterance = nil
    activeCue = nil
    releaseFocus(keepRunning: schedule.status == "running")
    tick()
  }

  private func handleInterruption(_ notification: Notification) {
    guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    if type == .began {
      interrupted = true
      sessionActive = false
      retainInterruptedCue()
      cancelSpeech()
      focused = false
      silence?.pause()
      diagnostic("interruptionBegan")
    } else {
      // The workout clock keeps advancing through system audio interruptions.
      // Resume only current cues, never replay the accumulated backlog.
      interrupted = false
      recoverAudio()
      diagnostic("interruptionEnded")
      tick()
    }
    publishState()
  }

  private func publishState() {
    lastStateSent = now
    // JS is only a view. Avoid queuing UI ticks while another app is in front;
    // foreground activation / getState supplies a fresh snapshot instead.
    if UIApplication.shared.applicationState == .active { emit("onState", state) }
  }

  private func diagnostic(_ event: String, cue: WorkoutCue? = nil, error: Error? = nil) {
    var body: [String: Any] = ["event": event, "elapsed": schedule.elapsed(now: now)]
    if let cue { body["scheduledAt"] = cue.at; body["type"] = cue.type }
    if let error { body["error"] = error.localizedDescription }
    log.info("\(event, privacy: .public) elapsed=\(self.schedule.elapsed(now: self.now)) error=\(error?.localizedDescription ?? "", privacy: .public)")
    if UIApplication.shared.applicationState == .active { emit("onDiagnostic", body) }
  }
}
