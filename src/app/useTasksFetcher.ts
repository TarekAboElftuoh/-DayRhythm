import { useCallback } from 'react';
import type React from 'react';
import type { GoogleTaskItem, GoogleTaskList } from '../types/dayrhythm';
import { getCalendarAccessToken, getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';
import { hasSameOriginBackend } from '../services/apiClient';
import { SYNC_TASK_TITLE, VAULT_LIST_TITLE } from '../types/appTypes';
import { ACTIVE_UID_STORAGE_KEY, OFFLINE_TASKS_PREFIX, saveOfflineWorkspaceCache } from '../utils/appHelpers';

export interface UseTasksFetcherParams {
  recentlyCreatedTaskIdsRef: React.MutableRefObject<Set<string>>;
  setLoadingTasks: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceTokenExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setGoogleTaskLists: React.Dispatch<React.SetStateAction<GoogleTaskList[]>>;
  setGoogleTasks: React.Dispatch<React.SetStateAction<GoogleTaskItem[]>>;
  handleWorkspaceUnauthorized: () => void;
}

export function useTasksFetcher({
  recentlyCreatedTaskIdsRef,
  setLoadingTasks,
  setWorkspaceTokenExpired,
  setGoogleTaskLists,
  setGoogleTasks,
  handleWorkspaceUnauthorized,
}: UseTasksFetcherParams) {
  return useCallback(async (tokenOverride?: string) => {
    let token: string | null = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      try {
        token = (await getOrRefreshCalendarAccessToken()) || null;
      } catch {
        // ignore
      }
    }
    if (!token) return;
    setLoadingTasks(true);

    if (hasSameOriginBackend()) {
      try {
        const res = await fetch('/api/tasks', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.status === 401 && contentType.includes('application/json')) {
          handleWorkspaceUnauthorized();
          setLoadingTasks(false);
          return;
        }
        if (res.ok && contentType.includes('application/json')) {
          setLoadingTasks(false);
          setWorkspaceTokenExpired(false);
          const data = await res.json();
          const nextLists = Array.isArray(data.taskLists)
            ? data.taskLists.filter((l: { title?: string }) => l.title !== VAULT_LIST_TITLE)
            : undefined;
          const nextTasks = Array.isArray(data.tasks)
            ? data.tasks.filter(
                (t: { title?: string; taskListTitle?: string }) =>
                  t.title !== SYNC_TASK_TITLE && t.taskListTitle !== VAULT_LIST_TITLE
              )
            : undefined;
          if (nextLists) setGoogleTaskLists(nextLists);
          if (nextTasks) {
            setGoogleTasks((prev) => {
              const missingNew = prev.filter(
                (t) =>
                  !nextTasks.some((fresh: GoogleTaskItem) => fresh.id === t.id) &&
                  recentlyCreatedTaskIdsRef.current.has(t.id)
              );
              return [...nextTasks, ...missingNew];
            });
          }
          const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
          if (nextLists || nextTasks) {
            saveOfflineWorkspaceCache(OFFLINE_TASKS_PREFIX, activeUid, {
              taskLists: nextLists ?? [],
              tasks: nextTasks ?? [],
            });
          }
          return;
        }
      } catch {
        // Standalone APK/EXE fallback below
      }
    }

    try {
      const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listsRes.status === 401) {
        handleWorkspaceUnauthorized();
        return;
      }
      if (!listsRes.ok) return;
      setWorkspaceTokenExpired(false);
      const listsJson = (await listsRes.json()) as { items?: Array<Record<string, unknown>> };
      const mappedLists: GoogleTaskList[] = (listsJson.items || [])
        .filter((l) => String(l.title || '') !== VAULT_LIST_TITLE)
        .map((l) => ({
          id: String(l.id || '@default'),
          title: String(l.title || 'مهامي'),
        }));
      setGoogleTaskLists(mappedLists);

      const allTasks: GoogleTaskItem[] = [];
      await Promise.all(
        mappedLists.slice(0, 6).map(async (list) => {
          try {
            const tRes = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=false&maxResults=100`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!tRes.ok) return;
            const tJson = (await tRes.json()) as { items?: Array<Record<string, unknown>> };
            for (const item of tJson.items || []) {
              const itemTitle = String(item.title || '');
              if (itemTitle === SYNC_TASK_TITLE || list.title === VAULT_LIST_TITLE) {
                continue;
              }
              allTasks.push({
                id: String(item.id || ''),
                taskListId: list.id,
                taskListTitle: list.title,
                title: String(item.title || '(مهمة بدون عنوان)'),
                notes: typeof item.notes === 'string' ? item.notes : undefined,
                status: item.status === 'completed' ? 'completed' : 'needsAction',
                due: typeof item.due === 'string' ? item.due : undefined,
                completed: typeof item.completed === 'string' ? item.completed : undefined,
                updated: typeof item.updated === 'string' ? item.updated : undefined,
              });
            }
          } catch {
            // skip individual list error
          }
        })
      );
      setGoogleTasks((prev) => {
        const missingNew = prev.filter(
          (t) =>
            !allTasks.some((fresh) => fresh.id === t.id) &&
            recentlyCreatedTaskIdsRef.current.has(t.id)
        );
        return [...allTasks, ...missingNew];
      });
      const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
      saveOfflineWorkspaceCache(OFFLINE_TASKS_PREFIX, activeUid, {
        taskLists: mappedLists,
        tasks: allTasks,
      });
    } catch {
      // ignore offline errors
    } finally {
      setLoadingTasks(false);
    }
  }, [
    handleWorkspaceUnauthorized,
    recentlyCreatedTaskIdsRef,
    setGoogleTaskLists,
    setGoogleTasks,
    setLoadingTasks,
    setWorkspaceTokenExpired,
  ]);
}
