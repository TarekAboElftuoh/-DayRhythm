import { DEVICE_ID_STORAGE_KEY, type NativeBatteryReading } from '../types/appTypes';

interface NativeBridgeWindow {
  __dayRhythmNativeBattery?: {
    levelPct?: number;
    charging?: boolean;
    chargeTimeRemainingMin?: number;
    deviceLabel?: string;
    chargeLimitPct?: number;
    updatedAtMs?: number;
  };
  DayRhythmNative?: {
    getBatterySnapshotJson?: () => string;
    dismissActiveAlerts?: () => void;
    stopNativeAlarmSound?: () => void;
    dismissAlarm?: () => void;
  };
  chrome?: { webview?: { postMessage?: (msg: string) => void } };
}

const nativeBridgeWindow = (): Window & NativeBridgeWindow =>
  window as Window & NativeBridgeWindow;

/** Stable per-device id used to tag cross-device sync packets. */
export function resolveMyDeviceId(): string {
  if (typeof window === 'undefined') return 'device_unknown';
  if (nativeBridgeWindow().DayRhythmNative) {
    return 'device_mobile';
  }
  if (nativeBridgeWindow().chrome?.webview?.postMessage) {
    return 'device_pc';
  }
  try {
    const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) return stored;
    const gen = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, gen);
    return gen;
  } catch {
    return 'device_web';
  }
}

/** Silences any alert already playing in the WebView2 / Android shell. */
export function stopNativeAlerts(): void {
  try {
    nativeBridgeWindow().chrome?.webview?.postMessage?.(JSON.stringify({ type: 'stop-alert' }));
  } catch {
    // ignore WebView2 postMessage errors
  }
  try {
    const androidBridge = nativeBridgeWindow().DayRhythmNative;
    androidBridge?.stopNativeAlarmSound?.();
    androidBridge?.dismissActiveAlerts?.();
    androidBridge?.dismissAlarm?.();
  } catch {
    // ignore Android bridge errors
  }
}

export function clampBatteryLevel(levelPct: number): number {
  return Math.max(0, Math.min(100, Math.round(levelPct)));
}

export function clampChargeEtaMin(chargeTimeRemainingMin: number): number {
  if (typeof chargeTimeRemainingMin !== 'number' || !Number.isFinite(chargeTimeRemainingMin)) {
    return -1;
  }
  return Math.max(-1, Math.min(1440, Math.round(chargeTimeRemainingMin)));
}

/** Reads the native battery snapshot exposed by the Windows / Android shell. */
export function readNativeBatterySnapshot(): NativeBatteryReading | null {
  const bridge = nativeBridgeWindow();
  if (bridge.DayRhythmNative?.getBatterySnapshotJson) {
    try {
      const parsed = JSON.parse(bridge.DayRhythmNative.getBatterySnapshotJson()) as {
        levelPct?: number;
        charging?: boolean;
        chargeTimeRemainingMin?: number;
        deviceLabel?: string;
      };
      if (typeof parsed.levelPct === 'number') {
        return {
          levelPct: parsed.levelPct,
          charging: Boolean(parsed.charging),
          deviceLabel: parsed.deviceLabel || 'OnePlus 12R',
          chargeTimeRemainingMin:
            typeof parsed.chargeTimeRemainingMin === 'number' ? parsed.chargeTimeRemainingMin : -1,
        };
      }
    } catch {
      // ignore malformed native battery JSON
    }
  }
  const nativeBattery = bridge.__dayRhythmNativeBattery;
  if (nativeBattery && typeof nativeBattery.levelPct === 'number') {
    return {
      levelPct: nativeBattery.levelPct,
      charging: Boolean(nativeBattery.charging),
      deviceLabel: nativeBattery.deviceLabel || 'OnePlus 12R',
      chargeTimeRemainingMin:
        typeof nativeBattery.chargeTimeRemainingMin === 'number'
          ? nativeBattery.chargeTimeRemainingMin
          : -1,
      chargeLimitPct: nativeBattery.chargeLimitPct,
      updatedAtMs: nativeBattery.updatedAtMs,
    };
  }
  return null;
}
