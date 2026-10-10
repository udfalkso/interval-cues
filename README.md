# Intervals

A personal iPhone app for interval-running workouts with **spoken audio callouts** that
play alongside a podcast/music — it pauses spoken audio or lowers music for each callout, then resumes.
Works with the screen locked and the phone in your pocket. Built with Expo (SDK 54) /
React Native, reusing the scaffolding and iOS release toolchain from the eden app.

- Home-screen name: **Intervals**  ·  App Store Connect record: **Interval Cues**
- Bundle id: `com.udi.intervals`  ·  Apple Team: `K5FGQ428RU` (personal)

## How it works

- **Configure** multiple workouts as ordered steps: plain segments (Warm up, Fast, Slow,
  Cool down, Walk, or Custom) and **repeat blocks** (e.g. `4× [Fast 4:00, Slow 3:00]`).
- **Run** a workout: a big countdown ring, current/next phase, and a running total.
- **Callouts** use the system voice at each phase change, an optional "30 seconds left",
  and completion. Pause mode uses iOS's spoken-audio interruption option: compatible
  podcasts pause and music lowers; Lower ducks other audio; Over mixes at full volume.
  All modes remain mixable so prompts can take focus from the background.
- **Background timing on iPhone**: the local `WorkoutAudio` Expo module owns a native
  monotonic clock, speech synthesizer and looping audio player. JavaScript updates the
  screen but does not schedule or play cues in development/release iPhone builds. The
  native loop maintains background audio eligibility while Strava or another app is in
  front, with other audio playing or the screen locked. Focus release and loop restart
  happen together on the native queue, without waiting for JavaScript to wake up.
- **Recovery**: old phases and warnings are discarded after a delay/interruption. Only
  the latest relevant cue plays, with the actual remaining duration for a late phase.
  Speech has a start watchdog, one retry and a bounded completion deadline. Cancelled
  utterances cannot release a newer cue's audio focus. Audio interruptions, Bluetooth
  route changes and media-service resets trigger recovery; timing continues through
  system interruptions. iOS can still interrupt audio for calls or stop a force-quit app.
- **Fallback**: Expo Go and Android use the JavaScript announcer with stale-cue filtering
  and speech watchdogs. The native background implementation is iPhone-specific.

Key files: `src/engine/timeline.js` (pure schedule logic, unit-tested), `src/engine/IntervalEngine.js`
(run controls + native state), `modules/workout-audio/ios/` (background clock + audio),
`src/engine/speech.js` (voice picker + fallback announcer),
`src/screens/*` (Workouts / Edit / Run / Settings), `src/theme.js` (design tokens).

## Develop

```bash
yarn                 # install
yarn test            # run the timeline unit tests
yarn test:native     # native scheduling regression checks (requires Xcode/Swift)
yarn ios:prebuild    # link the local native module when upgrading an existing build
yarn ios:sim         # debug build + live reload on a booted simulator
yarn ios             # build & run on a connected device (needed to test audio)
```

The native module requires a new iPhone build; a JavaScript-only update cannot install it.
Audio ducking + background behavior must also be validated on a **real device**:

1. Start a podcast and Strava GPS recording, then a short interval workout in Intervals.
2. Leave Strava in front for several transitions; repeat with the phone locked for at
   least ten minutes. Confirm each prompt arrives on time, without a burst of old cues.
3. Check Pause, Lower and Over with both podcast and music playback. Podcast pausing
   depends on the other app identifying its session as spoken audio.
4. Pause/resume, skip a phase while paused, stop and immediately start a new workout.
   Confirm cancelled prompts do not return and other audio resumes after callouts.
5. Disconnect/reconnect Bluetooth headphones and interrupt with a call or Siri. On
   recovery, confirm the current interval is announced without obsolete warnings.

Device logs under subsystem `com.udi.intervals`, category `WorkoutAudio` record scheduled
and actual speech-start times, retries and audio-session errors.

## Release to TestFlight

Local `xcodebuild` archive/export + `asc builds upload` (ported from eden). One-time setup:

1. `cp .env.release.local.example .env.release.local` and fill in the personal-account
   values (new `ASC_APP_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`; the `.p8` at
   `~/.private_keys/AuthKey_<ASC_KEY_ID>.p8`). Team `K5FGQ428RU` is already the default.
2. Register the bundle id `com.udi.intervals` under the team (`asc` signing setup).
3. Create the App Store Connect app record named **Interval Cues**, then put its app id
   into `.env.release.local` as `ASC_APP_ID`.
4. Ship:

```bash
yarn ios:testflight        # archive -> export -> upload, auto build number
```

Other scripts: `yarn ios:prebuild` (regenerate native `ios/`), `yarn ios:archive`,
`yarn ios:export`.
