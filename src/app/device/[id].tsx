import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBluetooth } from '@/services/bluetooth-provider';
import {
  finderSignalReducer,
  getSignalLevel,
  INITIAL_FINDER_SIGNAL_STATE,
  SIGNAL_LOSS_TIMEOUT_MS,
} from '@/services/signal';

const DIRECTION_COPY = {
  sampling: {
    arrow: '…',
    label: 'Checking direction',
    body: 'Hold your position briefly while the signal settles.',
    color: '#5F727C',
  },
  stronger: {
    arrow: '↑',
    label: 'Getting stronger',
    body: 'Likely closer—keep moving slowly in this direction.',
    color: '#159A68',
  },
  weaker: {
    arrow: '↓',
    label: 'Getting weaker',
    body: 'Likely farther away. Move back or try another direction.',
    color: '#D25A44',
  },
  stable: {
    arrow: '→',
    label: 'Stable',
    body: 'No meaningful change yet. Move a few steps, then pause.',
    color: '#5F727C',
  },
  tryAnother: {
    arrow: '↩',
    label: 'Try another direction',
    body: 'This settled below the strongest signal seen this session.',
    color: '#C47718',
  },
  strongest: {
    arrow: '↑',
    label: 'Signal strongest in this direction',
    body: 'This is the strongest rolling signal seen this session.',
    color: '#087D79',
  },
} as const;

