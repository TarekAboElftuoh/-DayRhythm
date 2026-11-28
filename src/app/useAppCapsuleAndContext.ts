import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { User } from 'firebase/auth';
import {
  ActiveSanctuaryState,
  CreativeActivityItem,
  CreativeActivityPlacement,
  DailyRhythmPlan,
  DualStreaks,
  FreeWindow,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PrayerTimeItem,
  ScheduleBlock,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  WeatherHydrationInfo,
} from '../types/dayrhythm';
import {
  formatMinutes12h,
  getNowMinutesInTimeZone,
  getWeekdayInTimeZone,
} from '../engines/prayerEngine';
import {
  buildLifeProfileGeminiSummary,
  resolveMedicationDosesForDay,
} from '../engines/lifeRhythmEngine';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import { buildCapsuleTimerState } from './buildCapsuleTimerState';

export interface UseAppCapsuleAndContextParams {
  activeTimeZone: string;
  prayers: PrayerTimeItem[];
  medications: MedicationItem[];
  todayCairoIso: string;
  dailyRhythmPlan: DailyRhythmPlan;
  nowTickMin: number;
  needsAuth: boolean;
  useOfflineDemo: boolean;
  firebaseUser: User | null;
  streaks: DualStreaks;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  creativeActivities: CreativeActivityItem[];
  memories: MemoryItem[];
  liveBlocks: ScheduleBlock[];
  acknowledgedBlockIdsRef: MutableRefObject<Set<string>>;
  sunlightSessions: ComputedSunlightSession[];
  lifeProfile: LifeProfile;
  hydrationHistory: HydrationDayLog[];
  hydrationToday: HydrationDayLog;
  travelState: TravelState;
  weatherInfo: WeatherHydrationInfo | null;
  todayCalendarMeta: TodayCalendarMeta;
  creativePlacements: CreativeActivityPlacement[];
  freeSlotsToday: FreeWindow[];
  tomorrowAlert: TomorrowAlertInfo | null;
  activeSanctuary: ActiveSanctuaryState;
  activeLocation: { nameAr: string };
}

