import {
  getDirectionCandidate,
  finderSignalReducer,
  getSignalLevel,
  getSignalTrend,
  INITIAL_DIRECTION_TRACKER,
  INITIAL_FINDER_SIGNAL_STATE,
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

  test('smooths new samples without jumping directly to them', () => {
    expect(smoothRssi(null, -80)).toBe(-80);
    expect(smoothRssi(-80, -60)).toBeCloseTo(-74.4);
  });

  test('uses tolerance to prevent trend jitter', () => {
    expect(getSignalTrend([-70, -69, -68, -68])).toBe('stable');
    expect(getSignalTrend([-76, -75, -68, -67])).toBe('stronger');
    expect(getSignalTrend([-62, -63, -70, -71])).toBe('weaker');
  });

  test('compares rolling windows for relative direction guidance', () => {
    expect(getDirectionCandidate([-76, -75, -74, -68, -67, -66], -70).status).toBe(
      'strongest',
    );
    expect(getDirectionCandidate([-62, -63, -64, -70, -71, -72], -62).status).toBe(
      'weaker',
    );
    expect(getDirectionCandidate([-70, -69, -70, -69, -70, -69], -69).status).toBe(
      'stable',
    );
  });

  test('suggests another direction when a stable window is below the session best', () => {
    expect(getDirectionCandidate([-76, -76, -75, -75, -76, -75], -68).status).toBe(
      'tryAnother',
    );
  });

  test('requires two matching changes before switching guidance', () => {
    const readings = [-78, -77, -76, -68, -67, -66];
    const first = updateDirectionTracker(readings, INITIAL_DIRECTION_TRACKER);
    expect(first.status).toBe('stable');
    expect(first.pendingStatus).toBe('strongest');

    const confirmed = updateDirectionTracker([...readings, -65], first);
    expect(confirmed.status).toBe('strongest');
    expect(confirmed.pendingStatus).toBeNull();
  });

  test('starts a new direction window without discarding smoothing or the session best', () => {
    const sampled = [-72, -71, -70, -62, -61, -60].reduce(
      (state, rssi) => finderSignalReducer(state, { type: 'sample', rssi }),
      INITIAL_FINDER_SIGNAL_STATE,
    );
    const reset = finderSignalReducer(sampled, { type: 'changedDirection' });

    expect(reset.readings).toEqual([]);
    expect(reset.smoothedRssi).toBe(sampled.smoothedRssi);
    expect(reset.direction.status).toBe('sampling');
    expect(reset.direction.bestAverage).toBe(sampled.direction.bestAverage);
  });
});
