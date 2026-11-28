import { sanitizeUiPrefs } from '../firebase';
import type {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
} from '../types/dayrhythm';
import type { OnePlusDeviceSettings } from '../firebase';

export function downloadBackupJsonFile(params: {
  todayIso: string;
  lifeProfile: LifeProfile;
  medications: MedicationItem[];
  memories: MemoryItem[];
  creativeActivities: CreativeActivityItem[];
  habits: DynamicHabit[];
  hydrationHistory: HydrationDayLog[];
  streaks: DualStreaks;
  deviceSettings: OnePlusDeviceSettings;
  selectedLogoId: string;
  capsulePrefs: { orientation: 'horizontal' | 'vertical'; size: 'sm' | 'md' | 'lg' };
}): boolean {
  const payload = {
    app: 'DayRhythm',
    version: 1,
    exportedAtIso: new Date().toISOString(),
    lifeProfile: params.lifeProfile,
    medications: params.medications,
    memories: params.memories,
    creativeActivities: params.creativeActivities,
    habits: params.habits,
    hydrationHistory: params.hydrationHistory,
    streaks: params.streaks,
    deviceSettings: params.deviceSettings,
    uiPrefs: sanitizeUiPrefs({
      selectedLogoId: params.selectedLogoId,
      capsuleOrientation: params.capsulePrefs.orientation,
      capsuleSize: params.capsulePrefs.size,
    }),
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayrhythm-backup-${params.todayIso}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeImportedStreaks(raw: unknown, fallback: DualStreaks): DualStreaks {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Partial<DualStreaks>;
  return {
    dailyCommitmentDays: Math.max(0, Math.min(3650, Number(obj.dailyCommitmentDays) || 0)),
    dailyCommitmentDoneToday: Boolean(obj.dailyCommitmentDoneToday),
    waterTargetDays: Math.max(0, Math.min(3650, Number(obj.waterTargetDays) || 0)),
    waterTargetDoneToday: Boolean(obj.waterTargetDoneToday),
  };
}
