jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  getAvailableVoicesAsync: jest.fn(() => Promise.resolve([])),
}));
jest.mock('expo-audio', () => ({
  AudioModule: { setAudioModeAsync: jest.fn(() => Promise.resolve()) },
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/engine/nativeAudio', () => ({ nativeAudio: null }));

import * as Speech from 'expo-speech';
import { AudioModule, setIsAudioActiveAsync } from 'expo-audio';
import { announce, stopSpeaking, setSelectedVoice, setCalloutMode } from '../src/engine/speech';

async function flush() {
  // Drain the short async chains without advancing watchdog timers.
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

beforeEach(async () => {
  jest.useFakeTimers();
  await stopSpeaking();
  jest.clearAllMocks();
  setSelectedVoice('test-voice');
  setCalloutMode('over');
});

afterEach(async () => {
  await stopSpeaking();
  jest.useRealTimers();
});

it('plays only the newest cue from a delayed burst', async () => {
  announce('Old warning');
  announce('Current phase');
  await flush();
  expect(Speech.speak).toHaveBeenCalledTimes(1);
  expect(Speech.speak.mock.calls[0][0]).toBe('Current phase');
});

it('cancels speech waiting for voice resolution', async () => {
  setSelectedVoice(null);
  let resolveVoices;
  Speech.getAvailableVoicesAsync.mockReturnValueOnce(new Promise((resolve) => { resolveVoices = resolve; }));
  announce('Cancelled prompt');
  await flush();
  const stopped = stopSpeaking();
  resolveVoices([]);
  await stopped;
  await flush();
  expect(Speech.speak).not.toHaveBeenCalled();
});

it('ignores callbacks from superseded speech', async () => {
  await announce('Warning');
  const old = Speech.speak.mock.calls[0][1];
  await announce('New interval');
  AudioModule.setAudioModeAsync.mockClear();
  old.onStopped();
  old.onDone();
  old.onStart();
  await flush();
  expect(AudioModule.setAudioModeAsync).not.toHaveBeenCalled();
  expect(Speech.speak).toHaveBeenCalledTimes(2);
});

it('retries stalled speech once and then releases focus', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await announce('Current interval');
  jest.advanceTimersByTime(3000);
  await flush();
  expect(Speech.speak).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(3000);
  await flush();
  expect(Speech.speak).toHaveBeenCalledTimes(2);
  expect(AudioModule.setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ interruptionMode: 'mixWithOthers' }));
  console.warn.mockRestore();
});

it('never speaks an expired cue', async () => {
  await announce('Old warning', { expiresAt: Date.now() - 1 });
  expect(Speech.speak).not.toHaveBeenCalled();
});

it('stops a warning at its deadline even after speech starts', async () => {
  await announce('30 seconds left', { expiresAt: Date.now() + 1000 });
  Speech.speak.mock.calls[0][1].onStart();
  Speech.stop.mockClear();
  jest.advanceTimersByTime(1000);
  await flush();
  expect(Speech.stop).toHaveBeenCalledTimes(1);
});

it('settles duplicate completion callbacks only once', async () => {
  await announce('Prompt');
  const callbacks = Speech.speak.mock.calls[0][1];
  AudioModule.setAudioModeAsync.mockClear();
  callbacks.onDone();
  callbacks.onStopped();
  callbacks.onError();
  await flush();
  expect(AudioModule.setAudioModeAsync).toHaveBeenCalledTimes(1);
});

it('lets an on-time warning finish after its start deadline', async () => {
  await announce('30 seconds left', {
    startBy: Date.now() + 3000, expiresAt: Date.now() + 30000,
  });
  Speech.speak.mock.calls[0][1].onStart();
  Speech.stop.mockClear();
  jest.advanceTimersByTime(4000);
  await flush();
  expect(Speech.stop).not.toHaveBeenCalled();
});

it('releases paused audio even if the preference changes during a prompt', async () => {
  setCalloutMode('pause');
  await announce('Prompt');
  setCalloutMode('over');
  Speech.speak.mock.calls[0][1].onDone();
  await flush();
  expect(setIsAudioActiveAsync).toHaveBeenCalledWith(false);
  expect(setIsAudioActiveAsync).toHaveBeenLastCalledWith(true);
});
