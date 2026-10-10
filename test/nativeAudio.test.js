jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

import { nativeSchedule } from '../src/engine/nativeAudio';
import { buildTimeline } from '../src/engine/timeline';

it('encodes phase boundaries and recovery names for the native clock', () => {
  const timeline = buildTimeline({ announce30sLeft: true, steps: [
    { type: 'segment', kind: 'custom', label: 'Sprint', seconds: 60 },
    { type: 'segment', kind: 'walk', seconds: 45 },
  ] });
  expect(nativeSchedule(timeline)).toEqual([
    expect.objectContaining({ at: 0, type: 'phase', validUntil: 60, recoveryName: 'Sprint' }),
    expect.objectContaining({ at: 30, type: 'warn', validUntil: 60, recoveryName: 'Sprint' }),
    expect.objectContaining({ at: 60, type: 'phase', validUntil: 105, recoveryName: 'Walk' }),
    expect.objectContaining({ at: 75, type: 'warn', validUntil: 105, recoveryName: 'Walk' }),
    expect.objectContaining({ at: 105, type: 'done', validUntil: 120, recoveryName: null }),
  ]);
});
