import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
  QuietModeType,
  SurfaceTheme,
  TravelState,
} from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import {
  sanitizeUiPrefs,
  type AppSyncSettings,
  type OnePlusDeviceSettings,
  type SyncedRhythmPayload,
} from '../firebase';
import type { UserSettingsPayload } from '../services/cloudStateService';
import type { TasksVaultPayload } from '../types/appTypes';
import { getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';
import { saveToGoogleDriveAppData, type FullDayRhythmCloudBackup } from '../services/googleDriveStorage';
import { getSavedCloudApiUrl } from '../services/apiClient';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { MEDS_STORAGE_KEY } from '../hooks/medications/storage';
import {
  CREATIVE_STORAGE_KEY,
  HABITS_STORAGE_KEY,
  MEMORIES_STORAGE_KEY,
  RHYTHM_FIELD_GROUPS,
  serializeRhythmFields,
  STORAGE_KEY,
  WATER_REMINDER_STORAGE_KEY,
} from '../utils/appHelpers';
import { SCHEMA_VERSION } from '../utils/schemaMigration';
import { sanitizeRhythmPayload } from './sanitizers';

export interface UseAutoBackupEffectsParams {
  activeTimeZone: string;
  firebaseUser: User | null;
  firestoreReady: boolean;
  cloudPausedUntil: number;
  medications: MedicationItem[];
  creativeActivities: CreativeActivityItem[];
  habits: DynamicHabit[];
  memories: MemoryItem[];
  waterRemindersEnabled: boolean;
  hydrationHistory: HydrationDayLog[];
  streaks: DualStreaks;
  lifeProfile: LifeProfile;
  deviceSettings: OnePlusDeviceSettings;
  quietMode: QuietModeType;
  quietUntilTs: number | null;
  adhanOverrideSilent: boolean;
  sanctuaryOverrideUntilMs: number;
  surfaceTheme: SurfaceTheme;
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  sunMode: boolean;
  includePrayerAnchors: boolean;
  capsulePrefs: CapsulePrefs;
  selectedLogoId: string;
  travelState: TravelState;
  chatMessages: PersistedChatMessage[];
  hasHydratedGoogleDriveRef: React.MutableRefObject<boolean>;
  isSavingGoogleDriveRef: React.MutableRefObject<boolean>;
  isLoadingSettingsRef: React.MutableRefObject<boolean>;
  hasHydratedRemoteRef: React.MutableRefObject<boolean>;
  clientIdRef: React.MutableRefObject<string>;
  appSettingsRef: React.MutableRefObject<AppSyncSettings>;
  lastServerFieldsRef: React.MutableRefObject<Record<string, string>>;
  setGoogleDriveSynced: React.Dispatch<React.SetStateAction<boolean>>;
  setFirestoreSynced: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
}

export function useAutoBackupEffects(p: UseAutoBackupEffectsParams): void {
  useEffect(() => {
    try { localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(p.medications)); } catch { /* ignore */ }
  }, [p.medications]);

  useEffect(() => {
    try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(p.creativeActivities)); } catch { /* ignore */ }
  }, [p.creativeActivities]);

  useEffect(() => {
    try { localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(p.habits)); } catch { /* ignore */ }
  }, [p.habits]);

  useEffect(() => {
    try { localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(p.waterRemindersEnabled)); } catch { /* ignore */ }
  }, [p.waterRemindersEnabled]);

  useEffect(() => {
    try { localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(p.memories)); } catch { /* ignore */ }
  }, [p.memories]);

  useEffect(() => {
    if (!p.hasHydratedGoogleDriveRef.current) return;
    const timer = window.setTimeout(async () => {
      const token = await getOrRefreshCalendarAccessToken();
      if (!token) return;
      const backup: FullDayRhythmCloudBackup & {
        schemaVersion: number;
        quietUntilTs?: number | null;
        quietModeUpdatedAt?: number;
        sanctuaryOverrideUntilMs?: number;
        travelState?: TravelState;
      } = {
        version: 1,
        schemaVersion: SCHEMA_VERSION,
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now(),
        lifeProfile: p.lifeProfile,
        medications: p.medications,
        hydrationHistory: p.hydrationHistory,
        creativeActivities: p.creativeActivities,
        habits: p.habits,
        memories: p.memories,
        deviceSettings: p.deviceSettings,
        quietMode: p.quietMode,
        quietUntilTs: p.quietUntilTs,
        quietModeUpdatedAt: (() => {
          try { return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now(); } catch { return Date.now(); }
        })(),
        adhanOverrideSilent: p.adhanOverrideSilent,
        sanctuaryOverrideUntilMs: p.sanctuaryOverrideUntilMs,
        waterRemindersEnabled: p.waterRemindersEnabled,
        phoneChargeLimitPct: p.phoneChargeLimitPct,
        smartChargeAlertEnabled: p.smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged: p.smartChargeKeepUntilUnplugged,
        capsulePrefs: p.capsulePrefs,
        selectedLogoId: p.selectedLogoId,
        travelState: p.travelState,
        chatMessages: p.chatMessages.slice(-50),
      };

      if (p.isSavingGoogleDriveRef.current) return;
      p.isSavingGoogleDriveRef.current = true;
      try {
        const ok = await saveToGoogleDriveAppData(token, backup);
        if (ok) p.setGoogleDriveSynced(true);
      } finally {
        p.isSavingGoogleDriveRef.current = false;
      }
    }, 60_000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.lifeProfile, p.medications, p.hydrationHistory, p.creativeActivities, p.habits, p.memories,
    p.deviceSettings, p.quietMode, p.adhanOverrideSilent, p.sanctuaryOverrideUntilMs,
    p.waterRemindersEnabled, p.phoneChargeLimitPct, p.smartChargeAlertEnabled,
    p.smartChargeKeepUntilUnplugged, p.capsulePrefs, p.selectedLogoId, p.travelState, p.chatMessages,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hydrationHistory: p.hydrationHistory, deviceSettings: p.deviceSettings, lifeProfile: p.lifeProfile })
      );
    } catch { /* ignore */ }

    if (p.isLoadingSettingsRef.current || !p.hasHydratedRemoteRef.current) return;
    const todayEntry = p.hydrationHistory[p.hydrationHistory.length - 1];
    if (!todayEntry) return;

    const payload: TasksVaultPayload & { quietUntilTs?: number | null; quietModeUpdatedAt?: number } = {
      updatedAtMs: Date.now(),
      originClientId: p.clientIdRef.current,
      hydrationDateKey: getDateIsoInTimeZone(p.activeTimeZone),
      cupsLogged: todayEntry.cupsLogged,
      targetCups: todayEntry.targetCups,
      hydrationWeeklyCounts: p.hydrationHistory.map((d) => d.cupsLogged),
      hydrationSlotOpIds: todayEntry.slotOpIds ?? [],
      hydrationRemovedOpIds: todayEntry.removedOpIds ?? [],
      hydrationUpdatedAtMs: todayEntry.hydrationUpdatedAtMs ?? 0,
      dailyCommitmentDays: p.streaks.dailyCommitmentDays,
      dailyCommitmentDoneToday: p.streaks.dailyCommitmentDoneToday,
      waterTargetDays: p.streaks.waterTargetDays,
      waterTargetDoneToday: p.streaks.waterTargetDoneToday,
      quietMode: p.quietMode,
      quietUntilTs: p.quietUntilTs,
      quietModeUpdatedAt: (() => {
        try { return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now(); } catch { return Date.now(); }
      })(),
      adhanOverrideSilent: p.adhanOverrideSilent,
      surfaceTheme: p.surfaceTheme,
      deviceSettings: p.deviceSettings,
      lifeProfile: p.lifeProfile,
      medications: p.medications,
      creativeActivities: p.creativeActivities,
      habits: p.habits,
      memories: p.memories,
      appSettings: { ...p.appSettingsRef.current },
      uiPrefs: sanitizeUiPrefs({
        selectedLogoId: p.selectedLogoId,
        capsuleOrientation: p.capsulePrefs.orientation,
        capsuleSize: p.capsulePrefs.size,
        cloudApiUrl: getSavedCloudApiUrl() || undefined,
      }),
    };

    const localFields = serializeRhythmFields(sanitizeRhythmPayload(payload as SyncedRhythmPayload));
    const serverFields = p.lastServerFieldsRef.current;
    const changedKeys: Array<keyof SyncedRhythmPayload> = [];
    for (const group of RHYTHM_FIELD_GROUPS) {
      if (group.some((key) => localFields[key] !== serverFields[key])) changedKeys.push(...group);
    }
    if (changedKeys.length === 0) return;

    const patch: Record<string, unknown> = {};
    const payloadRecord = payload as unknown as Record<string, unknown>;
    for (const key of changedKeys) {
      patch[key] = payloadRecord[key];
    }

    p.lastServerFieldsRef.current = { ...p.lastServerFieldsRef.current, ...localFields };
    void p.pushToTasksVaultImmediately(patch as Partial<UserSettingsPayload>);
    p.setFirestoreSynced(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.activeTimeZone, p.firebaseUser?.uid, p.firestoreReady, p.hydrationHistory, p.streaks,
    p.quietMode, p.adhanOverrideSilent, p.surfaceTheme, p.deviceSettings, p.lifeProfile,
    p.medications, p.creativeActivities, p.habits, p.memories, p.phoneChargeLimitPct,
    p.smartChargeAlertEnabled, p.smartChargeKeepUntilUnplugged, p.waterRemindersEnabled,
    p.sunMode, p.includePrayerAnchors, p.selectedLogoId, p.capsulePrefs.orientation,
    p.capsulePrefs.size, p.cloudPausedUntil, p.pushToTasksVaultImmediately,
  ]);
}
