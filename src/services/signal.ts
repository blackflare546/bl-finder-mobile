export const SIGNAL_LOSS_TIMEOUT_MS = 7_000;
export const TREND_TOLERANCE_DBM = 3;
export const RSSI_SMOOTHING_ALPHA = 0.24;
export const MEDIAN_WINDOW_SIZE = 5;
export const RAW_HISTORY_SIZE = 24;
export const SMOOTHED_HISTORY_SIZE = 24;
export const DIRECTION_WINDOW_SIZE = 4;
export const DIRECTION_CONFIRMATION_SAMPLES = 3;
export const STRONGEST_IMPROVEMENT_DBM = 2;
export const TRY_ANOTHER_DIRECTION_GAP_DBM = 5;
export const SIGNAL_LEVEL_HYSTERESIS_DBM = 2;
export const UNSTABLE_WINDOW_SIZE = 7;
export const UNSTABLE_RANGE_DBM = 18;
export const UNSTABLE_MEDIAN_DEVIATION_DBM = 4;

export type SignalLevelLabel = 'Very Close' | 'Close' | 'Nearby' | 'Weak' | 'Very Weak';

export type SignalLevel = {
  label: SignalLevelLabel;
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
  | 'strongest'
  | 'unstable';

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
  rawReadings: number[];
  filteredReadings: number[];
  readings: number[];
  rawRssi: number | null;
  filteredRssi: number | null;
  smoothedRssi: number | null;
  signalLevel: SignalLevel | null;
  direction: DirectionTracker;
};

export type FinderSignalAction =
  | { type: 'sample'; rssi: number }
  | { type: 'changedDirection' };

export const INITIAL_FINDER_SIGNAL_STATE: FinderSignalState = {
  rawReadings: [],
  filteredReadings: [],
  readings: [],
  rawRssi: null,
  filteredRssi: null,
  smoothedRssi: null,
  signalLevel: null,
  direction: INITIAL_DIRECTION_TRACKER,
};

const SIGNAL_LEVELS: (SignalLevel & { minimum: number })[] = [
  { label: 'Very Close', color: '#16A36A', progress: 1, minimum: -55 },
  { label: 'Close', color: '#35B46F', progress: 0.8, minimum: -65 },
  { label: 'Nearby', color: '#E9A23B', progress: 0.6, minimum: -75 },
  { label: 'Weak', color: '#E36F3D', progress: 0.4, minimum: -85 },
  { label: 'Very Weak', color: '#D04C4C', progress: 0.2, minimum: Number.NEGATIVE_INFINITY },
];

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function filterRssiSample(recentRawReadings: number[], next: number): number {
  const window = [...recentRawReadings.slice(-(MEDIAN_WINDOW_SIZE - 1)), next];
  return window.length < 3 ? next : median(window);
}

export function smoothRssi(previous: number | null, next: number): number {
  if (previous === null) return next;
  return previous + RSSI_SMOOTHING_ALPHA * (next - previous);
}

export function getSignalLevel(
  rssi: number,
  previousLabel?: SignalLevelLabel,
): SignalLevel {
  const candidateIndex = SIGNAL_LEVELS.findIndex((level) => rssi >= level.minimum);
  const candidate = SIGNAL_LEVELS[candidateIndex];
  if (!previousLabel) return candidate;

  const previousIndex = SIGNAL_LEVELS.findIndex((level) => level.label === previousLabel);
  if (previousIndex < 0 || candidateIndex === previousIndex) return candidate;

  if (candidateIndex < previousIndex) {
    const strongerBoundary = SIGNAL_LEVELS[candidateIndex].minimum + SIGNAL_LEVEL_HYSTERESIS_DBM;
    return rssi >= strongerBoundary ? candidate : SIGNAL_LEVELS[previousIndex];
  }

  const weakerBoundary = SIGNAL_LEVELS[previousIndex].minimum - SIGNAL_LEVEL_HYSTERESIS_DBM;
  return rssi < weakerBoundary ? candidate : SIGNAL_LEVELS[previousIndex];
}

