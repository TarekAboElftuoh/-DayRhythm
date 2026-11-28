import { resolveWeekdayFromIso } from './habitAnchors';
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
import { computeFreeWindows } from './freeWindows';
import { buildLockedIntervalsAndBlocks, findLockedCollision } from './timelineIntervals';
import { buildSystemBackgroundBlocks } from './timelineSystemBlocks';
import { claimFreeInterval, mapMinutesToHabitAnchor, parseTaskMinutesForTimeline, pickScientificFreeSlot } from './timelineHelpers';
import { placeTimelineHabits } from './timelineHabits';
import { classifyScientificTaskEnergy, type BuildDayTimelineInput, type DayTimelineModel, type DayTimelinePlacedItem, type DayTimelineUnplacedItem } from './timelineTypes';

export function buildDayTimelineModel(input: BuildDayTimelineInput): DayTimelineModel {
  const {
    prayers,
    plan,
    profile,
    habits = [],
    blocks = [],
    medications = [],
    googleTasks = [],
    calendarEvents = [],
    todayIso,
    timeZone,
  } = input;
  const weekday = input.weekday ?? resolveWeekdayFromIso(todayIso);
  const { lockedBlocks, collisionIntervals } = buildLockedIntervalsAndBlocks(prayers, plan, profile);
  lockedBlocks.push(...buildSystemBackgroundBlocks(prayers, plan, blocks, medications, weekday));
  lockedBlocks.sort((a, b) => a.startMin - b.startMin);

  const bedtime = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;
  const windDownStartMin =
    plan.seasonalSleep?.windDownStartMin ?? Math.max(plan.wakeMin, bedtime - 55);

  const placedBlocks: DayTimelinePlacedItem[] = [];
  const unplacedBlocks: DayTimelineUnplacedItem[] = [];
  const validFixedBlocks: ScheduleBlock[] = [];
  const deepWorkRanges: Array<[number, number]> = [];

  // 1. Evaluate movable ScheduleBlocks (never force colliding items onto locked time)
  for (const blk of blocks) {
    if (blk.deleted || blk.isAllDay || blk.source === 'prayer' || blk.isAnchor) continue;
    const dur = Math.max(10, Math.round(blk.durationMin || 30));
    const collision = findLockedCollision(blk.startMin, blk.startMin + dur, collisionIntervals);
    if (collision) {
      unplacedBlocks.push({
        id: `unplaced_blk_${blk.id}`,
        kind: 'event',
        sourceId: blk.id,
        title: blk.categoryAr,
        emoji: blk.emojiPair || '📅',
        durationMin: dur,
        requestedStartMin: blk.startMin,
        conflictKind: collision.kind,
        conflictReasonAr: collision.reasonAr,
        suggestedSlot: null,
        googleEventId: blk.googleEventId,
        googleCalendarId: blk.googleCalendarId,
        scheduleBlock: blk,
      });
      continue;
    }
    validFixedBlocks.push(blk);
    const energy = classifyScientificTaskEnergy(blk.categoryAr);
    if (energy === 'deep_focus') {
      deepWorkRanges.push([blk.startMin, blk.startMin + dur]);
    }
    placedBlocks.push({
      id: `placed_blk_${blk.id}`,
      kind: 'event',
      sourceId: blk.id,
      title: blk.categoryAr,
      emoji: blk.emojiPair || '📅',
      startMin: blk.startMin,
      endMin: blk.startMin + dur,
      durationMin: dur,
      completed: blk.completed,
      energyCategory: energy,
      subtitleAr: blk.calendarTitle,
      googleEventId: blk.googleEventId,
      googleCalendarId: blk.googleCalendarId,
      googleHtmlLink: blk.googleHtmlLink,
      scheduleBlockId: blk.id,
      scheduleBlock: blk,
    });
  }

  // 2. Compute clean freeWindows excluding locked blocks & valid fixed events
  const freeWindows = computeFreeWindows({
    prayers,
    plan,
    profile,
    occupiedBlocks: validFixedBlocks,
    calendarEvents,
    todayIso,
    timeZone,
    minGapMinutes: 15,
  });
  const remaining: FreeWindow[] = freeWindows.map((w) => ({ ...w }));

  // 3. Evaluate today's Google Tasks
  const placedTitlesNorm = new Set(
    placedBlocks.map((p) => `${p.title.trim().toLowerCase()}|${p.startMin}`)
  );
  for (const tk of googleTasks) {
    if (tk.status === 'completed' || tk.title === 'sync_state' || tk.taskListTitle === '[DayRhythm Sync Vault]') {
      continue;
    }
    const parsed = parseTaskMinutesForTimeline(tk, todayIso, timeZone ?? profile.currentTimeZone);
    if (!parsed) continue;
    const dur = 30;
    if (!parsed.hasExplicitTime) {
      unplacedBlocks.push({
        id: `unplaced_task_${tk.id}`,
        kind: 'task',
        sourceId: tk.id,
        title: tk.title,
        emoji: '☑️',
        durationMin: dur,
        requestedStartMin: null,
        conflictKind: 'anchor_unavailable',
        conflictReasonAr: 'مهمة اليوم بدون وقت محدد',
        suggestedSlot: null,
        googleTaskId: tk.id,
        googleTaskListId: tk.taskListId,
        googleTask: tk,
      });
      continue;
    }
    if (placedTitlesNorm.has(`${tk.title.trim().toLowerCase()}|${parsed.startMin}`)) continue;
    const collision = findLockedCollision(parsed.startMin, parsed.startMin + dur, collisionIntervals);
    if (collision) {
      unplacedBlocks.push({
        id: `unplaced_task_${tk.id}`,
        kind: 'task',
        sourceId: tk.id,
        title: tk.title,
        emoji: '☑️',
        durationMin: dur,
        requestedStartMin: parsed.startMin,
        conflictKind: collision.kind,
        conflictReasonAr: collision.reasonAr,
        suggestedSlot: null,
        googleTaskId: tk.id,
        googleTaskListId: tk.taskListId,
        googleTask: tk,
      });
      continue;
    }

    // Reserve from remaining free windows if falling inside one
    for (let w = 0; w < remaining.length; w++) {
      if (parsed.startMin < remaining[w].endMin && parsed.startMin + dur > remaining[w].startMin) {
        const ovS = Math.max(remaining[w].startMin, parsed.startMin);
        const ovE = Math.min(remaining[w].endMin, parsed.startMin + dur);
        if (ovE > ovS) {
          claimFreeInterval(remaining, w, ovS, ovE - ovS, prayers, plan);
        }
        break;
      }
    }
    const energy = classifyScientificTaskEnergy(tk.title);
    if (energy === 'deep_focus') {
      deepWorkRanges.push([parsed.startMin, parsed.startMin + dur]);
    }
    placedBlocks.push({
      id: `placed_task_${tk.id}`,
      kind: 'task',
      sourceId: tk.id,
      title: tk.title,
      emoji: '☑️',
      startMin: parsed.startMin,
      endMin: parsed.startMin + dur,
      durationMin: dur,
      completed: false,
      energyCategory: energy,
      googleTaskId: tk.id,
      googleTaskListId: tk.taskListId,
      googleTask: tk,
    });
  }


  placeTimelineHabits({
    habits,
    todayIso,
    weekday,
    prayers,
    profile,
    plan,
    collisionIntervals,
    remaining,
    deepWorkRanges,
    placedBlocks,
    unplacedBlocks,
  });

  // 5. Assign sequential non-overlapping scientific suggestions for all unplacedBlocks
  const suggestionPool: FreeWindow[] = remaining.map((w) => ({ ...w }));
  const suggestionDeepRanges: Array<[number, number]> = deepWorkRanges.map(([s, e]) => [s, e]);
  for (const item of unplacedBlocks) {
    item.suggestedSlot = pickScientificFreeSlot({
      title: item.title,
      durationMin: item.durationMin,
      remainingWindows: suggestionPool,
      prayers,
      plan,
      deepWorkRanges: suggestionDeepRanges,
      claim: true,
    });
  }

  placedBlocks.sort((a, b) => a.startMin - b.startMin);

  return {
    wakeMin: plan.wakeMin,
    bedtimeMin: plan.bedtimeMin,
    windDownStartMin,
    lockedBlocks,
    placedBlocks,
    unplacedBlocks,
    freeWindows,
  };
}