export default function DeviceFinderScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { devices, error, isScanning, startScan, stopScan } = useBluetooth();
  const device = devices.find((candidate) => candidate.id === id);
  const displayName = name || device?.name || 'Bluetooth device';
  const [signalState, dispatchSignal] = useReducer(
    finderSignalReducer,
    INITIAL_FINDER_SIGNAL_STATE,
  );
  const [clock, setClock] = useState(0);

  useEffect(() => {
    void startScan(false);
    return () => {
      void stopScan();
    };
  }, [startScan, stopScan]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!device) return;
    dispatchSignal({ type: 'sample', rssi: device.rssi });
  }, [device?.lastSeen, device?.rssi, device]);

  const smoothedRssi = signalState.smoothedRssi ?? device?.rssi ?? null;
  const signal = smoothedRssi === null ? null : getSignalLevel(smoothedRssi);
  const direction = DIRECTION_COPY[signalState.direction.status];
  const temporarilyLost = !device || clock - device.lastSeen > SIGNAL_LOSS_TIMEOUT_MS;
  const roundedRssi = smoothedRssi === null ? '—' : Math.round(smoothedRssi);
  const bars = useMemo(() => (signal ? Math.round(signal.progress * 5) : 0), [signal]);

  return (
    <>
      <Stack.Screen options={{ title: displayName }} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.deviceHeader}>
          <View style={styles.deviceBadge}><Text style={styles.deviceBadgeText}>⌁</Text></View>
          <View style={styles.deviceCopy}>
            <Text numberOfLines={1} selectable style={styles.deviceName}>{displayName}</Text>
            <Text numberOfLines={1} selectable style={styles.deviceId}>{id}</Text>
          </View>
          <View style={[styles.liveBadge, !isScanning && styles.pausedBadge]}>
            <View style={[styles.liveDot, !isScanning && styles.pausedDot]} />
            <Text style={[styles.liveText, !isScanning && styles.pausedText]}>{isScanning ? 'LIVE' : 'PAUSED'}</Text>
          </View>
        </View>

        {temporarilyLost ? (
          <View style={styles.lostCard}>
            <Text style={styles.lostIcon}>!</Text>
            <View style={styles.lostCopy}>
              <Text selectable style={styles.lostTitle}>Signal temporarily lost</Text>
              <Text selectable style={styles.lostBody}>Keep moving slowly. The device may advertise again in a moment.</Text>
            </View>
          </View>
        ) : null}

        {error ? <View style={styles.errorCard}><Text selectable style={styles.errorText}>{error}</Text></View> : null}

        <View style={styles.signalCard}>
          <Text selectable style={styles.overline}>SMOOTHED SIGNAL</Text>
          <View style={[styles.signalOrbOuter, { borderColor: signal?.color ?? '#B8C6CB' }]}>
            <View style={[styles.signalOrbMiddle, { borderColor: signal?.color ?? '#D6E0E3' }]}>
              <View style={[styles.signalOrb, { backgroundColor: signal?.color ?? '#82949D' }]}>
                {smoothedRssi === null ? <ActivityIndicator color="#FFFFFF" size="large" /> : (
                  <>
                    <Text selectable style={styles.rssiNumber}>{roundedRssi}</Text>
                    <Text selectable style={styles.rssiUnit}>dBm</Text>
                  </>
                )}
              </View>
            </View>
          </View>
          <Text numberOfLines={1} selectable style={[styles.levelLabel, { color: signal?.color ?? '#60727E' }]}>
            {temporarilyLost ? 'Searching…' : signal?.label ?? 'Waiting for signal'}
          </Text>
          <View accessibilityLabel={`${bars} of 5 signal bars`} style={styles.meter}>
            {[1, 2, 3, 4, 5].map((bar) => (
              <View key={bar} style={[styles.meterSegment, { backgroundColor: bar <= bars ? signal?.color : '#DFE7E9' }]} />
            ))}
          </View>
        </View>

        <View style={styles.directionCard}>
          <Text selectable style={styles.directionOverline}>RELATIVE DIRECTION • HOTTER / COLDER</Text>
          <View style={styles.directionSummary}>
            <View style={[styles.directionIcon, { backgroundColor: `${direction.color}18` }]}>
              <Text selectable style={[styles.directionArrow, { color: direction.color }]}>{direction.arrow}</Text>
            </View>
            <View style={styles.directionCopy}>
              <Text selectable style={styles.directionTitle}>{direction.label}</Text>
              <Text selectable style={styles.directionBody}>{direction.body}</Text>
            </View>
          </View>
          <Pressable
            accessibilityHint="Starts a fresh signal comparison while retaining the strongest signal"
            disabled={!isScanning || temporarilyLost}
            onPress={() => dispatchSignal({ type: 'changedDirection' })}
            style={({ pressed }) => [
              styles.directionButton,
              (!isScanning || temporarilyLost) && styles.directionButtonDisabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.directionButtonText}>I changed direction ↩</Text>
          </Pressable>
          <Text selectable style={styles.directionFootnote}>
            Compares recent signal strength only—not an angle, bearing, or exact location.
          </Text>
        </View>

        <View style={styles.tipCard}>
          <Text selectable style={styles.tipTitle}>How to get a useful reading</Text>
          <View style={styles.tipRow}><Text style={styles.tipNumber}>1</Text><Text selectable style={styles.tipText}>Move slowly in one direction.</Text></View>
          <View style={styles.tipRow}><Text style={styles.tipNumber}>2</Text><Text selectable style={styles.tipText}>Pause for a few seconds after each move.</Text></View>
          <View style={styles.tipRow}><Text style={styles.tipNumber}>3</Text><Text selectable style={styles.tipText}>Follow a strengthening signal; walls and your body can affect it.</Text></View>
        </View>

        <Pressable onPress={() => (isScanning ? void stopScan() : void startScan(false))} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
          <Text style={styles.controlButtonText}>{isScanning ? 'Stop monitoring' : 'Resume monitoring'}</Text>
        </Pressable>
        <Text selectable style={styles.disclaimer}>Signal strength is relative and can fluctuate. It does not represent exact distance.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#F2F7F9', flexGrow: 1, gap: 14, padding: 18, paddingBottom: 42 },
  deviceHeader: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DCE7EA', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  deviceBadge: { alignItems: 'center', backgroundColor: '#DFF5F3', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  deviceBadgeText: { color: '#087D79', fontSize: 25, fontWeight: '800' },
  deviceCopy: { flex: 1, gap: 3 },
  deviceName: { color: '#071B2B', fontSize: 17, fontWeight: '800' },
  deviceId: { color: '#60727E', fontFamily: 'monospace', fontSize: 10 },
  liveBadge: { alignItems: 'center', backgroundColor: '#E5F7F0', borderRadius: 12, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 7 },
  liveDot: { backgroundColor: '#159A68', borderRadius: 4, height: 7, width: 7 },
  liveText: { color: '#11764F', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  pausedBadge: { backgroundColor: '#EDF1F2' },
  pausedDot: { backgroundColor: '#819199' },
  pausedText: { color: '#60727E' },
  lostCard: { alignItems: 'center', backgroundColor: '#FFF1DA', borderColor: '#F2D39F', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  lostIcon: { backgroundColor: '#E9A23B', borderRadius: 15, color: '#FFFFFF', fontSize: 16, fontWeight: '900', lineHeight: 30, textAlign: 'center', width: 30 },
  lostCopy: { flex: 1, gap: 3 },
  lostTitle: { color: '#704716', fontSize: 14, fontWeight: '800' },
  lostBody: { color: '#80633E', fontSize: 12, lineHeight: 17 },
  errorCard: { backgroundColor: '#FCEAEC', borderColor: '#F3C6CA', borderRadius: 16, borderWidth: 1, padding: 14 },
  errorText: { color: '#8E3B43', fontSize: 13, lineHeight: 19 },
  signalCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DCE7EA', borderRadius: 26, borderWidth: 1, gap: 13, padding: 24 },
  overline: { color: '#60727E', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  signalOrbOuter: { alignItems: 'center', borderRadius: 91, borderWidth: 1, height: 182, justifyContent: 'center', marginVertical: 4, opacity: 0.95, width: 182 },
  signalOrbMiddle: { alignItems: 'center', borderRadius: 75, borderWidth: 10, height: 150, justifyContent: 'center', width: 150 },
  signalOrb: { alignItems: 'center', borderRadius: 62, height: 124, justifyContent: 'center', width: 124 },
  rssiNumber: { color: '#FFFFFF', fontSize: 45, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  rssiUnit: { color: '#EFFFFD', fontSize: 12, fontWeight: '700', marginTop: -4 },
  levelLabel: { fontSize: 23, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center', width: '100%' },
  meter: { flexDirection: 'row', gap: 5, width: '84%' },
  meterSegment: { borderRadius: 4, flex: 1, height: 7 },
  directionCard: { backgroundColor: '#FFFFFF', borderColor: '#DCE7EA', borderRadius: 20, borderWidth: 1, gap: 13, padding: 16 },
  directionOverline: { color: '#60727E', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  directionSummary: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  directionIcon: { alignItems: 'center', borderRadius: 17, height: 54, justifyContent: 'center', width: 54 },
  directionArrow: { fontSize: 30, fontWeight: '800' },
  directionCopy: { flex: 1, gap: 4 },
  directionTitle: { color: '#071B2B', fontSize: 17, fontWeight: '800' },
  directionBody: { color: '#60727E', fontSize: 13, lineHeight: 19 },
  directionButton: { alignItems: 'center', backgroundColor: '#E4F4F3', borderRadius: 14, justifyContent: 'center', minHeight: 46, paddingHorizontal: 16 },
  directionButtonDisabled: { opacity: 0.5 },
  directionButtonText: { color: '#087D79', fontSize: 14, fontWeight: '800' },
  directionFootnote: { color: '#73858D', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  tipCard: { backgroundColor: '#E8F4F5', borderRadius: 20, gap: 11, padding: 17 },
  tipTitle: { color: '#164E58', fontSize: 15, fontWeight: '800', paddingBottom: 2 },
  tipRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  tipNumber: { backgroundColor: '#0F8581', borderRadius: 11, color: '#FFFFFF', fontSize: 11, fontWeight: '900', lineHeight: 22, textAlign: 'center', width: 22 },
  tipText: { color: '#365E65', flex: 1, fontSize: 13, lineHeight: 18 },
  controlButton: { alignItems: 'center', backgroundColor: '#071B2B', borderRadius: 17, justifyContent: 'center', minHeight: 53, paddingHorizontal: 20 },
  controlButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  disclaimer: { color: '#687B84', fontSize: 11, lineHeight: 17, paddingHorizontal: 20, textAlign: 'center' },
});
