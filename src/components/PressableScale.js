import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PressableScale({
  children,
  style,
  scaleValue = 0.96,
  duration = 150,
  onPress,
  onLongPress,
  disabled,
  ...props
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(scaleValue, { duration });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration });
  };

  return (
    <AnimatedPressable
      style={[animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
