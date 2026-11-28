import type {
  DailyRhythmPlan,
  GoogleTaskItem,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  PrayerTimeItem,
  ScheduleBlock,
  TravelState,
} from '../types/dayrhythm';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import { formatMinutes12h, getWeekdayInTimeZone } from '../engines/prayerEngine';
import { resolveMedicationDosesForDay } from '../engines/lifeRhythmEngine';
import { cleanCalendarText, resolveBlockDisplayInfo } from '../services/apiClient';
import { extractTaskTimeMinutesForToday } from '../utils/appHelpers';

export interface UnifiedCapsuleCandidate {
  sourceKind: 'calendar' | 'water' | 'medication' | 'task';
  emoji: string;
  title: string;
  clockLabel: string;
  startSec: number;
  endSec: number;
  targetSec: number;
  isNow: boolean;
  durationSec: number;
}

export function collectCapsuleCandidates(args: {
  activeTimeZone: string;
  nowSecOfDay: number;
  todayCairoIso: string;
  travelState: TravelState;
  liveBlocks: ScheduleBlock[];
  acknowledgedBlockIds: Set<string>;
  sunlightSessions: ComputedSunlightSession[];
  lifeProfile: LifeProfile;
  hydrationHistory: HydrationDayLog[];
  dailyRhythmPlan: DailyRhythmPlan;
  prayers: PrayerTimeItem[];
  medications: MedicationItem[];
  googleTasks: GoogleTaskItem[];
}): { candidates: UnifiedCapsuleCandidate[]; untimedTaskFallback: GoogleTaskItem | null } {
  const {
    activeTimeZone, nowSecOfDay, todayCairoIso, travelState, liveBlocks,
    acknowledgedBlockIds, sunlightSessions, lifeProfile, hydrationHistory,
    dailyRhythmPlan, prayers, medications, googleTasks,
  } = args;

  const candidates: UnifiedCapsuleCandidate[] = [];

  const deferCalendarCapsule = travelState.active && (travelState.deferredCategories?.includes('calendar') ?? false);
  for (const block of liveBlocks) {
    if (
      block.completed ||
      block.deleted ||
      block.isAllDay ||
      block.reflowStatus === 'postponed_travel' ||
      (deferCalendarCapsule && block.source === 'google_calendar') ||
      acknowledgedBlockIds.has(block.id)
    ) continue;
    if (block.id.startsWith('sunlight_')) {
      const matchedSun = sunlightSessions.find((s) => `sunlight_${s.id}` === block.id);
      if (matchedSun?.isCloudBlocked) continue;
    }
    const startSec = block.startMin * 60;
    const isZeroDuration = (block.durationMin ?? 0) === 0;
    const durationSec = isZeroDuration ? 0 : Math.max(60, block.durationMin * 60);
    const endSec = startSec + durationSec;
    if (isZeroDuration ? nowSecOfDay >= startSec : endSec <= nowSecOfDay) continue;
    const isNow = !isZeroDuration && nowSecOfDay >= startSec && nowSecOfDay < endSec;
    const bDisplay = resolveBlockDisplayInfo(block);
    const prayerEffectiveMin =
      block.source === 'prayer' ? block.startMin + lifeProfile.adhanLeadMinutes : block.startMin;
    candidates.push({
      sourceKind: 'calendar',
      emoji: (block.emojiPair || '📅').split(' ')[0] || '📅',
      title: bDisplay.title,
      clockLabel: formatMinutes12h(prayerEffectiveMin, 'ar'),
      startSec,
      endSec,
      targetSec: isZeroDuration ? startSec : isNow ? endSec : startSec,
      isNow,
      durationSec,
    });
  }

  const deferWaterCapsule = travelState.active && (travelState.deferredCategories?.includes('water') ?? false);
  const hydrationTodayEntry = hydrationHistory[hydrationHistory.length - 1];
  if (!deferWaterCapsule && hydrationTodayEntry && dailyRhythmPlan.hydrationSlots.length > 0) {
    const nextUpcomingCup = dailyRhythmPlan.hydrationSlots.find(
      (slot, idx) => !hydrationTodayEntry.slots[idx] && slot.timeMinutes * 60 > nowSecOfDay
    );
    if (nextUpcomingCup) {
      const startSec = nextUpcomingCup.timeMinutes * 60;
      const durationSec = 5 * 60;
      candidates.push({
        sourceKind: 'water',
        emoji: '💧',
        title: `كوب ماء ${nextUpcomingCup.cupIndex}`,
        clockLabel: formatMinutes12h(nextUpcomingCup.timeMinutes, 'ar'),
        startSec,
        endSec: startSec + durationSec,
        targetSec: startSec,
        isNow: false,
        durationSec,
      });
    }
  }

  const deferredMedsCapsule = travelState.active ? new Set(travelState.deferredMedIds ?? []) : null;
  const todayWeekday = getWeekdayInTimeZone(activeTimeZone);
  const capsuleFajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const capsuleMaghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
  for (const med of medications) {
    if (deferredMedsCapsule?.has(med.id)) continue;
    if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayWeekday)) continue;
    const times = med.times24 && med.times24.length > 0 ? med.times24 : med.time24 ? [med.time24] : [];
    const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
    const resolved = resolveMedicationDosesForDay(med, {
      isFastingToday: Boolean(dailyRhythmPlan.isFastingToday),
      fajrMin: capsuleFajrMin,
      maghribMin: capsuleMaghribMin,
    });
    for (const dose of resolved.doses) {
      const alreadyTaken =
        times.length > 1
          ? takenDoses.includes(dose.originalTime24) || takenDoses.includes(dose.effectiveTime24)
          : med.takenDateKey === todayCairoIso;
      if (alreadyTaken) continue;
      const medMin = dose.effectiveMin;
      const startSec = medMin * 60;
      const durationSec = 10 * 60;
      const endSec = startSec + durationSec;
      if (endSec <= nowSecOfDay) continue;
      const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
      candidates.push({
        sourceKind: 'medication',
        emoji: '💊',
        title: med.name,
        clockLabel: formatMinutes12h(medMin, 'ar'),
        startSec,
        endSec,
        targetSec: isNow ? endSec : startSec,
        isNow,
        durationSec,
      });
    }
  }

  let untimedTaskFallback: GoogleTaskItem | null = null;
  const deferTasksCapsule = travelState.active && (travelState.deferredCategories?.includes('tasks') ?? false);
  if (!deferTasksCapsule) {
    for (const tk of googleTasks) {
      const info = extractTaskTimeMinutesForToday(tk, todayCairoIso, activeTimeZone);
      if (!info) continue;
      if (!info.hasExplicitTime) {
        if (!untimedTaskFallback) untimedTaskFallback = tk;
        continue;
      }
      const startSec = info.startMin * 60;
      const durationSec = 15 * 60;
      const endSec = startSec + durationSec;
      if (endSec <= nowSecOfDay) continue;
      const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
      candidates.push({
        sourceKind: 'task',
        emoji: '☑️',
        title: cleanCalendarText(tk.title) || 'مهمة',
        clockLabel: formatMinutes12h(info.startMin, 'ar'),
        startSec,
        endSec,
        targetSec: isNow ? endSec : startSec,
        isNow,
        durationSec,
      });
    }
  }

  return { candidates, untimedTaskFallback };
}
