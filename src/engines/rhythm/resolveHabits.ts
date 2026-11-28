import { clamp } from './constants';
import { computeFreeWindows, getFreeWindowPeriodLabelAr } from './freeWindows';
import type { ResolveHabitsForDayInput } from './habitAnchors';
import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';
import {
  calculateEgyptianPrayerTimes, formatMinutes12h, formatMinutes24h,
  formatTime24To12h, getSpecialFastDay, parseIsoToTimeZoneInfo,
} from '../prayerEngine';
import { getHabitAnchorWindow, resolveWeekdayFromIso } from './habitAnchors';

export function resolveHabitsForDay(input: ResolveHabitsForDayInput): ResolvedHabitPlacement[] {
  const { habits, prayers, plan, profile, occupiedBlocks, calendarEvents, todayIso, timeZone } =
    input;
  const activeHabits = habits.filter((h) => h.status === 'active');
  if (activeHabits.length === 0) return [];

  const weekday = input.weekday ?? resolveWeekdayFromIso(todayIso);
  const minHabitDur = activeHabits.reduce(
    (min, h) => Math.min(min, Math.max(5, Math.round(h.durationMin || 30))),
    20
  );
  const baseWindows = input.freeWindows
    ? input.freeWindows.map((w) => ({ ...w }))
    : computeFreeWindows({
        prayers,
        plan,
        profile,
        occupiedBlocks,
        calendarEvents,
        todayIso,
        timeZone,
        minGapMinutes: Math.min(20, minHabitDur),
      });

  const remaining: FreeWindow[] = baseWindows.map((w) => ({ ...w }));
  const results = new Array<ResolvedHabitPlacement>(activeHabits.length);

  const dueIndices: number[] = [];
  for (let i = 0; i < activeHabits.length; i++) {
    const habit = activeHabits[i];
    const completedToday = Boolean(todayIso && habit.completedDates.includes(todayIso));
    const scheduledToday =
      !habit.daysOfWeek ||
      habit.daysOfWeek.length === 0 ||
      (weekday !== null && habit.daysOfWeek.includes(weekday));
    if (!scheduledToday) {
      results[i] = {
        habit,
        dueToday: false,
        completedToday,
        skippedReasonAr: 'غير مجدولة اليوم',
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: false,
      };
      continue;
    }
    if (habit.skipOnFasting && plan.isFastingToday) {
      results[i] = {
        habit,
        dueToday: false,
        completedToday,
        skippedReasonAr: 'مؤجلة في يوم الصيام',
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: false,
      };
      continue;
    }
    dueIndices.push(i);
  }

  // Place anchor-specific habits before `'any-free-slot'` so anchors are preserved first
  dueIndices.sort((a, b) => {
    const aAny = activeHabits[a].anchor === 'any-free-slot' ? 1 : 0;
    const bAny = activeHabits[b].anchor === 'any-free-slot' ? 1 : 0;
    return aAny - bAny || a - b;
  });

  const claimFromInterval = (winIdx: number, startMin: number, durationMin: number) => {
    const win = remaining[winIdx];
    const endMin = startMin + durationMin;
    const replacements: FreeWindow[] = [];
    if (startMin - win.startMin >= 5) {
      replacements.push({
        startMin: win.startMin,
        endMin: startMin,
        durationMin: startMin - win.startMin,
        label: win.label,
      });
    }
    if (win.endMin - endMin >= 5) {
      replacements.push({
        startMin: endMin,
        endMin: win.endMin,
        durationMin: win.endMin - endMin,
        label: getFreeWindowPeriodLabelAr(endMin, prayers, plan),
      });
    }
    remaining.splice(winIdx, 1, ...replacements);
    return {
      startMin,
      endMin,
      time24: formatMinutes24h(startMin),
      windowLabel: getFreeWindowPeriodLabelAr(startMin, prayers, plan),
    };
  };

  for (const idx of dueIndices) {
    const habit = activeHabits[idx];
    const completedToday = Boolean(todayIso && habit.completedDates.includes(todayIso));
    const todayOv = todayIso ? habit.dailyOverrides?.[todayIso] : undefined;
    const dur = clamp(Math.round(todayOv?.durationMin ?? habit.durationMin ?? 30), 5, 240);

    if (todayOv?.unplaced) {
      results[idx] = {
        habit,
        dueToday: true,
        completedToday,
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: true,
      };
      continue;
    }

    if (typeof todayOv?.startMin === 'number') {
      const ovStart = todayOv.startMin;
      const ovWinIdx = remaining.findIndex(
        (w) => ovStart >= w.startMin && ovStart + dur <= w.endMin
      );
      if (ovWinIdx !== -1) {
        results[idx] = {
          habit,
          dueToday: true,
          completedToday,
          slot: claimFromInterval(ovWinIdx, ovStart, dur),
          isFallbackSlot: false,
          isFlexibleUnplaced: false,
        };
        continue;
      }
    }

    const pref = getHabitAnchorWindow(habit.anchor, prayers, plan, profile);

    let chosenWinIdx = -1;
    let chosenStart = 0;
    let isFallbackSlot = false;

    if (pref && pref.end > pref.start) {
      if (pref.preferEnd) {
        for (let w = remaining.length - 1; w >= 0; w--) {
          const win = remaining[w];
          const ovS = Math.max(win.startMin, pref.start);
          const ovE = Math.min(win.endMin, pref.end);
          if (ovE - ovS >= dur) {
            chosenWinIdx = w;
            chosenStart = ovE - dur;
            break;
          }
        }
      } else {
        for (let w = 0; w < remaining.length; w++) {
          const win = remaining[w];
          const ovS = Math.max(win.startMin, pref.start);
          const ovE = Math.min(win.endMin, pref.end);
          if (ovE - ovS >= dur) {
            chosenWinIdx = w;
            chosenStart = ovS;
            break;
          }
        }
      }
    }

    if (chosenWinIdx === -1) {
      if (!pref) {
        for (let w = 0; w < remaining.length; w++) {
          if (remaining[w].durationMin >= dur) {
            chosenWinIdx = w;
            chosenStart = remaining[w].startMin;
            break;
          }
        }
      } else {
        let bestDist = Infinity;
        for (let w = 0; w < remaining.length; w++) {
          const win = remaining[w];
          if (win.endMin - win.startMin < dur) continue;
          const targetAnchor = pref.preferEnd ? pref.ideal - dur : pref.ideal;
          const candStart = clamp(targetAnchor, win.startMin, win.endMin - dur);
          const dist = Math.abs(candStart - targetAnchor);
          if (dist < bestDist) {
            bestDist = dist;
            chosenWinIdx = w;
            chosenStart = candStart;
          }
        }
        if (chosenWinIdx !== -1) {
          isFallbackSlot = true;
        }
      }
    }

    if (chosenWinIdx !== -1) {
      results[idx] = {
        habit,
        dueToday: true,
        completedToday,
        slot: claimFromInterval(chosenWinIdx, chosenStart, dur),
        isFallbackSlot,
        isFlexibleUnplaced: false,
      };
    } else {
      results[idx] = {
        habit,
        dueToday: true,
        completedToday,
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: true,
      };
    }
  }

  return results;
}

