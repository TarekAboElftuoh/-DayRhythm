import { SyncedRhythmPayload, AppSyncSettings } from '../firebase';
import {
  MedicationItem,
  CreativeActivityItem,
  MemoryItem,
  UiPrefs,
} from '../types/dayrhythm';
import { refreshGoogleCalendarTokenSilently } from './googleCalendarAuth';

export interface TasksVaultPayload extends Partial<SyncedRhythmPayload> {
  updatedAtMs: number;
  originClientId: string;
  medications?: MedicationItem[];
  creativeActivities?: CreativeActivityItem[];
  memories?: MemoryItem[];
  appSettings?: AppSyncSettings;
  uiPrefs?: UiPrefs;
  lastDismissSignal?: {
    timestampMs: number;
    scope: string;
    action: string;
    clientId: string;
  };
}

export const VAULT_LIST_TITLE = '[DayRhythm Sync Vault]';
export const SYNC_TASK_TITLE = 'sync_state';
const VAULT_LIST_ID_CACHE = 'dayrhythm_tasks_vault_list_id_v2';
const SYNC_TASK_ID_CACHE = 'dayrhythm_tasks_vault_task_id_v2';

let cachedListId: string | null = null;
let cachedTaskId: string | null = null;

function getStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStored(key: string, val: string | null): void {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function getOrFindTasksVaultListId(token: string): Promise<string | null> {
  if (!token) return null;
  if (cachedListId) return cachedListId;
  const stored = getStored(VAULT_LIST_ID_CACHE);
  if (stored) {
    cachedListId = stored;
    return cachedListId;
  }

  try {
    const listRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.status === 401) {
      const fresh = await refreshGoogleCalendarTokenSilently();
      if (fresh && fresh !== token) return getOrFindTasksVaultListId(fresh);
      return null;
    }
    if (!listRes.ok) return null;

    const data = (await listRes.json()) as { items?: Array<{ id: string; title: string }> };
    const items = data.items || [];
    const found = items.find((l) => l.title === VAULT_LIST_TITLE);
    if (found?.id) {
      cachedListId = found.id;
      setStored(VAULT_LIST_ID_CACHE, found.id);
      return cachedListId;
    }

    // Create new list
    const createRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: VAULT_LIST_TITLE }),
    });
    if (!createRes.ok) return null;
    const created = (await createRes.json()) as { id?: string };
    if (created?.id) {
      cachedListId = created.id;
      setStored(VAULT_LIST_ID_CACHE, created.id);
      return cachedListId;
    }
  } catch (err) {
    console.warn('[TasksVault] Failed resolving list id:', err);
  }
  return null;
}

export async function getOrFindSyncTaskId(token: string, listId: string): Promise<string | null> {
  if (!token || !listId) return null;
  if (cachedTaskId) return cachedTaskId;
  const stored = getStored(SYNC_TASK_ID_CACHE);
  if (stored) {
    cachedTaskId = stored;
    return cachedTaskId;
  }

  try {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?maxResults=20`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      cachedTaskId = null;
      setStored(SYNC_TASK_ID_CACHE, null);
      cachedListId = null;
      setStored(VAULT_LIST_ID_CACHE, null);
      return null;
    }

    if (res.status === 401) {
      const fresh = await refreshGoogleCalendarTokenSilently();
      if (fresh && fresh !== token) return getOrFindSyncTaskId(fresh, listId);
      return null;
    }
    if (!res.ok) return null;

    const data = (await res.json()) as { items?: Array<{ id: string; title: string }> };
    const items = data.items || [];
    const found = items.find((t) => t.title === SYNC_TASK_TITLE);
    if (found?.id) {
      cachedTaskId = found.id;
      setStored(SYNC_TASK_ID_CACHE, found.id);
      return cachedTaskId;
    }

    // Create sync task
    const createRes = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: SYNC_TASK_TITLE, notes: '{}' }),
      }
    );
    if (!createRes.ok) return null;
    const created = (await createRes.json()) as { id?: string };
    if (created?.id) {
      cachedTaskId = created.id;
      setStored(SYNC_TASK_ID_CACHE, created.id);
      return cachedTaskId;
    }
  } catch (err) {
    console.warn('[TasksVault] Failed resolving sync task id:', err);
  }
  return null;
}

let inFlightPush: Promise<boolean> | null = null;
let pendingPushPayload: { token: string; payload: TasksVaultPayload } | null = null;

export async function pushRhythmStateToTasks(
  token: string,
  payload: TasksVaultPayload
): Promise<boolean> {
  if (!token) return false;
  pendingPushPayload = { token, payload };
  if (inFlightPush) return inFlightPush;

  inFlightPush = (async () => {
    // 200ms debounce to collapse rapid sequential changes into one push
    await new Promise((r) => setTimeout(r, 200));
    while (pendingPushPayload) {
      const current = pendingPushPayload;
      pendingPushPayload = null;
      try {
        let activeToken = current.token;
        const listId = await getOrFindTasksVaultListId(activeToken);
        if (!listId) continue;
        const taskId = await getOrFindSyncTaskId(activeToken, listId);
        if (!taskId) continue;

        const notesStr = JSON.stringify(current.payload);
        const putUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`;
        let res = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: taskId,
            title: SYNC_TASK_TITLE,
            notes: notesStr,
          }),
        });

        if (res.status === 404) {
          cachedTaskId = null;
          setStored(SYNC_TASK_ID_CACHE, null);
          cachedListId = null;
          setStored(VAULT_LIST_ID_CACHE, null);
        } else if (res.status === 401) {
          const fresh = await refreshGoogleCalendarTokenSilently();
          if (fresh && fresh !== activeToken) {
            activeToken = fresh;
            res = await fetch(putUrl, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${activeToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id: taskId,
                title: SYNC_TASK_TITLE,
                notes: notesStr,
              }),
            });
            if (res.status === 404) {
              cachedTaskId = null;
              setStored(SYNC_TASK_ID_CACHE, null);
              cachedListId = null;
              setStored(VAULT_LIST_ID_CACHE, null);
            }
          }
        }
      } catch (err) {
        console.warn('[TasksVault] Failed pushing rhythm state:', err);
      }
    }
    inFlightPush = null;
    return true;
  })();

  return inFlightPush;
}

export async function pullRhythmStateFromTasks(
  token: string
): Promise<TasksVaultPayload | null> {
  if (!token) return null;
  try {
    const listId = await getOrFindTasksVaultListId(token);
    if (!listId) return null;
    const taskId = await getOrFindSyncTaskId(token, listId);
    if (!taskId) return null;

    const getUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`;
    const res = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) {
      cachedTaskId = null;
      setStored(SYNC_TASK_ID_CACHE, null);
      cachedListId = null;
      setStored(VAULT_LIST_ID_CACHE, null);
      return null;
    }

    if (res.status === 401) {
      const fresh = await refreshGoogleCalendarTokenSilently();
      if (fresh && fresh !== token) return pullRhythmStateFromTasks(fresh);
      return null;
    }

    if (!res.ok) return null;

    const data = (await res.json()) as { notes?: string };
    if (!data.notes) return null;

    const parsed = JSON.parse(data.notes) as TasksVaultPayload;
    if (parsed && typeof parsed === 'object' && typeof parsed.updatedAtMs === 'number') {
      return parsed;
    }
  } catch (err) {
    console.warn('[TasksVault] Failed pulling rhythm state:', err);
  }
  return null;
}
