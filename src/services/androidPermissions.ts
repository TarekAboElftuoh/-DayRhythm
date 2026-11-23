/**
 * Real Android System Permissions Service.
 * Communicates directly with native/android-webkit via window.DayRhythmNative.
 */

export interface AndroidPermissionsStatus {
  notifications: boolean;
  exactAlarm: boolean;
  batteryOptimization: boolean;
  fullScreenIntent: boolean;
  dndPolicy: boolean;
  location: boolean;
}

interface DayRhythmNativeBridge {
  getPermissionsStatusJson?: () => string;
  requestEssentialPermissions?: () => void;
  openExactAlarmSettings?: () => void;
  openBatteryOptimizationSettings?: () => void;
  openFullScreenIntentSettings?: () => void;
  openDndSettings?: () => void;
  openLiveAlertSettings?: () => void;
  openAppSystemSettings?: () => void;
}

function getNativeBridge(): DayRhythmNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as Window & { DayRhythmNative?: DayRhythmNativeBridge }).DayRhythmNative;
  return bridge || null;
}

export function isAndroidNative(): boolean {
  return Boolean(getNativeBridge());
}

export function getAndroidPermissionsStatus(): AndroidPermissionsStatus | null {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.getPermissionsStatusJson !== 'function') {
    return null;
  }
  try {
    const raw = bridge.getPermissionsStatusJson();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AndroidPermissionsStatus>;
    return {
      notifications: Boolean(parsed.notifications),
      exactAlarm: Boolean(parsed.exactAlarm),
      batteryOptimization: Boolean(parsed.batteryOptimization),
      fullScreenIntent: Boolean(parsed.fullScreenIntent),
      dndPolicy: Boolean(parsed.dndPolicy),
      location: Boolean(parsed.location),
    };
  } catch {
    return null;
  }
}

export function requestEssentialAndroidPermissions(): void {
  getNativeBridge()?.requestEssentialPermissions?.();
}

export function openExactAlarmSettings(): void {
  getNativeBridge()?.openExactAlarmSettings?.();
}

export function openBatteryOptimizationSettings(): void {
  getNativeBridge()?.openBatteryOptimizationSettings?.();
}

export function openFullScreenIntentSettings(): void {
  getNativeBridge()?.openFullScreenIntentSettings?.();
}

export function openDndSettings(): void {
  getNativeBridge()?.openDndSettings?.();
}

export function openLiveAlertSettings(): void {
  getNativeBridge()?.openLiveAlertSettings?.();
}

export function openAppSystemSettings(): void {
  getNativeBridge()?.openAppSystemSettings?.();
}