export function getSignalTrend(readings: number[]): SignalTrend {
  if (readings.length < DIRECTION_WINDOW_SIZE * 2) return 'stable';

  const recent = readings.slice(-DIRECTION_WINDOW_SIZE);
  const prior = readings.slice(-DIRECTION_WINDOW_SIZE * 2, -DIRECTION_WINDOW_SIZE);
  const change = average(recent) - average(prior);

  if (change >= TREND_TOLERANCE_DBM) return 'stronger';
  if (change <= -TREND_TOLERANCE_DBM) return 'weaker';
  return 'stable';
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function isSignalUnstable(rawReadings: number[]): boolean {
  const recent = rawReadings.slice(-UNSTABLE_WINDOW_SIZE);
  if (recent.length < UNSTABLE_WINDOW_SIZE) return false;

  const center = median(recent);
  const medianDeviation = median(recent.map((value) => Math.abs(value - center)));
  const range = Math.max(...recent) - Math.min(...recent);
  const significantDeltas = recent
    .slice(1)
    .map((value, index) => value - recent[index])
    .filter((delta) => Math.abs(delta) >= TREND_TOLERANCE_DBM);
  const directionChanges = significantDeltas.slice(1).filter(
    (delta, index) => Math.sign(delta) !== Math.sign(significantDeltas[index]),
  ).length;

  return (
    range >= UNSTABLE_RANGE_DBM &&
    medianDeviation >= UNSTABLE_MEDIAN_DEVIATION_DBM &&
    directionChanges >= 3
  );
}

export function getDirectionCandidate(
  readings: number[],
  bestAverage: number | null,
  unstable = false,
): { status: RelativeDirection; bestAverage: number | null } {
  if (unstable) return { status: 'unstable', bestAverage };
  if (readings.length < DIRECTION_WINDOW_SIZE) {
    return { status: 'sampling', bestAverage };
  }

  const recentAverage = average(readings.slice(-DIRECTION_WINDOW_SIZE));
  if (readings.length < DIRECTION_WINDOW_SIZE * 2) {
    return {
      status: 'sampling',
      bestAverage: bestAverage === null ? recentAverage : Math.max(bestAverage, recentAverage),
    };
  }

  const priorAverage = average(
    readings.slice(-DIRECTION_WINDOW_SIZE * 2, -DIRECTION_WINDOW_SIZE),
  );
  const change = recentAverage - priorAverage;
  const previousBest = bestAverage ?? priorAverage;
  const nextBestAverage = Math.max(previousBest, recentAverage);

  if (change >= TREND_TOLERANCE_DBM) {
    const isNewStrongest = recentAverage >= previousBest + STRONGEST_IMPROVEMENT_DBM;
    return {
      status: isNewStrongest ? 'strongest' : 'stronger',
      bestAverage: nextBestAverage,
    };
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
  unstable = false,
): DirectionTracker {
  const candidate = getDirectionCandidate(readings, tracker.bestAverage, unstable);

  if (candidate.status === 'sampling') {
    return {
      ...tracker,
      status: 'sampling',
      pendingStatus: null,
      pendingCount: 0,
      bestAverage: candidate.bestAverage,
    };
  }
  if (candidate.status === 'unstable') {
    return {
      status: 'unstable',
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
    pendingStatus: candidate.status,
    pendingCount,
    // Do not promote a candidate peak until it has passed confirmation.
    bestAverage: tracker.bestAverage,
  };
}

export function finderSignalReducer(
  state: FinderSignalState,
  action: FinderSignalAction,
): FinderSignalState {
  if (action.type === 'changedDirection') {
    return {
      ...INITIAL_FINDER_SIGNAL_STATE,
      direction: {
        ...INITIAL_DIRECTION_TRACKER,
        bestAverage: state.direction.bestAverage,
      },
    };
  }

  if (!Number.isFinite(action.rssi)) return state;

  const filteredRssi = filterRssiSample(state.rawReadings, action.rssi);
  const smoothedRssi = smoothRssi(state.smoothedRssi, filteredRssi);
  const rawReadings = [...state.rawReadings, action.rssi].slice(-RAW_HISTORY_SIZE);
  const filteredReadings = [...state.filteredReadings, filteredRssi].slice(-RAW_HISTORY_SIZE);
  const readings = [...state.readings, smoothedRssi].slice(-SMOOTHED_HISTORY_SIZE);
  const unstable = isSignalUnstable(rawReadings);
  const signalLevel = getSignalLevel(smoothedRssi, state.signalLevel?.label);

  return {
    rawReadings,
    filteredReadings,
    readings,
    rawRssi: action.rssi,
    filteredRssi,
    smoothedRssi,
    signalLevel,
    direction: updateDirectionTracker(readings, state.direction, unstable),
  };
}
