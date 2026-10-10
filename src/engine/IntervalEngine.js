import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';

import { buildTimeline, cueId, takeDueCue } from './timeline';
import { nativeAudio, nativeSchedule } from './nativeAudio';
import {
  announce,
  stopSpeaking,
  setMixMode,
  setSpeechRate,
  setSelectedVoice,
  setCalloutMode,
  setKeepAliveControl,
  resolveBestVoice,
  cachedVoice,
} from './speech';
import haptics from '../utils/haptics';
import useWorkoutsStore from '../store/useWorkoutsStore';

// Fallback only. Native iPhone builds own their loop and clock in WorkoutAudio.
const SILENCE = require('../../assets/silence.wav');

const EngineContext = createContext(null);
export const useEngine = () => useContext(EngineContext);

function phaseAt(phases, elapsed) {
  let current = phases[0] || null;
  for (const p of phases) {
    if (elapsed >= p.startSec) current = p;
    else break;
  }
  return current;
}

export function EngineProvider({ children }) {
  const keepAlive = useAudioPlayer(nativeAudio ? null : SILENCE, { keepAudioSessionActive: true });
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
  const statusRef = useRef('idle');
  const actionRef = useRef(0);

  // Keep the screen on while a workout is active (does not affect background).
  const runningLike = status === 'running' || status === 'paused';

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (nativeAudio) {
      resolveBestVoice();
      const applyState = (state) => {
        if (!timelineRef.current) return;
        statusRef.current = state.status;
        setStatus(state.status);
        setElapsed(state.elapsed);
      };
      const subscription = nativeAudio.addListener('onState', applyState);
      const diagnostics = nativeAudio.addListener('onDiagnostic', (event) => {
        if (event.event === 'cueScheduled' && AppState.currentState === 'active') {
          if (event.type === 'phase') haptics.medium();
          else if (event.type === 'done') haptics.success();
        }
        if (event.error || event.event === 'speechRetry') {
          console.warn('[Workout audio]', event);
        }
      });
      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active') nativeAudio.getState().then(applyState).catch(console.warn);
      });
      return () => {
        actionRef.current += 1;
        subscription.remove();
        diagnostics.remove();
        appState.remove();
        nativeAudio.stop().catch(console.warn);
      };
    }
    // Configure the keep-alive player and the initial (mixing) audio session.
    try {
      keepAlive.loop = true;
    } catch (e) {}
    setMixMode();
    resolveBestVoice(); // warm the voice list so the first callout isn't delayed

    // Let speech.js briefly release the keep-alive track when it deactivates the
    // audio session to let a paused app resume (pause mode). Only re-play it
    // while a workout is actually running.
    setKeepAliveControl({
      pause: () => {
        try {
          keepAlive.pause();
        } catch (e) {}
      },
      play: () => {
        if (statusRef.current === 'running') {
          try {
            keepAlive.play();
          } catch (e) {}
        }
      },
    });

    return () => {
      clearTick();
      setKeepAliveControl(null);
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
    setCalloutMode(settings?.calloutMode ?? 'pause');
    if (nativeAudio) {
      nativeAudio.configure(
        settings?.voiceId ?? null,
        settings?.speechRate ?? 0.5,
        settings?.calloutMode ?? 'pause',
      ).catch(console.warn);
    }
  }, [settings?.speechRate, settings?.voiceId, settings?.calloutMode]);

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

    const cue = takeDueCue(tl, e, firedRef.current);
    if (cue) {
      if (cue.type === 'phase') haptics.medium();
      else if (cue.type === 'done') haptics.success();
      const expiresAt = Date.now() + (cue.validUntil - e) * 1000;
      const startBy = cue.type === 'warn'
        ? Math.min(Date.now() + (3 - (e - cue.at)) * 1000, expiresAt)
        : expiresAt;
      announce(cue.text, { expiresAt, startBy });
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
    statusRef.current = 'running';
    setSpeechRate(settings?.speechRate ?? 0.5);
    setSelectedVoice(settings?.voiceId ?? null);
    setCalloutMode(settings?.calloutMode ?? 'pause');
    if (nativeAudio) {
      const action = ++actionRef.current;
      nativeAudio.start(
        nativeSchedule(tl), tl.total, settings?.voiceId || cachedVoice() || null,
        settings?.speechRate ?? 0.5, settings?.calloutMode ?? 'pause',
      ).catch((error) => {
        if (action !== actionRef.current) return;
        statusRef.current = 'idle';
        setStatus('idle');
        nativeAudio.stop().catch(console.warn);
        Alert.alert('Audio could not start', error.message || 'Please try starting the workout again.');
      });
      return;
    }
    try {
      keepAlive.seekTo(0);
      keepAlive.play();
    } catch (e) {}
    startTick();
    runTick(); // fire the t=0 phase cue immediately
  };

  const pause = () => {
    if (status !== 'running') return;
    if (nativeAudio) {
      actionRef.current += 1;
      nativeAudio.pause().catch(console.warn);
      return;
    }
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
    if (nativeAudio) {
      nativeAudio.resume().catch((error) => Alert.alert('Audio could not resume', error.message));
      return;
    }
    pausedAccumRef.current += Date.now() - pausedAtRef.current;
    setStatus('running');
    try {
      keepAlive.play();
    } catch (e) {}
    startTick();
  };

  const stop = () => {
    actionRef.current += 1;
    if (nativeAudio) nativeAudio.stop().catch(console.warn);
    clearTick();
    if (!nativeAudio) stopSpeaking();
    try {
      keepAlive.pause();
    } catch (e) {}
    setStatus('idle');
    statusRef.current = 'idle';
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
    // Let the "workout complete" utterance finish; its callback restores
    // mixing mode. Nothing else to schedule.
  };

  const skipPhase = () => {
    const tl = timelineRef.current;
    if (!tl || (status !== 'running' && status !== 'paused')) return;
    if (nativeAudio) {
      // Read the native clock, rather than a possibly delayed UI update.
      nativeAudio.getState().then((state) => {
        if (timelineRef.current !== tl || !['running', 'paused'].includes(state.status)) return;
        const cur = phaseAt(tl.phases, state.elapsed);
        const next = tl.phases.find((p) => p.startSec > (cur ? cur.startSec : -1));
        return nativeAudio.seek(next ? next.startSec : tl.total);
      }).catch(console.warn);
      return;
    }
    const e = status === 'paused'
      ? (pausedAtRef.current - startedAtRef.current - pausedAccumRef.current) / 1000
      : computeElapsed();
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
