import { useCallback } from 'react';
import type React from 'react';
import type {
  CalendarActionProposal,
  CalendarExecutionResult,
  CreativeActivityActionProposal,
  CreativeActivityItem,
  CreativeActivityPlacement,
  CreativeCadence,
  CreativeExecutionResult,
} from '../types/dayrhythm';
import type { TasksVaultPayload } from '../types/appTypes';
import { sanitizeCreativeActivityId, sanitizeCreativeActivityItem } from '../firebase';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { CREATIVE_STORAGE_KEY } from '../utils/appHelpers';

export interface UseCreativeHandlersParams {
  activeTimeZone: string;
  setCreativeActivities: React.Dispatch<React.SetStateAction<CreativeActivityItem[]>>;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: () => Promise<boolean>;
  handleExecuteCalendarActions: (
    actions: CalendarActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }>;
  showToast: (msg: string) => void;
}

export function useCreativeHandlers(p: UseCreativeHandlersParams) {
  const handleAddCreativeActivity = useCallback(
    (input: {
      name: string;
      emoji?: string;
      cadence?: CreativeCadence;
      goalCount?: number;
      weeklyGoalSessions: number;
      sessionMinutes: number;
      expiresOnDate?: string;
    }) => {
      const cadence: CreativeCadence = input.cadence ?? 'weekly';
      const goalCount = input.goalCount ?? input.weeklyGoalSessions;
      const act = sanitizeCreativeActivityItem({
        id: sanitizeCreativeActivityId(
          `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        ),
        name: input.name,
        emoji: input.emoji || '🎨',
        cadence,
        goalCount,
        weeklyGoalSessions: Math.min(14, goalCount),
        sessionMinutes: input.sessionMinutes,
        loggedDates: [],
        scheduledTime24: '',
        calendarEventId: '',
        expiresOnDate: input.expiresOnDate ?? '',
      });
      p.setCreativeActivities((prev) => {
        const next = [...prev, act];
        void p.pushToTasksVaultImmediately({ creativeActivities: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      p.showToast(`${act.emoji} تمت إضافة «${act.name}» وسيُوضع تلقائياً في أوقاتك الفاضية ✓`);
      return act;
    },
    [p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setCreativeActivities, p.showToast]
  );

  const handleDeleteCreativeActivity = useCallback(
    (id: string) => {
      p.setCreativeActivities((prev) => {
        const next = prev.filter((a) => a.id !== id);
        void p.pushToTasksVaultImmediately({ creativeActivities: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      p.showToast('تم حذف النشاط الإبداعي');
    },
    [p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setCreativeActivities, p.showToast]
  );

  const handleScheduleCreativeInCalendar = useCallback(
    async (placement: CreativeActivityPlacement) => {
      if (!placement.suggestedSlot) {
        p.showToast('لا توجد فترة فراغ كافية متبقية اليوم — يمكنك جدولته عبر شات Gemini لغدٍ');
        return;
      }
      const action: CalendarActionProposal = {
        operation: 'create',
        calendarId: 'primary',
        title: `${placement.activity.emoji} ${placement.activity.name}`,
        dateIso: getDateIsoInTimeZone(p.activeTimeZone),
        startTime24: placement.suggestedSlot.time24,
        durationMinutes: placement.activity.sessionMinutes,
        description: `نشاط إبداعي مجدول في وقت فراغك · الهدف: ${placement.goalInPeriod} جلسات (${placement.periodLabelAr})`,
      };
      const res = await p.handleExecuteCalendarActions([action]);
      const createdId = res.results[0]?.id ?? '';
      p.setCreativeActivities((prev) => {
        const next = prev.map((a) => {
          if (a.id !== placement.activity.id) return a;
          return {
            ...a,
            scheduledTime24: placement.suggestedSlot!.time24,
            calendarEventId: createdId || a.calendarEventId,
          };
        });
        void p.pushToTasksVaultImmediately({ creativeActivities: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    [p.activeTimeZone, p.handleExecuteCalendarActions, p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setCreativeActivities, p.showToast]
  );

  const handleExecuteCreativeActions = useCallback(
    async (
      creativeActions: CreativeActivityActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<CreativeExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      const results: CreativeExecutionResult[] = [];

      p.setCreativeActivities((prev) => {
        let next = [...prev];
        for (const act of creativeActions) {
          const op = act.operation;
          if (op === 'remove') {
            const target = next.find((a) => (act.activityId && a.id === act.activityId) || a.name.trim() === act.name.trim());
            if (target) {
              next = next.filter((a) => a.id !== target.id);
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
            }
          } else if (op === 'log_session' || op === 'log_today') {
            const target = next.find((a) => (act.activityId && a.id === act.activityId) || a.name.includes(act.name.trim()));
            if (target) {
              const nextDates = target.loggedDates.includes(todayIso) ? target.loggedDates : [...target.loggedDates, todayIso].slice(-30);
              next = next.map((a) => (a.id === target.id ? { ...target, loggedDates: nextDates } : a));
              results.push({ name: target.name, operation: 'log_session', status: 'logged', id: target.id });
            }
          } else {
            const existing = next.find((a) => (act.activityId && a.id === act.activityId) || a.name.trim() === act.name.trim());
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const nextCadence = act.cadence ?? existing.cadence ?? 'weekly';
              const nextGoal = act.goalCount ?? act.weeklyGoalSessions ?? existing.goalCount ?? existing.weeklyGoalSessions;
              const updated = sanitizeCreativeActivityItem({
                ...existing,
                name: act.name || existing.name,
                emoji: act.emoji ?? existing.emoji,
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? existing.sessionMinutes,
                scheduledTime24: act.scheduledTime24 ?? existing.scheduledTime24,
                calendarEventId: calId || existing.calendarEventId,
                expiresOnDate: act.expiresOnDate ?? existing.expiresOnDate,
              });
              next = next.map((a) => (a.id === existing.id ? updated : a));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const nextCadence: CreativeCadence = act.cadence ?? 'weekly';
              const nextGoal = act.goalCount ?? act.weeklyGoalSessions ?? (nextCadence === 'daily' ? 1 : nextCadence === 'monthly' ? 8 : 3);
              const created = sanitizeCreativeActivityItem({
                id: sanitizeCreativeActivityId(act.activityId || `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
                name: act.name,
                emoji: act.emoji ?? '🎨',
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? 30,
                loggedDates: [],
                scheduledTime24: act.scheduledTime24 ?? '',
                calendarEventId: calId,
                expiresOnDate: act.expiresOnDate ?? '',
              });
              next = [...next, created];
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        void p.pushToTasksVaultImmediately({ creativeActivities: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      return results;
    },
    [p.activeTimeZone, p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setCreativeActivities]
  );

  return {
    handleAddCreativeActivity,
    handleDeleteCreativeActivity,
    handleScheduleCreativeInCalendar,
    handleExecuteCreativeActions,
  };
}
