jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({ pause: jest.fn(), play: jest.fn() })),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../src/utils/haptics', () => ({ medium: jest.fn(), success: jest.fn() }));
jest.mock('../src/store/useWorkoutsStore', () => ({
  __esModule: true,
  default: (selector) => selector({ settings: { speechRate: 0.5, voiceId: 'voice', calloutMode: 'pause' } }),
}));
jest.mock('../src/engine/speech', () => ({
  announce: jest.fn(), stopSpeaking: jest.fn(), setMixMode: jest.fn(),
  setSpeechRate: jest.fn(), setSelectedVoice: jest.fn(), setCalloutMode: jest.fn(),
  setKeepAliveControl: jest.fn(), resolveBestVoice: jest.fn(), cachedVoice: jest.fn(),
}));
jest.mock('../src/engine/nativeAudio', () => {
  const listeners = {};
  return {
    nativeAudio: {
      start: jest.fn(() => Promise.resolve()), stop: jest.fn(() => Promise.resolve()),
      pause: jest.fn(() => Promise.resolve()), resume: jest.fn(() => Promise.resolve()),
      configure: jest.fn(() => Promise.resolve()), seek: jest.fn(() => Promise.resolve()),
      getState: jest.fn(() => Promise.resolve({ status: 'running', elapsed: 65 })),
      addListener: jest.fn((event, callback) => {
        listeners[event] = callback;
        return { remove: () => delete listeners[event] };
      }),
    },
    nativeSchedule: jest.requireActual('../src/engine/timeline').buildCues,
    emitState: (state) => listeners.onState?.(state),
  };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';
import { EngineProvider, useEngine } from '../src/engine/IntervalEngine';
import { nativeAudio, emitState } from '../src/engine/nativeAudio';
import { announce, setMixMode } from '../src/engine/speech';

global.IS_REACT_ACT_ENVIRONMENT = true;
let engine;
let root;
const workout = { id: 'test', steps: [
  { type: 'segment', kind: 'fast', seconds: 60 },
  { type: 'segment', kind: 'slow', seconds: 60 },
  { type: 'segment', kind: 'walk', seconds: 60 },
] };

function Consumer() {
  engine = useEngine();
  return null;
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await act(async () => { root = create(<EngineProvider><Consumer /></EngineProvider>); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
});

it('delegates the entire workout to native audio without a JS cue timer', async () => {
  const intervals = jest.spyOn(global, 'setInterval');
  await act(async () => engine.start(workout));
  expect(nativeAudio.start).toHaveBeenCalledWith(expect.any(Array), 180, 'voice', 0.5, 'pause');
  expect(setMixMode).not.toHaveBeenCalled();
  expect(intervals).not.toHaveBeenCalled();
  await act(async () => emitState({ status: 'running', elapsed: 65 }));
  expect(engine.phase.kind).toBe('slow');
  expect(engine.remainingInPhase).toBe(55);
  expect(announce).not.toHaveBeenCalled();
  intervals.mockRestore();
});

it('updates paused and resumed views from the native clock', async () => {
  await act(async () => engine.start(workout));
  await act(async () => engine.pause());
  expect(nativeAudio.pause).toHaveBeenCalledTimes(1);
  await act(async () => emitState({ status: 'paused', elapsed: 20 }));
  expect(engine.status).toBe('paused');
  await act(async () => engine.resume());
  expect(nativeAudio.resume).toHaveBeenCalledTimes(1);
  await act(async () => emitState({ status: 'running', elapsed: 21 }));
  expect(engine.remainingInPhase).toBe(39);
});

it('uses native elapsed time when the UI is stale during skip', async () => {
  await act(async () => engine.start(workout));
  expect(engine.elapsed).toBe(0);
  await act(async () => engine.skipPhase());
  expect(nativeAudio.seek).toHaveBeenCalledWith(120);
});

it('ignores late native state after stopping', async () => {
  await act(async () => engine.start(workout));
  await act(async () => engine.stop());
  await act(async () => emitState({ status: 'running', elapsed: 65 }));
  expect(engine.status).toBe('idle');
  expect(engine.timeline).toBeNull();
});

it('shows an audio activation failure rather than running silently', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  nativeAudio.start.mockRejectedValueOnce(new Error('Audio unavailable'));
  await act(async () => engine.start(workout));
  expect(engine.status).toBe('idle');
  expect(alert).toHaveBeenCalledWith('Audio could not start', 'Audio unavailable');
  alert.mockRestore();
});
