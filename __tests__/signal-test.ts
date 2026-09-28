import {
  filterRssiSample,
  finderSignalReducer,
  getDirectionCandidate,
  getSignalLevel,
  getSignalTrend,
  INITIAL_DIRECTION_TRACKER,
  INITIAL_FINDER_SIGNAL_STATE,
  isSignalUnstable,
  smoothRssi,
  updateDirectionTracker,
} from '@/services/signal';

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

  test('uses hysteresis around signal-level boundaries', () => {
    expect(getSignalLevel(-74, 'Weak').label).toBe('Weak');
    expect(getSignalLevel(-72, 'Weak').label).toBe('Nearby');
    expect(getSignalLevel(-76, 'Nearby').label).toBe('Nearby');
    expect(getSignalLevel(-78, 'Nearby').label).toBe('Weak');
  });

  test('median filtering rejects an isolated RSSI spike', () => {
    expect(filterRssiSample([-70, -69, -71, -70], -35)).toBe(-70);
  });

  test('smooths filtered samples without jumping directly to them', () => {
    expect(smoothRssi(null, -80)).toBe(-80);
    expect(smoothRssi(-80, -60)).toBeCloseTo(-75.2);
  });

  test('uses rolling windows and tolerance to prevent trend jitter', () => {
    expect(getSignalTrend([-70, -69, -70, -69, -69, -68, -69, -68])).toBe('stable');
    expect(getSignalTrend([-78, -77, -76, -75, -69, -68, -67, -66])).toBe('stronger');
    expect(getSignalTrend([-62, -63, -64, -65, -70, -71, -72, -73])).toBe('weaker');
  });

  test('detects noisy oscillation but not a steady movement trend', () => {
    expect(isSignalUnstable([-70, -52, -88, -54, -86, -55, -84])).toBe(true);
    expect(isSignalUnstable([-80, -77, -74, -71, -68, -65, -62])).toBe(false);
  });

  test('compares smoothed rolling windows for relative guidance', () => {
    expect(
      getDirectionCandidate([-77, -76, -75, -74, -68, -67, -66, -65], -70).status,
    ).toBe('strongest');
    expect(
      getDirectionCandidate([-62, -63, -64, -65, -70, -71, -72, -73], -62).status,
    ).toBe('weaker');
    expect(
      getDirectionCandidate([-70, -69, -70, -69, -69, -70, -69, -70], -69).status,
    ).toBe('stable');
  });

  test('suggests another direction when settled below the session best', () => {
    expect(
      getDirectionCandidate([-76, -76, -75, -75, -75, -76, -75, -76], -68).status,
    ).toBe('tryAnother');
  });

  test('uses unstable guidance instead of a false direction', () => {
    expect(getDirectionCandidate([-75, -74, -73, -72], -70, true).status).toBe('unstable');
  });

  test('requires three matching evaluations before switching guidance', () => {
    const readings = [-78, -77, -76, -75, -68, -67, -66, -65];
    const first = updateDirectionTracker(readings, INITIAL_DIRECTION_TRACKER);
    expect(first.status).toBe('sampling');
    expect(first.pendingStatus).toBe('strongest');

    const second = updateDirectionTracker(readings, first);
    expect(second.status).toBe('sampling');
    expect(second.pendingStatus).toBe('strongest');

    const confirmed = updateDirectionTracker(readings, second);
    expect(confirmed.status).toBe('strongest');
    expect(confirmed.pendingStatus).toBeNull();
  });

  test('recalibrates readings while retaining the session best', () => {
    const sampled = [-72, -71, -70, -69, -64, -63, -62, -61].reduce(
      (state, rssi) => finderSignalReducer(state, { type: 'sample', rssi }),
      INITIAL_FINDER_SIGNAL_STATE,
    );
    const reset = finderSignalReducer(sampled, { type: 'changedDirection' });

    expect(reset.rawReadings).toEqual([]);
    expect(reset.readings).toEqual([]);
    expect(reset.smoothedRssi).toBeNull();
    expect(reset.direction.status).toBe('sampling');
    expect(reset.direction.bestAverage).toBe(sampled.direction.bestAverage);
  });
});
