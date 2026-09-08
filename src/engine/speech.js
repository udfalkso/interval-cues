// Spoken callouts that PAUSE other audio (podcast/music) for the announcement,
// then release focus so it resumes. All callouts are serialized through a queue
// so a burst of cues can't race the audio-session mode switches.

import * as Speech from 'expo-speech';
import { AudioModule } from 'expo-audio';

// The persistent part of our audio session. Only `interruptionMode` changes:
//  - 'mixWithOthers' while idle/between callouts  -> podcast plays at full volume
//  - 'doNotMix' around a callout                  -> iOS pauses the other app
const BASE_MODE = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  shouldRouteThroughEarpiece: false,
};

async function setMode(interruptionMode) {
  try {
    await AudioModule.setAudioModeAsync({ ...BASE_MODE, interruptionMode });
  } catch (e) {
    // Non-fatal: worst case the podcast isn't paused for a callout.
  }
}

export const setMixMode = () => setMode('mixWithOthers');
export const setExclusiveMode = () => setMode('doNotMix');

// --- voice selection --------------------------------------------------------
// The user can pick any installed voice (persisted as settings.voiceId). When
// unset (null) we auto-pick the best-sounding installed English voice.
let selectedVoiceId = null;
let bestVoice; // identifier string, or undefined for the system default
let voicePromise;

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

// --- serialized announcer ---------------------------------------------------
let queue = [];
let speaking = false;
let rate = 0.5;

export function setSpeechRate(r) {
  if (typeof r === 'number' && r > 0) rate = r;
}

export function announce(text) {
  if (!text) return;
  queue.push(text);
  if (!speaking) drain();
}

async function drain() {
  if (queue.length === 0) {
    // Whole burst finished — release focus so the podcast resumes.
    speaking = false;
    await setMixMode();
    return;
  }
  speaking = true;
  const text = queue.shift();
  // Take exclusive focus first so the other app is paused before we speak.
  await setExclusiveMode();
  const voice = await currentVoice();
  const next = () => drain();
  try {
    Speech.speak(text, {
      voice,
      rate,
      onDone: next,
      onStopped: next,
      onError: next,
    });
  } catch (e) {
    next();
  }
}

// Cancel any queued/in-flight speech and hand audio focus back immediately.
export function stopSpeaking() {
  queue = [];
  speaking = false;
  try {
    Speech.stop();
  } catch (e) {}
  setMixMode();
}

// Speak a one-off phrase (e.g. the Settings "test voice" / voice preview).
// Pass voiceIdOverride to audition a specific voice without selecting it.
export async function speakOnce(text, voiceIdOverride) {
  try {
    Speech.stop();
  } catch (e) {}
  const voice = voiceIdOverride || (await currentVoice());
  await setExclusiveMode();
  Speech.speak(text, {
    voice,
    rate,
    onDone: setMixMode,
    onStopped: setMixMode,
    onError: setMixMode,
  });
}
