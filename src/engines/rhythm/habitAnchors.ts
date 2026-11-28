import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';
import { parseTime24Minutes } from './freeWindows';

export const DYNAMIC_HABIT_ANCHOR_LABELS: Record<
  DynamicHabitAnchor,
  { labelAr: string; labelEn: string; emoji: string }
> = {
  'after-fajr': { labelAr: 'بعد الفجر', labelEn: 'After Fajr', emoji: '🌌' },
  'sunrise-light': { labelAr: 'ضوء الشروق', labelEn: 'Sunrise Light', emoji: '🌅' },
  'duha': { labelAr: 'الضحى', labelEn: 'Duha', emoji: '☀️' },
  'after-dhuhr': { labelAr: 'بعد الظهر', labelEn: 'After Dhuhr', emoji: '🕌' },
  'after-asr': { labelAr: 'بعد العصر', labelEn: 'After Asr', emoji: '🌤️' },
  'pre-maghrib': { labelAr: 'قبل المغرب', labelEn: 'Pre-Maghrib', emoji: '🌇' },
  'after-maghrib': { labelAr: 'بعد المغرب', labelEn: 'After Maghrib', emoji: '🌆' },
  'after-isha': { labelAr: 'بعد العشاء', labelEn: 'After Isha', emoji: '🌙' },
  'any-free-slot': { labelAr: 'أي وقت فاضي', labelEn: 'Any Free Slot', emoji: '✨' },
};

export interface ResolveHabitsForDayInput {
  habits: DynamicHabit[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  freeWindows?: FreeWindow[];
  profile?: LifeProfile;
  occupiedBlocks?: ScheduleBlock[];
  calendarEvents?: GoogleCalendarEventItem[];
  todayIso: string;
  weekday?: number;
  timeZone?: string;
}

export function resolveWeekdayFromIso(todayIso: string): number | null {
  const m = todayIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

export function getHabitAnchorWindow(
  anchor: DynamicHabitAnchor,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile?: LifeProfile
): { start: number; end: number; ideal: number; preferEnd: boolean } | null {
  if (anchor === 'any-free-slot') return null;

  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;
  const preBuffer = Math.max(5, profile?.adhanLeadMinutes ?? 0);
  const postBuffer = Math.max(20, profile?.prayerSilenceMinutes ?? 20);
  const bedtime = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;

  switch (anchor) {
    case 'after-fajr':
      return { start: fajr + postBuffer, end: sunrise, ideal: fajr + postBuffer, preferEnd: false };
    case 'sunrise-light':
      return {
        start: sunrise + 15,
        end: Math.min(dhuhr - preBuffer, sunrise + 75),
        ideal: sunrise + 15,
        preferEnd: false,
      };
    case 'duha':
      return {
        start: sunrise + 30,
        end: dhuhr - preBuffer,
        ideal: Math.min(dhuhr - 45, sunrise + 75),
        preferEnd: false,
      };
    case 'after-dhuhr':
      return {
        start: dhuhr + postBuffer,
        end: asr - preBuffer,
        ideal: dhuhr + postBuffer,
        preferEnd: false,
      };
    case 'after-asr':
      return {
        start: asr + postBuffer,
        end: maghrib - preBuffer,
        ideal: asr + postBuffer,
        preferEnd: false,
      };
    case 'pre-maghrib':
      return {
        start: Math.max(asr + postBuffer, maghrib - 75),
        end: maghrib - preBuffer,
        ideal: maghrib - preBuffer,
        preferEnd: true,
      };
    case 'after-maghrib':
      return {
        start: maghrib + postBuffer,
        end: isha - preBuffer,
        ideal: maghrib + postBuffer,
        preferEnd: false,
      };
    case 'after-isha':
      return {
        start: isha + postBuffer,
        end: bedtime,
        ideal: isha + postBuffer,
        preferEnd: false,
      };
  }
}

/**
 * Dynamically places `'active'` habits for today into genuine non-overlapping slots
 * inside `computeFreeWindows` according to each habit's prayer/sun anchor, falling back
 * to the nearest available free window (or marking flexible if none fits).
 * `'planned'` habits are strictly excluded until activated.
 */
