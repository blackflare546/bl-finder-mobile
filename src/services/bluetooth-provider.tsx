import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import BleManager, { BleScanMode, BleState, type Peripheral } from 'react-native-ble-manager';

export type BluetoothDevice = {
  id: string;
  name: string;
  rssi: number;
  lastSeen: number;
  isConnectable?: boolean;
};

type PermissionState = 'unknown' | 'granted' | 'denied';

type BluetoothContextValue = {
  adapterState: BleState | 'initializing';
  devices: BluetoothDevice[];
  error: string | null;
  hasScanned: boolean;
  isScanning: boolean;
  permissionState: PermissionState;
  enableBluetooth: () => Promise<void>;
  startScan: (clearExisting?: boolean) => Promise<void>;
  stopScan: () => Promise<void>;
};

const BluetoothContext = createContext<BluetoothContextValue | null>(null);

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission|unauthor/i.test(message)) return 'Bluetooth permission is required to scan.';
  if (/powered off|disabled|bluetooth.*off/i.test(message)) return 'Turn on Bluetooth to start scanning.';
  return message || 'Bluetooth scanning failed. Please try again.';
}

export function BluetoothProvider({ children }: PropsWithChildren) {
  const [adapterState, setAdapterState] = useState<BleState | 'initializing'>('initializing');
  const [devicesById, setDevicesById] = useState<Map<string, BluetoothDevice>>(() => new Map());
  const [error, setError] = useState<string | null>(() =>
    process.env.EXPO_OS === 'android' ? null : 'Bluetooth Finder is available on Android only.',
  );
  const [hasScanned, setHasScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (process.env.EXPO_OS !== 'android') {
      return;
    }

    const stateListener = BleManager.onDidUpdateState(({ state }) => {
      if (!mountedRef.current) return;
      setAdapterState(state);
      if (state !== BleState.On) setIsScanning(false);
    });
    const deviceListener = BleManager.onDiscoverPeripheral((peripheral: Peripheral) => {
      if (!mountedRef.current || !Number.isFinite(peripheral.rssi)) return;
      const name = peripheral.name?.trim() || peripheral.advertising?.localName?.trim() || 'Unnamed device';
      setDevicesById((current) => {
        const next = new Map(current);
        next.set(peripheral.id, {
          id: peripheral.id,
          name,
          rssi: peripheral.rssi,
          lastSeen: Date.now(),
          isConnectable: peripheral.advertising?.isConnectable,
        });
        return next;
      });
    });
    const stopListener = BleManager.onStopScan(({ status }) => {
      if (!mountedRef.current) return;
      setIsScanning(false);
      if (status !== 0 && status !== 10) {
        setError(`Bluetooth scan stopped with Android error ${status}.`);
      }
    });

    void BleManager.start({ showAlert: false })
      .then(() => BleManager.checkState())
      .then((state) => mountedRef.current && setAdapterState(state))
      .catch((reason) => mountedRef.current && setError(friendlyError(reason)));

    return () => {
      mountedRef.current = false;
      stateListener.remove();
      deviceListener.remove();
      stopListener.remove();
      void BleManager.stopScan().catch(() => undefined);
    };
  }, []);

  const requestPermissions = useCallback(async () => {
    const apiLevel = Number(Platform.Version);
    const permissions =
      apiLevel >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const granted = permissions.every(
      (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED,
    );
    setPermissionState(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  const startScan = useCallback(
    async (clearExisting = true) => {
      if (process.env.EXPO_OS !== 'android') return;
      setError(null);
      setHasScanned(true);

      try {
        const granted = permissionState === 'granted' || (await requestPermissions());
        if (!granted) {
          setError('Bluetooth permission was denied. Allow it in Android Settings to scan.');
          return;
        }

        const state = await BleManager.checkState();
        setAdapterState(state);
        if (state !== BleState.On) {
          setError('Bluetooth is off. Turn it on, then scan again.');
          return;
        }

        await BleManager.stopScan().catch(() => undefined);
        if (clearExisting) setDevicesById(new Map());
        await BleManager.scan({
          serviceUUIDs: [],
          seconds: 0,
          scanMode: BleScanMode.LowLatency,
          reportDelay: 0,
        });
        if (mountedRef.current) setIsScanning(true);
      } catch (reason) {
        if (mountedRef.current) {
          setIsScanning(false);
          setError(friendlyError(reason));
        }
      }
    },
    [permissionState, requestPermissions],
  );

  const stopScan = useCallback(async () => {
    try {
      await BleManager.stopScan();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      if (mountedRef.current) setIsScanning(false);
    }
  }, []);

  const enableBluetooth = useCallback(async () => {
    try {
      setError(null);
      await BleManager.enableBluetooth();
      const state = await BleManager.checkState();
      setAdapterState(state);
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }, []);

  const value = useMemo<BluetoothContextValue>(
    () => ({
      adapterState,
      devices: [...devicesById.values()].sort((a, b) => b.rssi - a.rssi),
      error,
      hasScanned,
      isScanning,
      permissionState,
      enableBluetooth,
      startScan,
      stopScan,
    }),
    [adapterState, devicesById, enableBluetooth, error, hasScanned, isScanning, permissionState, startScan, stopScan],
  );

  return <BluetoothContext.Provider value={value}>{children}</BluetoothContext.Provider>;
}

export function useBluetooth() {
  const value = useContext(BluetoothContext);
  if (!value) throw new Error('useBluetooth must be used inside BluetoothProvider.');
  return value;
}
