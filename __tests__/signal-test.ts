import { getSignalLevel, getSignalTrend, smoothRssi } from '@/services/signal';

describe('signal helpers', () => {
  test.each([
    [-55, 'Very Close'],
    [-56, 'Close'],
    [-65, 'Close'],
    [-66, 'Nearby'],
    [-75, 'Nearby'],
    [-76, 'Weak'],
    [-85, 'Weak'],
    [-86, 'Very Weak'],
  ] as const)('classifies %i dBm as %s', (rssi, expected) => {
    expect(getSignalLevel(rssi).label).toBe(expected);
  });

  test('smooths new samples without jumping directly to them', () => {
    expect(smoothRssi(null, -80)).toBe(-80);
    expect(smoothRssi(-80, -60)).toBeCloseTo(-74.4);
  });

  test('uses tolerance to prevent trend jitter', () => {
    expect(getSignalTrend([-70, -69, -68, -68])).toBe('stable');
    expect(getSignalTrend([-76, -75, -68, -67])).toBe('stronger');
    expect(getSignalTrend([-62, -63, -70, -71])).toBe('weaker');
  });
});
