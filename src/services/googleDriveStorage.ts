import {
  CreativeActivityItem,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
  QuietModeType,
  UiPrefs,
} from '../types/dayrhythm';
import { OnePlusDeviceSettings } from '../firebase';

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

function getStoredFileId(): string | null {
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

function storeFileId(fileId: string | null): void {
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

/**
 * Searches for the appDataFolder backup file or creates a clean one if not found.
 */
export async function getOrFindAppDataFileId(token: string): Promise<string | null> {
  if (!token) return null;
  const knownId = getStoredFileId();
  if (knownId) {
    return knownId;
  }

  try {
    const query = encodeURIComponent(`name = '${GDRIVE_BACKUP_FILENAME}' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&pageSize=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (res.status === 401) {
      return null;
    }

    if (!res.ok) {
      console.warn('[GoogleDriveStorage] Failed to list appDataFolder:', res.status, res.statusText);
      return null;
    }

    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    if (Array.isArray(data.files) && data.files.length > 0 && data.files[0]?.id) {
      const id = data.files[0].id;
      storeFileId(id);
      return id;
    }

    // No existing file found: create empty record in appDataFolder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: GDRIVE_BACKUP_FILENAME,
        parents: ['appDataFolder'],
        description: 'DayRhythm Full Account Rhythm & Constitution Cloud Backup',
      }),
    });

    if (!createRes.ok) {
      console.warn('[GoogleDriveStorage] Failed to create appDataFolder file:', createRes.status);
      return null;
    }

    const created = (await createRes.json()) as { id?: string };
    if (created?.id) {
      storeFileId(created.id);
      return created.id;
    }
  } catch (err) {
    console.warn('[GoogleDriveStorage] Error finding/creating file:', err);
  }

  return null;
}

/**
 * Loads the full user account state directly from Google Drive appDataFolder.
 * Returns null if no file exists yet or if network/token is unavailable.
 */
export async function loadFromGoogleDriveAppData(
  token: string
): Promise<FullDayRhythmCloudBackup | null> {
  if (!token) return null;

  try {
    let fileId = getStoredFileId();

    if (!fileId) {
      const query = encodeURIComponent(`name = '${GDRIVE_BACKUP_FILENAME}' and trashed = false`);
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&pageSize=5`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (searchRes.status === 401) return null;
      if (!searchRes.ok) return null;

      const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
      if (Array.isArray(searchJson.files) && searchJson.files.length > 0 && searchJson.files[0]?.id) {
        fileId = searchJson.files[0].id;
        storeFileId(fileId);
      } else {
        // First time ever: no backup in Drive yet
        return null;
      }
    }

    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (downloadRes.status === 404) {
      // Stale cached ID: clear and let next run re-search
      storeFileId(null);
      return null;
    }

    if (downloadRes.status === 401) return null;
    if (!downloadRes.ok) {
      console.warn('[GoogleDriveStorage] Failed to download backup media:', downloadRes.status);
      return null;
    }

    const rawText = await downloadRes.text();
    if (!rawText || !rawText.trim()) return null;

    const parsed = JSON.parse(rawText) as FullDayRhythmCloudBackup;
    if (!parsed || typeof parsed !== 'object') return null;

    console.log(
      `[GoogleDriveStorage] Successfully hydrated cloud account backup from Google Drive (updated: ${parsed.updatedAtIso || 'unknown'})`
    );
    return parsed;
  } catch (err) {
    console.warn('[GoogleDriveStorage] Error loading cloud account backup:', err);
    return null;
  }
}

/**
 * Saves the entire application rhythm state to Google Drive appDataFolder.
 * 100% free, private to the user, encrypted in transit and at rest by Google.
 */
export async function saveToGoogleDriveAppData(
  token: string,
  backup: FullDayRhythmCloudBackup
): Promise<boolean> {
  if (!token) return false;

  try {
    let fileId = await getOrFindAppDataFileId(token);
    if (!fileId) return false;

    const payloadStr = JSON.stringify(backup, null, 2);

    let patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: payloadStr,
      }
    );

    if (patchRes.status === 404) {
      // Cached file was deleted or invalid: re-acquire file and retry once
      storeFileId(null);
      fileId = await getOrFindAppDataFileId(token);
      if (!fileId) return false;

      patchRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: payloadStr,
        }
      );
    }

    if (patchRes.status === 401) return false;

    if (!patchRes.ok) {
      console.warn('[GoogleDriveStorage] Failed to patch appData file:', patchRes.status);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[GoogleDriveStorage] Failed to save cloud account backup to Drive:', err);
    return false;
  }
}
