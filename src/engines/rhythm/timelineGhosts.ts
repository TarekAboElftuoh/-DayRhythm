import { clamp } from './constants';
import { getFreeWindowPeriodLabelAr } from './freeWindows';
import { mapMinutesToHabitAnchor } from './timelineHelpers';
import { findLockedCollision } from './timelineIntervals';
import type { DayTimelineSuggestedSlot } from './timelineTypes';
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
import { buildLockedIntervalsAndBlocks } from './timelineIntervals';
import { pickScientificFreeSlot } from './timelineHelpers';
import type { LockedInterval } from './timelineTypes';

export interface DayTimelineGhostSlot {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  label: string;
  suggestedAnchor: DynamicHabitAnchor;
}

function subtractLockedFromWindows(
  windows: FreeWindow[],
  lockedIntervals: LockedInterval[],
  minDur: number
): FreeWindow[] {
  const safe: FreeWindow[] = [];
  for (const w of windows) {
    let slices: Array<[number, number]> = [[w.startMin, w.endMin]];
    for (const iv of lockedIntervals) {
      const next: Array<[number, number]> = [];
      for (const [s, e] of slices) {
        if (iv.endMin <= s || iv.startMin >= e) {
          next.push([s, e]);
        } else {
          if (iv.startMin > s) next.push([s, iv.startMin]);
          if (iv.endMin < e) next.push([iv.endMin, e]);
        }
      }
      slices = next;
    }
    for (const [s, e] of slices) {
      if (e - s >= minDur) {
        safe.push({
          startMin: s,
          endMin: e,
          durationMin: e - s,
          label: w.label,
        });
      }
    }
  }
  return safe;
}

function mergeWindowsWithRange(
  windows: FreeWindow[],
  extraRange?: [number, number] | null,
  prayers: PrayerTimeItem[] = [],
  plan?: DailyRhythmPlan
): FreeWindow[] {
  const all: Array<[number, number]> = windows.map((w) => [w.startMin, w.endMin]);
  if (extraRange && extraRange[1] > extraRange[0]) {
    all.push(extraRange);
  }
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of all) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  return merged.map(([s, e]) => ({
    startMin: s,
    endMin: e,
    durationMin: e - s,
    label: plan ? getFreeWindowPeriodLabelAr(s, prayers, plan) : '',
  }));
}

/**
 * Computes glowing Aquamarine Ghost Slots across all valid freeWindows where `durationMin` fits,
 * strictly excluding locked prayers, sleep, Suhoor, and recovery naps.
 */
