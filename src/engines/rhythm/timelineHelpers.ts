import { clamp } from './constants';
import { getFreeWindowPeriodLabelAr } from './freeWindows';
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
import { findLockedCollision } from './timelineIntervals';
import { classifyScientificTaskEnergy, type DayTimelineSuggestedSlot, type LockedInterval } from './timelineTypes';

export function mapMinutesToHabitAnchor(
  startMin: number,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan
): DynamicHabitAnchor {
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;

  if (startMin < sunrise) return 'after-fajr';
  if (startMin < sunrise + 75) return 'sunrise-light';
  if (startMin < dhuhr) return 'duha';
  if (startMin < asr) return 'after-dhuhr';
  if (startMin < Math.max(asr + 30, maghrib - 75)) return 'after-asr';
  if (startMin < maghrib) return 'pre-maghrib';
  if (startMin < isha) return 'after-maghrib';
  return 'after-isha';
}

export function parseTaskMinutesForTimeline(
  task: GoogleTaskItem,
  todayIso: string,
  timeZone = 'Africa/Cairo'
): { startMin: number; hasExplicitTime: boolean } | null {
  if (task.status === 'completed') return null;
  if (task.due) {
    const dueDateOnly = task.due.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateOnly) && dueDateOnly !== todayIso) {
      return null;
    }
    const timePartMatch = task.due.match(/T(\d{2}):(\d{2})/);
    if (timePartMatch && !(timePartMatch[1] === '00' && timePartMatch[2] === '00')) {
      const parsed = parseIsoToTimeZoneInfo(task.due, timeZone);
      if (parsed && parsed.dateIso === todayIso) {
        return { startMin: parsed.minutesSinceMidnight, hasExplicitTime: true };
      }
    }
  }
  const combined = `${task.notes || ''} ${task.title || ''}`;
  const tagged24 = combined.match(/(?:⏰|@|\[)\s*(\d{1,2}):(\d{2})\s*\]?/);
  if (tagged24) {
    const h = Number(tagged24[1]);
    const m = Number(tagged24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { startMin: h * 60 + m, hasExplicitTime: true };
    }
  }
  const time12Match = combined.match(/(\d{1,2}):(\d{2})\s*(ص|صباحاً|صباحا|م|مساءً|مساءا|مساء|am|pm)\b/i);
  if (time12Match) {
    let h = Number(time12Match[1]);
    const m = Number(time12Match[2]);
    const marker = time12Match[3].toLowerCase();
    const isPm = marker.startsWith('م') || marker === 'pm';
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return { startMin: h * 60 + m, hasExplicitTime: true };
    }
  }
  const plain24 = combined.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (plain24) {
    return { startMin: Number(plain24[1]) * 60 + Number(plain24[2]), hasExplicitTime: true };
  }
  if (task.due && task.due.slice(0, 10) === todayIso) {
    return { startMin: -1, hasExplicitTime: false };
  }
  return null;
}

export function claimFreeInterval(
  remaining: FreeWindow[],
  winIdx: number,
  startMin: number,
  durationMin: number,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  focusBufferMin = 0
): void {
  const win = remaining[winIdx];
  const endMin = startMin + durationMin;
  const beforeEnd = Math.max(win.startMin, startMin - focusBufferMin);
  const afterStart = Math.min(win.endMin, endMin + focusBufferMin);
  const replacements: FreeWindow[] = [];
  if (beforeEnd - win.startMin >= 10) {
    replacements.push({
      startMin: win.startMin,
      endMin: beforeEnd,
      durationMin: beforeEnd - win.startMin,
      label: win.label,
    });
  }
  if (win.endMin - afterStart >= 10) {
    replacements.push({
      startMin: afterStart,
      endMin: win.endMin,
      durationMin: win.endMin - afterStart,
      label: getFreeWindowPeriodLabelAr(afterStart, prayers, plan),
    });
  }
  remaining.splice(winIdx, 1, ...replacements);
}

/**
 * Picks the highest-scoring scientific free window for a task/habit without overlapping
 * locked blocks, respecting:
 * - Deep focus: morning / post-Fajr / Duha peak, never in Wind-Down Zone (45-60m before bedtime),
 *   avoiding last 2h before Maghrib on fasting days, and enforcing 15m focus buffer.
 * - Exercise: never within 2h of bedtime; on fasting days prefers ~1h before Maghrib.
 */
