import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import {
  CreativeActivityItem,
  DualStreaks,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  QuietModeType,
  SurfaceTheme,
  UiPrefs,
} from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import { SELECTED_LOGO_STORAGE_KEY } from '../components/logoRegistry';
import {
  OnePlusDeviceSettings,
  sanitizeCreativeActivityItem,
  sanitizeDeviceSettings,
  sanitizeLifeProfile,
  sanitizeMedicationItem,
  sanitizeMemoryItem,
  sanitizeUiPrefs,
  type SyncedRhythmPayload,
} from '../firebase';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { CAPSULE_PREFS_STORAGE_KEY, rollOverHydrationHistoryIfNeeded } from '../utils/appHelpers';

export interface UseBackupActionsParams {
  activeTimeZone: string;
  adhanOverrideSilent: boolean;
  capsulePrefs: CapsulePrefs;
  creativeActivities: CreativeActivityItem[];
  deviceSettings: OnePlusDeviceSettings;
  firebaseUser: User | null;
  firestoreSynced: boolean;
  hydrationHistory: HydrationDayLog[];
  lifeProfile: LifeProfile;
  localWriteLockUntilRef: MutableRefObject<number>;
  medications: MedicationItem[];
  memories: MemoryItem[];
  pushFullCloudBackupImmediately: () => Promise<boolean>;
  pushToTasksVaultImmediately: (overrides?: Partial<SyncedRhythmPayload>) => Promise<void>;
  quietMode: QuietModeType;
  selectedLogoId: string;
  setCapsulePrefs: Dispatch<SetStateAction<CapsulePrefs>>;
  setCreativeActivities: Dispatch<SetStateAction<CreativeActivityItem[]>>;
  setDeviceSettings: Dispatch<SetStateAction<OnePlusDeviceSettings>>;
  setHydrationHistory: Dispatch<SetStateAction<HydrationDayLog[]>>;
  setLifeProfile: Dispatch<SetStateAction<LifeProfile>>;
  setMedications: Dispatch<SetStateAction<MedicationItem[]>>;
  setMemories: Dispatch<SetStateAction<MemoryItem[]>>;
  setSelectedLogoId: Dispatch<SetStateAction<string>>;
  setStreaks: Dispatch<SetStateAction<DualStreaks>>;
  showToast: (msg: string) => void;
  streaks: DualStreaks;
  surfaceTheme: SurfaceTheme;
  targetCups: number;
}