export function useAppCapsuleAndContext(p: UseAppCapsuleAndContextParams) {
  const {
    activeTimeZone,
    prayers,
    medications,
    todayCairoIso,
    dailyRhythmPlan,
    nowTickMin,
    needsAuth,
    useOfflineDemo,
    firebaseUser,
    streaks,
    calendarEvents,
    googleTasks,
    creativeActivities,
    memories,
    liveBlocks,
    acknowledgedBlockIdsRef,
    sunlightSessions,
    lifeProfile,
    hydrationHistory,
    hydrationToday,
    travelState,
    weatherInfo,
    todayCalendarMeta,
    creativePlacements,
    freeSlotsToday,
    tomorrowAlert,
    activeSanctuary,
    activeLocation,
  } = p;

  const nextMedicationQuick = useMemo(() => {
    const todayW = getWeekdayInTimeZone(activeTimeZone);
    const fajrMin = prayers.find((pr) => pr.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
    const maghribMin = prayers.find((pr) => pr.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
    const candidates: Array<{ id: string; name: string; doseTime24?: string; timeLabel?: string; sortMin: number }> = [];
    for (const med of medications) {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) continue;
      const times = med.times24 && med.times24.length > 0 ? med.times24 : med.time24 ? [med.time24] : [];
      const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
      if (times.length === 0) {
        if (med.takenDateKey !== todayCairoIso) candidates.push({ id: med.id, name: med.name, sortMin: 24 * 60 + 1 });
        continue;
      }
      const resolved = resolveMedicationDosesForDay(med, {
        isFastingToday: Boolean(dailyRhythmPlan.isFastingToday),
        fajrMin,
        maghribMin,
      });
      for (const dose of resolved.doses) {
        const alreadyTaken =
          times.length > 1
            ? takenDoses.includes(dose.originalTime24) || takenDoses.includes(dose.effectiveTime24)
            : med.takenDateKey === todayCairoIso;
        if (alreadyTaken) continue;
        candidates.push({
          id: med.id,
          name: med.name,
          doseTime24: times.length > 1 ? dose.originalTime24 : undefined,
          timeLabel: formatMinutes12h(dose.effectiveMin, 'ar'),
          sortMin: dose.effectiveMin,
        });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.sortMin - b.sortMin);
    const upcoming = candidates.find((c) => c.sortMin >= nowTickMin - 15) ?? candidates[0];
    return { id: upcoming.id, name: upcoming.name, doseTime24: upcoming.doseTime24, timeLabel: upcoming.timeLabel };
  }, [activeTimeZone, dailyRhythmPlan.isFastingToday, medications, nowTickMin, prayers, todayCairoIso]);

  const [capsuleNowMs, setCapsuleNowMs] = useState<number>(() => Date.now());

  const hasDailyWirdHabit = useMemo(() => {
    if (needsAuth || !firebaseUser?.uid || firebaseUser.isAnonymous) return false;
    if (streaks.dailyCommitmentDays > 0 || streaks.dailyCommitmentDoneToday) return true;
    const wirdRe = /(ورد|الورد|قرآن|قران|أذكار|اذكار|تلاوة|الالتزام اليومي|🌱)/i;
    if (calendarEvents.some((e) => wirdRe.test(`${e.summary ?? ''} ${e.description ?? ''}`))) return true;
    if (googleTasks.some((tk) => wirdRe.test(`${tk.title ?? ''} ${tk.notes ?? ''}`))) return true;
    if (creativeActivities.some((a) => wirdRe.test(`${a.name} ${a.emoji}`))) return true;
    if (memories.some((m) => wirdRe.test(m.ruleText))) return true;
    return false;
  }, [needsAuth, firebaseUser?.uid, firebaseUser?.isAnonymous, streaks.dailyCommitmentDays, streaks.dailyCommitmentDoneToday, calendarEvents, googleTasks, creativeActivities, memories]);

  const nextActiveBlock = useMemo(() => {
    if (needsAuth && !useOfflineDemo) return null;
    const nowMin = getNowMinutesInTimeZone(activeTimeZone, new Date(capsuleNowMs));
    return (
      liveBlocks.find(
        (b) => !b.completed && !b.deleted && (b.isAllDay || b.startMin + Math.max(1, b.durationMin) > nowMin)
      ) ?? null
    );
  }, [needsAuth, useOfflineDemo, liveBlocks, activeTimeZone, capsuleNowMs]);

  const capsuleTimerState = useMemo(
    () =>
      buildCapsuleTimerState({
        needsAuth, useOfflineDemo, activeTimeZone, capsuleNowMs, todayCairoIso, travelState,
        liveBlocks, acknowledgedBlockIds: acknowledgedBlockIdsRef.current, sunlightSessions,
        lifeProfile, hydrationHistory, dailyRhythmPlan, prayers, medications, googleTasks, nextActiveBlock,
      }),
    [needsAuth, useOfflineDemo, activeTimeZone, liveBlocks, hydrationHistory, dailyRhythmPlan, medications, prayers, googleTasks, todayCairoIso, nextActiveBlock, capsuleNowMs, travelState, sunlightSessions, lifeProfile, acknowledgedBlockIdsRef]
  );

  useEffect(() => {
    const syncNow = () => setCapsuleNowMs(Date.now());
    const now = Date.now();
    const targetMs = capsuleTimerState.targetEpochMs || 0;
    const msToTarget = targetMs > now ? targetMs - now + 150 : 60_000;
    const msToMinute = 60_000 - (now % 60_000) + 120;
    const delay = Math.max(250, Math.min(60_000, msToTarget, msToMinute));
    const timer = window.setTimeout(syncNow, delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow();
    };
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [capsuleNowMs, capsuleTimerState.targetEpochMs]);

  const assistantContextSummary = useMemo(() => {
    const lifeConstitution = buildLifeProfileGeminiSummary(
      lifeProfile, dailyRhythmPlan, memories, weatherInfo, todayCalendarMeta,
      creativePlacements, freeSlotsToday, tomorrowAlert, todayCairoIso
    );
    const prayerLines = prayers
      .filter((pr) => pr.isObligatory)
      .map((pr) => `${pr.nameAr}: ${formatMinutes12h(pr.adhanMinutes, 'ar')} (تنبيه ${formatMinutes12h(pr.alarmMinutes, 'ar')})`)
      .join(' | ');
    return `
${lifeConstitution}
حالة حماية الصوت الآن: ${activeSanctuary.type === 'none' ? 'عادي' : activeSanctuary.labelAr}
مواقيت الصلاة اليوم (${activeLocation.nameAr}): ${prayerLines}
الترطيب المسجل اليوم: ${hydrationToday.cupsLogged}/${hydrationToday.targetCups} كوب (${hydrationToday.cupsLogged * lifeProfile.cupSizeMl} / ${dailyRhythmPlan.activeTargetMl} مل)
الحدث القادم: ${nextActiveBlock ? `${nextActiveBlock.emojiPair} ${nextActiveBlock.categoryAr} (${formatMinutes12h(nextActiveBlock.startMin, 'ar')})` : 'لا يوجد'}
`.trim();
  }, [
    activeLocation.nameAr, activeSanctuary, creativePlacements, dailyRhythmPlan, freeSlotsToday,
    hydrationToday.cupsLogged, hydrationToday.targetCups, lifeProfile, memories, nextActiveBlock,
    prayers, todayCairoIso, todayCalendarMeta, tomorrowAlert, weatherInfo,
  ]);

  return {
    nextMedicationQuick,
    capsuleNowMs,
    hasDailyWirdHabit,
    nextActiveBlock,
    capsuleTimerState,
    assistantContextSummary,
  };
}
