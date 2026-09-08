import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Small id helper — good enough for local-only records.
export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// A fresh empty segment for the editor.
export const newSegment = (kind = 'fast', seconds = 60) => ({
  id: uid(),
  type: 'segment',
  kind,
  label: '',
  seconds,
});

export const newRepeat = () => ({
  id: uid(),
  type: 'repeat',
  times: 4,
  steps: [newSegment('fast', 240), newSegment('slow', 180)],
});

// Seeded on first launch — Udi's cardio-improvement session.
const defaultWorkout = () => ({
  id: uid(),
  name: 'Cardio Intervals',
  announce30sLeft: true,
  steps: [
    { id: uid(), type: 'segment', kind: 'warmup', label: 'Warm up', seconds: 600 },
    {
      id: uid(),
      type: 'repeat',
      times: 4,
      steps: [
        { id: uid(), type: 'segment', kind: 'fast', label: '', seconds: 240 },
        { id: uid(), type: 'segment', kind: 'slow', label: '', seconds: 180 },
      ],
    },
    { id: uid(), type: 'segment', kind: 'cooldown', label: 'Cool down', seconds: 420 },
  ],
});

const useWorkoutsStore = create(
  persist(
    (set, get) => ({
      workouts: [],
      isHydrated: false,

      // Global preferences.
      settings: {
        speechRate: 0.5, // expo-speech iOS default is ~0.5
        voiceId: null, // null = auto-pick the best installed voice
      },

      setHydrated: () => set({ isHydrated: true }),

      seedIfEmpty: () => {
        if (get().workouts.length === 0) {
          set({ workouts: [defaultWorkout()] });
        }
      },

      getWorkout: (id) => get().workouts.find((w) => w.id === id),

      addWorkout: (workout) => {
        const w = { ...workout, id: workout.id || uid() };
        set((s) => ({ workouts: [...s.workouts, w] }));
        return w.id;
      },

      upsertWorkout: (workout) => {
        set((s) => {
          const exists = s.workouts.some((w) => w.id === workout.id);
          return {
            workouts: exists
              ? s.workouts.map((w) => (w.id === workout.id ? workout : w))
              : [...s.workouts, workout],
          };
        });
      },

      deleteWorkout: (id) =>
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      duplicateWorkout: (id) => {
        const src = get().workouts.find((w) => w.id === id);
        if (!src) return null;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = uid();
        copy.name = `${src.name} copy`;
        // fresh ids for nested steps so editing the copy never mutates the source
        copy.steps = (copy.steps || []).map((step) => {
          const s = { ...step, id: uid() };
          if (s.type === 'repeat') s.steps = s.steps.map((in_) => ({ ...in_, id: uid() }));
          return s;
        });
        set((s) => ({ workouts: [...s.workouts, copy] }));
        return copy.id;
      },

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'intervals-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        workouts: state.workouts,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated();
          state.seedIfEmpty();
        }
      },
    }
  )
);

export default useWorkoutsStore;
