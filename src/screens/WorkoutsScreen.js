import React, { useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, radius, typography, shadows, kindColor } from '../theme';
import PressableScale from '../components/PressableScale';
import haptics from '../utils/haptics';
import useWorkoutsStore, { uid, newRepeat } from '../store/useWorkoutsStore';
import { buildPhases, spokenName } from '../engine/timeline';

function summarize(workout) {
  const parts = (workout.steps || []).map((step) => {
    if (step.type === 'repeat') {
      const inner = (step.steps || []).map((s) => spokenName(s)).join('/');
      return `${step.times}× ${inner}`;
    }
    return spokenName(step);
  });
  return parts.join('  ·  ');
}

function totalMinutes(workout) {
  const total = buildPhases(workout).reduce((s, p) => s + p.seconds, 0);
  const m = Math.round(total / 60);
  return `${m} min`;
}

function kindStrip(workout) {
  // A slim multi-color bar previewing the phase sequence.
  const phases = buildPhases(workout);
  const max = 24;
  const shown = phases.slice(0, max);
  return (
    <View style={styles.strip}>
      {shown.map((p, i) => (
        <View
          key={p.key + i}
          style={{ flex: p.seconds, backgroundColor: kindColor(p.kind) }}
        />
      ))}
    </View>
  );
}

function emptyWorkout() {
  return {
    id: uid(),
    name: '',
    announce30sLeft: true,
    steps: [
      { id: uid(), type: 'segment', kind: 'warmup', label: 'Warm up', seconds: 300 },
      newRepeat(),
      { id: uid(), type: 'segment', kind: 'cooldown', label: 'Cool down', seconds: 300 },
    ],
  };
}

export default function WorkoutsScreen({ navigation }) {
  const workouts = useWorkoutsStore((s) => s.workouts);
  const isHydrated = useWorkoutsStore((s) => s.isHydrated);
  const duplicateWorkout = useWorkoutsStore((s) => s.duplicateWorkout);
  const deleteWorkout = useWorkoutsStore((s) => s.deleteWorkout);
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          hitSlop={12}
          onPress={() => navigation.navigate('Settings')}
          style={{ paddingHorizontal: spacing.sm }}
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const onLongPress = (workout) => {
    haptics.medium();
    Alert.alert(workout.name || 'Untitled', undefined, [
      { text: 'Edit', onPress: () => navigation.navigate('EditWorkout', { id: workout.id }) },
      { text: 'Duplicate', onPress: () => duplicateWorkout(workout.id) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete workout?', `"${workout.name || 'Untitled'}" will be removed.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(workout.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const startNew = () => {
    haptics.selection();
    navigation.navigate('EditWorkout', { workout: emptyWorkout(), isNew: true });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + 96,
        }}
      >
        {isHydrated && workouts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="timer-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No workouts yet.</Text>
            <Text style={styles.emptySub}>Tap “New workout” to build your first interval set.</Text>
          </View>
        ) : null}

        {workouts.map((w) => (
          <PressableScale
            key={w.id}
            style={styles.card}
            onPress={() => {
              haptics.selection();
              navigation.navigate('Run', { id: w.id });
            }}
            onLongPress={() => onLongPress(w)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {w.name || 'Untitled workout'}
              </Text>
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>{totalMinutes(w)}</Text>
              </View>
            </View>
            <Text style={styles.cardSummary} numberOfLines={2}>
              {summarize(w)}
            </Text>
            {kindStrip(w)}
            <View style={styles.cardFooter}>
              <Ionicons name="play-circle" size={20} color={colors.accent} />
              <Text style={styles.cardFooterText}>Tap to start · hold to edit</Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>

      <View style={[styles.fabWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        <PressableScale style={styles.fab} onPress={startNew}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>New workout</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { ...typography.title3, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  timePill: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  timePillText: { ...typography.footnote, color: colors.accent, fontWeight: '600' },
  cardSummary: { ...typography.subhead, color: colors.textSecondary, marginTop: spacing.sm },
  strip: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: spacing.md,
    backgroundColor: colors.bgElevated,
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  cardFooterText: { ...typography.caption1, color: colors.textTertiary, marginLeft: spacing.xs },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl * 2 },
  emptyText: { ...typography.headline, color: colors.textSecondary, marginTop: spacing.md },
  emptySub: {
    ...typography.subhead,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    ...shadows.md,
  },
  fabText: { ...typography.headline, color: '#fff', marginLeft: spacing.xs },
});
