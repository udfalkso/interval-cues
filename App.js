import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { colors } from './src/theme';
import { EngineProvider } from './src/engine/IntervalEngine';
import WorkoutsScreen from './src/screens/WorkoutsScreen';
import EditWorkoutScreen from './src/screens/EditWorkoutScreen';
import RunScreen from './src/screens/RunScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.textPrimary,
    primary: colors.accent,
    border: colors.border,
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <EngineProvider>
          <StatusBar style="light" />
          <NavigationContainer theme={navTheme}>
            <Stack.Navigator
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.textPrimary,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen
                name="Workouts"
                component={WorkoutsScreen}
                options={{ title: 'Intervals' }}
              />
              <Stack.Screen
                name="EditWorkout"
                component={EditWorkoutScreen}
                options={{ presentation: 'modal', title: 'Edit Workout' }}
              />
              <Stack.Screen
                name="Run"
                component={RunScreen}
                options={{ headerShown: false, gestureEnabled: false }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ presentation: 'modal', title: 'Settings' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </EngineProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
