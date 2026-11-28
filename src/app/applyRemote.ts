import type React from 'react';
import {
  sanitizePhoneBattery,
  type SyncedRhythmPayload,
} from '../firebase';
import { RHYTHM_FIELD_GROUPS } from '../utils/appHelpers';
import { isMobileDevice } from '../services/platform';
import { migrateAppState } from '../utils/schemaMigration';
import { sanitizeRhythmPayload, sanitizeTravelState } from './sanitizers';
import { applyRemoteAlertsAndSettings, type ApplyRemoteCtx } from './applyRemoteAlertsAndSettings';
import { applyRemoteListsAndHydration, type ApplyRemoteListsCtx } from './applyRemoteLists';
import type {
  CreativeActivityItem,
  DynamicHabit,
  MedicationItem,
  MemoryItem,
  PeriodicRitualStatus,
  PhoneBatteryTelemetry,
  PomodoroState,
  TravelState,
} from '../types/dayrhythm';

export interface ApplyRemoteFullCtx extends ApplyRemoteCtx, ApplyRemoteListsCtx {
  lastFirestoreUpdatedAtRef: React.MutableRefObject<number>;
  LAST_FIRESTORE_UPDATED_AT_KEY: string;
  TRAVEL_STATE_STORAGE_KEY: string;
  completedOverridesRef: React.MutableRefObject<Record<string, boolean>>;
  fastingOverrideRef: React.MutableRefObject<'auto' | 'fasting' | 'normal'>;
  isFridayModeRef: React.MutableRefObject<boolean>;
  includeBiweeklyPcCleanupRef: React.MutableRefObject<boolean>;
  travelStateRef: React.MutableRefObject<TravelState>;
  pomodoroRef: React.MutableRefObject<PomodoroState>;
  periodicRitualsRef: React.MutableRefObject<PeriodicRitualStatus[]>;
  lastServerFieldsRef: React.MutableRefObject<Record<string, string>>;
  lastSpircFullStateRef: React.MutableRefObject<Record<string, unknown>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setFastingOverride: React.Dispatch<React.SetStateAction<'auto' | 'fasting' | 'normal'>>;
  setIsFridayMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIncludeBiweeklyPcCleanup: React.Dispatch<React.SetStateAction<boolean>>;
  setTravelState: React.Dispatch<React.SetStateAction<TravelState>>;
  setPomodoro: React.Dispatch<React.SetStateAction<PomodoroState>>;
  setPeriodicRituals: React.Dispatch<React.SetStateAction<PeriodicRitualStatus[]>>;
  setPhoneBattery: React.Dispatch<React.SetStateAction<PhoneBatteryTelemetry | null>>;
}

