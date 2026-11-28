import { useCallback } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  CalendarActionProposal, CalendarExecutionResult, DeletedWorkspaceSnapshot, GoogleCalendarEventItem,
  GoogleTaskItem, GoogleTaskList, ScheduleBlock, SharedChangelogEntry, TaskActionProposal, TaskExecutionResult,
} from '../types/dayrhythm';
import type { EmitCrossDeviceSync } from '../types/appTypes';
import { getCalendarAccessToken } from '../services/googleCalendarAuth';
import { apiFetchJson } from '../services/apiClient';
import { computeEventRangeInTimeZone, getDateIsoInTimeZone, parseIsoToTimeZoneInfo } from '../engines/prayerEngine';
import { extractEmojiPair, resolveCalendarActionTargets, resolveTaskActionTargets } from '../utils/appHelpers';
import { executeCalendarDirect, executeTasksDirect } from './googleWorkspaceDirect';
import { applyOfflineActionsToBlocks } from './applyOfflineActionsHelper';
import { cancelTargetAlarms } from './useAlertSnoozeHandler';

export interface UseCalendarTaskExecutorsParams {
  activeTimeZone: string;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  googleTaskLists: GoogleTaskList[];
  firebaseUser: User | null;
  clientIdRef: React.MutableRefObject<string>;
  recentlyCreatedEventIdsRef: React.MutableRefObject<Set<string>>;
  recentlyCreatedTaskIdsRef: React.MutableRefObject<Set<string>>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  setOfflineBlocks: React.Dispatch<React.SetStateAction<ScheduleBlock[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<GoogleCalendarEventItem[]>>;
  setGoogleTasks: React.Dispatch<React.SetStateAction<GoogleTaskItem[]>>;
  setReflowedBlocksOverride: React.Dispatch<React.SetStateAction<ScheduleBlock[] | null>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setLastDeletedWorkspaceItem: React.Dispatch<React.SetStateAction<DeletedWorkspaceSnapshot | null>>;
  handleWorkspaceUnauthorized: () => void;
  fetchCalendarEvents: (tokenOverride?: string) => Promise<void>;
  fetchGoogleTasks: (tokenOverride?: string) => Promise<void>;
  emitCrossDeviceSync: EmitCrossDeviceSync;
  appendChangelog: (device: SharedChangelogEntry['device'], noteAr: string, noteEn: string) => void;
  showToast: (msg: string) => void;
}

export function useCalendarTaskExecutors(p: UseCalendarTaskExecutorsParams) {
  const handleApplyOfflineActions = useCallback(
    (actions: CalendarActionProposal[]) => {
      p.setOfflineBlocks((prev) => applyOfflineActionsToBlocks(prev, actions));
    },
    [p.setOfflineBlocks]
  );

  const executeCalendarActionsNow = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      if (!options?.isUndoRestore && !options?.alreadyResolved) {
        actions = resolveCalendarActionTargets(actions, p.calendarEvents);
      }
      const token = getCalendarAccessToken();
      let results: CalendarExecutionResult[] = [];
      let googleSynced = false;

      const deleteAct = actions.find((a) => a.operation === 'delete' && a.eventId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingEv = p.calendarEvents.find((e) => e.id === deleteAct.eventId);
        const startInfo = existingEv?.start ? parseIsoToTimeZoneInfo(existingEv.start, p.activeTimeZone) : null;
        let durationMinutes = 0;
        if (existingEv?.start && existingEv?.end && !existingEv.isAllDay) {
          const diff = Math.round((new Date(existingEv.end).getTime() - new Date(existingEv.start).getTime()) / 60_000);
          durationMinutes = diff <= 1 ? 0 : Math.min(720, Math.max(0, diff));
        }
        const h24 = startInfo ? Math.floor(startInfo.minutesSinceMidnight / 60) : 9;
        const m24 = startInfo ? startInfo.minutesSinceMidnight % 60 : 0;
        undoSnap = {
          opId: `del_ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'event',
          title: existingEv?.summary || deleteAct.title,
          calendarId: existingEv?.calendarId || deleteAct.calendarId || 'primary',
          dateIso: startInfo?.dateIso || getDateIsoInTimeZone(p.activeTimeZone),
          startTime24: `${String(h24).padStart(2, '0')}:${String(m24).padStart(2, '0')}`,
          durationMinutes,
          description: existingEv?.description || '',
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(actions.filter((a) => a.operation === 'delete' && a.eventId).map((a) => a.eventId!));
        if (deleteIds.size > 0) {
          p.setCalendarEvents((prev) => prev.filter((ev) => !deleteIds.has(ev.id)));
          p.setReflowedBlocksOverride((prev) => (prev ? prev.filter((b) => !b.googleEventId || !deleteIds.has(b.googleEventId)) : prev));
          actions.filter((a) => a.operation === 'delete' && a.eventId).forEach((a) => {
            const bId = `gcal_${a.calendarId || 'primary'}_${a.eventId}`;
            p.acknowledgedBlockIdsRef.current.add(bId);
            cancelTargetAlarms({ blockId: bId });
            p.emitCrossDeviceSync('alarm_dismiss', 'event_deleted', undefined, { blockId: bId, alertId: bId });
          });
        }
      }

      if (token) {
        let serverHandled = false;
        try {
          const { ok, status, data } = await apiFetchJson<{ results?: CalendarExecutionResult[]; error?: string }>(
            '/api/calendar/execute',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                ...(p.firebaseUser?.uid ? { 'x-user-uid': p.firebaseUser.uid } : {}),
                'x-client-id': p.clientIdRef.current,
              },
              body: JSON.stringify({ actions, undoSnapshot: undoSnap }),
            }
          );
          if (!ok) {
            if (status === 401) {
              p.handleWorkspaceUnauthorized();
              p.showToast('انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى بضغطة واحدة');
            }
            await p.fetchCalendarEvents(token);
            throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Calendar.');
          }
          results = Array.isArray(data.results) ? data.results : [];
          serverHandled = true;
        } catch {
          results = await executeCalendarDirect(actions, token, p.activeTimeZone, p.handleWorkspaceUnauthorized, p.showToast);
          serverHandled = true;
        }

        if (serverHandled) {
          googleSynced = true;
          p.setReflowedBlocksOverride(null);
          const createdItems: GoogleCalendarEventItem[] = [];
          for (const act of actions) {
            if (act.operation === 'create' && act.dateIso && act.startTime24) {
              const resItem = results.find((r) => r.operation === 'create' && r.title === act.title);
              const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
                act.dateIso, act.startTime24, act.durationMinutes, p.activeTimeZone
              );
              const createdId = resItem?.id || `created_${Date.now()}`;
              createdItems.push({
                id: createdId, calendarId: act.calendarId || 'primary', summary: act.title,
                description: act.description || '', start: startDateTime, end: endDateTime, isAllDay: false, htmlLink: resItem?.htmlLink,
              });
              p.recentlyCreatedEventIdsRef.current.add(createdId);
            }
          }
          if (createdItems.length > 0) {
            p.setCalendarEvents((prev) => {
              const newIds = new Set(createdItems.map((c) => c.id));
              return [...prev.filter((e) => !newIds.has(e.id)), ...createdItems].sort((a, b) => a.start.localeCompare(b.start));
            });
            setTimeout(() => createdItems.forEach((c) => p.recentlyCreatedEventIdsRef.current.delete(c.id)), 30_000);
          }
          for (const act of actions) {
            if (act.eventId) {
              const bId = `gcal_${act.calendarId || 'primary'}_${act.eventId}`;
              p.acknowledgedBlockIdsRef.current.delete(bId);
              p.setCompletedOverrides((prev) => {
                if (!prev[bId]) return prev;
                const next = { ...prev };
                delete next[bId];
                return next;
              });
            }
          }
          await p.fetchCalendarEvents(token);
        }

        if (undoSnap) p.setLastDeletedWorkspaceItem(undoSnap);
        p.emitCrossDeviceSync('calendar', options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update', undoSnap);
        p.appendChangelog('Gemini API', `تحديث ${results.length} حدثاً في Google Calendar الحقيقي`, `Updated ${results.length} events in Google Calendar`);
        p.showToast(
          options?.isUndoRestore
            ? '↩️ تم استرجاع الحدث ومزامنته على جميع أجهزتك ✓'
            : deleteAct
              ? 'تم حذف الحدث ومزامنته فوراً — يمكنك التراجع الآن ✓'
              : `تمت المزامنة مع Google Calendar (${results.length} عمليات) ✓`
        );
      } else {
        handleApplyOfflineActions(actions);
        p.showToast('تم التطبيق في وضع المعاينة (سجّل الدخول بحساب Google للتنفيذ في تقويمك).');
      }
      return { googleSynced, results };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.activeTimeZone, p.appendChangelog, p.calendarEvents, p.emitCrossDeviceSync, p.fetchCalendarEvents, p.firebaseUser?.uid, handleApplyOfflineActions, p.handleWorkspaceUnauthorized, p.showToast]
  );

  const executeTaskActionsNow = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      if (!options?.isUndoRestore && !options?.alreadyResolved) {
        taskActions = resolveTaskActionTargets(taskActions, p.googleTasks);
      }
      const token = getCalendarAccessToken();
      if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google لتنفيذ تعديلات Google Tasks.');

      const deleteAct = taskActions.find((a) => a.operation === 'delete' && a.taskId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingTk = p.googleTasks.find((tk) => tk.id === deleteAct.taskId);
        undoSnap = {
          opId: `del_tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'task',
          title: existingTk?.title || deleteAct.title,
          taskListId: existingTk?.taskListId || deleteAct.taskListId || '@default',
          notes: existingTk?.notes || '',
          dueDateIso: existingTk?.due ? existingTk.due.slice(0, 10) : undefined,
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(taskActions.filter((a) => a.operation === 'delete' && a.taskId).map((a) => a.taskId!));
        if (deleteIds.size > 0) p.setGoogleTasks((prev) => prev.filter((tk) => !deleteIds.has(tk.id)));
      }
      taskActions.forEach((a) => {
        if ((a.operation === 'delete' || a.operation === 'complete') && a.taskId) cancelTargetAlarms({ taskId: a.taskId });
      });

      let results: TaskExecutionResult[] = [];
      try {
        const { ok, status, data } = await apiFetchJson<{ results?: TaskExecutionResult[]; error?: string }>(
          '/api/tasks/execute',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              ...(p.firebaseUser?.uid ? { 'x-user-uid': p.firebaseUser.uid } : {}),
              'x-client-id': p.clientIdRef.current,
            },
            body: JSON.stringify({ taskActions, undoSnapshot: undoSnap }),
          }
        );
        if (!ok) {
          if (status === 401) {
            p.handleWorkspaceUnauthorized();
            p.showToast('انتهت جلسة مزامنة Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
          }
          await p.fetchGoogleTasks(token);
          throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Tasks.');
        }
        results = Array.isArray(data.results) ? data.results : [];
      } catch {
        results = await executeTasksDirect(taskActions, token, p.handleWorkspaceUnauthorized, p.showToast);
      }

      const createdItems: GoogleTaskItem[] = [];
      for (const act of taskActions) {
        if (act.operation === 'create') {
          const resItem = results.find((r) => r.operation === 'create' && r.title === act.title);
          const createdId = resItem?.id || `task_${Date.now()}`;
          createdItems.push({
            id: createdId,
            taskListId: act.taskListId || '@default',
            taskListTitle: p.googleTaskLists.find((l) => l.id === act.taskListId)?.title || 'المهام',
            title: act.title,
            notes: act.notes || '',
            status: 'needsAction',
            due: act.dueDateIso ? `${act.dueDateIso}T00:00:00.000Z` : undefined,
          });
          p.recentlyCreatedTaskIdsRef.current.add(createdId);
        }
      }
      if (createdItems.length > 0) {
        p.setGoogleTasks((prev) => {
          const newIds = new Set(createdItems.map((c) => c.id));
          return [...prev.filter((t) => !newIds.has(t.id)), ...createdItems];
        });
        setTimeout(() => createdItems.forEach((c) => p.recentlyCreatedTaskIdsRef.current.delete(c.id)), 30_000);
      }

      await p.fetchGoogleTasks(token);
      if (undoSnap) p.setLastDeletedWorkspaceItem(undoSnap);
      p.emitCrossDeviceSync('tasks', options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update', undoSnap);
      p.appendChangelog('Gemini API', `تحديث ${results.length} مهمة في Google Tasks الحقيقي`, `Updated ${results.length} tasks in Google Tasks`);
      p.showToast(
        options?.isUndoRestore
          ? '↩️ تم استرجاع المهمة ومزامنتها على جميع أجهزتك ✓'
          : deleteAct
            ? 'تم حذف المهمة ومزامنتها فوراً — يمكنك التراجع الآن ✓'
            : `تم تحديث Google Tasks بنجاح (${results.length} عمليات) ✓`
      );
      return { googleSynced: true, results };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.appendChangelog, p.emitCrossDeviceSync, p.fetchGoogleTasks, p.firebaseUser?.uid, p.googleTaskLists, p.googleTasks, p.handleWorkspaceUnauthorized, p.showToast]
  );

  return { handleApplyOfflineActions, executeCalendarActionsNow, executeTaskActionsNow };
}