export function buildGhostSlotsForItem(params: {
  durationMin: number;
  freeWindows: FreeWindow[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  excludeRange?: [number, number] | null;
}): DayTimelineGhostSlot[] {
  const dur = clamp(Math.round(params.durationMin || 30), 5, 240);
  const { collisionIntervals } = buildLockedIntervalsAndBlocks(
    params.prayers,
    params.plan,
    params.profile
  );
  const expanded = mergeWindowsWithRange(
    params.freeWindows,
    params.excludeRange,
    params.prayers,
    params.plan
  );
  const safeWindows = subtractLockedFromWindows(expanded, collisionIntervals, dur);

  return safeWindows.map((w, idx) => ({
    id: `ghost_${idx}_${w.startMin}_${w.endMin}`,
    startMin: w.startMin,
    endMin: w.endMin,
    durationMin: w.durationMin,
    label: w.label || getFreeWindowPeriodLabelAr(w.startMin, params.prayers, params.plan),
    suggestedAnchor: mapMinutesToHabitAnchor(w.startMin, params.prayers, params.plan),
  }));
}

export interface SnapToFreeWindowParams {
  targetStartMin: number;
  durationMin: number;
  freeWindows: FreeWindow[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  excludeRange?: [number, number] | null;
}

export interface SnapToFreeWindowResult {
  snapped: boolean;
  startMin: number;
  endMin: number;
  time24: string;
  windowLabel: string;
  suggestedAnchor: DynamicHabitAnchor;
  jumpedOverLocked: boolean;
}

/**
 * Magnetically snaps any candidate minute-of-day strictly into the nearest valid `freeWindow`
 * that accommodates `durationMin`, jumping cleanly over locked prayers, sleep, Suhoor, and naps.
 */
export function snapToValidFreeWindow(params: SnapToFreeWindowParams): SnapToFreeWindowResult {
  const dur = clamp(Math.round(params.durationMin || 30), 5, 240);
  const { collisionIntervals } = buildLockedIntervalsAndBlocks(
    params.prayers,
    params.plan,
    params.profile
  );
  const expanded = mergeWindowsWithRange(
    params.freeWindows,
    params.excludeRange,
    params.prayers,
    params.plan
  );
  const safeWindows = subtractLockedFromWindows(expanded, collisionIntervals, dur);

  if (safeWindows.length === 0) {
    return {
      snapped: false,
      startMin: params.targetStartMin,
      endMin: params.targetStartMin + dur,
      time24: formatMinutes24h(params.targetStartMin),
      windowLabel: '',
      suggestedAnchor: 'any-free-slot',
      jumpedOverLocked: false,
    };
  }

  let bestDist = Infinity;
  let bestStart = safeWindows[0].startMin;
  let bestLabel = safeWindows[0].label;

  for (const w of safeWindows) {
    const maxStart = w.endMin - dur;
    if (maxStart < w.startMin) continue;
    const cand = clamp(Math.round(params.targetStartMin / 5) * 5, w.startMin, maxStart);
    const dist = Math.abs(cand - params.targetStartMin);
    if (dist < bestDist) {
      bestDist = dist;
      bestStart = cand;
      bestLabel = w.label || getFreeWindowPeriodLabelAr(cand, params.prayers, params.plan);
    }
  }

  const hitsLockedAtTarget = Boolean(
    findLockedCollision(params.targetStartMin, params.targetStartMin + dur, collisionIntervals)
  );

  return {
    snapped: true,
    startMin: bestStart,
    endMin: bestStart + dur,
    time24: formatMinutes24h(bestStart),
    windowLabel: bestLabel,
    suggestedAnchor: mapMinutesToHabitAnchor(bestStart, params.prayers, params.plan),
    jumpedOverLocked: hitsLockedAtTarget || Math.abs(bestStart - params.targetStartMin) > 5,
  };
}

/**
 * Swipe-Right helper: proposes moving an item to the next best logical freeWindow after its current start.
 */
export function findNextLogicalFreeSlot(params: {
  title: string;
  currentStartMin: number;
  durationMin: number;
  freeWindows: FreeWindow[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
}): DayTimelineSuggestedSlot | null {
  const dur = clamp(Math.round(params.durationMin || 30), 5, 240);
  const { collisionIntervals } = buildLockedIntervalsAndBlocks(
    params.prayers,
    params.plan,
    params.profile
  );
  const safeWindows = subtractLockedFromWindows(params.freeWindows, collisionIntervals, dur);
  const laterWindows = safeWindows.filter((w) => w.endMin - dur > params.currentStartMin + 5).map((w) => {
    const minStart = Math.max(w.startMin, params.currentStartMin + 15);
    return {
      ...w,
      startMin: minStart,
      durationMin: w.endMin - minStart,
    };
  }).filter((w) => w.durationMin >= dur);

  const laterPick = pickScientificFreeSlot({
    title: params.title,
    durationMin: dur,
    remainingWindows: laterWindows,
    prayers: params.prayers,
    plan: params.plan,
  });
  if (laterPick) return laterPick;

  const altWindows = safeWindows.filter(
    (w) => !(params.currentStartMin >= w.startMin && params.currentStartMin < w.endMin)
  );
  return pickScientificFreeSlot({
    title: params.title,
    durationMin: dur,
    remainingWindows: altWindows.length > 0 ? altWindows : safeWindows,
    prayers: params.prayers,
    plan: params.plan,
  });
}

