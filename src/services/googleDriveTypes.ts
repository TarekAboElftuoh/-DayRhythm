import type {
  CreativeActivityItem,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
  QuietModeType,
  UiPrefs,
} from '../types/dayrhythm';
import type { OnePlusDeviceSettings } from '../firebase';

export const GDRIVE_BACKUP_FILENAME = 'dayrhythm_account_sync.json';
const GDRIVE_FILE_ID_CACHE_KEY = 'dayrhythm_gdrive_appdata_file_id_v1';

export interface FullDayRhythmCloudBackup {
  version: 1;
  updatedAtIso: string;
  updatedAtMs: number;
  lifeProfile: LifeProfile;
  medications: MedicationItem[];
  hydrationHistory: HydrationDayLog[];
  creativeActivities: CreativeActivityItem[];
  habits?: DynamicHabit[];
  memories: MemoryItem[];
  deviceSettings: OnePlusDeviceSettings;
  uiPrefs?: UiPrefs;
  quietMode?: QuietModeType;
  adhanOverrideSilent?: boolean;
  waterRemindersEnabled?: boolean;
  phoneChargeLimitPct?: number;
  smartChargeAlertEnabled?: boolean;
  smartChargeKeepUntilUnplugged?: boolean;
  capsulePrefs?: {
    orientation: 'horizontal' | 'vertical';
    size: 'sm' | 'md' | 'lg';
  };
  selectedLogoId?: string;
  chatMessages?: PersistedChatMessage[];
}

let cachedFileId: string | null = null;

export interface DriveApiStatus {
  status: 'ok' | 'service_disabled' | 'scope_missing' | 'unknown_error';
  enableUrl: string;
}

let lastDriveStatus: DriveApiStatus = {
  status: 'ok',
  enableUrl: 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=527201435015',
};

export function getDriveApiStatus(): DriveApiStatus {
  return lastDriveStatus;
}

export function setDriveApiStatus(status: DriveApiStatus): void {
  lastDriveStatus = status;
}

export function getStoredFileId(): string | null {
  if (cachedFileId) return cachedFileId;
  try {
    const saved = localStorage.getItem(GDRIVE_FILE_ID_CACHE_KEY);
    if (saved && typeof saved === 'string') {
      cachedFileId = saved.trim();
      return cachedFileId;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function storeFileId(fileId: string | null): void {
  cachedFileId = fileId;
  try {
    if (fileId) {
      localStorage.setItem(GDRIVE_FILE_ID_CACHE_KEY, fileId);
    } else {
      localStorage.removeItem(GDRIVE_FILE_ID_CACHE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}