export function useBackupActions(params: UseBackupActionsParams) {
  const {
    activeTimeZone,
    adhanOverrideSilent,
    capsulePrefs,
    creativeActivities,
    deviceSettings,
    firebaseUser,
    firestoreSynced,
    hydrationHistory,
    lifeProfile,
    localWriteLockUntilRef,
    medications,
    memories,
    pushFullCloudBackupImmediately,
    pushToTasksVaultImmediately,
    quietMode,
    selectedLogoId,
    setCapsulePrefs,
    setCreativeActivities,
    setDeviceSettings,
    setHydrationHistory,
    setLifeProfile,
    setMedications,
    setMemories,
    setSelectedLogoId,
    setStreaks,
    showToast,
    streaks,
    surfaceTheme,
    targetCups,
  } = params;

  const handleExportBackupJson = useCallback(() => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const payload = {
      app: 'DayRhythm',
      version: 1,
      exportedAtIso: new Date().toISOString(),
      lifeProfile,
      medications,
      memories,
      creativeActivities,
      hydrationHistory,
      streaks,
      deviceSettings,
      uiPrefs: sanitizeUiPrefs({
        selectedLogoId,
        capsuleOrientation: capsulePrefs.orientation,
        capsuleSize: capsulePrefs.size,
      }),
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dayrhythm-backup-${todayIso}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`💾 تم تنزيل النسخة الاحتياطية الكاملة (dayrhythm-backup-${todayIso}.json) ✓`);
    } catch {
      showToast('تعذر تنزيل ملف النسخة الاحتياطية — حاول مرة أخرى');
    }
  }, [
    activeTimeZone,
    capsulePrefs.orientation,
    capsulePrefs.size,
    creativeActivities,
    deviceSettings,
    hydrationHistory,
    lifeProfile,
    medications,
    memories,
    selectedLogoId,
    showToast,
    streaks,
  ]);

  const handleImportBackupJson = useCallback(
    async (rawText: string): Promise<{ ok: boolean; summaryAr: string }> => {
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (!parsed || parsed.app !== 'DayRhythm') {
          return {
            ok: false,
            summaryAr: 'الملف غير صالح — تأكد أنه ملف نسخة احتياطية مُصدّر من «إيقاع اليوم».',
          };
        }

        const nextProfile = parsed.lifeProfile
          ? sanitizeLifeProfile(parsed.lifeProfile as Partial<LifeProfile>)
          : lifeProfile;
        const nextDevice = parsed.deviceSettings
          ? sanitizeDeviceSettings(parsed.deviceSettings as Partial<OnePlusDeviceSettings>)
          : deviceSettings;
        const nextMeds = Array.isArray(parsed.medications)
          ? parsed.medications.map((m) => sanitizeMedicationItem(m as Partial<MedicationItem>))
          : medications;
        const nextMems = Array.isArray(parsed.memories)
          ? parsed.memories.map((m) => sanitizeMemoryItem(m as Partial<MemoryItem>))
          : memories;
        const nextCreative = Array.isArray(parsed.creativeActivities)
          ? parsed.creativeActivities.map((a) =>
              sanitizeCreativeActivityItem(a as Partial<CreativeActivityItem>)
            )
          : creativeActivities;
        const nextUi: UiPrefs =
          (parsed.uiPrefs ? sanitizeUiPrefs(parsed.uiPrefs as Partial<UiPrefs>) : undefined) ?? {
            selectedLogoId,
            capsuleOrientation: capsulePrefs.orientation,
            capsuleSize: capsulePrefs.size,
          };
        const nextStreaks: DualStreaks =
          parsed.streaks && typeof parsed.streaks === 'object'
            ? {
                dailyCommitmentDays: Math.max(
                  0,
                  Math.min(3650, Number((parsed.streaks as Partial<DualStreaks>).dailyCommitmentDays) || 0)
                ),
                dailyCommitmentDoneToday: Boolean(
                  (parsed.streaks as Partial<DualStreaks>).dailyCommitmentDoneToday
                ),
                waterTargetDays: Math.max(
                  0,
                  Math.min(3650, Number((parsed.streaks as Partial<DualStreaks>).waterTargetDays) || 0)
                ),
                waterTargetDoneToday: Boolean(
                  (parsed.streaks as Partial<DualStreaks>).waterTargetDoneToday
                ),
              }
            : streaks;
        const restoreTz = nextProfile.currentTimeZone || activeTimeZone;
        const nextHydration =
          Array.isArray(parsed.hydrationHistory) && parsed.hydrationHistory.length === 7
            ? rollOverHydrationHistoryIfNeeded(
                parsed.hydrationHistory as HydrationDayLog[],
                targetCups,
                restoreTz
              )
            : hydrationHistory;

        localWriteLockUntilRef.current = Date.now() + 800;
        setLifeProfile(nextProfile);
        setDeviceSettings(nextDevice);
        setMedications(nextMeds);
        setMemories(nextMems);
        setCreativeActivities(nextCreative);
        setStreaks(nextStreaks);
        setHydrationHistory(nextHydration);
        setSelectedLogoId(nextUi.selectedLogoId);
        setCapsulePrefs({
          orientation: nextUi.capsuleOrientation,
          size: nextUi.capsuleSize,
        });

        try {
          window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, nextUi.selectedLogoId);
          window.localStorage.setItem(
            CAPSULE_PREFS_STORAGE_KEY,
            JSON.stringify({
              orientation: nextUi.capsuleOrientation,
              size: nextUi.capsuleSize,
            })
          );
        } catch {
          // ignore storage errors
        }

        const todayEntry = nextHydration[nextHydration.length - 1];
        void pushToTasksVaultImmediately({
          hydrationDateKey: getDateIsoInTimeZone(restoreTz),
          cupsLogged: todayEntry?.cupsLogged ?? 0,
          targetCups: todayEntry?.targetCups ?? targetCups,
          hydrationWeeklyCounts: nextHydration.map((d) => d.cupsLogged),
          dailyCommitmentDays: nextStreaks.dailyCommitmentDays,
          dailyCommitmentDoneToday: nextStreaks.dailyCommitmentDoneToday,
          waterTargetDays: nextStreaks.waterTargetDays,
          waterTargetDoneToday: nextStreaks.waterTargetDoneToday,
          quietMode,
          adhanOverrideSilent,
          surfaceTheme,
          deviceSettings: nextDevice,
          lifeProfile: nextProfile,
          medications: nextMeds,
          creativeActivities: nextCreative,
          memories: nextMems,
          uiPrefs: nextUi,
        });
        void pushFullCloudBackupImmediately();

        const summaryAr = `تم استرجاع النسخة الاحتياطية بنجاح ✓ (${nextMeds.length} علاج · ${nextMems.length} قاعدة ذاكرة · ${nextCreative.length} نشاط إبداعي)`;
        showToast(summaryAr);
        return { ok: true, summaryAr };
      } catch {
        return {
          ok: false,
          summaryAr: 'تعذر قراءة ملف JSON — تأكد أن الملف سليم وغير تالف.',
        };
      }
    },
    [
      activeTimeZone,
      adhanOverrideSilent,
      capsulePrefs.orientation,
      capsulePrefs.size,
      creativeActivities,
      deviceSettings,
      firebaseUser?.emailVerified,
      firebaseUser?.uid,
      firestoreSynced,
      hydrationHistory,
      lifeProfile,
      localWriteLockUntilRef,
      medications,
      memories,
      pushFullCloudBackupImmediately,
      pushToTasksVaultImmediately,
      quietMode,
      selectedLogoId,
      setCapsulePrefs,
      setCreativeActivities,
      setDeviceSettings,
      setHydrationHistory,
      setLifeProfile,
      setMedications,
      setMemories,
      setSelectedLogoId,
      setStreaks,
      showToast,
      streaks,
      surfaceTheme,
      targetCups,
    ]
  );

  return {
    handleExportBackupJson,
    handleImportBackupJson,
  };
}
