import { useCallback } from 'react';
import type React from 'react';
import type {
  DynamicHabit,
  DynamicHabitAnchor,
  DynamicHabitDailyOverride,
  DynamicHabitStatus,
  HabitActionProposal,
  HabitExecutionResult,
} from '../types/dayrhythm';
import type { TasksVaultPayload } from '../types/appTypes';
import { sanitizeDynamicHabit, sanitizeHabitId } from '../firebase';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { HABITS_STORAGE_KEY } from '../utils/appHelpers';

export interface UseHabitHandlersParams {
  activeTimeZone: string;
  setHabits: React.Dispatch<React.SetStateAction<DynamicHabit[]>>;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: (customToken?: string, overrides?: { habits?: DynamicHabit[] }) => Promise<boolean>;
  showToast: (msg: string) => void;
}

export function useHabitHandlers(p: UseHabitHandlersParams) {
  const persistHabitsNext = useCallback(
    (updater: (prev: DynamicHabit[]) => DynamicHabit[]) => {
      p.setHabits((prev) => {
        const next = updater(prev);
        void p.pushToTasksVaultImmediately({ habits: next });
        void p.pushFullCloudBackupImmediately(undefined, { habits: next });
        try { localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    [p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setHabits]
  );

  const handleAddHabit = useCallback(
    (input: {
      title: string;
      status: DynamicHabitStatus;
      anchor: DynamicHabitAnchor;
      durationMin: number;
      daysOfWeek?: number[];
      skipOnFasting?: boolean;
    }) => {
      const created = sanitizeDynamicHabit({
        id: sanitizeHabitId(`hab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        title: input.title,
        status: input.status,
        anchor: input.anchor,
        durationMin: input.durationMin,
        daysOfWeek: input.daysOfWeek,
        skipOnFasting: input.skipOnFasting,
        completedDates: [],
      });
      persistHabitsNext((prev) => [...prev, created]);
      p.showToast(
        created.status === 'active'
          ? `✓ تمت إضافة العادة «${created.title}» وتسكينها تلقائياً في أوقاتك الفاضية`
          : `✓ تمت إضافة العادة المستقبلية «${created.title}»`
      );
    },
    [persistHabitsNext, p.showToast]
  );

  const handleUpdateHabit = useCallback(
    (
      id: string,
      patch: {
        title: string;
        status: DynamicHabitStatus;
        anchor: DynamicHabitAnchor;
        durationMin: number;
        daysOfWeek?: number[];
        skipOnFasting?: boolean;
        dailyOverrides?: Record<string, DynamicHabitDailyOverride>;
      }
    ) => {
      persistHabitsNext((prev) =>
        prev.map((h) =>
          h.id === id
            ? sanitizeDynamicHabit({
                ...h,
                title: patch.title,
                status: patch.status,
                anchor: patch.anchor,
                durationMin: patch.durationMin,
                daysOfWeek: patch.daysOfWeek,
                skipOnFasting: patch.skipOnFasting,
                dailyOverrides: patch.dailyOverrides !== undefined ? patch.dailyOverrides : h.dailyOverrides,
              })
            : h
        )
      );
      p.showToast('✓ تم تحديث العادة');
    },
    [persistHabitsNext, p.showToast]
  );

  const handleToggleHabitToday = useCallback(
    (habitId: string) => {
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      let completedNow = false;
      let targetTitle = '';
      persistHabitsNext((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h;
          targetTitle = h.title;
          const has = h.completedDates.includes(todayIso);
          completedNow = !has;
          const nextDates = has ? h.completedDates.filter((d) => d !== todayIso) : [...h.completedDates, todayIso].slice(-60);
          return { ...h, completedDates: nextDates };
        })
      );
      if (targetTitle) {
        p.showToast(completedNow ? `✓ تم إنجاز «${targetTitle}» اليوم` : `تم إلغاء إنجاز «${targetTitle}»`);
      }
    },
    [p.activeTimeZone, persistHabitsNext, p.showToast]
  );

  const handleDeleteHabit = useCallback(
    (habitId: string) => {
      persistHabitsNext((prev) => prev.filter((h) => h.id !== habitId));
      p.showToast('تم حذف العادة');
    },
    [persistHabitsNext, p.showToast]
  );

  const handleToggleHabitStatus = useCallback(
    (habitId: string) => {
      let nextStatus: DynamicHabitStatus = 'active';
      let targetTitle = '';
      persistHabitsNext((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h;
          targetTitle = h.title;
          nextStatus = h.status === 'active' ? 'planned' : 'active';
          return { ...h, status: nextStatus };
        })
      );
      if (targetTitle) {
        p.showToast(
          nextStatus === 'active'
            ? `✓ تم تفعيل «${targetTitle}» في جدول اليوم`
            : `تم تأجيل «${targetTitle}» إلى العادات المستقبلية`
        );
      }
    },
    [persistHabitsNext, p.showToast]
  );

  const handleExecuteHabitActions = useCallback(
    async (habitActions: HabitActionProposal[]): Promise<HabitExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      const results: HabitExecutionResult[] = [];

      persistHabitsNext((prev) => {
        let next = [...prev];
        for (const act of habitActions) {
          const op = act.operation;
          const findTarget = () =>
            next.find(
              (h) => (act.habitId && h.id === act.habitId) || h.title.trim().toLowerCase() === act.title.trim().toLowerCase()
            ) ?? next.find((h) => h.title.trim().includes(act.title.trim()));

          if (op === 'remove') {
            const target = findTarget();
            if (target) {
              next = next.filter((h) => h.id !== target.id);
              results.push({ id: target.id, title: target.title, operation: 'remove', status: 'removed' });
            }
          } else if (op === 'toggle_today') {
            const target = findTarget();
            if (target) {
              const has = target.completedDates.includes(todayIso);
              const nextDates = has ? target.completedDates.filter((d) => d !== todayIso) : [...target.completedDates, todayIso].slice(-60);
              next = next.map((h) => (h.id === target.id ? { ...h, completedDates: nextDates } : h));
              results.push({ id: target.id, title: target.title, operation: 'toggle_today', status: has ? 'unchecked' : 'completed' });
            }
          } else if (op === 'pause' || op === 'activate') {
            const target = findTarget();
            const targetStatus: DynamicHabitStatus = op === 'pause' ? 'planned' : 'active';
            if (target) {
              const updated = sanitizeDynamicHabit({
                ...target,
                status: targetStatus,
                ...(act.anchor ? { anchor: act.anchor } : {}),
                ...(typeof act.durationMin === 'number' ? { durationMin: act.durationMin } : {}),
                ...(Array.isArray(act.daysOfWeek) ? { daysOfWeek: act.daysOfWeek } : {}),
                ...(typeof act.skipOnFasting === 'boolean' ? { skipOnFasting: act.skipOnFasting } : {}),
              });
              next = next.map((h) => (h.id === target.id ? updated : h));
              results.push({ id: updated.id, title: updated.title, operation: op, status: targetStatus });
            } else if (op === 'activate') {
              const created = sanitizeDynamicHabit({
                id: sanitizeHabitId(act.habitId || `hab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
                title: act.title,
                status: 'active',
                anchor: act.anchor ?? 'any-free-slot',
                durationMin: act.durationMin ?? 30,
                daysOfWeek: act.daysOfWeek,
                skipOnFasting: act.skipOnFasting,
                completedDates: [],
              });
              next = [...next, created];
              results.push({ id: created.id, title: created.title, operation: op, status: 'active' });
            }
          } else {
            const existing =
              op === 'update'
                ? findTarget()
                : next.find(
                    (h) => (act.habitId && h.id === act.habitId) || h.title.trim().toLowerCase() === act.title.trim().toLowerCase()
                  );
            if (existing) {
              const updated = sanitizeDynamicHabit({
                ...existing,
                title: act.title || existing.title,
                status: act.status ?? existing.status,
                anchor: act.anchor ?? existing.anchor,
                durationMin: act.durationMin ?? existing.durationMin,
                daysOfWeek: act.daysOfWeek ?? existing.daysOfWeek,
                skipOnFasting: act.skipOnFasting ?? existing.skipOnFasting,
              });
              next = next.map((h) => (h.id === existing.id ? updated : h));
              results.push({ id: updated.id, title: updated.title, operation: 'update', status: updated.status });
            } else {
              const created = sanitizeDynamicHabit({
                id: sanitizeHabitId(act.habitId || `hab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
                title: act.title,
                status: act.status ?? 'active',
                anchor: act.anchor ?? 'any-free-slot',
                durationMin: act.durationMin ?? 30,
                daysOfWeek: act.daysOfWeek,
                skipOnFasting: act.skipOnFasting,
                completedDates: [],
              });
              next = [...next, created];
              results.push({ id: created.id, title: created.title, operation: 'add', status: created.status });
            }
          }
        }
        return next;
      });

      return results;
    },
    [p.activeTimeZone, persistHabitsNext]
  );

  return {
    handleAddHabit,
    handleUpdateHabit,
    handleToggleHabitToday,
    handleDeleteHabit,
    handleToggleHabitStatus,
    handleExecuteHabitActions,
  };
}