export function pickScientificFreeSlot(params: {
  title: string;
  durationMin: number;
  remainingWindows: FreeWindow[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  deepWorkRanges?: Array<[number, number]>;
  claim?: boolean;
}): DayTimelineSuggestedSlot | null {
  const { title, remainingWindows, prayers, plan, deepWorkRanges = [], claim = false } = params;
  const dur = clamp(Math.round(params.durationMin || 30), 10, 240);
  const energy = classifyScientificTaskEnergy(title);
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const bedtime = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;
  const windDownStart = plan.seasonalSleep?.windDownStartMin ?? Math.max(plan.wakeMin, bedtime - 55);
  const exerciseCutoff = Math.max(plan.wakeMin, bedtime - 120);
  const fastingDipStart = maghrib - 120;
  const focusBuffer = energy === 'deep_focus' ? 15 : 0;

  let bestScore = -Infinity;
  let bestWinIdx = -1;
  let bestStart = 0;
  let bestNote = 'ضمن نوافذ الفراغ المتاحة بعيداً عن الأوقات المحمية';

  const hasDeepBufferConflict = (s: number, e: number): boolean => {
    if (energy !== 'deep_focus') return false;
    return deepWorkRanges.some(([ds, de]) => s < de + 15 && e + 15 > ds);
  };

  for (let i = 0; i < remainingWindows.length; i++) {
    const win = remainingWindows[i];
    if (win.endMin - win.startMin < dur) continue;

    // Candidate starts inside this window: window start, after-deep-buffer start, and pre-Maghrib exercise start
    const candidateStarts = new Set<number>([win.startMin]);
    if (energy === 'deep_focus') {
      for (const [, de] of deepWorkRanges) {
        if (de + 15 >= win.startMin && de + 15 + dur <= win.endMin) {
          candidateStarts.add(de + 15);
        }
      }
    }
    if (energy === 'exercise' && plan.isFastingToday) {
      const preMaghribTarget = Math.max(win.startMin, maghrib - 60 - Math.round(dur / 2));
      if (preMaghribTarget + dur <= win.endMin) {
        candidateStarts.add(preMaghribTarget);
      }
    }

    for (const candStart of candidateStarts) {
      const candEnd = candStart + dur;
      if (candStart < win.startMin || candEnd > win.endMin) continue;

      if (energy === 'deep_focus' && candEnd > windDownStart) continue;
      if (energy === 'exercise' && candEnd > exerciseCutoff) continue;
      if (hasDeepBufferConflict(candStart, candEnd)) continue;

      let score = 100 - candStart / 30; // slight preference for earlier clean slots
      let note = 'أفضل نافذة فراغ متوافقة مع الإيقاع الحيوي';

      if (energy === 'deep_focus') {
        if (candStart >= sunrise && candEnd <= dhuhr) {
          score += 60;
          note = 'ذروة التركيز الصباحية (بعد الشروق والضحى)';
        } else if (candStart >= plan.wakeMin && candEnd <= sunrise) {
          score += 45;
          note = 'هدوء ما بعد الفجر للعمل العميق';
        }
        if (plan.isFastingToday && candStart < maghrib && candEnd > fastingDipStart) {
          score -= 80;
        }
      } else if (energy === 'exercise') {
        if (plan.isFastingToday && candStart >= maghrib - 75 && candEnd <= maghrib) {
          score += 70;
          note = 'تمرين خفيف قبل المغرب بساعة (~حرق مثالي في الصيام)';
        } else if (candEnd <= exerciseCutoff) {
          score += 30;
          note = 'موعد آمن للتمرين (قبل النوم بأكثر من ساعتين)';
        }
      } else {
        if (candEnd > windDownStart) {
          score -= 25;
        }
        if (plan.isFastingToday && candStart >= fastingDipStart && candEnd <= maghrib) {
          score += 25;
          note = 'مهمة خفيفة مناسبة لمنحنى طاقة ما قبل المغرب';
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestWinIdx = i;
        bestStart = candStart;
        bestNote = note;
      }
    }
  }

  if (bestWinIdx === -1) return null;

  if (claim) {
    claimFreeInterval(remainingWindows, bestWinIdx, bestStart, dur, prayers, plan, focusBuffer);
    if (energy === 'deep_focus') {
      deepWorkRanges.push([bestStart, bestStart + dur]);
    }
  }

  return {
    startMin: bestStart,
    endMin: bestStart + dur,
    time24: formatMinutes24h(bestStart),
    windowLabel: getFreeWindowPeriodLabelAr(bestStart, prayers, plan),
    suggestedAnchor: mapMinutesToHabitAnchor(bestStart, prayers, plan),
    scientificNoteAr: bestNote,
  };
}

/**
 * Builds the 24h vertical day timeline (Wake -> Bedtime) with:
 * - Locked immutable blocks (5 prayers, Suhoor on fasting days, Seasonal Sleep, active Recovery Naps)
 * - Placed movable habits/tasks/events inside valid non-locked slots
 * - `unplacedBlocks` ("تحتاج توظيف") for ANY item colliding with a locked block or unable to fit its anchor
 */
