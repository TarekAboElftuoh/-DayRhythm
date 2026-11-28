import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  CalendarActionProposal,
  CalendarExecutionResult,
  DeletedWorkspaceSnapshot,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  TaskActionProposal,
  TaskExecutionResult,
} from '../types/dayrhythm';
import { getCalendarAccessToken } from '../services/googleCalendarAuth';
import { computeEventRangeInTimeZone, getDateIsoInTimeZone } from '../engines/prayerEngine';
import {
  isNetworkFailure,
  type QueuedGoogleOp,
  readGoogleOfflineQueue,
  resolveCalendarActionTargets,
  resolveRelativeCalendarStarts,
  resolveTaskActionTargets,
  writeGoogleOfflineQueue,
} from '../utils/appHelpers';

export interface UseWorkspaceActionsParams {
  activeTimeZone: string;
  authUser: User | null;
  needsAuth: boolean;
  workspaceTokenExpired: boolean;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  lastDeletedWorkspaceItem: DeletedWorkspaceSnapshot | null;
  restoredOpIdsRef: React.MutableRefObject<Set<string>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<GoogleCalendarEventItem[]>>;
  setGoogleTasks: React.Dispatch<React.SetStateAction<GoogleTaskItem[]>>;
  setLastDeletedWorkspaceItem: React.Dispatch<React.SetStateAction<DeletedWorkspaceSnapshot | null>>;
  executeCalendarActionsNow: (
    actions: CalendarActionProposal[],
    options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }>;
  executeTaskActionsNow: (
    taskActions: TaskActionProposal[],
    options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
  ) => Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }>;
  showToast: (msg: string) => void;
}

