import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AndroidPermissionsStatus {
  notification: boolean;
  exactAlarm: boolean;
  batteryOptimization: boolean;
  fullScreenIntent: boolean;
  dndPolicy: boolean;
  fineLocation: boolean;
  backgroundLocation: boolean;
  calendar: boolean;
  isAndroid: boolean;
  sdkInt?: number;
}

interface AndroidPermissionsPluginInterface {
  checkPermissionsStatus(): Promise<AndroidPermissionsStatus>;
  requestEssentialPermissions(): Promise<AndroidPermissionsStatus>;
  openExactAlarmSettings(): Promise<void>;
  openBatteryOptimizationSettings(): Promise<void>;
  openFullScreenIntentSettings(): Promise<void>;
  openDndSettings(): Promise<void>;
  requestBackgroundLocation(): Promise<AndroidPermissionsStatus>;
  openAppSystemSettings(): Promise<void>;
}

const AndroidPermissionsPlugin = registerPlugin<AndroidPermissionsPluginInterface>('AndroidPermissions');

export function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function checkAndroidPermissionsStatus(): Promise<AndroidPermissionsStatus> {
  if (!isAndroidNative()) {
    // Web / Desktop fallback (All permissions simulated or marked as desktop-ready)
    return {
      notification: typeof Notification !== 'undefined' && Notification.permission === 'granted',
      exactAlarm: true,
      batteryOptimization: true,
      fullScreenIntent: true,
      dndPolicy: true,
      fineLocation: true,
      backgroundLocation: true,
      calendar: true,
      isAndroid: false,
    };
  }

  try {
    return await AndroidPermissionsPlugin.checkPermissionsStatus();
  } catch (err) {
    console.warn('[AndroidPermissions] check failed:', err);
    return {
      notification: false,
      exactAlarm: false,
      batteryOptimization: false,
      fullScreenIntent: false,
      dndPolicy: false,
      fineLocation: false,
      backgroundLocation: false,
      calendar: false,
      isAndroid: true,
    };
  }
}

export async function requestEssentialAndroidPermissions(): Promise<AndroidPermissionsStatus> {
  if (!isAndroidNative()) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
    }
    return checkAndroidPermissionsStatus();
  }

  try {
    return await AndroidPermissionsPlugin.requestEssentialPermissions();
  } catch (err) {
    console.warn('[AndroidPermissions] requestEssential failed:', err);
    return checkAndroidPermissionsStatus();
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await AndroidPermissionsPlugin.openExactAlarmSettings();
  } catch (err) {
    console.warn('[AndroidPermissions] openExactAlarmSettings failed:', err);
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await AndroidPermissionsPlugin.openBatteryOptimizationSettings();
  } catch (err) {
    console.warn('[AndroidPermissions] openBatteryOptimizationSettings failed:', err);
  }
}

export async function openFullScreenIntentSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await AndroidPermissionsPlugin.openFullScreenIntentSettings();
  } catch (err) {
    console.warn('[AndroidPermissions] openFullScreenIntentSettings failed:', err);
  }
}

export async function openDndSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await AndroidPermissionsPlugin.openDndSettings();
  } catch (err) {
    console.warn('[AndroidPermissions] openDndSettings failed:', err);
  }
}

export async function requestBackgroundLocation(): Promise<AndroidPermissionsStatus> {
  if (!isAndroidNative()) return checkAndroidPermissionsStatus();
  try {
    return await AndroidPermissionsPlugin.requestBackgroundLocation();
  } catch (err) {
    console.warn('[AndroidPermissions] requestBackgroundLocation failed:', err);
    return checkAndroidPermissionsStatus();
  }
}

export async function openAppSystemSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await AndroidPermissionsPlugin.openAppSystemSettings();
  } catch (err) {
    console.warn('[AndroidPermissions] openAppSystemSettings failed:', err);
  }
}
