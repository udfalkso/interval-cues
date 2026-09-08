import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, radius, typography, kindColor } from '../theme';
import PressableScale from '../components/PressableScale';
import haptics from '../utils/haptics';
import useWorkoutsStore from '../store/useWorkoutsStore';
import { useEngine } from '../engine/IntervalEngine';
import { spokenName, formatClock, buildPhases } from '../engine/timeline';

const RING = 280;
const STROKE = 16;
const R = (RING - STROKE) / 2;
const C = 2 * Math.PI * R;

function Ring({ frac, color }) {
  const clamped = Math.max(0, Math.min(1, frac));
  return (
    <Svg width={RING} height={RING}>
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={R}
        stroke={colors.bgElevated}
        strokeWidth={STROKE}
        fill="none"
      />
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={R}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - clamped)}
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}

function ControlButton({ icon, label, onPress, tone = 'neutral', big }) {
  const bg =
    tone === 'primary' ? colors.accent : tone === 'danger' ? colors.errorBg : colors.bgCard;
  const fg = tone === 'primary' ? '#fff' : tone === 'danger' ? colors.error : colors.textPrimary;
  return (
    <PressableScale style={[styles.ctrl, big && styles.ctrlBig, { backgroundColor: bg }]} onPress={onPress}>
      <Ionicons name={icon} size={big ? 30 : 24} color={fg} />
      <Text style={[styles.ctrlLabel, { color: fg }]}>{label}</Text>
    </PressableScale>
  );
}

export default function RunScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const getWorkout = useWorkoutsStore((s) => s.getWorkout);
  const workout = route.params?.workout || getWorkout(route.params?.id);
  const engine = useEngine();

  useEffect(() => {
    if (!workout) navigation.goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout]);

  if (!workout) return <View style={styles.container} />;

  const { status, phase, nextPhase, remainingInPhase, totalRemaining, elapsed, timeline } = engine;
  const active = status === 'running' || status === 'paused';
  const isThisWorkout = engine.workout && engine.workout.id === workout.id;

  const exit = () => {
    engine.stop();
    navigation.goBack();
  };

  // --- Ready state (not started yet) ---------------------------------------
  if (!active && status !== 'done') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <Header title={workout.name || 'Workout'} onClose={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.readyHint}>Ready when you are</Text>
          <Text style={styles.readyTotal}>{formatClock(timelineTotal(workout))}</Text>
          <Text style={styles.readySub}>total · start a podcast first, then press Start</Text>
        </View>
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
          <ControlButton
            icon="play"
            label="Start"
            tone="primary"
            big
            onPress={() => {
              haptics.medium();
              engine.start(workout);
            }}
          />
        </View>
      </View>
    );
  }

  // --- Done state -----------------------------------------------------------
  if (status === 'done' && isThisWorkout) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <Header title={workout.name || 'Workout'} onClose={exit} />
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Text style={styles.doneTitle}>Workout complete</Text>
          <Text style={styles.readySub}>{formatClock(timeline ? timeline.total : 0)} · nice work</Text>
        </View>
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
          <ControlButton icon="checkmark" label="Done" tone="primary" big onPress={exit} />
        </View>
      </View>
    );
  }

  // --- Active state (running / paused) --------------------------------------
  const color = phase ? kindColor(phase.kind) : colors.accent;
  const frac = phase && phase.seconds ? (phase.seconds - remainingInPhase) / phase.seconds : 0;
  const overallFrac = timeline && timeline.total ? elapsed / timeline.total : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Header title={workout.name || 'Workout'} onClose={exit} />

      {/* overall progress */}
      <View style={styles.overallTrack}>
        <View style={[styles.overallFill, { width: `${Math.min(100, overallFrac * 100)}%` }]} />
      </View>

      <View style={styles.center}>
        <Text style={[styles.phaseName, { color }]}>{phase ? spokenName(phase) : ''}</Text>
        {phase && phase.rep ? (
          <Text style={styles.repText}>Interval {phase.rep.index} of {phase.rep.total}</Text>
        ) : (
          <Text style={styles.repText}> </Text>
        )}

        <View style={styles.ringWrap}>
          <Ring frac={frac} color={color} />
          <View style={styles.ringCenter}>
            <Text style={styles.bigTime}>{formatClock(remainingInPhase)}</Text>
            <Text style={styles.bigTimeLabel}>remaining</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Meta label="Next" value={nextPhase ? spokenName(nextPhase) : 'Finish'} />
          <Meta label="Total left" value={formatClock(totalRemaining)} />
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
        <ControlButton icon="play-skip-forward" label="Skip" onPress={() => { haptics.selection(); engine.skipPhase(); }} />
        {status === 'running' ? (
          <ControlButton icon="pause" label="Pause" tone="primary" big onPress={() => { haptics.medium(); engine.pause(); }} />
        ) : (
          <ControlButton icon="play" label="Resume" tone="primary" big onPress={() => { haptics.medium(); engine.resume(); }} />
        )}
        <ControlButton icon="stop" label="Stop" tone="danger" onPress={exit} />
      </View>
    </View>
  );
}

function Header({ title, onClose }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} hitSlop={12} style={styles.headerClose}>
        <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Meta({ label, value }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Small helper so the ready screen can show total without a running timeline.
function timelineTotal(workout) {
  return buildPhases(workout).reduce((s, p) => s + p.seconds, 0);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md },
  headerClose: { width: 26 },
  headerTitle: { ...typography.headline, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  overallTrack: { height: 4, borderRadius: 2, backgroundColor: colors.bgElevated, overflow: 'hidden', marginBottom: spacing.md },
  overallFill: { height: 4, backgroundColor: colors.accent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phaseName: { ...typography.largeTitle, fontWeight: '800' },
  repText: { ...typography.callout, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, minHeight: 20 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  bigTime: { fontSize: 64, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  bigTimeLabel: { ...typography.footnote, color: colors.textTertiary, marginTop: -spacing.xs },
  metaRow: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.xl },
  meta: { alignItems: 'center', minWidth: 120 },
  metaLabel: { ...typography.caption1, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { ...typography.title3, color: colors.textPrimary, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.md },
  ctrl: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, paddingVertical: spacing.md },
  ctrlBig: { flex: 1.4, paddingVertical: spacing.lg },
  ctrlLabel: { ...typography.footnote, marginTop: spacing.xs, fontWeight: '600' },
  readyHint: { ...typography.title3, color: colors.textSecondary },
  readyTotal: { fontSize: 72, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'], marginVertical: spacing.sm },
  readySub: { ...typography.subhead, color: colors.textTertiary, textAlign: 'center' },
  doneTitle: { ...typography.title1, color: colors.textPrimary, marginTop: spacing.md },
});
