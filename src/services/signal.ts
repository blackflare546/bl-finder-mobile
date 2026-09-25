export const SIGNAL_LOSS_TIMEOUT_MS = 7_000;
export const TREND_TOLERANCE_DBM = 3;
export const RSSI_SMOOTHING_ALPHA = 0.28;
export const DIRECTION_WINDOW_SIZE = 3;
export const DIRECTION_CONFIRMATION_SAMPLES = 2;
export const BEST_DIRECTION_TOLERANCE_DBM = 1;
export const TRY_ANOTHER_DIRECTION_GAP_DBM = 4;

export type SignalLevel = {
  label: 'Very Close' | 'Close' | 'Nearby' | 'Weak' | 'Very Weak';
  color: string;
  progress: number;
};

export type SignalTrend = 'stronger' | 'stable' | 'weaker';
export type RelativeDirection =
  | 'sampling'
  | 'stronger'
  | 'weaker'
  | 'stable'
  | 'tryAnother'
  | 'strongest';

export type DirectionTracker = {
  status: RelativeDirection;
  pendingStatus: RelativeDirection | null;
  pendingCount: number;
  bestAverage: number | null;
};

export const INITIAL_DIRECTION_TRACKER: DirectionTracker = {
  status: 'sampling',
  pendingStatus: null,
  pendingCount: 0,
  bestAverage: null,
};

export type FinderSignalState = {
  readings: number[];
  smoothedRssi: number | null;
  direction: DirectionTracker;
};

export type FinderSignalAction =
  | { type: 'sample'; rssi: number }
  | { type: 'changedDirection' };

export const INITIAL_FINDER_SIGNAL_STATE: FinderSignalState = {
  readings: [],
  smoothedRssi: null,
  direction: INITIAL_DIRECTION_TRACKER,
};

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

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getDirectionCandidate(
  readings: number[],
  bestAverage: number | null,
): { status: RelativeDirection; bestAverage: number | null } {
  if (readings.length < DIRECTION_WINDOW_SIZE) {
    return { status: 'sampling', bestAverage };
  }

  const recentAverage = average(readings.slice(-DIRECTION_WINDOW_SIZE));
  const nextBestAverage = bestAverage === null ? recentAverage : Math.max(bestAverage, recentAverage);

  if (readings.length < DIRECTION_WINDOW_SIZE * 2) {
    return { status: 'sampling', bestAverage: nextBestAverage };
  }

  const priorAverage = average(
    readings.slice(-DIRECTION_WINDOW_SIZE * 2, -DIRECTION_WINDOW_SIZE),
  );
  const change = recentAverage - priorAverage;

  if (change >= TREND_TOLERANCE_DBM) {
    const atSessionBest = recentAverage >= nextBestAverage - BEST_DIRECTION_TOLERANCE_DBM;
    return { status: atSessionBest ? 'strongest' : 'stronger', bestAverage: nextBestAverage };
  }
  if (change <= -TREND_TOLERANCE_DBM) {
    return { status: 'weaker', bestAverage: nextBestAverage };
  }
  if (nextBestAverage - recentAverage >= TRY_ANOTHER_DIRECTION_GAP_DBM) {
    return { status: 'tryAnother', bestAverage: nextBestAverage };
  }
  return { status: 'stable', bestAverage: nextBestAverage };
}

export function updateDirectionTracker(
  readings: number[],
  tracker: DirectionTracker,
): DirectionTracker {
  const candidate = getDirectionCandidate(readings, tracker.bestAverage);

  if (candidate.status === 'sampling') {
    return { ...tracker, status: 'sampling', bestAverage: candidate.bestAverage };
  }
  if (candidate.status === 'stable') {
    return {
      status: 'stable',
      pendingStatus: null,
      pendingCount: 0,
      bestAverage: candidate.bestAverage,
    };
  }
  if (candidate.status === tracker.status) {
    return {
      ...tracker,
      pendingStatus: null,
      pendingCount: 0,
      bestAverage: candidate.bestAverage,
    };
  }

  const pendingCount = candidate.status === tracker.pendingStatus ? tracker.pendingCount + 1 : 1;
  if (pendingCount >= DIRECTION_CONFIRMATION_SAMPLES) {
    return {
      status: candidate.status,
      pendingStatus: null,
      pendingCount: 0,
      bestAverage: candidate.bestAverage,
    };
  }

  return {
    ...tracker,
    status: tracker.status === 'sampling' ? 'stable' : tracker.status,
    pendingStatus: candidate.status,
    pendingCount,
    bestAverage: candidate.bestAverage,
  };
}

export function finderSignalReducer(
  state: FinderSignalState,
  action: FinderSignalAction,
): FinderSignalState {
  if (action.type === 'changedDirection') {
    return {
      ...state,
      readings: [],
      direction: {
        ...INITIAL_DIRECTION_TRACKER,
        bestAverage: state.direction.bestAverage,
      },
    };
  }

  const smoothedRssi = smoothRssi(state.smoothedRssi, action.rssi);
  const readings = [...state.readings, smoothedRssi].slice(-18);
  return {
    smoothedRssi,
    readings,
    direction: updateDirectionTracker(readings, state.direction),
  };
}