export function useWorkspaceActions(p: UseWorkspaceActionsParams) {
  const [queuedGoogleOpsCount, setQueuedGoogleOpsCount] = useState<number>(() => readGoogleOfflineQueue().length);

  const queueGoogleOp = useCallback(
    (kind: QueuedGoogleOp['kind'], actions: QueuedGoogleOp['actions']) => {
      const next = [
        ...readGoogleOfflineQueue(),
        { id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, kind, actions, createdAtMs: Date.now() },
      ];
      writeGoogleOfflineQueue(next);
      setQueuedGoogleOpsCount(next.length);
      p.showToast('📴 مفيش إنترنت — التعديل اتحفظ وهيتنفذ في Google لوحده أول ما النت يرجع');
    },
    [p.showToast]
  );

  const handleExecuteCalendarActions = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[]; queued?: boolean }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      const queueNow = (resolved: CalendarActionProposal[]) => {
        queueGoogleOp('calendar', resolved);
        const deleteIds = new Set(resolved.filter((a) => a.operation === 'delete').map((a) => a.eventId));
        p.setCalendarEvents((prev) => {
          const kept = prev.filter((e) => !deleteIds.has(e.id));
          const created = resolved
            .filter((a) => a.operation === 'create' && a.dateIso && a.startTime24)
            .map((a, i) => {
              const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
                a.dateIso, a.startTime24, a.durationMinutes, p.activeTimeZone
              );
              return {
                id: `queued-${Date.now()}-${i}`,
                calendarId: a.calendarId || 'primary',
                summary: a.title,
                description: a.description || '',
                start: startDateTime,
                end: endDateTime,
                isAllDay: false,
              } as GoogleCalendarEventItem;
            });
          return [...kept, ...created].sort((x, y) => x.start.localeCompare(y.start));
        });
        return { googleSynced: false, results: [], queued: true };
      };
      const resolved = options?.isUndoRestore
        ? actions
        : resolveCalendarActionTargets(resolveRelativeCalendarStarts(actions, p.activeTimeZone), p.calendarEvents);
      if (navigator.onLine === false) return queueNow(resolved);
      try {
        return await p.executeCalendarActionsNow(resolved, { ...options, alreadyResolved: true });
      } catch (err: unknown) {
        if (isNetworkFailure(err)) return queueNow(resolved);
        throw err;
      }
    },
    [p.activeTimeZone, p.calendarEvents, p.executeCalendarActionsNow, p.setCalendarEvents, queueGoogleOp]
  );

  const handleExecuteTaskActions = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[]; queued?: boolean }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      const queueNow = (resolved: TaskActionProposal[]) => {
        queueGoogleOp('tasks', resolved);
        p.setGoogleTasks((prev) =>
          prev
            .filter((t) => !resolved.some((a) => a.operation === 'delete' && a.taskId === t.id))
            .map((t) => {
              const act = resolved.find((a) => a.taskId === t.id);
              if (!act) return t;
              if (act.operation === 'complete') return { ...t, status: 'completed' as const };
              if (act.operation === 'reopen') return { ...t, status: 'needsAction' as const };
              if (act.operation === 'update') return { ...t, title: act.title || t.title };
              return t;
            })
        );
        return { googleSynced: false, results: [], queued: true };
      };
      const resolved = options?.isUndoRestore ? taskActions : resolveTaskActionTargets(taskActions, p.googleTasks);
      if (navigator.onLine === false) return queueNow(resolved);
      try {
        return await p.executeTaskActionsNow(resolved, { ...options, alreadyResolved: true });
      } catch (err: unknown) {
        if (isNetworkFailure(err)) return queueNow(resolved);
        throw err;
      }
    },
    [p.executeTaskActionsNow, p.googleTasks, p.setGoogleTasks, queueGoogleOp]
  );

  const flushingQueueRef = useRef(false);
  useEffect(() => {
    if (!p.authUser || p.needsAuth || p.workspaceTokenExpired) return;
    const flush = async () => {
      if (flushingQueueRef.current || navigator.onLine === false || !getCalendarAccessToken()) return;
      const queue = readGoogleOfflineQueue();
      if (queue.length === 0) return;
      flushingQueueRef.current = true;
      let done = 0;
      try {
        for (const op of queue) {
          try {
            if (op.kind === 'calendar') {
              await p.executeCalendarActionsNow(op.actions as CalendarActionProposal[], { alreadyResolved: true });
            } else {
              await p.executeTaskActionsNow(op.actions as TaskActionProposal[], { alreadyResolved: true });
            }
            done += 1;
          } catch (err: unknown) {
            if (isNetworkFailure(err)) break;
            p.showToast(`تعذر تنفيذ تعديل محفوظ: ${err instanceof Error ? err.message : ''}`);
          }
          const rest = readGoogleOfflineQueue().filter((q) => q.id !== op.id);
          writeGoogleOfflineQueue(rest);
          setQueuedGoogleOpsCount(rest.length);
        }
        if (done > 0) p.showToast(`✓ رجع النت — اتنفذ ${done} تعديل محفوظ في Google`);
      } finally {
        flushingQueueRef.current = false;
      }
    };
    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [p.authUser, p.needsAuth, p.workspaceTokenExpired, p.executeCalendarActionsNow, p.executeTaskActionsNow, p.showToast]);

  const handleUndoWorkspaceDelete = useCallback(async () => {
    const snap = p.lastDeletedWorkspaceItem;
    if (!snap) return;
    if (p.restoredOpIdsRef.current.has(snap.opId)) {
      p.setLastDeletedWorkspaceItem(null);
      return;
    }
    p.restoredOpIdsRef.current.add(snap.opId);
    p.setLastDeletedWorkspaceItem(null);

    try {
      if (snap.kind === 'task') {
        await handleExecuteTaskActions(
          [{ operation: 'create', taskListId: snap.taskListId || '@default', title: snap.title, notes: snap.notes, dueDateIso: snap.dueDateIso }],
          { isUndoRestore: true }
        );
      } else {
        await handleExecuteCalendarActions(
          [{
            operation: 'create',
            calendarId: snap.calendarId || 'primary',
            title: snap.title,
            dateIso: snap.dateIso || getDateIsoInTimeZone(p.activeTimeZone),
            startTime24: snap.startTime24 || '09:00',
            durationMinutes: typeof snap.durationMinutes === 'number' ? snap.durationMinutes : 30,
            description: snap.description,
          }],
          { isUndoRestore: true }
        );
      }
    } catch {
      p.restoredOpIdsRef.current.delete(snap.opId);
      p.showToast('تعذر الاسترجاع — تأكد من الاتصال بحساب Google');
    }
  }, [p.activeTimeZone, handleExecuteCalendarActions, handleExecuteTaskActions, p.lastDeletedWorkspaceItem, p.restoredOpIdsRef, p.setLastDeletedWorkspaceItem, p.showToast]);

  return { queuedGoogleOpsCount, handleExecuteCalendarActions, handleExecuteTaskActions, handleUndoWorkspaceDelete };
}
