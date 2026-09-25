export const SIGNAL_LOSS_TIMEOUT_MS = 7_000;
export const TREND_TOLERANCE_DBM = 3;
export const RSSI_SMOOTHING_ALPHA = 0.28;

export type SignalLevel = {
  label: 'Very Close' | 'Close' | 'Nearby' | 'Weak' | 'Very Weak';
  color: string;
  progress: number;
};

export type SignalTrend = 'stronger' | 'stable' | 'weaker';

export function smoothRssi(previous: number | null, next: number): number {
  if (previous === null) return next;
  return previous + RSSI_SMOOTHING_ALPHA * (next - previous);
}

export function getSignalLevel(rssi: number): SignalLevel {
  if (rssi >= -55) return { label: 'Very Close', color: '#16A36A', progress: 1 };
  if (rssi >= -65) return { label: 'Close', color: '#35B46F', progress: 0.8 };
  if (rssi >= -75) return { label: 'Nearby', color: '#E9A23B', progress: 0.6 };
  if (rssi >= -85) return { label: 'Weak', color: '#E36F3D', progress: 0.4 };
  return { label: 'Very Weak', color: '#D04C4C', progress: 0.2 };
}

export function getSignalTrend(readings: number[]): SignalTrend {
  if (readings.length < 4) return 'stable';

  const recent = readings.slice(-2);
  const prior = readings.slice(-4, -2);
  const recentAverage = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const priorAverage = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  const change = recentAverage - priorAverage;

  if (change >= TREND_TOLERANCE_DBM) return 'stronger';
  if (change <= -TREND_TOLERANCE_DBM) return 'weaker';
  return 'stable';
}
