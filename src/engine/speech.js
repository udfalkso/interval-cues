// Spoken callouts over other audio (podcast/music). How the other audio behaves
// during a callout is user-configurable (calloutMode):
//   'pause' -> take exclusive focus so the other app pauses, then resume it
//   'duck'  -> lower the other app's volume during the callout (instant return)
//   'over'  -> just speak on top; the other app keeps playing at full volume
// Native iPhone workouts use WorkoutAudio; this handles fallback speech only.

import * as Speech from 'expo-speech';
import { nativeAudio } from './nativeAudio';
import { AudioModule, setIsAudioActiveAsync } from 'expo-audio';

// The persistent part of our audio session. Only `interruptionMode` changes.
const BASE_MODE = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  shouldRouteThroughEarpiece: false,
};

async function setMode(interruptionMode) {
  try {
    await AudioModule.setAudioModeAsync({ ...BASE_MODE, interruptionMode });
  } catch (e) {
    // Non-fatal: worst case the other audio isn't paused/ducked for a callout.
  }
}

// interruption mode applied *around a callout* for each user preference.
const CALLOUT_INTERRUPTION = {
  pause: 'doNotMix',      // pauses the other app entirely
  duck: 'duckOthers',     // lowers the other app's volume; returns instantly
  over: 'mixWithOthers',  // no change — voice plays over full-volume audio
};
let calloutMode = 'pause';
let focusedMode = null;

export function setCalloutMode(mode) {
  if (CALLOUT_INTERRUPTION[mode]) calloutMode = mode;
}

// The engine registers controls for its silent keep-alive player so we can
// briefly release it while deactivating the session (see releaseOtherAudio).
let keepAliveControl = null; // { pause(), play() }
export function setKeepAliveControl(control) {
  keepAliveControl = control;
}

// Between callouts we always mix, so the other app plays at full volume.
export const setMixMode = () => setMode('mixWithOthers');
// Entering a callout applies the mode for the current preference.
const enterCalloutFocus = async () => {
  const mode = calloutMode;
  await setMode(CALLOUT_INTERRUPTION[mode]);
  focusedMode = mode;
};

// Hand audio focus back after a callout. For 'pause', a paused app only resumes
// when OUR session actually deactivates (iOS posts .notifyOthersOnDeactivation).
// Our silent keep-alive holds the session active, so briefly pause it, toggle
// the session inactive->active, then resume it so the background timer survives.
async function exitCalloutFocus() {
  const releaseSession = focusedMode === 'pause';
  focusedMode = null;
  await setMixMode();
  if (!releaseSession) return; // duck/over resume via mixWithOthers alone
  try {
    keepAliveControl?.pause?.();
    await setIsAudioActiveAsync(false);
  } catch (e) {}
  try {
    await setIsAudioActiveAsync(true);
  } catch (e) {}
  keepAliveControl?.play?.();
}

// --- voice selection --------------------------------------------------------
// The user can pick any installed voice (persisted as settings.voiceId). When
// unset (null) we auto-pick the best-sounding installed English voice.
let selectedVoiceId = null;
let bestVoice; // identifier string, or undefined for the system default
let voicePromise;

export const cachedVoice = () => bestVoice;

export function setSelectedVoice(id) {
  selectedVoiceId = id || null;
}

// Names of Apple's "novelty" voices — usable but comedic; keep them off the top.
const NOVELTY = [
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'good news', 'jester', 'organ', 'superstar', 'trinoids', 'whisper',
  'wobble', 'zarvox',
];

// Higher = nicer. Prefers Siri / premium / enhanced, English, non-novelty.
export function voiceScore(v) {
  const id = (v.identifier || '').toLowerCase();
  const q = String(v.quality || '').toLowerCase();
  const lang = (v.language || '').toLowerCase();
  let s = 0;
  if (id.includes('siri')) s += 100;
  if (q.includes('premium')) s += 60;
  else if (q.includes('enhanced')) s += 40;
  if (lang === 'en-us') s += 12;
  else if (lang.startsWith('en')) s += 6;
  if (NOVELTY.some((n) => id.includes(n))) s -= 200;
  return s;
}

