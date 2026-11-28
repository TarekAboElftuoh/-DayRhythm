import { clamp } from './constants';
import { DYNAMIC_HABIT_ANCHOR_LABELS } from './habitAnchors';
import { pickScientificFreeSlot } from './timelineHelpers';
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
import { findLockedCollision } from './timelineIntervals';
import { claimFreeInterval, mapMinutesToHabitAnchor } from './timelineHelpers';
import { classifyScientificTaskEnergy, type DayTimelineLockedBlock, type DayTimelinePlacedItem, type DayTimelineUnplacedItem, type LockedInterval } from './timelineTypes';

export function placeTimelineHabits(params: {
  habits: DynamicHabit[];
  todayIso: string;
  weekday: number | null;
  prayers: PrayerTimeItem[];
  profile: LifeProfile;
  plan: DailyRhythmPlan;
  collisionIntervals: LockedInterval[];
  remaining: FreeWindow[];
  deepWorkRanges: Array<[number, number]>;
  placedBlocks: DayTimelinePlacedItem[];
  unplacedBlocks: DayTimelineUnplacedItem[];
}): void {
  const {
    habits, todayIso, weekday, prayers, profile, plan,
    collisionIntervals, remaining, deepWorkRanges, placedBlocks, unplacedBlocks,
  } = params;
  // 4. Evaluate active Dynamic Habits (strictly honoring anchor without forcing onto locked/fallback time)
  const activeHabits = habits.filter((h) => h.status === 'active');
  const dueHabits = activeHabits
    .filter((habit) => {
      const scheduledToday =
        !habit.daysOfWeek ||
        habit.daysOfWeek.length === 0 ||
        (weekday !== null && habit.daysOfWeek.includes(weekday));
      if (!scheduledToday) return false;
      if (habit.skipOnFasting && plan.isFastingToday) return false;
      return true;
    })
    .sort((a, b) => (a.anchor === 'any-free-slot' ? 1 : 0) - (b.anchor === 'any-free-slot' ? 1 : 0));

  for (const habit of dueHabits) {
    const todayOv = todayIso ? habit.dailyOverrides?.[todayIso] : undefined;
    const dur = clamp(Math.round(todayOv?.durationMin ?? habit.durationMin ?? 30), 5, 240);
    const completedToday = Boolean(todayIso && habit.completedDates.includes(todayIso));
    const anchorMeta = DYNAMIC_HABIT_ANCHOR_LABELS[habit.anchor];
    const energy = classifyScientificTaskEnergy(habit.title);

    if (todayOv?.unplaced) {
      unplacedBlocks.push({
        id: `unplaced_habit_${habit.id}`,
        kind: 'habit',
        sourceId: habit.id,
        title: habit.title,
        emoji: anchorMeta.emoji,
        durationMin: dur,
        requestedStartMin: null,
        conflictKind: 'anchor_unavailable',
        conflictReasonAr: 'مؤجلة لليوم في قائمة التوظيف',
        suggestedSlot: null,
        habit,
      });
      continue;
    }

    if (typeof todayOv?.startMin === 'number') {
      const ovStart = todayOv.startMin;
      const ovCollision = findLockedCollision(ovStart, ovStart + dur, collisionIntervals);
      if (!ovCollision) {
        const winIdx = remaining.findIndex((w) => ovStart >= w.startMin && ovStart + dur <= w.endMin);
        if (winIdx !== -1) {
          claimFreeInterval(
            remaining,
            winIdx,
            ovStart,
            dur,
            prayers,
            plan,
            energy === 'deep_focus' ? 15 : 0
          );
        }
        if (energy === 'deep_focus') {
          deepWorkRanges.push([ovStart, ovStart + dur]);
        }
        placedBlocks.push({
          id: `placed_habit_${habit.id}`,
          kind: 'habit',
          sourceId: habit.id,
          title: habit.title,
          emoji: anchorMeta.emoji,
          startMin: ovStart,
          endMin: ovStart + dur,
          durationMin: dur,
          completed: completedToday,
          energyCategory: energy,
          subtitleAr: `${anchorMeta.labelAr} · تعديل اليوم`,
          habitId: habit.id,
          anchor: habit.anchor,
          isTodayOverride: true,
          habit,
        });
        continue;
      }
      unplacedBlocks.push({
        id: `unplaced_habit_${habit.id}`,
        kind: 'habit',
        sourceId: habit.id,
        title: habit.title,
        emoji: anchorMeta.emoji,
        durationMin: dur,
        requestedStartMin: ovStart,
        conflictKind: ovCollision.kind,
        conflictReasonAr: ovCollision.reasonAr,
        suggestedSlot: null,
        habit,
      });
      continue;
    }

    if (habit.anchor === 'any-free-slot') {
      const picked = pickScientificFreeSlot({
        title: habit.title,
        durationMin: dur,
        remainingWindows: remaining,
        prayers,
        plan,
        deepWorkRanges,
        claim: true,
      });
      if (picked) {
        placedBlocks.push({
          id: `placed_habit_${habit.id}`,
          kind: 'habit',
          sourceId: habit.id,
          title: habit.title,
          emoji: anchorMeta.emoji,
          startMin: picked.startMin,
          endMin: picked.endMin,
          durationMin: dur,
          completed: completedToday,
          energyCategory: energy,
          subtitleAr: anchorMeta.labelAr,
          habitId: habit.id,
          anchor: habit.anchor,
          habit,
        });
      } else {
        unplacedBlocks.push({
          id: `unplaced_habit_${habit.id}`,
          kind: 'habit',
          sourceId: habit.id,
          title: habit.title,
          emoji: anchorMeta.emoji,
          durationMin: dur,
          requestedStartMin: null,
          conflictKind: 'anchor_unavailable',
          conflictReasonAr: 'لا توجد نافذة فراغ كافية اليوم',
          suggestedSlot: null,
          habit,
        });
      }
      continue;
    }

    const pref = getHabitAnchorWindow(habit.anchor, prayers, plan, profile);
    let placedStart: number | null = null;
    let placedWinIdx = -1;

    if (pref && pref.end > pref.start) {
      if (pref.preferEnd) {
        for (let w = remaining.length - 1; w >= 0; w--) {
          const ovS = Math.max(remaining[w].startMin, pref.start);
          const ovE = Math.min(remaining[w].endMin, pref.end);
          if (ovE - ovS >= dur) {
            placedWinIdx = w;
            placedStart = ovE - dur;
            break;
          }
        }
      } else {
        for (let w = 0; w < remaining.length; w++) {
          const ovS = Math.max(remaining[w].startMin, pref.start);
          const ovE = Math.min(remaining[w].endMin, pref.end);
          if (ovE - ovS >= dur) {
            placedWinIdx = w;
            placedStart = ovS;
            break;
          }
        }
      }
    }

    if (placedStart !== null && placedWinIdx !== -1) {
      const collision = findLockedCollision(placedStart, placedStart + dur, collisionIntervals);
      if (!collision) {
        claimFreeInterval(
          remaining,
          placedWinIdx,
          placedStart,
          dur,
          prayers,
          plan,
          energy === 'deep_focus' ? 15 : 0
        );
        if (energy === 'deep_focus') {
          deepWorkRanges.push([placedStart, placedStart + dur]);
        }
        placedBlocks.push({
          id: `placed_habit_${habit.id}`,
          kind: 'habit',
          sourceId: habit.id,
          title: habit.title,
          emoji: anchorMeta.emoji,
          startMin: placedStart,
          endMin: placedStart + dur,
          durationMin: dur,
          completed: completedToday,
          energyCategory: energy,
          subtitleAr: anchorMeta.labelAr,
          habitId: habit.id,
          anchor: habit.anchor,
          habit,
        });
        continue;
      }
    }

    // Cannot fit anchor cleanly or collides with locked block -> route to unplacedBlocks
    const anchorCollision = pref
      ? findLockedCollision(pref.start, Math.max(pref.start + dur, pref.end), collisionIntervals)
      : null;

    unplacedBlocks.push({
      id: `unplaced_habit_${habit.id}`,
      kind: 'habit',
      sourceId: habit.id,
      title: habit.title,
      emoji: anchorMeta.emoji,
      durationMin: dur,
      requestedStartMin: pref ? pref.start : null,
      conflictKind: anchorCollision ? anchorCollision.kind : 'anchor_unavailable',
      conflictReasonAr: anchorCollision
        ? anchorCollision.reasonAr
        : `المرتكز «${anchorMeta.labelAr}» ممتلئ أو لا يتسع للمدة`,
      suggestedSlot: null,
      habit,
    });
  }

}
