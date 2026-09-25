import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { BluetoothProvider } from '@/services/bluetooth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <BluetoothProvider>
      <StatusBar style="light" />
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#071B2B' },
          headerTintColor: '#F5FBFF',
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#F2F7F9' },
        }}>
        <Stack.Screen name="index" options={{ title: 'Bluetooth Finder' }} />
        <Stack.Screen name="device/[id]" options={{ title: 'Find device' }} />
      </Stack>
    </BluetoothProvider>
  );
}
