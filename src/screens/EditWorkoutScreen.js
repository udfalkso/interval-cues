import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Switch,
  Alert,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography, kindColor } from '../theme';
import haptics from '../utils/haptics';
import useWorkoutsStore, { uid, newSegment, newRepeat } from '../store/useWorkoutsStore';
import { buildPhases, formatClock } from '../engine/timeline';

const KINDS = [
  { kind: 'warmup', label: 'Warm up' },
  { kind: 'fast', label: 'Fast' },
  { kind: 'slow', label: 'Slow' },
  { kind: 'cooldown', label: 'Cool down' },
  { kind: 'walk', label: 'Walk' },
  { kind: 'custom', label: 'Custom' },
];

function Stepper({ onDec, onInc, disabledDec, disabledInc }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        hitSlop={8}
        onPress={() => {
          haptics.selection();
          onDec();
        }}
        disabled={disabledDec}
        style={[styles.stepBtn, disabledDec && styles.stepBtnOff]}
      >
        <Ionicons name="remove" size={18} color={disabledDec ? colors.textDisabled : colors.textPrimary} />
      </Pressable>
      <Pressable
        hitSlop={8}
        onPress={() => {
          haptics.selection();
          onInc();
        }}
        disabled={disabledInc}
        style={[styles.stepBtn, disabledInc && styles.stepBtnOff]}
      >
        <Ionicons name="add" size={18} color={disabledInc ? colors.textDisabled : colors.textPrimary} />
      </Pressable>
    </View>
  );
}

function DurationEditor({ seconds, onChange }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const setM = (nm) => onChange(Math.max(5, nm * 60 + s));
  const setS = (ns) => onChange(Math.max(5, m * 60 + ns));
  return (
    <View style={styles.durationRow}>
      <View style={styles.durationField}>
        <Text style={styles.durationValue}>{formatClock(seconds)}</Text>
        <Text style={styles.durationUnit}>min:sec</Text>
      </View>
      <View style={styles.durationControls}>
        <View style={styles.durationCol}>
          <Text style={styles.durationColLabel}>min</Text>
          <Stepper onDec={() => setM(Math.max(0, m - 1))} onInc={() => setM(m + 1)} disabledDec={m <= 0} />
        </View>
        <View style={styles.durationCol}>
          <Text style={styles.durationColLabel}>sec</Text>
          <Stepper
            onDec={() => setS((s - 15 + 60) % 60)}
            onInc={() => setS((s + 15) % 60)}
          />
        </View>
      </View>
    </View>
  );
}

