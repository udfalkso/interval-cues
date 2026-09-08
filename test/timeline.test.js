import {
  buildPhases,
  buildCues,
  buildTimeline,
  totalSeconds,
  humanizeDuration,
  phaseText,
} from '../src/engine/timeline';

// Udi's default workout: 10m warm up, 4x [4m fast, 3m slow], 7m cool down.
const defaultWorkout = {
  id: 'default',
  name: 'Cardio Intervals',
  announce30sLeft: true,
  steps: [
    { type: 'segment', kind: 'warmup', label: 'Warm up', seconds: 600 },
    {
      type: 'repeat',
      times: 4,
      steps: [
        { type: 'segment', kind: 'fast', label: 'Fast', seconds: 240 },
        { type: 'segment', kind: 'slow', label: 'Slow', seconds: 180 },
      ],
    },
    { type: 'segment', kind: 'cooldown', label: 'Cool down', seconds: 420 },
  ],
};

describe('buildPhases', () => {
  const phases = buildPhases(defaultWorkout);

  it('expands repeat blocks into a flat phase list', () => {
    // warmup + 4*(fast+slow) + cooldown = 1 + 8 + 1 = 10 phases
    expect(phases).toHaveLength(10);
  });

  it('orders phases warmup -> (fast/slow)x4 -> cooldown', () => {
    expect(phases.map((p) => p.kind)).toEqual([
      'warmup',
      'fast', 'slow', 'fast', 'slow', 'fast', 'slow', 'fast', 'slow',
      'cooldown',
    ]);
  });

  it('computes contiguous absolute offsets', () => {
    expect(phases[0]).toMatchObject({ startSec: 0, endSec: 600 });
    expect(phases[1]).toMatchObject({ startSec: 600, endSec: 840 }); // first fast
    expect(phases[2]).toMatchObject({ startSec: 840, endSec: 1020 }); // first slow
    expect(phases[9]).toMatchObject({ startSec: 2280, endSec: 2700 }); // cool down
  });

  it('tags repeat phases with their interval index/total', () => {
    expect(phases[1].rep).toEqual({ index: 1, total: 4 });
    expect(phases[7].rep).toEqual({ index: 4, total: 4 }); // last fast
    expect(phases[0].rep).toBeNull();
    expect(phases[9].rep).toBeNull();
  });
});

describe('totals', () => {
  it('sums to 2700 seconds (45 minutes)', () => {
    expect(totalSeconds(defaultWorkout)).toBe(2700);
    expect(buildTimeline(defaultWorkout).total).toBe(2700);
  });
});

describe('buildCues', () => {
  const cues = buildCues(defaultWorkout);

  it('emits a phase cue at each phase start', () => {
    const phaseCues = cues.filter((c) => c.type === 'phase');
    expect(phaseCues).toHaveLength(10);
    expect(phaseCues[0]).toMatchObject({ at: 0, text: 'Warm up for 10 minutes.' });
    expect(phaseCues[1]).toMatchObject({
      at: 600,
      text: 'Fast for 4 minutes, interval 1 of 4.',
    });
    expect(phaseCues[2]).toMatchObject({
      at: 840,
      text: 'Slow for 3 minutes, interval 1 of 4.',
    });
  });

  it('emits a 30-seconds-left warn 30s before each qualifying phase end', () => {
    const warns = cues.filter((c) => c.type === 'warn');
    // every phase here is >= 45s, so all 10 qualify
    expect(warns).toHaveLength(10);
    expect(warns[0]).toMatchObject({ at: 570, text: '30 seconds left.' }); // 600 - 30
  });

  it('ends with a completion cue at the total time', () => {
    const last = cues[cues.length - 1];
    expect(last).toMatchObject({ at: 2700, type: 'done' });
  });

  it('is sorted by time', () => {
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].at).toBeGreaterThanOrEqual(cues[i - 1].at);
    }
  });

  it('omits 30s warnings when the workout disables them', () => {
    const cuesOff = buildCues({ ...defaultWorkout, announce30sLeft: false });
    expect(cuesOff.filter((c) => c.type === 'warn')).toHaveLength(0);
  });
});

describe('humanizeDuration', () => {
  it('formats minutes and seconds naturally', () => {
    expect(humanizeDuration(600)).toBe('10 minutes');
    expect(humanizeDuration(60)).toBe('1 minute');
    expect(humanizeDuration(90)).toBe('1 minute 30 seconds');
    expect(humanizeDuration(45)).toBe('45 seconds');
  });
});

describe('phaseText', () => {
  it('uses a custom label for custom-kind phases', () => {
    const p = { kind: 'custom', label: 'Sprint', seconds: 30, rep: null };
    expect(phaseText(p)).toBe('Sprint for 30 seconds.');
  });
});
