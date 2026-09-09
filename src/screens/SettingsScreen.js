import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../theme';
import PressableScale from '../components/PressableScale';
import haptics from '../utils/haptics';
import useWorkoutsStore from '../store/useWorkoutsStore';
import { speakOnce, setSpeechRate, setSelectedVoice, setCalloutMode, getVoices } from '../engine/speech';

const RATES = [
  { label: 'Slower', value: 0.4 },
  { label: 'Normal', value: 0.5 },
  { label: 'Faster', value: 0.6 },
];

const CALLOUT_MODES = [
  { value: 'pause', label: 'Pause', hint: 'Pauses your music/podcast for each callout, then resumes it.' },
  { value: 'duck', label: 'Lower', hint: 'Dips the volume during a callout and returns instantly — no resume delay.' },
  { value: 'over', label: 'Speak over', hint: 'Keeps your audio at full volume and speaks over it.' },
];

const PREVIEW = 'Fast for four minutes, interval one of four. Thirty seconds left.';

function qualityBadge(quality) {
  const q = String(quality).toLowerCase();
  if (q.includes('premium')) return { text: 'Premium', color: colors.gold ?? colors.warning };
  if (q.includes('enhanced')) return { text: 'Enhanced', color: colors.success };
  return null;
}

export default function SettingsScreen() {
  const settings = useWorkoutsStore((s) => s.settings);
  const updateSettings = useWorkoutsStore((s) => s.updateSettings);
  const rate = settings?.speechRate ?? 0.5;
  const voiceId = settings?.voiceId ?? null;
  const calloutMode = settings?.calloutMode ?? 'pause';

  const [voices, setVoices] = useState(null); // null = loading

  useEffect(() => {
    let alive = true;
    getVoices().then((list) => {
      if (alive) setVoices(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pickRate = (value) => {
    haptics.selection();
    updateSettings({ speechRate: value });
    setSpeechRate(value);
  };

  const pickVoice = (id) => {
    haptics.selection();
    updateSettings({ voiceId: id });
    setSelectedVoice(id);
    setSpeechRate(rate);
    speakOnce(PREVIEW, id || undefined);
  };

  const pickCalloutMode = (mode) => {
    haptics.selection();
    updateSettings({ calloutMode: mode });
    setCalloutMode(mode);
  };

  const calloutHint = CALLOUT_MODES.find((m) => m.value === calloutMode)?.hint;

  const hasNice =
    voices && voices.some((v) => qualityBadge(v.quality) || v.id.toLowerCase().includes('siri'));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.sectionLabel}>During callouts</Text>
      <View style={styles.rateRow}>
        {CALLOUT_MODES.map((m) => {
          const active = calloutMode === m.value;
          return (
            <Pressable
              key={m.value}
              onPress={() => pickCalloutMode(m.value)}
              style={[styles.rateChip, active && styles.rateChipActive]}
            >
              <Text style={[styles.rateChipText, active && styles.rateChipTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.calloutHint}>{calloutHint}</Text>

      <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Voice speed</Text>
      <View style={styles.rateRow}>
        {RATES.map((r) => {
          const active = Math.abs(rate - r.value) < 0.001;
          return (
            <Pressable
              key={r.value}
              onPress={() => pickRate(r.value)}
              style={[styles.rateChip, active && styles.rateChipActive]}
            >
              <Text style={[styles.rateChipText, active && styles.rateChipTextActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Voice</Text>
      <Text style={styles.sectionHint}>Tap any voice to select it and hear a preview.</Text>

      {voices === null ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
      ) : (
        <View style={styles.voiceList}>
          <VoiceRow
            name="Automatic (best installed)"
            subtitle="Let Intervals pick the nicest voice"
            selected={voiceId === null}
            onPress={() => pickVoice(null)}
          />
          {voices.map((v) => (
            <VoiceRow
              key={v.id}
              name={v.name}
              subtitle={v.language}
              badge={qualityBadge(v.quality)}
              selected={voiceId === v.id}
              onPress={() => pickVoice(v.id)}
            />
          ))}
        </View>
      )}

      {voices && !hasNice ? (
        <View style={styles.note}>
          <Ionicons name="sparkles-outline" size={18} color={colors.textTertiary} />
          <Text style={styles.noteText}>
            Only basic voices are installed, so callouts sound robotic. Download an Enhanced or
            Premium English voice (or a Siri voice) in iOS Settings → Accessibility → Spoken Content
            → Voices → English — it will appear here automatically and sounds far more natural.
            (The Simulator only has the basic voice; test on a real device.)
          </Text>
        </View>
      ) : null}

      <View style={styles.note}>
        <Ionicons name="headset-outline" size={18} color={colors.textTertiary} />
        <Text style={styles.noteText}>
          Callouts work with your podcast or music playing, and with the screen locked and phone in
          your pocket. If “Pause” feels slow to resume your audio, try “Lower” — it dips the volume
          and returns instantly.
        </Text>
      </View>
    </ScrollView>
  );
}

function VoiceRow({ name, subtitle, badge, selected, onPress }) {
  return (
    <PressableScale style={[styles.voiceRow, selected && styles.voiceRowActive]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={styles.voiceNameRow}>
          <Text style={styles.voiceName} numberOfLines={1}>{name}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: badge.color }]}>
              <Text style={styles.badgeText}>{badge.text}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.voiceSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'play-circle-outline'}
        size={24}
        color={selected ? colors.accent : colors.textTertiary}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionLabel: {
    ...typography.footnote,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionHint: { ...typography.footnote, color: colors.textTertiary, marginBottom: spacing.sm, marginTop: -spacing.xs },
  calloutHint: { ...typography.footnote, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 18 },
  rateRow: { flexDirection: 'row', gap: spacing.sm },
  rateChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  rateChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rateChipText: { ...typography.body, color: colors.textSecondary },
  rateChipTextActive: { color: '#fff', fontWeight: '700' },
  voiceList: { gap: spacing.sm },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  voiceRowActive: { borderColor: colors.accent },
  voiceNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voiceName: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  voiceSub: { ...typography.caption1, color: colors.textTertiary, marginTop: 2 },
  badge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { ...typography.caption2, color: '#0F0F0F', fontWeight: '700' },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noteText: { ...typography.footnote, color: colors.textSecondary, flex: 1, lineHeight: 18 },
});
