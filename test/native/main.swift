import Foundation

var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
  checks += 1
  precondition(condition(), message)
}

let cues = [
  WorkoutCue(at: 0, type: "phase", text: "Warm up for 1 minute.", validUntil: 60, recoveryName: "Warm up"),
  WorkoutCue(at: 30, type: "warn", text: "30 seconds left.", validUntil: 60, recoveryName: nil),
  WorkoutCue(at: 60, type: "phase", text: "Fast for 1 minute.", validUntil: 120, recoveryName: "Fast"),
  WorkoutCue(at: 90, type: "warn", text: "30 seconds left.", validUntil: 120, recoveryName: nil),
  WorkoutCue(at: 120, type: "done", text: "Workout complete.", validUntil: 135, recoveryName: nil),
]

func fresh() -> CueSchedule {
  var schedule = CueSchedule()
  schedule.start(cues: cues, total: 120, now: 1000)
  return schedule
}

var schedule = fresh()
check(schedule.nextCue(now: 1000)?.at == 0, "Start cue fires immediately")
check(schedule.nextCue(now: 1000.1) == nil, "Cues never fire twice")
check(schedule.nextCue(now: 1030)?.type == "warn", "On-time warning plays")
check(schedule.nextCue(now: 1060)?.type == "phase", "Next phase plays on time")
check(schedule.nextCue(now: 1120)?.type == "done", "Completion plays once")
check(schedule.status == "done", "Clock finishes independently of UI")
check(schedule.nextCue(now: 1121) == nil, "Completion cannot repeat")

schedule = fresh()
_ = schedule.nextCue(now: 1000)
let recovered = schedule.nextCue(now: 1065)
check(recovered?.at == 60, "Delayed timer drops old warning and old phase")
check(recovered?.spokenText(at: 65) == "Fast. 55 seconds remaining.", "Recovery announces actual remaining duration")
check(schedule.nextCue(now: 1065) == nil, "Recovery cannot queue duplicates")

schedule = fresh()
_ = schedule.nextCue(now: 1000)
check(schedule.nextCue(now: 1034) == nil, "Obsolete 30-second warning is dropped even within same phase")
check(cues[1].isRelevant(at: 60) == false, "Warning cannot continue into the next phase")
check(cues[0].isRelevant(at: 60) == false, "Old phase speech expires at boundary")

schedule = fresh()
_ = schedule.nextCue(now: 1000)
schedule.pause(now: 1020)
check(schedule.elapsed(now: 1100) == 20, "Pausing freezes elapsed time")
check(schedule.nextCue(now: 1100) == nil, "Pause does not consume cues")
schedule.resume(now: 1100)
check(schedule.nextCue(now: 1110)?.at == 30, "Resume preserves remaining cue offsets")

schedule = fresh()
schedule.pause(now: 1020)
schedule.seek(to: 60, now: 1100)
check(schedule.elapsed(now: 1200) == 60, "Skipping while paused stays frozen at target")
schedule.resume(now: 1200)
check(schedule.nextCue(now: 1200)?.at == 60, "Skipped-to phase fires on resume")

schedule = fresh()
schedule.seek(to: 60, now: 1020)
check(schedule.nextCue(now: 1020)?.at == 60, "Skipping while running announces target immediately")
check(schedule.nextCue(now: 1020) == nil, "Skipped cues never replay")
schedule.seek(to: 120, now: 1030)
check(schedule.nextCue(now: 1030)?.type == "done", "Skipping last phase completes workout")

schedule = fresh()
check(schedule.nextCue(now: 1140) == nil, "Long interruption drops all obsolete cues including completion")
check(schedule.status == "done", "Long interruption still completes the workout")
schedule.stop()
check(schedule.status == "idle" && schedule.elapsed(now: 1200) == 0, "Stop resets the clock")
schedule.start(cues: cues, total: 120, now: 2000)
check(schedule.nextCue(now: 2000)?.at == 0, "Restart gets a clean cue cursor")

print("Passed \(checks) native workout scheduling checks")