export function applyRemotePayload(
  remote: SyncedRhythmPayload & {
    medications?: MedicationItem[];
    creativeActivities?: CreativeActivityItem[];
    habits?: DynamicHabit[];
    memories?: MemoryItem[];
  },
  ctx: ApplyRemoteFullCtx
): void {
  const migratedRemote = migrateAppState(remote) as unknown as SyncedRhythmPayload;
  const remoteTs = (remote as { updatedAtMs?: number }).updatedAtMs;
  if (typeof remoteTs === 'number' && remoteTs > ctx.lastFirestoreUpdatedAtRef.current) {
    ctx.lastFirestoreUpdatedAtRef.current = remoteTs;
    try { localStorage.setItem(ctx.LAST_FIRESTORE_UPDATED_AT_KEY, String(remoteTs)); } catch { /* ignore */ }
  }

  applyRemoteAlertsAndSettings(remote, migratedRemote, ctx);
  applyRemoteListsAndHydration(remote, ctx);

  if (remote.completedOverrides && JSON.stringify(remote.completedOverrides) !== JSON.stringify(ctx.completedOverridesRef.current)) {
    ctx.completedOverridesRef.current = remote.completedOverrides;
    ctx.setCompletedOverrides(remote.completedOverrides);
  }
  if (remote.fastingOverride && remote.fastingOverride !== ctx.fastingOverrideRef.current) {
    ctx.fastingOverrideRef.current = remote.fastingOverride;
    ctx.setFastingOverride(remote.fastingOverride);
  }
  if (typeof remote.isFridayMode === 'boolean' && remote.isFridayMode !== ctx.isFridayModeRef.current) {
    ctx.isFridayModeRef.current = remote.isFridayMode;
    ctx.setIsFridayMode(remote.isFridayMode);
  }
  if (typeof remote.includeBiweeklyPcCleanup === 'boolean' && remote.includeBiweeklyPcCleanup !== ctx.includeBiweeklyPcCleanupRef.current) {
    ctx.includeBiweeklyPcCleanupRef.current = remote.includeBiweeklyPcCleanup;
    ctx.setIncludeBiweeklyPcCleanup(remote.includeBiweeklyPcCleanup);
  }
  if (remote.travelState && Date.now() >= ctx.localWriteLockUntilRef.current) {
    const cleanRemoteTravel = sanitizeTravelState(remote.travelState);
    if ((cleanRemoteTravel.updatedAt ?? 0) >= (ctx.travelStateRef.current.updatedAt ?? 0) && JSON.stringify(cleanRemoteTravel) !== JSON.stringify(ctx.travelStateRef.current)) {
      ctx.travelStateRef.current = cleanRemoteTravel;
      ctx.setTravelState(cleanRemoteTravel);
      try { localStorage.setItem(ctx.TRAVEL_STATE_STORAGE_KEY, JSON.stringify(cleanRemoteTravel)); } catch { /* ignore */ }
    }
  }
  if (remote.pomodoro && JSON.stringify(remote.pomodoro) !== JSON.stringify(ctx.pomodoroRef.current)) {
    ctx.pomodoroRef.current = remote.pomodoro;
    ctx.setPomodoro(remote.pomodoro);
  }
  if (Array.isArray(remote.periodicRituals) && JSON.stringify(remote.periodicRituals) !== JSON.stringify(ctx.periodicRitualsRef.current)) {
    ctx.periodicRitualsRef.current = remote.periodicRituals;
    ctx.setPeriodicRituals(remote.periodicRituals);
  }
  if (!isMobileDevice() && remote.phoneBattery) {
    const incomingBat = sanitizePhoneBattery(remote.phoneBattery);
    if (incomingBat) {
      ctx.setPhoneBattery((prev) =>
        prev && prev.levelPct === incomingBat.levelPct && prev.charging === incomingBat.charging &&
        prev.chargeLimitPct === incomingBat.chargeLimitPct && prev.chargeTimeRemainingMin === incomingBat.chargeTimeRemainingMin
          ? prev
          : incomingBat
      );
      ctx.setBatteryGuard((prev) => ({
        ...prev,
        levelPct: incomingBat.levelPct,
        cableConnected: incomingBat.charging,
        pcAlertActive: incomingBat.charging && incomingBat.levelPct >= incomingBat.chargeLimitPct && prev.bypassChargingLimitPct === null,
        autoSilencedByDisconnect: !incomingBat.charging && prev.cableConnected,
      }));
    }
  }

  try {
    const incomingObj = remote as unknown as Record<string, unknown>;
    const sanitizedRemote = sanitizeRhythmPayload(remote);
    const nextFields = { ...ctx.lastServerFieldsRef.current };
    for (const group of RHYTHM_FIELD_GROUPS) {
      for (const key of group) {
        if (incomingObj[key] !== undefined) {
          nextFields[key] = JSON.stringify((sanitizedRemote as unknown as Record<string, unknown>)[key] ?? null);
        }
      }
    }
    ctx.lastServerFieldsRef.current = nextFields;
    ctx.lastSpircFullStateRef.current = { ...ctx.lastSpircFullStateRef.current, ...incomingObj };
  } catch { /* ignore */ }
}
