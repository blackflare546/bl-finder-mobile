# Bluetooth setup

Bluetooth Finder targets Android only and uses `react-native-ble-manager` 12.x with Expo SDK 57 / React Native 0.86. The library supports React Native's new architecture, provides Android BLE scanning events, and includes an Expo config plugin.

## Native requirements

- BLE is native code, so the app does **not** run in Expo Go. Use an Android development build.
- The config plugin adds `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` for Android 12+ and location permission with a maximum SDK of 30 for older supported Android versions.
- `neverForLocation` is enabled because scan results are used only as a local proximity hint. The app has no GPS, maps, location storage, or background tracking.
- BLE hardware is marked required. iOS Bluetooth permission configuration is disabled.
- Runtime permission requests use Nearby devices on Android 12+ and fine location on Android 7–11, as required for BLE discovery on those releases.

Changes to a native dependency or `app.json` require rebuilding the development client.

## Physical Android device

Connect a device with USB debugging enabled, then run:

```bash
npx expo run:android --device
```

After the development build is installed, later JavaScript-only iterations can use:

```bash
npx expo start --dev-client
```

For a cloud development APK, configure EAS and run `npx eas-cli@latest build --platform android --profile development`.

## Verification checklist

1. Launch on a physical Android 7+ device and grant Nearby devices (or location on Android 7–11).
2. Confirm the Bluetooth-off state and Turn on action.
3. Start and stop a scan; confirm repeated advertisements update RSSI without duplicate rows.
4. Select a device and move closer/farther, pausing between moves to confirm smoothing and trend tolerance.
5. Power off or move the target away and confirm the temporary-loss state appears after about seven seconds.
6. Leave the finder and confirm scanning stops.

Some earphones and watches stop advertising while connected to another phone, asleep, or inside a closed charging case. RSSI is affected by walls, orientation, and the user's body, so it must not be presented as exact distance.
