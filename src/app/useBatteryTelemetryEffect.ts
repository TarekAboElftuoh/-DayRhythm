import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type { BatteryGuardState, PhoneBatteryTelemetry } from '../types/dayrhythm';
import { publishPhoneBatteryTelemetry } from '../firebase';
import { SPIRC_ACTION, SPIRC_ENTITY, type SpircClusterHandle } from '../services/spircClient';
import { detectIsMobileDeviceClient } from '../utils/appHelpers';
import { readNativeBatterySnapshot } from '../utils/deviceHelpers';

export interface UseBatteryTelemetryEffectParams {
  firebaseUser: User | null;
  firestoreSynced: boolean;
  wsConnected: boolean;
  phoneChargeLimitRef: React.MutableRefObject<number>;
  spircClusterRef: React.MutableRefObject<SpircClusterHandle | null>;
  setPhoneBattery: React.Dispatch<React.SetStateAction<PhoneBatteryTelemetry | null>>;
  setBatteryGuard: React.Dispatch<React.SetStateAction<BatteryGuardState>>;
}

export function useBatteryTelemetryEffect(p: UseBatteryTelemetryEffectParams): void {
  useEffect(() => {
    const isMobileClient = detectIsMobileDeviceClient();
    const nativeWindow = window as Window & {
      __dayRhythmNativeBattery?: {
        levelPct?: number;
        charging?: boolean;
        chargeTimeRemainingMin?: number;
        deviceLabel?: string;
        chargeLimitPct?: number;
        updatedAtMs?: number;
      };
      DayRhythmNative?: { getBatterySnapshotJson?: () => string };
    };

    if (!isMobileClient) {
      const onNativeBattery = (ev: Event) => {
        const detail = (
          ev as CustomEvent<{
            levelPct?: number;
            charging?: boolean;
            chargeTimeRemainingMin?: number;
            chargeLimitPct?: number;
            deviceLabel?: string;
            updatedAtMs?: number;
          }>
        ).detail;
        if (detail && typeof detail.levelPct === 'number') {
          const clampedLevel = Math.max(0, Math.min(100, Math.round(detail.levelPct)));
          const clampedEta =
            typeof detail.chargeTimeRemainingMin === 'number' && Number.isFinite(detail.chargeTimeRemainingMin)
              ? Math.max(-1, Math.min(1440, Math.round(detail.chargeTimeRemainingMin)))
              : -1;
          const limit =
            typeof detail.chargeLimitPct === 'number' && detail.chargeLimitPct > 0
              ? detail.chargeLimitPct
              : p.phoneChargeLimitRef.current;
          const incoming: PhoneBatteryTelemetry = {
            levelPct: clampedLevel,
            charging: Boolean(detail.charging),
            chargeLimitPct: limit,
            chargeTimeRemainingMin: detail.charging ? clampedEta : -1,
            updatedAtMs: typeof detail.updatedAtMs === 'number' ? detail.updatedAtMs : Date.now(),
            deviceLabel: detail.deviceLabel || 'OnePlus 12R',
          };
          p.setPhoneBattery(incoming);
          p.setBatteryGuard((prev) => ({
            ...prev,
            levelPct: incoming.levelPct,
            cableConnected: incoming.charging,
            pcAlertActive:
              incoming.charging &&
              incoming.levelPct >= incoming.chargeLimitPct &&
              prev.bypassChargingLimitPct === null,
            autoSilencedByDisconnect: !incoming.charging && prev.cableConnected,
          }));
        }
      };

      window.addEventListener('dayrhythm:native-battery', onNativeBattery);
      if (nativeWindow.__dayRhythmNativeBattery && typeof nativeWindow.__dayRhythmNativeBattery.levelPct === 'number') {
        const b = nativeWindow.__dayRhythmNativeBattery;
        p.setPhoneBattery({
          levelPct: Math.max(0, Math.min(100, Math.round(b.levelPct ?? 0))),
          charging: Boolean(b.charging),
          chargeLimitPct: b.chargeLimitPct || p.phoneChargeLimitRef.current,
          chargeTimeRemainingMin: b.charging ? (b.chargeTimeRemainingMin ?? -1) : -1,
          updatedAtMs: b.updatedAtMs || Date.now(),
          deviceLabel: b.deviceLabel || 'OnePlus 12R',
        });
      }
      return () => window.removeEventListener('dayrhythm:native-battery', onNativeBattery);
    }

    let lastSentKey = '';
    let lastFirestorePushMs = 0;
    let pushedToFirestoreOnce = false;

    const pushPhoneBattery = (
      levelPct: number,
      charging: boolean,
      deviceLabel: string,
      chargeTimeRemainingMin = -1
    ) => {
      const clampedLevel = Math.max(0, Math.min(100, Math.round(levelPct)));
      const clampedEta =
        typeof chargeTimeRemainingMin === 'number' && Number.isFinite(chargeTimeRemainingMin)
          ? Math.max(-1, Math.min(1440, Math.round(chargeTimeRemainingMin)))
          : -1;
      const limit = p.phoneChargeLimitRef.current;
      const nowMs = Date.now();
      const snapshot: PhoneBatteryTelemetry = {
        levelPct: clampedLevel,
        charging,
        chargeLimitPct: limit,
        chargeTimeRemainingMin: charging ? clampedEta : -1,
        updatedAtMs: nowMs,
        deviceLabel: deviceLabel || 'OnePlus 12R',
      };
      const dedupeKey = `${clampedLevel}:${charging ? 1 : 0}:${limit}:${snapshot.chargeTimeRemainingMin}`;
      const changed = dedupeKey !== lastSentKey;
      if (changed) {
        lastSentKey = dedupeKey;
        p.setPhoneBattery(snapshot);
        if (!nativeWindow.DayRhythmNative) {
          p.spircClusterRef.current?.sendJsonState(
            'phone_battery',
            SPIRC_ENTITY.STATE_V3,
            SPIRC_ACTION.BATTERY_TELEMETRY,
            snapshot
          );
        }
      }

      if (
        !nativeWindow.DayRhythmNative &&
        p.firebaseUser?.uid &&
        p.firebaseUser.emailVerified &&
        p.firestoreSynced &&
        (!pushedToFirestoreOnce || changed || (charging && nowMs - lastFirestorePushMs > 180_000))
      ) {
        pushedToFirestoreOnce = true;
        lastFirestorePushMs = nowMs;
        void publishPhoneBatteryTelemetry(p.firebaseUser.uid, snapshot).catch(() => {});
      }
    };

    const onNativeBattery = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ levelPct?: number; charging?: boolean; chargeTimeRemainingMin?: number; deviceLabel?: string }>
      ).detail;
      if (detail && typeof detail.levelPct === 'number') {
        pushPhoneBattery(
          detail.levelPct,
          Boolean(detail.charging),
          detail.deviceLabel || 'OnePlus 12R',
          typeof detail.chargeTimeRemainingMin === 'number' ? detail.chargeTimeRemainingMin : -1
        );
      }
    };
    window.addEventListener('dayrhythm:native-battery', onNativeBattery);

    const pullNativeBatterySnapshot = () => {
      const snapshot = readNativeBatterySnapshot();
      if (!snapshot) return false;
      pushPhoneBattery(snapshot.levelPct, snapshot.charging, snapshot.deviceLabel, snapshot.chargeTimeRemainingMin);
      return true;
    };

    pullNativeBatterySnapshot();
    const nativePollTimer = nativeWindow.DayRhythmNative?.getBatterySnapshotJson
      ? window.setInterval(pullNativeBatterySnapshot, 30_000)
      : null;

    type BatteryManagerLike = {
      level: number;
      charging: boolean;
      chargingTime?: number;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    };
    let batteryManager: BatteryManagerLike | null = null;
    let onWebBatteryChange: (() => void) | null = null;
    let pollTimer: number | null = null;

    const navWithBattery = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (!nativeWindow.DayRhythmNative && typeof navWithBattery.getBattery === 'function') {
      navWithBattery
        .getBattery()
        .then((bm) => {
          batteryManager = bm;
          const emitFromWeb = () => {
            const etaMin =
              bm.charging && typeof bm.chargingTime === 'number' && Number.isFinite(bm.chargingTime) && bm.chargingTime > 0 && bm.chargingTime < 86400
                ? Math.max(1, Math.round(bm.chargingTime / 60))
                : -1;
            pushPhoneBattery(Math.round(bm.level * 100), Boolean(bm.charging), 'الهاتف', etaMin);
          };
          onWebBatteryChange = emitFromWeb;
          emitFromWeb();
          bm.addEventListener('levelchange', emitFromWeb);
          bm.addEventListener('chargingchange', emitFromWeb);
          bm.addEventListener('chargingtimechange', emitFromWeb);
          pollTimer = window.setInterval(emitFromWeb, 25_000);
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('dayrhythm:native-battery', onNativeBattery);
      if (nativePollTimer !== null) window.clearInterval(nativePollTimer);
      if (batteryManager && onWebBatteryChange) {
        batteryManager.removeEventListener('levelchange', onWebBatteryChange);
        batteryManager.removeEventListener('chargingchange', onWebBatteryChange);
        batteryManager.removeEventListener('chargingtimechange', onWebBatteryChange);
      }
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.firebaseUser?.uid, p.firebaseUser?.emailVerified, p.firestoreSynced, p.wsConnected]);
}
