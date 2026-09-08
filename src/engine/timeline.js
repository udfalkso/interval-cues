// Pure, dependency-free logic for turning a saved Workout into:
//   1. a flat list of timed `phases` (with absolute start/end offsets), and
//   2. a sorted list of `cues` (absolute-offset spoken announcements).
//
// Kept pure on purpose so it is trivially unit-testable (see test/timeline.test.js)
// and so the run engine only has to compare the wall clock against cue offsets.

const KIND_WORD = {
  warmup: 'Warm up',
  fast: 'Fast',
  slow: 'Slow',
  cooldown: 'Cool down',
  walk: 'Walk',
};

// Spoken name for a phase: its custom label wins, otherwise the kind's word.
export function spokenName(step) {
  if (step.kind === 'custom' && step.label) return step.label;
  return KIND_WORD[step.kind] || step.label || 'Interval';
}

// "10 minutes", "4 minutes", "90 seconds" -> "1 minute 30 seconds".
export function humanizeDuration(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const parts = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  if (parts.length === 0) return '0 seconds';
  return parts.join(' ');
}

// mm:ss for on-screen timers.
export function formatClock(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Flatten a workout's steps (segments + repeat blocks) into timed phases.
export function buildPhases(workout) {
  const phases = [];
  let t = 0;
  let seq = 0;

  const pushSegment = (segment, rep) => {
    const seconds = Math.max(1, Math.round(segment.seconds || 0));
    const phase = {
      key: `p${seq++}`,
      kind: segment.kind || 'custom',
      label: segment.label || KIND_WORD[segment.kind] || 'Interval',
      seconds,
      startSec: t,
      endSec: t + seconds,
      rep: rep || null, // { index, total } when inside a repeat block
    };
    phases.push(phase);
    t += seconds;
  };

  for (const step of workout.steps || []) {
    if (step.type === 'repeat') {
      const times = Math.max(1, Math.round(step.times || 1));
      for (let i = 0; i < times; i++) {
        for (const inner of step.steps || []) {
          // one nesting level only — inner steps are always segments
          pushSegment(inner, { index: i + 1, total: times });
        }
      }
    } else {
      pushSegment(step, null);
    }
  }

  return phases;
}

export function totalSeconds(workout) {
  return buildPhases(workout).reduce((sum, p) => sum + p.seconds, 0);
}

// The phrase spoken when a phase begins.
export function phaseText(phase) {
  const name = spokenName(phase);
  const dur = humanizeDuration(phase.seconds);
  let text = `${name} for ${dur}`;
  if (phase.rep) text += `, interval ${phase.rep.index} of ${phase.rep.total}`;
  return text + '.';
}

// Build the full ordered cue list for a workout.
//   { at: <seconds from start>, type: 'phase' | 'warn' | 'done', text, phaseKey? }
export function buildCues(workout) {
  const phases = buildPhases(workout);
  const cues = [];

  phases.forEach((phase) => {
    cues.push({ at: phase.startSec, type: 'phase', text: phaseText(phase), phaseKey: phase.key });
    // "30 seconds left" only makes sense on phases long enough to warrant it.
    if (workout.announce30sLeft && phase.seconds >= 45) {
      cues.push({ at: phase.endSec - 30, type: 'warn', text: '30 seconds left.', phaseKey: phase.key });
    }
  });

  const total = phases.reduce((s, p) => s + p.seconds, 0);
  if (total > 0) {
    cues.push({ at: total, type: 'done', text: 'Workout complete. Great job.' });
  }

  // Stable sort by time; phase cues before warn cues that share an offset.
  const rank = { phase: 0, warn: 1, done: 2 };
  return cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at - b.c.at || rank[a.c.type] - rank[b.c.type] || a.i - b.i)
    .map(({ c }) => c);
}

// Everything the run engine needs, computed once at start.
export function buildTimeline(workout) {
  const phases = buildPhases(workout);
  return {
    phases,
    cues: buildCues(workout),
    total: phases.reduce((s, p) => s + p.seconds, 0),
  };
}
