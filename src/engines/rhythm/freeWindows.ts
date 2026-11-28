import { clamp } from './constants';
import { SEASONAL_SLEEP_CONSTANTS } from './seasonalSleep';
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
import { durationForward, wrap1440 } from './constants';

export interface ComputeFreeWindowsInput {
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile?: LifeProfile;
  occupiedBlocks?: ScheduleBlock[];
  calendarEvents?: GoogleCalendarEventItem[];
  todayIso?: string;
  timeZone?: string;
  minGapMinutes?: number;
}

export function getFreeWindowPeriodLabelAr(
  startMin: number,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan
): string {
  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;

  if (startMin < fajr) return 'قبل الفجر';
  if (startMin < sunrise) return 'بعد الفجر';
  if (startMin < dhuhr) return 'الصباح';
  if (startMin < asr) return 'بعد الظهر';
  if (startMin < maghrib) return 'بعد العصر';
  if (startMin < isha) return 'بعد المغرب';
  return 'بعد العشاء';
}

export function parseTime24Minutes(hhmm: string, fallback: number): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return clamp(Number(m[1]) * 60 + Number(m[2]), 0, 1439);
}

/**
 * Computes all genuine free windows between wake time and bedtime by merging:
 * 1) The 5 daily obligatory prayers (-5m to +20m buffer, or configured lead/silence if larger)
 * 2) Resolved seasonal night sleep, Suhoor window (fasting days), post-Fajr recovery & post-Dhuhr nap
 * 3) Active fixed work hours (if enabled today)
 * 4) Fixed Google Calendar / scheduled events for the day
 * Micro-gaps shorter than minGapMinutes (default 20) are filtered out.
 */
export function computeFreeWindows(input: ComputeFreeWindowsInput): FreeWindow[] {
  const { prayers, plan, profile, occupiedBlocks = [], calendarEvents = [] } = input;
  const minGap = Math.max(1, Math.round(input.minGapMinutes ?? 20));

  const dayStart = clamp(plan.wakeMin, 0, 1439);
  const dayEnd = plan.bedtimeMin > dayStart ? clamp(plan.bedtimeMin, 0, 1440) : 1440;
  if (dayEnd <= dayStart + minGap) return [];

  const busy: Array<[number, number]> = [];

  // 1. Night sleep bounds (if bedtime wraps past midnight, [bedtime, wake] precedes dayStart)
  if (dayStart > 0) busy.push([0, dayStart]);
  if (dayEnd < 1440) busy.push([dayEnd, 1440]);

  // 2. Suhoor window on fasting days / fasting eve
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  if (plan.isFastingToday || plan.suhoorStartMin !== null) {
    const suhoorLead =
      profile?.suhoorLeadMinutes ?? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN;
    const suhoorStart =
      plan.suhoorStartMin !== null ? plan.suhoorStartMin : Math.max(0, fajrMin - suhoorLead);
    if (fajrMin > suhoorStart) {
      busy.push([suhoorStart, fajrMin]);
    }
  }

  // 3. The 5 daily prayers with clean buffer (-5m to +20m)
  const preBuffer = Math.max(5, profile?.adhanLeadMinutes ?? 0);
  const postBuffer = Math.max(20, profile?.prayerSilenceMinutes ?? 20);
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    busy.push([p.adhanMinutes - preBuffer, p.adhanMinutes + postBuffer]);
  }

  // 4. Automatic seasonal recovery sleep (post-Fajr block & post-Dhuhr nap)
  if (
    typeof plan.postFajrStartMin === 'number' &&
    typeof plan.postFajrDurationMin === 'number' &&
    plan.postFajrDurationMin > 0
  ) {
    busy.push([plan.postFajrStartMin, plan.postFajrStartMin + plan.postFajrDurationMin]);
  }
  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    busy.push([plan.qailulahStartMin, plan.qailulahStartMin + plan.qailulahDurationMin]);
  }

  // 5. Active fixed work hours if enabled today
  if (plan.isWorkDayToday && profile?.workEnabled && profile.workStart24 && profile.workEnd24) {
    const ws = parseTime24Minutes(profile.workStart24, 9 * 60);
    const we = parseTime24Minutes(profile.workEnd24, 17 * 60);
    if (we > ws) {
      busy.push([ws, we]);
    }
  }

  // 6. Fixed scheduled blocks (excluding auto-placed creative blocks, prayer anchors, deleted & all-day)
  for (const blk of occupiedBlocks) {
    if (blk.deleted || blk.isAllDay || blk.source === 'creative' || blk.source === 'prayer') {
      continue;
    }
    const dur = blk.durationMin > 0 ? blk.durationMin : 15;
    busy.push([blk.startMin, blk.startMin + dur]);
  }

  // 7. Fixed Google Calendar events (when passed directly)
  if (calendarEvents.length > 0) {
    const tz = input.timeZone ?? profile?.currentTimeZone ?? 'Africa/Cairo';
    for (const ev of calendarEvents) {
      if (ev.isAllDay || !ev.start) continue;
      const startInfo = parseIsoToTimeZoneInfo(ev.start, tz);
      if (startInfo.isAllDay) continue;
      if (input.todayIso && startInfo.dateIso !== input.todayIso) continue;
      const endInfo = ev.end ? parseIsoToTimeZoneInfo(ev.end, tz) : null;
      let endMin = startInfo.minutesSinceMidnight + 15;
      if (endInfo && !endInfo.isAllDay) {
        endMin =
          endInfo.dateIso === startInfo.dateIso
            ? endInfo.minutesSinceMidnight
            : 1440;
      }
      if (endMin > startInfo.minutesSinceMidnight) {
        busy.push([startInfo.minutesSinceMidnight, endMin]);
      }
    }
  }

  // Clamp to awake day [dayStart, dayEnd] and merge overlapping/adjacent intervals
  const clamped: Array<[number, number]> = [];
  for (const [s, e] of busy) {
    const cs = Math.max(dayStart, s);
    const ce = Math.min(dayEnd, e);
    if (ce > cs) clamped.push([cs, ce]);
  }

  clamped.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of clamped) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  const free: FreeWindow[] = [];
  let cursor = dayStart;
  for (const [bs, be] of merged) {
    if (bs - cursor >= minGap) {
      free.push({
        startMin: cursor,
        endMin: bs,
        durationMin: bs - cursor,
        label: getFreeWindowPeriodLabelAr(cursor, prayers, plan),
      });
    }
    cursor = Math.max(cursor, be);
  }
  if (dayEnd - cursor >= minGap) {
    free.push({
      startMin: cursor,
      endMin: dayEnd,
      durationMin: dayEnd - cursor,
      label: getFreeWindowPeriodLabelAr(cursor, prayers, plan),
    });
  }
  return free;
}

/**
 * Finds genuinely free time windows today away from:
 * 1) Night sleep & wake windows
 * 2) All 5 obligatory prayers + silence buffers
 * 3) Active fixed work hours (if enabled today)
 * 4) All existing scheduled / Google Calendar blocks
 */
export function findFreeTimeSlotsForToday(
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile: LifeProfile,
  occupiedBlocks: ScheduleBlock[],
  minGapMinutes = 25
): FreeTimeSlot[] {
  return computeFreeWindows({
    prayers,
    plan,
    profile,
    occupiedBlocks,
    minGapMinutes,
  });
}

