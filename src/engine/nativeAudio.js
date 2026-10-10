import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { spokenName } from './timeline';

// Expo Go / Android keep the JS implementation. iPhone development and release
// builds use the native clock, so cue playback does not need JS to wake up.
export const nativeAudio = Platform.OS === 'ios'
  ? requireOptionalNativeModule('WorkoutAudio')
  : null;

export function nativeSchedule(timeline) {
  return timeline.cues.map((cue) => {
    const phase = timeline.phases.find((p) => p.key === cue.phaseKey);
    return {
      ...cue,
      validUntil: phase?.endSec ?? timeline.total + 15,
      recoveryName: phase ? spokenName(phase) : null,
    };
  });
}
