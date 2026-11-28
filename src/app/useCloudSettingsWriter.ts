import { useCallback, useRef } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  AppSettingsPatch,
  CreativeActivityItem,
  DeletedWorkspaceSnapshot,
  DualStreaks,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PeriodicRitualStatus,
  PomodoroState,
  QuietModeType,
  SurfaceTheme,
  TaskSoundCategory,
  TravelState,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import type { AppSyncSettings, OnePlusDeviceSettings, SyncedRhythmPayload } from '../firebase';
import { sanitizeUiPrefs } from '../firebase';
import {
  emitCloudLiveSignal,
  saveCloudUserSettings,
  type UserSettingsPayload,
} from '../services/cloudStateService';
import { stopContinuousAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { getSavedCloudApiUrl } from '../services/apiClient';
import { persistToNativeSqlite, SPIRC_ACTION, SPIRC_ENTITY, type SpircClusterHandle } from '../services/spircClient';
import { RHYTHM_FIELD_GROUPS } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import { loadDeletedMedicationIds, loadMedicationsUpdatedAt } from '../hooks/medications/storage';
import { SCHEMA_VERSION } from '../utils/schemaMigration';
import { sanitizeRhythmPayload } from './sanitizers';
import { useIncomingRemoteSync } from './useIncomingRemoteSync';

export interface UseCloudSyncHandlersParams {
  firebaseUser: User | null;
  clientIdRef: React.MutableRefObject<string>;
  seenSyncOpIdsRef: React.MutableRefObject<Set<string>>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  lifeProfileRef: React.MutableRefObject<LifeProfile>;
  appSettingsRef: React.MutableRefObject<AppSyncSettings>;
  recentCloudWriteTimestampsRef: React.MutableRefObject<number[]>;
  pendingBurstPatchRef: React.MutableRefObject<Partial<UserSettingsPayload> | null>;
  pendingBurstFlushTimerRef: React.MutableRefObject<number | null>;
  lastSpircFullStateRef: React.MutableRefObject<Record<string, unknown>>;
  spircClusterRef: React.MutableRefObject<SpircClusterHandle | null>;
  isLoadingSettingsRef: React.MutableRefObject<boolean>;
  hasHydratedRemoteRef: React.MutableRefObject<boolean>;
  pendingPatchesBeforeHydrationRef: React.MutableRefObject<Array<Partial<UserSettingsPayload>>>;
  lastServerFieldsRef: React.MutableRefObject<Record<string, string>>;
  saveCloudUserSettingsRef: React.MutableRefObject<(patch?: Partial<UserSettingsPayload>) => Promise<void>>;
  hydrationHistory: HydrationDayLog[];
  lifeProfile: LifeProfile;
  streaks: DualStreaks;
  quietMode: QuietModeType;
  quietUntilTs: number | null;
  adhanOverrideSilent: boolean;
  sanctuaryOverrideUntilMs: number;
  surfaceTheme: SurfaceTheme;
  deviceSettings: OnePlusDeviceSettings;
  medications: MedicationItem[];
  creativeActivities: CreativeActivityItem[];
  habits: DynamicHabit[];
  memories: MemoryItem[];
  completedOverrides: Record<string, boolean>;
  fastingOverride: 'auto' | 'fasting' | 'normal';
  isFridayMode: boolean;
  includeBiweeklyPcCleanup: boolean;
  travelState: TravelState;
  pomodoro: PomodoroState;
  periodicRituals: PeriodicRitualStatus[];
  selectedLogoId: string;
  capsulePrefs: CapsulePrefs;
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  waterRemindersEnabled: boolean;
  sunMode: boolean;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setLastDeletedWorkspaceItem: React.Dispatch<React.SetStateAction<DeletedWorkspaceSnapshot | null>>;
  setFirestoreSynced: React.Dispatch<React.SetStateAction<boolean>>;
  fetchCalendarEvents: (tokenOverride?: string) => Promise<void>;
  fetchGoogleTasks: (tokenOverride?: string) => Promise<void>;
  refreshWorkspace: (tokenOverride?: string, options?: { forceGmail?: boolean }) => Promise<void>;
  triggerTaskAlert: (title: string, category: TaskSoundCategory, options?: Record<string, unknown>) => void;
  showToast: (msg: string) => void;
}

export function useCloudSyncHandlers(p: UseCloudSyncHandlersParams) {
  const { handleIncomingRemoteSync, handleIncomingRemoteSyncRef } = useIncomingRemoteSync(p);

  const saveCloudUserSettingsImmediately = useCallback(
    async (patch?: Partial<UserSettingsPayload>) => {
      let payload: Partial<UserSettingsPayload>;
      if (patch && Object.keys(patch).length > 0) {
        payload = {
          ...patch,
          originClientId: p.clientIdRef.current,
          updatedAtMs: Date.now(),
          schemaVersion: SCHEMA_VERSION,
          medicationsUpdatedAt: loadMedicationsUpdatedAt() || Date.now(),
          deletedMedicationIds: loadDeletedMedicationIds(),
        } as Partial<UserSettingsPayload>;
      } else {
        const todayEntry = p.hydrationHistory[p.hydrationHistory.length - 1];
        const currentProfile = p.lifeProfileRef.current || p.lifeProfile;
        const todayIso = getDateIsoInTimeZone(currentProfile.currentTimeZone || 'Africa/Cairo');
        payload = {
          hydrationDateKey: todayIso,
          cupsLogged: todayEntry?.cupsLogged ?? 0,
          targetCups: todayEntry?.targetCups ?? 13,
          hydrationWeeklyCounts: p.hydrationHistory.map((d) => d.cupsLogged),
          hydrationSlotOpIds: todayEntry?.slotOpIds ?? [],
          hydrationRemovedOpIds: todayEntry?.removedOpIds ?? [],
          hydrationUpdatedAtMs: todayEntry?.hydrationUpdatedAtMs ?? Date.now(),
          dailyCommitmentDays: p.streaks.dailyCommitmentDays,
          dailyCommitmentDoneToday: p.streaks.dailyCommitmentDoneToday,
          waterTargetDays: p.streaks.waterTargetDays,
          waterTargetDoneToday: p.streaks.waterTargetDoneToday,
          quietMode: p.quietMode,
          adhanOverrideSilent: p.adhanOverrideSilent,
          sanctuaryOverrideUntilMs: p.sanctuaryOverrideUntilMs,
          surfaceTheme: p.surfaceTheme,
          deviceSettings: p.deviceSettings,
          lifeProfile: currentProfile,
          medications: p.medications,
          creativeActivities: p.creativeActivities,
          habits: p.habits,
          memories: p.memories,
          originClientId: p.clientIdRef.current,
          completedOverrides: p.completedOverrides,
          fastingOverride: p.fastingOverride,
          isFridayMode: p.isFridayMode,
          includeBiweeklyPcCleanup: p.includeBiweeklyPcCleanup,
          travelState: p.travelState,
          pomodoro: p.pomodoro,
          periodicRituals: p.periodicRituals,
          appSettings: { ...p.appSettingsRef.current },
          uiPrefs: sanitizeUiPrefs({
            selectedLogoId: p.selectedLogoId,
            capsuleOrientation: p.capsulePrefs.orientation,
            capsuleSize: p.capsulePrefs.size,
            cloudApiUrl: getSavedCloudApiUrl() || undefined,
          }),
          updatedAtMs: Date.now(),
          schemaVersion: SCHEMA_VERSION,
          medicationsUpdatedAt: loadMedicationsUpdatedAt() || Date.now(),
          deletedMedicationIds: loadDeletedMedicationIds(),
        } as Partial<UserSettingsPayload>;
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('dayrhythm_sync');
          bc.postMessage({ type: 'settings_update', settings: payload, clientId: p.clientIdRef.current, timestampMs: Date.now() });
          bc.close();
        } catch { /* ignore */ }
      }

      const nowBurstMs = Date.now();
      p.recentCloudWriteTimestampsRef.current = p.recentCloudWriteTimestampsRef.current.filter((ts) => nowBurstMs - ts < 4000);
      if (p.recentCloudWriteTimestampsRef.current.length >= 6) {
        p.pendingBurstPatchRef.current = { ...(p.pendingBurstPatchRef.current || {}), ...payload, updatedAtMs: nowBurstMs };
        if (p.pendingBurstFlushTimerRef.current === null) {
          p.pendingBurstFlushTimerRef.current = window.setTimeout(() => {
            p.pendingBurstFlushTimerRef.current = null;
            const queued = p.pendingBurstPatchRef.current;
            p.pendingBurstPatchRef.current = null;
            if (queued) void p.saveCloudUserSettingsRef.current(queued);
          }, 1200);
        }
        return;
      }
      p.recentCloudWriteTimestampsRef.current.push(nowBurstMs);

      const mergedFullState = { ...p.lastSpircFullStateRef.current, ...(payload as unknown as Record<string, unknown>) };
      p.lastSpircFullStateRef.current = mergedFullState;
      persistToNativeSqlite('state_v3', SPIRC_ENTITY.STATE_V3, nowBurstMs, p.clientIdRef.current, nowBurstMs, false, mergedFullState);
      const sentViaSpirc = p.spircClusterRef.current?.sendJsonState('state_v3', SPIRC_ENTITY.STATE_V3, SPIRC_ACTION.UPSERT, mergedFullState);

      const liveUid = p.firebaseUser?.uid;
      if (!sentViaSpirc && liveUid && !p.firebaseUser?.isAnonymous) {
        const liveOpId = `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        void emitCloudLiveSignal(liveUid, {
          opId: liveOpId, clientId: p.clientIdRef.current, timestampMs: Date.now(), type: 'settings_patch', patch: payload,
        });
      }

      if (p.isLoadingSettingsRef.current || !p.hasHydratedRemoteRef.current) {
        console.warn('[CloudSync] Write queued: settings are currently unhydrated or loading from cloud.');
        if (patch) p.pendingPatchesBeforeHydrationRef.current.push(patch);
        return;
      }

      const uid = p.firebaseUser?.uid;
      if (!uid || p.firebaseUser?.isAnonymous) return;

      try {
        const ok = await saveCloudUserSettings(uid, payload);
        if (ok) {
          p.setFirestoreSynced(true);
          try {
            const present = payload as unknown as Record<string, unknown>;
            const sanitizedFull = sanitizeRhythmPayload(payload as SyncedRhythmPayload) as unknown as Record<string, unknown>;
            const updatedFields: Record<string, string> = {};
            for (const group of RHYTHM_FIELD_GROUPS) {
              for (const key of group) {
                if (present[key] !== undefined) updatedFields[key] = JSON.stringify(sanitizedFull[key] ?? null);
              }
            }
            p.lastServerFieldsRef.current = { ...p.lastServerFieldsRef.current, ...updatedFields };
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('[CloudSync] saveCloudUserSettings error:', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      p.firebaseUser?.uid, p.firebaseUser?.isAnonymous, p.hydrationHistory, p.lifeProfile, p.streaks,
      p.quietMode, p.quietUntilTs, p.adhanOverrideSilent, p.surfaceTheme, p.deviceSettings,
      p.medications, p.creativeActivities, p.habits, p.memories, p.phoneChargeLimitPct,
      p.smartChargeAlertEnabled, p.smartChargeKeepUntilUnplugged, p.waterRemindersEnabled,
      p.sunMode, p.selectedLogoId, p.capsulePrefs,
    ]
  );

  return {
    handleIncomingRemoteSync,
    handleIncomingRemoteSyncRef,
    saveCloudUserSettingsImmediately,
    pushToTasksVaultImmediately: saveCloudUserSettingsImmediately,
  };
}
