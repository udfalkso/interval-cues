# Intervals

A personal iPhone app for interval-running workouts with **spoken audio callouts** that
play over a podcast/music — it pauses the other audio for each callout, then resumes.
Works with the screen locked and the phone in your pocket. Built with Expo (SDK 54) /
React Native, reusing the scaffolding and iOS release toolchain from the eden app.

- Home-screen name: **Intervals**  ·  App Store Connect record: **Interval Cues**
- Bundle id: `com.udi.intervals`  ·  Apple Team: `K5FGQ428RU` (personal)

## How it works

- **Configure** multiple workouts as ordered steps: plain segments (Warm up, Fast, Slow,
  Cool down, Walk, or Custom) and **repeat blocks** (e.g. `4× [Fast 4:00, Slow 3:00]`).
- **Run** a workout: a big countdown ring, current/next phase, and a running total.
- **Callouts** are spoken with the system voice (`expo-speech`) at each phase change, an
  optional "30 seconds left", and a completion cue. During each callout the app takes
  exclusive audio focus so the podcast pauses, then releases it so the podcast resumes.
- **Background survival**: a silent looping track (`assets/silence.wav`) keeps the iOS
  audio session — and our JS timer — alive while locked. Timing is computed from the wall
  clock, so cues never drift even if the tick is throttled in the background.

Key files: `src/engine/timeline.js` (pure schedule logic, unit-tested), `src/engine/IntervalEngine.js`
(run engine + keep-alive + cue firing), `src/engine/speech.js` (pause-others announcer),
`src/screens/*` (Workouts / Edit / Run / Settings), `src/theme.js` (design tokens).

## Develop

```bash
yarn                 # install
yarn test            # run the timeline unit tests
yarn ios:sim         # debug build + live reload on a booted simulator
yarn ios             # build & run on a connected device (needed to test audio)
```

Audio ducking + background behavior can only be validated on a **real device**: start a
podcast, start a short workout, lock the phone, and confirm callouts fire on time and the
podcast pauses/resumes.

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
