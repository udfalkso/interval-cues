import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';

import { buildTimeline } from './timeline';
import {
  announce,
  stopSpeaking,
  setMixMode,
  setSpeechRate,
  setSelectedVoice,
  resolveBestVoice,
} from './speech';
import haptics from '../utils/haptics';
import useWorkoutsStore from '../store/useWorkoutsStore';

// Silent looping track: an actively-playing audio session under
// UIBackgroundModes:['audio'] is what keeps our JS timer running while the
// screen is locked / phone is pocketed.
const SILENCE = require('../../assets/silence.wav');

const EngineContext = createContext(null);
export const useEngine = () => useContext(EngineContext);

const cueId = (cue) => `${cue.type}:${cue.at}:${cue.phaseKey || ''}`;

function phaseAt(phases, elapsed) {
  let current = phases[0] || null;
  for (const p of phases) {
    if (elapsed >= p.startSec) current = p;
    else break;
  }
  return current;
}

export function EngineProvider({ children }) {
  const keepAlive = useAudioPlayer(SILENCE);
  const settings = useWorkoutsStore((s) => s.settings);

  const [status, setStatus] = useState('idle'); // idle | running | paused | done
  const [elapsed, setElapsed] = useState(0);
  const [timeline, setTimeline] = useState(null);
  const [workout, setWorkout] = useState(null);

  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef(0);
  const firedRef = useRef(new Set());
  const timelineRef = useRef(null);
  const tickRef = useRef(null);

  // Keep the screen on while a workout is active (does not affect background).
  const runningLike = status === 'running' || status === 'paused';

  useEffect(() => {
    // Configure the keep-alive player and the initial (mixing) audio session.
    try {
      keepAlive.loop = true;
    } catch (e) {}
    setMixMode();
    resolveBestVoice(); // warm the voice list so the first callout isn't delayed
    return () => {
      clearTick();
      try {
        keepAlive.pause();
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the speech engine in sync with saved preferences (voice + rate),
  // including after async-storage hydration replaces the defaults.
  useEffect(() => {
    setSpeechRate(settings?.speechRate ?? 0.5);
    setSelectedVoice(settings?.voiceId ?? null);
  }, [settings?.speechRate, settings?.voiceId]);

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const computeElapsed = () =>
    (Date.now() - startedAtRef.current - pausedAccumRef.current) / 1000;

  const runTick = () => {
    const tl = timelineRef.current;
    if (!tl) return;
    const e = computeElapsed();
    setElapsed(e);

    for (const cue of tl.cues) {
      if (cue.at <= e && !firedRef.current.has(cueId(cue))) {
        firedRef.current.add(cueId(cue));
        if (cue.type === 'phase') haptics.medium();
        else if (cue.type === 'done') haptics.success();
        announce(cue.text);
      }
    }

    if (e >= tl.total) finish();
  };

  const startTick = () => {
    clearTick();
    tickRef.current = setInterval(runTick, 250);
  };

  const start = (w) => {
    if (!w) return;
    const tl = buildTimeline(w);
    timelineRef.current = tl;
    setTimeline(tl);
    setWorkout(w);
    firedRef.current = new Set();
    startedAtRef.current = Date.now();
    pausedAccumRef.current = 0;
    setElapsed(0);
    setStatus('running');
    setSpeechRate(settings?.speechRate ?? 0.5);
    setSelectedVoice(settings?.voiceId ?? null);
    try {
      keepAlive.seekTo(0);
      keepAlive.play();
    } catch (e) {}
    startTick();
    runTick(); // fire the t=0 phase cue immediately
  };

  const pause = () => {
    if (status !== 'running') return;
    pausedAtRef.current = Date.now();
    setStatus('paused');
    clearTick();
    stopSpeaking(); // release focus so the podcast can play while we're paused
    try {
      keepAlive.pause();
    } catch (e) {}
  };

  const resume = () => {
    if (status !== 'paused') return;
    pausedAccumRef.current += Date.now() - pausedAtRef.current;
    setStatus('running');
    try {
      keepAlive.play();
    } catch (e) {}
    startTick();
  };

  const stop = () => {
    clearTick();
    stopSpeaking();
    try {
      keepAlive.pause();
    } catch (e) {}
    setStatus('idle');
    setElapsed(0);
    timelineRef.current = null;
    setTimeline(null);
    setWorkout(null);
    firedRef.current = new Set();
  };

  const finish = () => {
    clearTick();
    try {
      keepAlive.pause();
    } catch (e) {}
    setStatus('done');
    // Let the "workout complete" utterance finish; its queue drain restores
    // mixing mode. Nothing else to schedule.
  };

  const skipPhase = () => {
    const tl = timelineRef.current;
    if (!tl || (status !== 'running' && status !== 'paused')) return;
    const e = computeElapsed();
    const cur = phaseAt(tl.phases, e);
    const next = tl.phases.find((p) => p.startSec > (cur ? cur.startSec : -1));
    const target = next ? next.startSec : tl.total;

    // Re-anchor the clock so elapsed == target, preserving any paused time.
    startedAtRef.current = Date.now() - pausedAccumRef.current - target * 1000;

    // Mark everything strictly before the new position as already fired so we
    // don't replay skipped cues — but the upcoming phase cue at `target` will
    // still fire on the next tick.
    for (const cue of tl.cues) {
      if (cue.at < target) firedRef.current.add(cueId(cue));
    }
    stopSpeaking();
    if (status === 'paused') {
      setElapsed(target);
    } else {
      runTick();
    }
  };

  // Derived, reactive view of the current position.
  const view = useMemo(() => {
    if (!timeline) {
      return { phase: null, nextPhase: null, remainingInPhase: 0, totalRemaining: 0 };
    }
    const phase = phaseAt(timeline.phases, elapsed);
    const nextPhase = phase
      ? timeline.phases.find((p) => p.startSec >= phase.endSec) || null
      : null;
    const remainingInPhase = phase ? Math.max(0, phase.endSec - elapsed) : 0;
    const totalRemaining = Math.max(0, timeline.total - elapsed);
    return { phase, nextPhase, remainingInPhase, totalRemaining };
  }, [timeline, elapsed]);

  const value = {
    status,
    workout,
    timeline,
    elapsed,
    ...view,
    start,
    pause,
    resume,
    stop,
    skipPhase,
  };

  return (
    <EngineContext.Provider value={value}>
      {runningLike ? <KeepAwake /> : null}
      {children}
    </EngineContext.Provider>
  );
}

// Mounted only while a workout runs, so the screen sleeps normally otherwise.
function KeepAwake() {
  useKeepAwake();
  return null;
}