function KindChips({ kind, onPick }) {
  return (
    <View style={styles.chips}>
      {KINDS.map((k) => {
        const active = k.kind === kind;
        return (
          <Pressable
            key={k.kind}
            onPress={() => {
              haptics.selection();
              onPick(k.kind);
            }}
            style={[
              styles.chip,
              active && { backgroundColor: kindColor(k.kind), borderColor: kindColor(k.kind) },
            ]}
          >
            <Text style={[styles.chipText, active && { color: '#0F0F0F', fontWeight: '700' }]}>
              {k.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SegmentBody({ segment, onChange, onRemove }) {
  return (
    <View>
      <KindChips kind={segment.kind} onPick={(kind) => onChange({ ...segment, kind })} />
      {segment.kind === 'custom' ? (
        <TextInput
          style={styles.labelInput}
          placeholder="Label (e.g. Sprint)"
          placeholderTextColor={colors.textTertiary}
          value={segment.label}
          onChangeText={(label) => onChange({ ...segment, label })}
        />
      ) : null}
      <DurationEditor seconds={segment.seconds} onChange={(seconds) => onChange({ ...segment, seconds })} />
      {onRemove ? (
        <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function EditWorkoutScreen({ route, navigation }) {
  const getWorkout = useWorkoutsStore((s) => s.getWorkout);
  const upsertWorkout = useWorkoutsStore((s) => s.upsertWorkout);

  const initial = useMemo(() => {
    if (route.params?.workout) return route.params.workout;
    const existing = route.params?.id ? getWorkout(route.params.id) : null;
    return existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: uid(), name: '', announce30sLeft: true, steps: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [name, setName] = useState(initial.name);
  const [announce30, setAnnounce30] = useState(initial.announce30sLeft ?? true);
  const [steps, setSteps] = useState(initial.steps);

  const total = useMemo(
    () => buildPhases({ steps }).reduce((s, p) => s + p.seconds, 0),
    [steps]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: route.params?.isNew ? 'New Workout' : 'Edit Workout',
      headerLeft: () => (
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.headerBtn}>Cancel</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={onSave} hitSlop={8}>
          <Text style={[styles.headerBtn, { color: colors.accent, fontWeight: '700' }]}>Save</Text>
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, name, announce30, steps]);

  const onSave = () => {
    if (!steps.length) {
      Alert.alert('Add at least one segment before saving.');
      return;
    }
    upsertWorkout({
      id: initial.id,
      name: name.trim() || 'Untitled workout',
      announce30sLeft: announce30,
      steps,
    });
    haptics.success();
    navigation.goBack();
  };

  const updateStep = (id, next) => setSteps((prev) => prev.map((s) => (s.id === id ? next : s)));
  const removeStep = (id) => setSteps((prev) => prev.filter((s) => s.id !== id));

  const updateInner = (repeatId, innerId, next) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.id === repeatId
          ? { ...s, steps: s.steps.map((in_) => (in_.id === innerId ? next : in_)) }
          : s
      )
    );
  const addInner = (repeatId) =>
    setSteps((prev) =>
      prev.map((s) => (s.id === repeatId ? { ...s, steps: [...s.steps, newSegment('fast', 60)] } : s))
    );
  const removeInner = (repeatId, innerId) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.id === repeatId
          ? { ...s, steps: s.steps.filter((in_) => in_.id !== innerId) }
          : s
      )
    );

  const renderItem = ({ item, drag, isActive }) => {
    const accent = item.type === 'repeat' ? colors.accent : kindColor(item.kind);
    return (
      <ScaleDecorator>
        <View style={[styles.stepCard, isActive && styles.stepCardActive, { borderLeftColor: accent }]}>
          <View style={styles.stepTop}>
            <Pressable onLongPress={drag} delayLongPress={120} hitSlop={8} style={styles.dragHandle}>
              <Ionicons name="reorder-three" size={22} color={colors.textTertiary} />
            </Pressable>
            <Text style={styles.stepType}>
              {item.type === 'repeat' ? `Repeat ${item.times}×` : 'Segment'}
            </Text>
          </View>

          {item.type === 'repeat' ? (
            <View>
              <View style={styles.repeatTimesRow}>
                <Text style={styles.fieldLabel}>Repetitions</Text>
                <View style={styles.repeatTimesRight}>
                  <Text style={styles.repeatTimesValue}>{item.times}</Text>
                  <Stepper
                    onDec={() => updateStep(item.id, { ...item, times: Math.max(1, item.times - 1) })}
                    onInc={() => updateStep(item.id, { ...item, times: Math.min(20, item.times + 1) })}
                    disabledDec={item.times <= 1}
                    disabledInc={item.times >= 20}
                  />
                </View>
              </View>
              {item.steps.map((in_) => (
                <View key={in_.id} style={styles.innerCard}>
                  <SegmentBody
                    segment={in_}
                    onChange={(next) => updateInner(item.id, in_.id, next)}
                    onRemove={item.steps.length > 1 ? () => removeInner(item.id, in_.id) : null}
                  />
                </View>
              ))}
              <Pressable style={styles.addInner} onPress={() => addInner(item.id)}>
                <Ionicons name="add" size={16} color={colors.accent} />
                <Text style={styles.addInnerText}>Add step to repeat</Text>
              </Pressable>
            </View>
          ) : (
            <SegmentBody
              segment={item}
              onChange={(next) => updateStep(item.id, next)}
              onRemove={() => removeStep(item.id)}
            />
          )}
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View style={styles.container}>
      <DraggableFlatList
        data={steps}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => setSteps(data)}
        renderItem={renderItem}
        activationDistance={12}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl * 2 }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="e.g. Tuesday intervals"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
            />
            <View style={styles.totalRow}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.totalText}>Total {formatClock(total)}</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.addRow}>
              <Pressable
                style={styles.addBtn}
                onPress={() => setSteps((p) => [...p, newSegment('fast', 60)])}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                <Text style={styles.addBtnText}>Add segment</Text>
              </Pressable>
              <Pressable style={styles.addBtn} onPress={() => setSteps((p) => [...p, newRepeat()])}>
                <Ionicons name="repeat" size={18} color={colors.accent} />
                <Text style={styles.addBtnText}>Add repeat block</Text>
              </Pressable>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Announce “30 seconds left”</Text>
                <Text style={styles.toggleSub}>Spoken cue near the end of each interval.</Text>
              </View>
              <Switch
                value={announce30}
                onValueChange={(v) => {
                  haptics.selection();
                  setAnnounce30(v);
                }}
                trackColor={{ true: colors.accent, false: colors.borderMedium }}
              />
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBtn: { ...typography.body, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  fieldLabel: { ...typography.footnote, color: colors.textTertiary, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  nameInput: {
    ...typography.title3,
    color: colors.textPrimary,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  totalText: { ...typography.subhead, color: colors.textSecondary, marginLeft: spacing.xs },
  stepCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stepCardActive: { borderColor: colors.accent, ...{} },
  stepTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  dragHandle: { paddingRight: spacing.sm },
  stepType: { ...typography.footnote, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  chipText: { ...typography.footnote, color: colors.textSecondary },
  labelInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationField: {},
  durationValue: { ...typography.title2, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  durationUnit: { ...typography.caption2, color: colors.textTertiary },
  durationControls: { flexDirection: 'row', gap: spacing.md },
  durationCol: { alignItems: 'center' },
  durationColLabel: { ...typography.caption2, color: colors.textTertiary, marginBottom: 2 },
  stepper: { flexDirection: 'row', gap: spacing.xs },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  stepBtnOff: { opacity: 0.4 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  removeText: { ...typography.footnote, color: colors.error, marginLeft: spacing.xs },
  repeatTimesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  repeatTimesRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  repeatTimesValue: { ...typography.title3, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  innerCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  addInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  addInnerText: { ...typography.footnote, color: colors.accent, marginLeft: spacing.xs },
  addRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  addBtnText: { ...typography.footnote, color: colors.accent, marginLeft: spacing.xs, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  toggleTitle: { ...typography.body, color: colors.textPrimary },
  toggleSub: { ...typography.footnote, color: colors.textTertiary, marginTop: 2 },
});
