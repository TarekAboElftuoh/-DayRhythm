import { useCallback, useMemo } from 'react';
import type React from 'react';
import type {
  AppLanguage,
  AppSettingsPatch,
  DailyRhythmPlan,
  FreeWindow,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationItem,
  QuietModeType,
  SettingsSnapshotContext,
  SoundRepeatSetting,
  TaskSoundCategory,
  TravelState,
  UnifiedSettingsPatch,
} from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import type { AppSyncSettings, OnePlusDeviceSettings } from '../firebase';
import type { UserSettingsPayload } from '../services/cloudStateService';
import type { FullDayRhythmCloudBackup } from '../services/googleDriveStorage';
import { stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { STORAGE_KEY } from '../utils/appHelpers';
import { validateAndNormalizeSettingsPatch } from '../utils/settingsPatchValidator';
import { sanitizeLifeProfile } from './sanitizers';
import { applyAppSettingsPatch } from './applyAppSettingsHelper';

export interface UseSettingsPatchHandlerParams {
  lifeProfile: LifeProfile;
  lifeProfileRef: React.MutableRefObject<LifeProfile>;
  appSettingsRef: React.MutableRefObject<AppSyncSettings>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  adhanOverrideSilentRef: React.MutableRefObject<boolean>;
  sanctuaryOverrideUntilMsRef: React.MutableRefObject<number>;
  travelStateRef: React.MutableRefObject<TravelState>;
  lastScheduledAlarmsJsonRef: React.MutableRefObject<string>;
  lastSyncedCloudAlarmsJsonRef: React.MutableRefObject<string>;
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  waterRemindersEnabled: boolean;
  quietMode: QuietModeType;
  adhanOverrideSilent: boolean;
  sunMode: boolean;
  language: AppLanguage;
  capsulePrefs: CapsulePrefs;
  deviceSettings: OnePlusDeviceSettings;
  includePrayerAnchors: boolean;
  fastingOverride: 'auto' | 'fasting' | 'normal';
  travelState: TravelState;
  sanctuaryOverrideUntilMs: number;
  freeSlotsToday: FreeWindow[];
  dailyRhythmPlan: DailyRhythmPlan;
  medications: MedicationItem[];
  setLifeProfile: React.Dispatch<React.SetStateAction<LifeProfile>>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setAdhanOverrideSilent: React.Dispatch<React.SetStateAction<boolean>>;
  setLanguage: React.Dispatch<React.SetStateAction<AppLanguage>>;
  setSanctuaryOverrideUntilMs: React.Dispatch<React.SetStateAction<number>>;
  setSettingsAlarmEpoch: React.Dispatch<React.SetStateAction<number>>;
  updateAppSettings: (patch: Partial<AppSyncSettings>) => void;
  handleSetQuietMode: (mode: QuietModeType, durationMinutes: number) => void;
  handleToggleAdhanOverrideSilent: () => void;
  handleUpdateCapsulePrefs: (next: CapsulePrefs) => void;
  handleUpdateDeviceSettings: (patch: Partial<OnePlusDeviceSettings>) => void;
  handleUpdateSoundRepeat: (cat: TaskSoundCategory, setting: SoundRepeatSetting) => void;
  handleChangeFastingOverride: (val: 'auto' | 'fasting' | 'normal') => void;
  handleCancelActiveSanctuaryEarly: () => void;
  handleDisableTravel: () => void;
  handleApplyTravel: (next: TravelState) => void;
  handleExecuteMedicationActions: (actions: MedicationActionProposal[]) => Promise<MedicationExecutionResult[]>;
  saveCloudUserSettingsImmediately: (patch?: Partial<UserSettingsPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: (customToken?: string, overrides?: Partial<FullDayRhythmCloudBackup> & { travelState?: TravelState }) => Promise<boolean>;
  showToast: (msg: string) => void;
}

export function useSettingsPatchHandler(p: UseSettingsPatchHandlerParams) {
  const handleApplyAppSettings = useCallback(
    (patch: AppSettingsPatch) => {
      applyAppSettingsPatch(patch, p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.capsulePrefs.orientation, p.capsulePrefs.size, p.handleSetQuietMode, p.handleToggleAdhanOverrideSilent, p.handleUpdateCapsulePrefs, p.handleUpdateDeviceSettings, p.handleUpdateSoundRepeat, p.showToast, p.updateAppSettings]
  );

  const currentSettingsSnapshot: SettingsSnapshotContext = useMemo(
    () => ({
      lifeProfile: p.lifeProfile,
      appSettings: {
        phoneChargeLimitPct: p.phoneChargeLimitPct,
        chargeAlertEnabled: p.smartChargeAlertEnabled,
        chargeAlertKeepUntilUnplugged: p.smartChargeKeepUntilUnplugged,
        waterRemindersEnabled: p.waterRemindersEnabled,
        quietMode: p.quietMode,
        adhanSoundInSilent: p.adhanOverrideSilent,
        sunMode: p.sunMode,
        language: p.language,
        capsuleOrientation: p.capsulePrefs.orientation,
        capsuleSize: p.capsulePrefs.size,
        liveAlertsEnabled: p.deviceSettings.liveAlertsEnabled,
        liveAlertsLeadMinutes: p.deviceSettings.liveAlertsLeadMinutes,
        liveAlertsAlwaysOn: p.deviceSettings.liveAlertsAlwaysOn,
        liveAlertsShowCharging: p.deviceSettings.liveAlertsShowCharging,
        persistentCountdownNotif: p.deviceSettings.persistentCountdownNotif,
        includePrayerAnchors: p.includePrayerAnchors,
      },
      fastingOverride: p.fastingOverride,
      travelState: p.travelState,
      sanctuaryOverrideUntilMs: p.sanctuaryOverrideUntilMs,
      freeWindows: p.freeSlotsToday,
      seasonalSleepMode: p.dailyRhythmPlan.sleepMode ?? 'long_night',
      medications: p.medications.map((m) => ({ id: m.id, name: m.name, fastingPolicy: m.fastingPolicy })),
    }),
    [
      p.adhanOverrideSilent, p.capsulePrefs.orientation, p.capsulePrefs.size, p.dailyRhythmPlan.sleepMode,
      p.deviceSettings.liveAlertsAlwaysOn, p.deviceSettings.liveAlertsEnabled, p.deviceSettings.liveAlertsLeadMinutes,
      p.deviceSettings.liveAlertsShowCharging, p.deviceSettings.persistentCountdownNotif, p.fastingOverride,
      p.freeSlotsToday, p.includePrayerAnchors, p.language, p.lifeProfile, p.medications,
      p.phoneChargeLimitPct, p.quietMode, p.sanctuaryOverrideUntilMs, p.smartChargeAlertEnabled,
      p.smartChargeKeepUntilUnplugged, p.sunMode, p.travelState, p.waterRemindersEnabled,
    ]
  );

  const handleApplySettingsPatch = useCallback(
    async (rawPatch: UnifiedSettingsPatch) => {
      const validated = validateAndNormalizeSettingsPatch(p.lifeProfileRef.current, rawPatch, currentSettingsSnapshot);
      if (!validated.hasChanges) {
        if (validated.errors.length > 0) p.showToast(`⛔ ${validated.errors[0]}`);
        return;
      }

      const cloudPatch: Partial<UserSettingsPayload> = {};
      const driveOverrides: Partial<FullDayRhythmCloudBackup> & { travelState?: TravelState } = {};

      if (Object.keys(validated.profilePatch).length > 0) {
        p.localWriteLockUntilRef.current = Date.now() + 4000;
        const nextProfile = sanitizeLifeProfile({ ...p.lifeProfileRef.current, ...validated.profilePatch });
        p.lifeProfileRef.current = nextProfile;
        p.setLifeProfile(nextProfile);
        try {
          const currentRaw = localStorage.getItem(STORAGE_KEY);
          const current = currentRaw ? JSON.parse(currentRaw) : {};
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, lifeProfile: nextProfile }));
        } catch { /* ignore */ }
        cloudPatch.lifeProfile = nextProfile;
        driveOverrides.lifeProfile = nextProfile;
      }

      const appP = validated.appSettingsPatch;
      if (Object.keys(appP).length > 0) {
        const nextAppSettings: AppSyncSettings = {
          ...p.appSettingsRef.current,
          ...(typeof appP.phoneChargeLimitPct === 'number' ? { phoneChargeLimitPct: appP.phoneChargeLimitPct } : {}),
          ...(typeof appP.chargeAlertEnabled === 'boolean' ? { smartChargeAlertEnabled: appP.chargeAlertEnabled } : {}),
          ...(typeof appP.chargeAlertKeepUntilUnplugged === 'boolean' ? { smartChargeKeepUntilUnplugged: appP.chargeAlertKeepUntilUnplugged } : {}),
          ...(typeof appP.waterRemindersEnabled === 'boolean' ? { waterRemindersEnabled: appP.waterRemindersEnabled } : {}),
          ...(typeof appP.sunMode === 'boolean' ? { sunMode: appP.sunMode } : {}),
          ...(typeof appP.includePrayerAnchors === 'boolean' ? { includePrayerAnchors: appP.includePrayerAnchors } : {}),
        };
        p.updateAppSettings({
          phoneChargeLimitPct: nextAppSettings.phoneChargeLimitPct,
          smartChargeAlertEnabled: nextAppSettings.smartChargeAlertEnabled,
          smartChargeKeepUntilUnplugged: nextAppSettings.smartChargeKeepUntilUnplugged,
          waterRemindersEnabled: nextAppSettings.waterRemindersEnabled,
          sunMode: nextAppSettings.sunMode,
          includePrayerAnchors: nextAppSettings.includePrayerAnchors,
        });
        if (appP.chargeAlertEnabled === false) {
          stopSmartChargeCompleteAlert();
          p.setSmartChargeAudioActive(false);
        }
        cloudPatch.appSettings = nextAppSettings;
        driveOverrides.phoneChargeLimitPct = nextAppSettings.phoneChargeLimitPct;
        driveOverrides.smartChargeAlertEnabled = nextAppSettings.smartChargeAlertEnabled;
        driveOverrides.smartChargeKeepUntilUnplugged = nextAppSettings.smartChargeKeepUntilUnplugged;
        driveOverrides.waterRemindersEnabled = nextAppSettings.waterRemindersEnabled;

        if (appP.quietMode) {
          p.handleSetQuietMode(appP.quietMode, appP.quietMode === 'normal' ? 0 : Math.max(0, appP.quietModeMinutes ?? 0));
          cloudPatch.quietMode = appP.quietMode;
          driveOverrides.quietMode = appP.quietMode;
        }
        if (typeof appP.adhanSoundInSilent === 'boolean') {
          p.adhanOverrideSilentRef.current = appP.adhanSoundInSilent;
          p.setAdhanOverrideSilent(appP.adhanSoundInSilent);
          cloudPatch.adhanOverrideSilent = appP.adhanSoundInSilent;
          driveOverrides.adhanOverrideSilent = appP.adhanSoundInSilent;
        }
        if (appP.language === 'ar' || appP.language === 'en') p.setLanguage(appP.language);
        if (appP.capsuleOrientation || appP.capsuleSize) {
          const nextCaps = { orientation: appP.capsuleOrientation ?? p.capsulePrefs.orientation, size: appP.capsuleSize ?? p.capsulePrefs.size };
          p.handleUpdateCapsulePrefs(nextCaps);
          driveOverrides.capsulePrefs = nextCaps;
        }
        const devPatch: Partial<OnePlusDeviceSettings> = {};
        if (typeof appP.liveAlertsEnabled === 'boolean') devPatch.liveAlertsEnabled = appP.liveAlertsEnabled;
        if (appP.liveAlertsLeadMinutes) devPatch.liveAlertsLeadMinutes = appP.liveAlertsLeadMinutes;
        if (typeof appP.liveAlertsAlwaysOn === 'boolean') devPatch.liveAlertsAlwaysOn = appP.liveAlertsAlwaysOn;
        if (typeof appP.liveAlertsShowCharging === 'boolean') devPatch.liveAlertsShowCharging = appP.liveAlertsShowCharging;
        if (typeof appP.persistentCountdownNotif === 'boolean') devPatch.persistentCountdownNotif = appP.persistentCountdownNotif;
        if (Object.keys(devPatch).length > 0) p.handleUpdateDeviceSettings(devPatch);
        if (appP.soundRepeats) {
          for (const [category, value] of Object.entries(appP.soundRepeats)) {
            if (value === undefined) continue;
            const setting: SoundRepeatSetting =
              value === 'continuous' ? 'continuous' : (Math.max(1, Math.min(10, Math.round(Number(value)))) as SoundRepeatSetting);
            p.handleUpdateSoundRepeat(category as TaskSoundCategory, setting);
          }
        }
      }

      if (validated.fastingOverride !== undefined) {
        p.handleChangeFastingOverride(validated.fastingOverride);
        cloudPatch.fastingOverride = validated.fastingOverride;
      }

      if (validated.cancelActiveSanctuaryEarly) {
        p.handleCancelActiveSanctuaryEarly();
      } else if (validated.sanctuaryOverrideUntilMs !== undefined) {
        const untilMs = validated.sanctuaryOverrideUntilMs;
        p.localWriteLockUntilRef.current = Date.now() + 5000;
        p.sanctuaryOverrideUntilMsRef.current = untilMs;
        p.setSanctuaryOverrideUntilMs(untilMs);
        try { localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(untilMs)); } catch { /* ignore */ }
        cloudPatch.sanctuaryOverrideUntilMs = untilMs;
      }

      if (validated.travelStatePatch) {
        const tp = validated.travelStatePatch;
        if (tp.active === false) {
          p.handleDisableTravel();
        } else {
          const nextLoc: TravelState['location'] = {
            ...p.travelStateRef.current.location,
            ...(tp.cityName ? { nameAr: tp.cityName, nameEn: tp.cityName } : {}),
            ...(typeof tp.lat === 'number' ? { lat: tp.lat } : {}),
            ...(typeof tp.lng === 'number' ? { lng: tp.lng } : {}),
            ...(tp.timeZone ? { timeZone: tp.timeZone } : {}),
          };
          const nextTravel: TravelState = {
            ...p.travelStateRef.current,
            active: tp.active ?? true,
            location: nextLoc,
            distanceKm: tp.distanceKm ?? p.travelStateRef.current.distanceKm,
            durationMode: tp.durationMode ?? p.travelStateRef.current.durationMode,
            returnDate: tp.returnDate ?? p.travelStateRef.current.returnDate,
            deferredCategories: tp.deferredCategories ?? p.travelStateRef.current.deferredCategories,
            deferredMedIds: tp.deferredMedIds ?? p.travelStateRef.current.deferredMedIds,
          };
          p.handleApplyTravel(nextTravel);
          cloudPatch.travelState = nextTravel;
          driveOverrides.travelState = nextTravel;
        }
      }

      if (validated.medicationFastingPolicies.length > 0) {
        await p.handleExecuteMedicationActions(
          validated.medicationFastingPolicies.map((m) => ({
            operation: 'update', medicationId: m.medicationId, name: m.name, fastingPolicy: m.fastingPolicy,
          }))
        );
      }

      if (validated.affectsAlarms) {
        p.lastScheduledAlarmsJsonRef.current = '';
        p.lastSyncedCloudAlarmsJsonRef.current = '';
        p.setSettingsAlarmEpoch((n) => n + 1);
      }

      if (Object.keys(cloudPatch).length > 0) void p.saveCloudUserSettingsImmediately(cloudPatch);
      void p.pushFullCloudBackupImmediately(undefined, driveOverrides);
      p.showToast('⚙️ تم تطبيق التغييرات وحفظها ومزامنتها ✓');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      p.capsulePrefs.orientation, p.capsulePrefs.size, currentSettingsSnapshot,
      p.handleApplyTravel, p.handleCancelActiveSanctuaryEarly, p.handleChangeFastingOverride,
      p.handleDisableTravel, p.handleExecuteMedicationActions, p.handleSetQuietMode,
      p.handleUpdateCapsulePrefs, p.handleUpdateDeviceSettings, p.handleUpdateSoundRepeat,
      p.pushFullCloudBackupImmediately, p.saveCloudUserSettingsImmediately, p.showToast, p.updateAppSettings,
    ]
  );

  return { handleApplyAppSettings, currentSettingsSnapshot, handleApplySettingsPatch };
}
