import Foundation

struct WorkoutCue {
  let at: Double
  let type: String
  let text: String
  let validUntil: Double
  let recoveryName: String?

  func isRelevant(at elapsed: Double) -> Bool {
    elapsed < validUntil && (type != "warn" || elapsed - at <= 3)
  }

  func spokenText(at elapsed: Double) -> String {
    guard type == "phase", elapsed - at > 3, let name = recoveryName else { return text }
    let remaining = max(1, Int(ceil(validUntil - elapsed)))
    let minutes = remaining / 60
    let seconds = remaining % 60
    var parts: [String] = []
    if minutes > 0 { parts.append("\(minutes) minute\(minutes == 1 ? "" : "s")") }
    if seconds > 0 { parts.append("\(seconds) second\(seconds == 1 ? "" : "s")") }
    return "\(name). \(parts.joined(separator: " ")) remaining."
  }
}

// Independent of React Native and audio; monotonic time avoids clock-change drift.
struct CueSchedule {
  private(set) var status = "idle"
  private(set) var cues: [WorkoutCue] = []
  private(set) var total = 0.0
  private var anchor = 0.0
  private var position = 0.0
  private var cursor = 0

  func elapsed(now: Double) -> Double {
    max(0, position + (status == "running" ? now - anchor : 0))
  }

  mutating func start(cues: [WorkoutCue], total: Double, now: Double) {
    self.cues = cues
    self.total = total
    position = 0
    cursor = 0
    anchor = now
    status = "running"
  }

  mutating func pause(now: Double) {
    guard status == "running" else { return }
    position = elapsed(now: now)
    status = "paused"
  }

  mutating func resume(now: Double) {
    guard status == "paused" else { return }
    anchor = now
    status = "running"
  }

  mutating func seek(to target: Double, now: Double) {
    position = min(total, max(0, target))
    anchor = now
    cursor = cues.firstIndex { $0.at >= position } ?? cues.count
  }

  // Consume overdue cues but return just the newest relevant one. A warning
  // from a previous phase must never precede the current phase announcement.
  mutating func nextCue(now: Double) -> WorkoutCue? {
    guard status == "running" else { return nil }
    let e = elapsed(now: now)
    var latest: WorkoutCue?
    while cursor < cues.count && cues[cursor].at <= e {
      let cue = cues[cursor]
      cursor += 1
      if cue.isRelevant(at: e) { latest = cue }
    }
    if e >= total {
      position = total
      status = "done"
    }
    return latest
  }

  mutating func stop() { self = CueSchedule() }
}
