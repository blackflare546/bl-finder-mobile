import { Stack, router, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BleState } from 'react-native-ble-manager';

import { type BluetoothDevice, useBluetooth } from '@/services/bluetooth-provider';

const COLORS = {
  ink: '#071B2B',
  muted: '#60727E',
  accent: '#10A6A0',
  accentDark: '#087D79',
  surface: '#FFFFFF',
  canvas: '#F2F7F9',
  border: '#DCE7EA',
  danger: '#C53E47',
};

function DeviceRow({ device, onPress }: { device: BluetoothDevice; onPress: () => void }) {
  const bars = device.rssi >= -60 ? 4 : device.rssi >= -70 ? 3 : device.rssi >= -82 ? 2 : 1;

  return (
    <Pressable
      accessibilityHint="Opens the signal finder for this device"
      accessibilityLabel={`${device.name}, signal ${device.rssi} dBm`}
      android_ripple={{ color: '#DDF4F2' }}
      onPress={onPress}
      style={({ pressed }) => [styles.deviceCard, pressed && styles.pressed]}>
      <View style={styles.deviceIcon}>
        <Text style={styles.deviceIconText}>⌁</Text>
      </View>
      <View style={styles.deviceDetails}>
        <Text numberOfLines={1} selectable style={styles.deviceName}>{device.name}</Text>
        <Text numberOfLines={1} selectable style={styles.deviceId}>{device.id}</Text>
      </View>
      <View style={styles.rssiGroup}>
        <View accessibilityLabel={`${bars} of 4 signal bars`} style={styles.bars}>
          {[1, 2, 3, 4].map((bar) => (
            <View key={bar} style={[styles.bar, { height: 5 + bar * 4 }, bar <= bars ? styles.barActive : styles.barInactive]} />
          ))}
        </View>
        <Text selectable style={styles.rssiText}>{device.rssi} dBm</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function ScannerScreen() {
  const { adapterState, devices, enableBluetooth, error, hasScanned, isScanning, permissionState, startScan, stopScan } = useBluetooth();

  const openDevice = useCallback((device: BluetoothDevice) => {
    router.push(
      { pathname: '/device/[id]', params: { id: device.id, name: device.name } } as unknown as Href,
    );
  }, []);

  const bluetoothOff = adapterState === BleState.Off || adapterState === BleState.TurningOff;
  const showEmpty = hasScanned && !isScanning && devices.length === 0 && !error;

  return (
    <>
      <Stack.Screen options={{ title: 'Bluetooth Finder' }} />
      <FlatList
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DeviceRow device={item} onPress={() => openDevice(item)} />}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.hero}>
              <View style={styles.radarOuter}>
                <View style={styles.radarMiddle}>
                  <View style={styles.radarInner}><Text style={styles.radarGlyph}>⌖</Text></View>
                </View>
              </View>
              <View style={styles.heroCopy}>
                <Text selectable style={styles.eyebrow}>MOVE • WATCH • FIND</Text>
                <Text selectable style={styles.heroTitle}>Find what’s nearby</Text>
                <Text selectable style={styles.heroBody}>Scan for a device, then follow its Bluetooth signal as you move around.</Text>
              </View>
            </View>

            {bluetoothOff ? (
              <View style={styles.notice}>
                <View style={styles.noticeCopy}>
                  <Text selectable style={styles.noticeTitle}>Bluetooth is off</Text>
                  <Text selectable style={styles.noticeBody}>Turn it on to discover nearby devices.</Text>
                </View>
                <Pressable onPress={() => void enableBluetooth()} style={styles.noticeButton}>
                  <Text style={styles.noticeButtonText}>Turn on</Text>
                </Pressable>
              </View>
            ) : null}

            {permissionState === 'denied' ? (
              <View style={[styles.notice, styles.permissionNotice]}>
                <View style={styles.noticeCopy}>
                  <Text selectable style={styles.noticeTitle}>Permission needed</Text>
                  <Text selectable style={styles.noticeBody}>Allow Nearby devices in Android Settings, then try again.</Text>
                </View>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Text selectable style={styles.errorTitle}>Couldn’t scan</Text>
                <Text selectable style={styles.errorBody}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isScanning || adapterState === 'initializing'}
                onPress={() => void startScan(true)}
                style={({ pressed }) => [styles.primaryButton, (isScanning || adapterState === 'initializing') && styles.disabledButton, pressed && styles.pressed]}>
                {isScanning ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.scanGlyph}>⌁</Text>}
                <Text style={styles.primaryButtonText}>{isScanning ? 'Scanning…' : hasScanned ? 'Rescan' : 'Scan nearby'}</Text>
              </Pressable>
              {isScanning ? (
                <Pressable onPress={() => void stopScan()} style={styles.stopButton}>
                  <Text style={styles.stopButtonText}>Stop</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.listHeading}>
              <View>
                <Text selectable style={styles.sectionTitle}>Nearby devices</Text>
                <Text selectable style={styles.sectionSubtitle}>
                  {isScanning ? 'Listening for Bluetooth signals' : devices.length ? `${devices.length} device${devices.length === 1 ? '' : 's'} found` : 'Start a scan to see devices'}
                </Text>
              </View>
              {isScanning ? <View style={styles.liveDot} /> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            {isScanning ? (
              <>
                <ActivityIndicator color={COLORS.accent} size="large" />
                <Text selectable style={styles.emptyTitle}>Searching nearby…</Text>
                <Text selectable style={styles.emptyBody}>Keep the device awake and nearby. Some paired devices stop advertising while connected.</Text>
              </>
            ) : showEmpty ? (
              <>
                <Text style={styles.emptyIcon}>∅</Text>
                <Text selectable style={styles.emptyTitle}>No devices found</Text>
                <Text selectable style={styles.emptyBody}>Move closer, make sure the missing device is powered on, then rescan.</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyIcon}>⌁</Text>
                <Text selectable style={styles.emptyTitle}>Ready when you are</Text>
                <Text selectable style={styles.emptyBody}>Your scan stays on this phone. No location history or device data is uploaded.</Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={<Text selectable style={styles.footer}>RSSI is a signal-strength hint, not an exact distance.</Text>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: COLORS.canvas, flexGrow: 1, gap: 10, padding: 18, paddingBottom: 40 },
  headerContent: { gap: 16 },
  hero: { backgroundColor: COLORS.ink, borderCurve: 'continuous', borderRadius: 28, overflow: 'hidden', padding: 22, gap: 18 },
  radarOuter: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#0B3544', borderCurve: 'continuous', borderRadius: 70, height: 132, justifyContent: 'center', width: 132 },
  radarMiddle: { alignItems: 'center', backgroundColor: '#0D4E58', borderRadius: 52, height: 98, justifyContent: 'center', width: 98 },
  radarInner: { alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 34, height: 66, justifyContent: 'center', width: 66 },
  radarGlyph: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  heroCopy: { alignItems: 'center', gap: 7 },
  eyebrow: { color: '#6CD6D1', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.7, textAlign: 'center' },
  heroBody: { color: '#B9CBD2', fontSize: 15, lineHeight: 22, maxWidth: 330, textAlign: 'center' },
  notice: { alignItems: 'center', backgroundColor: '#FFF1DA', borderColor: '#F2D39F', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 15 },
  permissionNotice: { backgroundColor: '#FCEAEC', borderColor: '#F3C6CA' },
  noticeCopy: { flex: 1, gap: 3 },
  noticeTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  noticeBody: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  noticeButton: { backgroundColor: COLORS.ink, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
  noticeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  errorCard: { backgroundColor: '#FCEAEC', borderColor: '#F3C6CA', borderRadius: 18, borderWidth: 1, gap: 4, padding: 15 },
  errorTitle: { color: COLORS.danger, fontSize: 15, fontWeight: '800' },
  errorBody: { color: '#78494D', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: COLORS.accentDark, borderCurve: 'continuous', borderRadius: 17, flex: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 54, paddingHorizontal: 20 },
  disabledButton: { opacity: 0.65 },
  pressed: { opacity: 0.78 },
  scanGlyph: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  stopButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: COLORS.border, borderRadius: 17, borderWidth: 1, justifyContent: 'center', minHeight: 54, paddingHorizontal: 22 },
  stopButtonText: { color: COLORS.danger, fontSize: 15, fontWeight: '800' },
  listHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 8 },
  sectionTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.35 },
  sectionSubtitle: { color: COLORS.muted, fontSize: 13, paddingTop: 3 },
  liveDot: { backgroundColor: COLORS.accent, borderRadius: 5, height: 10, width: 10 },
  deviceCard: { alignItems: 'center', backgroundColor: COLORS.surface, borderColor: COLORS.border, borderCurve: 'continuous', borderRadius: 19, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 78, padding: 14 },
  deviceIcon: { alignItems: 'center', backgroundColor: '#DFF5F3', borderRadius: 15, height: 48, justifyContent: 'center', width: 48 },
  deviceIconText: { color: COLORS.accentDark, fontSize: 26, fontWeight: '800' },
  deviceDetails: { flex: 1, gap: 4 },
  deviceName: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  deviceId: { color: COLORS.muted, fontFamily: 'monospace', fontSize: 10 },
  rssiGroup: { alignItems: 'flex-end', gap: 5 },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 2, height: 22 },
  bar: { borderRadius: 2, width: 4 },
  barActive: { backgroundColor: COLORS.accent },
  barInactive: { backgroundColor: '#D8E1E4' },
  rssiText: { color: COLORS.muted, fontSize: 11, fontVariant: ['tabular-nums'] },
  chevron: { color: '#92A4AD', fontSize: 29, lineHeight: 32 },
  emptyCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: COLORS.border, borderRadius: 22, borderStyle: 'dashed', borderWidth: 1, gap: 10, minHeight: 190, justifyContent: 'center', padding: 28 },
  emptyIcon: { color: '#88A0AA', fontSize: 32, fontWeight: '700' },
  emptyTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: COLORS.muted, fontSize: 14, lineHeight: 21, maxWidth: 300, textAlign: 'center' },
  footer: { color: COLORS.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12, textAlign: 'center' },
});
