import { useMemo } from 'react';
import type {
  AppLanguage,
  DailyRhythmPlan,
  GoogleTaskItem,
  HydrationDayLog,
  PrayerTimeItem,
  ScheduleBlock,
} from '../../types/dayrhythm';
import { resolveBlockDisplayInfo } from '../../services/apiClient';
import { formatSecClock } from './DashboardShared';

export function useHeroAndWater({
  remainingTodayBlocks,
  finishedTodayBlocks,
  prayers,
  prayersReady,
  calendarConnected,
  nowMinutes,
  nowSecOfDay,
  language,
  dailyRhythmPlan,
  hydrationToday,
  googleTasks,
  selectedTaskListId,
}: {
  remainingTodayBlocks: ScheduleBlock[];
  finishedTodayBlocks: ScheduleBlock[];
  prayers: PrayerTimeItem[];
  prayersReady?: boolean;
  calendarConnected: boolean;
  nowMinutes: number;
  nowSecOfDay: number;
  language: AppLanguage;
  dailyRhythmPlan: DailyRhythmPlan;
  hydrationToday: HydrationDayLog;
  googleTasks: GoogleTaskItem[];
  selectedTaskListId: string;
}) {
  const nextAlarmBlock = useMemo(() => remainingTodayBlocks[0] ?? null, [remainingTodayBlocks]);

  const nextObligatoryPrayerId = useMemo(() => {
    const obligatory = prayers.filter((p) => p.isObligatory);
    const upcoming = obligatory.find((p) => p.adhanMinutes >= nowMinutes);
    return upcoming?.id ?? obligatory[0]?.id ?? null;
  }, [prayers, nowMinutes]);

  const isNextBlockHappeningNow = Boolean(
    nextAlarmBlock &&
      !nextAlarmBlock.isAllDay &&
      nextAlarmBlock.startMin <= nowMinutes &&
      nextAlarmBlock.startMin + Math.max(1, nextAlarmBlock.durationMin) > nowMinutes
  );

  const nextAlarmDisplay = useMemo(() => resolveBlockDisplayInfo(nextAlarmBlock), [nextAlarmBlock]);

  const guestNextPrayer = useMemo(() => {
    if (calendarConnected || !(prayersReady ?? false)) return null;
    const prayer = prayers.find((p) => p.id === nextObligatoryPrayerId);
    if (!prayer) return null;
    const isTomorrow = prayer.adhanMinutes < nowMinutes;
    return { prayer, targetSec: (prayer.adhanMinutes + (isTomorrow ? 1440 : 0)) * 60 };
  }, [calendarConnected, prayersReady, prayers, nextObligatoryPrayerId, nowMinutes]);

  const countdownMeta = useMemo(() => {
    if (!calendarConnected) {
      if (guestNextPrayer) {
        const rem = Math.max(0, guestNextPrayer.targetSec - nowSecOfDay);
        return {
          clock: formatSecClock(rem),
          remainingSec: rem,
          caption: language === 'ar' ? `حتى أذان ${guestNextPrayer.prayer.nameAr}` : `Until ${guestNextPrayer.prayer.nameEn} adhan`,
        };
      }
      return { clock: '00:00', caption: language === 'ar' ? 'سجّل الدخول لعرض جدولك' : 'Sign in to sync schedule' };
    }
    if (!nextAlarmBlock) {
      return { clock: '✓', caption: language === 'ar' ? 'انتهى اليوم' : 'All done' };
    }
    if (isNextBlockHappeningNow) {
      const endSec = (nextAlarmBlock.startMin + Math.max(1, nextAlarmBlock.durationMin)) * 60;
      const remSec = Math.max(1, endSec - nowSecOfDay);
      const remMin = Math.ceil(remSec / 60);
      const h = Math.floor(remMin / 60);
      const m = remMin % 60;
      return {
        clock: formatSecClock(remSec),
        remainingSec: remSec,
        caption: language === 'ar' ? (h > 0 ? `متبقي الآن (${h} س ${m} د)` : `متبقي الآن (${m} د)`) : h > 0 ? `Left now (${h}h ${m}m)` : `Left now (${m}m)`,
      };
    }
    const startSec = nextAlarmBlock.startMin * 60;
    const diffSec = Math.max(0, startSec - nowSecOfDay);
    const diffMin = Math.ceil(diffSec / 60);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return {
      clock: formatSecClock(diffSec),
      remainingSec: diffSec,
      caption: language === 'ar' ? (h > 0 ? `يبدأ بعد ${h} س و ${m} د` : `يبدأ بعد ${m} د`) : h > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${m}m`,
    };
  }, [calendarConnected, guestNextPrayer, nextAlarmBlock, isNextBlockHappeningNow, nowSecOfDay, language]);

  const heroProgressPct = useMemo(() => {
    if (!calendarConnected) {
      if (!guestNextPrayer) return 0;
      const obligatory = prayers.filter((p) => p.isObligatory);
      const nextIdx = obligatory.findIndex((p) => p.id === guestNextPrayer.prayer.id);
      const prevPrayer = nextIdx > 0 ? obligatory[nextIdx - 1] : obligatory[obligatory.length - 1];
      const startSec = prevPrayer ? (prevPrayer.adhanMinutes > guestNextPrayer.prayer.adhanMinutes ? prevPrayer.adhanMinutes - 1440 : prevPrayer.adhanMinutes) * 60 : 0;
      const adjustedNow = nowSecOfDay < startSec ? nowSecOfDay + 1440 : nowSecOfDay;
      return Math.min(100, Math.max(4, Math.round(((adjustedNow - startSec) / Math.max(60, guestNextPrayer.targetSec - startSec)) * 100)));
    }
    if (!nextAlarmBlock) return 100;
    if (isNextBlockHappeningNow) {
      return Math.min(100, Math.max(2, Math.round(((nowSecOfDay - nextAlarmBlock.startMin * 60) / Math.max(60, nextAlarmBlock.durationMin * 60)) * 100)));
    }
    const lastFinished = finishedTodayBlocks[finishedTodayBlocks.length - 1];
    const windowStartSec = lastFinished ? (lastFinished.startMin + Math.max(0, lastFinished.durationMin)) * 60 : 0;
    return Math.min(100, Math.max(4, Math.round(((nowSecOfDay - windowStartSec) / Math.max(60, nextAlarmBlock.startMin * 60 - windowStartSec)) * 100)));
  }, [calendarConnected, guestNextPrayer, prayers, nextAlarmBlock, isNextBlockHappeningNow, finishedTodayBlocks, nowSecOfDay]);

  const scheduledHydrationSlots = dailyRhythmPlan.hydrationSlots;
  const scheduledTargetCups = scheduledHydrationSlots.length;
  const displayedCupsLogged = scheduledHydrationSlots.filter((_, idx) => Boolean(hydrationToday.slots[idx])).length;
  const totalMl = displayedCupsLogged * dailyRhythmPlan.cupSizeMl;
  const targetMl = scheduledTargetCups * dailyRhythmPlan.cupSizeMl;
  const waterPct = Math.min(100, Math.round((displayedCupsLogged / Math.max(1, scheduledTargetCups)) * 100));

  const nextWaterSlot = useMemo(() => {
    const upcoming = dailyRhythmPlan.hydrationSlots.find((slot, idx) => !hydrationToday.slots[idx] && slot.timeMinutes >= nowMinutes);
    return upcoming ?? dailyRhythmPlan.hydrationSlots.find((_, idx) => !hydrationToday.slots[idx]) ?? null;
  }, [dailyRhythmPlan.hydrationSlots, hydrationToday.slots, nowMinutes]);

  const visibleTasks = useMemo(() => {
    const base = selectedTaskListId === 'all' ? googleTasks : googleTasks.filter((tk) => tk.taskListId === selectedTaskListId);
    return base
      .filter((tk) => tk.title !== 'sync_state' && tk.taskListTitle !== '[DayRhythm Sync Vault]')
      .sort((a, b) => (a.status !== b.status ? (a.status === 'needsAction' ? -1 : 1) : (a.due ?? '9999').localeCompare(b.due ?? '9999')));
  }, [googleTasks, selectedTaskListId]);

  const openTasksCount = useMemo(
    () => googleTasks.filter((tk) => tk.status !== 'completed' && tk.title !== 'sync_state' && tk.taskListTitle !== '[DayRhythm Sync Vault]').length,
    [googleTasks]
  );

  return {
    nextAlarmBlock, nextObligatoryPrayerId, isNextBlockHappeningNow, nextAlarmDisplay,
    guestNextPrayer, countdownMeta, heroProgressPct, scheduledHydrationSlots,
    scheduledTargetCups, displayedCupsLogged, totalMl, targetMl, waterPct, nextWaterSlot,
    visibleTasks, openTasksCount,
  };
}