export function resolveBestVoice() {
  if (voicePromise) return voicePromise;
  voicePromise = (async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const en = voices.filter((v) => (v.language || '').toLowerCase().startsWith('en'));
      const pool = en.length ? en : voices;
      pool.sort((a, b) => voiceScore(b) - voiceScore(a));
      bestVoice = pool[0]?.identifier;
    } catch (e) {
      bestVoice = undefined;
    }
    return bestVoice;
  })();
  return voicePromise;
}

// The active voice id for this utterance: the user's pick, or the auto-best.
async function currentVoice() {
  if (selectedVoiceId) return selectedVoiceId;
  return resolveBestVoice();
}

// Full list for the picker: every installed voice, nicest first.
export async function getVoices() {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices
      .map((v) => ({
        id: v.identifier,
        name: v.name || v.identifier,
        language: v.language || '',
        quality: String(v.quality || 'Default'),
        score: voiceScore(v),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  } catch (e) {
    return [];
  }
}

// --- fallback announcer (Expo Go / Android) ---------------------------------
// Latest prompt wins. Audio mutations are serialized; utterance callbacks and
// async voice lookup can never resurrect a cancelled or superseded prompt.
let generation = 0;
let operation = Promise.resolve();
let watchdog;
let rate = 0.5;

export function setSpeechRate(r) {
  if (typeof r === 'number' && r > 0) rate = r;
}

function serialize(task) {
  operation = operation.catch(() => {}).then(task).catch((error) => {
    console.warn('[Workout speech]', error);
  });
  return operation;
}

function clearWatchdog() {
  clearTimeout(watchdog);
  watchdog = undefined;
}

export function announce(text, { expiresAt = Date.now() + 15000, startBy = expiresAt, voice, retry = false } = {}) {
  if (!text) return;
  const id = ++generation;
  clearWatchdog();
  return serialize(async () => {
    if (id !== generation) return;
    await Speech.stop();
    const resolvedVoice = voice || await currentVoice();
    if (id !== generation) return;
    if (Date.now() >= startBy || Date.now() >= expiresAt) {
      await exitCalloutFocus();
      return;
    }
    await enterCalloutFocus();
    if (id !== generation) return;
    let finished = false;
    const finish = () => {
      if (finished || id !== generation) return;
      finished = true;
      clearWatchdog();
      serialize(async () => {
        if (id !== generation) return;
        await Speech.stop();
        if (id === generation) await exitCalloutFocus();
      });
    };
    const expire = () => {
      if (id !== generation) return;
      finish();
    };
    watchdog = setTimeout(() => {
      if (id !== generation) return;
      if (!retry && Date.now() < startBy && Date.now() < expiresAt) {
        console.warn('[Workout speech] Retrying stalled prompt');
        announce(text, { expiresAt, startBy, voice: resolvedVoice, retry: true });
      } else {
        expire();
      }
    }, Math.max(0, Math.min(3000, startBy - Date.now(), expiresAt - Date.now())));
    try {
      Speech.speak(text, {
        voice: resolvedVoice,
        rate,
        useApplicationAudioSession: true,
        onStart: () => {
          if (finished || id !== generation) return;
          clearWatchdog();
          const durationLimit = Math.min(90000, Math.max(10000, text.length / (8 * rate) * 1000 + 5000));
          watchdog = setTimeout(expire, Math.max(0, Math.min(durationLimit, expiresAt - Date.now())));
        },
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    } catch (error) {
      finish();
    }
  });
}

export function stopSpeaking() {
  const id = ++generation;
  clearWatchdog();
  return serialize(async () => {
    await Speech.stop();
    if (id === generation) await exitCalloutFocus();
  });
}

// Native previews share the workout audio owner, avoiding conflicting sessions.
export async function speakOnce(text, voiceIdOverride) {
  const voice = voiceIdOverride || await currentVoice();
  if (nativeAudio) {
    try {
      await nativeAudio.preview(text, voice ?? null, rate, calloutMode);
    } catch (error) {
      console.warn('[Workout audio preview]', error);
    }
    return;
  }
  return announce(text, { voice, expiresAt: Date.now() + 90000 });
}
