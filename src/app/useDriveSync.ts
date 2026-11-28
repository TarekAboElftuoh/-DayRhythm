import { useCallback } from 'react';
import type React from 'react';
import type {
  CreativeActivityItem,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
  QuietModeType,
  TravelState,
} from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import type { OnePlusDeviceSettings } from '../firebase';
import { getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';
import { saveToGoogleDriveAppData, type FullDayRhythmCloudBackup } from '../services/googleDriveStorage';
import { SCHEMA_VERSION } from '../utils/schemaMigration';
import { loadDeletedMedicationIds, loadMedicationsUpdatedAt } from '../hooks/medications/storage';
import { hydrateDriveBackup, type HydrateDriveCtx } from './hydrateDriveBackup';

export interface UseDriveSyncParams extends HydrateDriveCtx {
  setIsSyncingGoogleDrive: React.Dispatch<React.SetStateAction<boolean>>;
  lifeProfile: LifeProfile;
  medications: MedicationItem[];
  hydrationHistory: HydrationDayLog[];
  creativeActivities: CreativeActivityItem[];
  habits: DynamicHabit[];
  memories: MemoryItem[];
  deviceSettings: OnePlusDeviceSettings;
  quietMode: QuietModeType;
  quietUntilTs: number | null;
  adhanOverrideSilent: boolean;
  sanctuaryOverrideUntilMs: number;
  waterRemindersEnabled: boolean;
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  capsulePrefs: CapsulePrefs;
  selectedLogoId: string;
  travelState: TravelState;
  chatMessages: PersistedChatMessage[];
}

export function useDriveSync(p: UseDriveSyncParams) {
  const { setIsSyncingGoogleDrive, hasHydratedGoogleDriveRef, setGoogleDriveSynced, showToast } = p;

  const hydrateGoogleDriveOnce = useCallback(
    async (customToken?: string): Promise<boolean> => {
      const token = customToken || (await getOrRefreshCalendarAccessToken());
      if (!token) {
        hasHydratedGoogleDriveRef.current = true;
        return false;
      }
      setIsSyncingGoogleDrive(true);
      try {
        return await hydrateDriveBackup(token, p);
      } catch (err) {
        console.warn('Failed hydrating Google Drive appData:', err);
        hasHydratedGoogleDriveRef.current = true;
        return false;
      } finally {
        setIsSyncingGoogleDrive(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showToast]
  );

  const pushFullCloudBackupImmediately = useCallback(
    async (
      customToken?: string,
      overrides?: Partial<FullDayRhythmCloudBackup> & { travelState?: TravelState }
    ): Promise<boolean> => {
      const token = customToken || (await getOrRefreshCalendarAccessToken());
      if (!token) return false;

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
        lifeProfile: overrides?.lifeProfile ?? p.lifeProfile,
        medications: overrides?.medications ?? p.medications,
        ...({
          medicationsUpdatedAt: loadMedicationsUpdatedAt() || Date.now(),
          deletedMedicationIds: loadDeletedMedicationIds(),
        } as Record<string, unknown>),
        hydrationHistory: overrides?.hydrationHistory ?? p.hydrationHistory,
        creativeActivities: overrides?.creativeActivities ?? p.creativeActivities,
        habits: overrides?.habits ?? p.habits,
        memories: overrides?.memories ?? p.memories,
        deviceSettings: overrides?.deviceSettings ?? p.deviceSettings,
        quietMode: overrides?.quietMode ?? p.quietMode,
        quietUntilTs: p.quietUntilTs,
        quietModeUpdatedAt: (() => {
          try {
            return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now();
          } catch {
            return Date.now();
          }
        })(),
        adhanOverrideSilent: overrides?.adhanOverrideSilent ?? p.adhanOverrideSilent,
        sanctuaryOverrideUntilMs: p.sanctuaryOverrideUntilMs,
        waterRemindersEnabled: overrides?.waterRemindersEnabled ?? p.waterRemindersEnabled,
        phoneChargeLimitPct: overrides?.phoneChargeLimitPct ?? p.phoneChargeLimitPct,
        smartChargeAlertEnabled: overrides?.smartChargeAlertEnabled ?? p.smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged: overrides?.smartChargeKeepUntilUnplugged ?? p.smartChargeKeepUntilUnplugged,
        capsulePrefs: overrides?.capsulePrefs ?? p.capsulePrefs,
        selectedLogoId: overrides?.selectedLogoId ?? p.selectedLogoId,
        travelState: overrides?.travelState ?? p.travelState,
        chatMessages: (overrides?.chatMessages ?? p.chatMessages).slice(-50),
      };

      setIsSyncingGoogleDrive(true);
      try {
        const ok = await saveToGoogleDriveAppData(token, backup);
        if (ok) {
          setGoogleDriveSynced(true);
          hasHydratedGoogleDriveRef.current = true;
          showToast('✓ تم حفظ ومزامنة جميع الإعدادات والدستور مع حساب Google بنجاح');
          return true;
        }
        return false;
      } catch (err) {
        console.warn('Failed pushing immediate backup to Google Drive:', err);
        return false;
      } finally {
        setIsSyncingGoogleDrive(false);
      }
    },
    [
      p.lifeProfile, p.medications, p.hydrationHistory, p.creativeActivities, p.habits, p.memories,
      p.deviceSettings, p.quietMode, p.quietUntilTs, p.adhanOverrideSilent, p.sanctuaryOverrideUntilMs,
      p.waterRemindersEnabled, p.phoneChargeLimitPct, p.smartChargeAlertEnabled, p.smartChargeKeepUntilUnplugged,
      p.capsulePrefs, p.selectedLogoId, p.travelState, p.chatMessages,
      hasHydratedGoogleDriveRef, setGoogleDriveSynced, setIsSyncingGoogleDrive, showToast,
    ]
  );

  return { hydrateGoogleDriveOnce, pushFullCloudBackupImmediately };
}
