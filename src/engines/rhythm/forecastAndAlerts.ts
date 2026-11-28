import { durationForward, wrap1440 } from './constants';
import { SEASONAL_SLEEP_CONSTANTS } from './seasonalSleep';
import { computeDailyRhythmPlan } from './dailyPlan';
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
import { computeSeasonalSleepPlan, isFastingDay } from './seasonalSleep';

/**
 * Computes annual summer shortest vs winter longest night (Isha+20m → Fajr-15m) at the user's coordinates
 * so AI & sleep UI can guide year-round diurnal sleep adaptation.
 */
export function computeAnnualSleepForecast(location: GeoLocation): {
  summerMinNightMin: number;
  winterMaxNightMin: number;
  summerFajrMin: number;
  summerIshaMin: number;
  winterFajrMin: number;
  winterIshaMin: number;
} {
  const year = new Date().getFullYear();
  const summerSolstice = new Date(Date.UTC(year, 5, 21, 12, 0, 0));
  const winterSolstice = new Date(Date.UTC(year, 11, 21, 12, 0, 0));
  const sPrayers = calculateEgyptianPrayerTimes(location, summerSolstice);
  const wPrayers = calculateEgyptianPrayerTimes(location, winterSolstice);

  const sFajr = sPrayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 240;
  const sIsha = sPrayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 1230;
  const wFajr = wPrayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 310;
  const wIsha = wPrayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 1090;

  const sNight = Math.max(
    0,
    durationForward(
      wrap1440(sIsha + SEASONAL_SLEEP_CONSTANTS.NORMAL_BED_AFTER_ISHA_MIN),
      wrap1440(sFajr - SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN)
    )
  );
  const wNight = Math.max(
    0,
    durationForward(
      wrap1440(wIsha + SEASONAL_SLEEP_CONSTANTS.NORMAL_BED_AFTER_ISHA_MIN),
      wrap1440(wFajr - SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN)
    )
  );

  return {
    summerMinNightMin: sNight,
    winterMaxNightMin: wNight,
    summerFajrMin: sFajr,
    summerIshaMin: sIsha,
    winterFajrMin: wFajr,
    winterIshaMin: wIsha,
  };
}

/**
 * Autonomous Future Season Simulator (e.g. +5 months ahead):
 * Shows exactly how prayers, night-only sleep, suhoor, and flexible study automatically adapt
 * when seasons shift without any manual reconfiguration.
 */
export function simulateFutureSeasonPlan(
  profile: LifeProfile,
  location: GeoLocation,
  monthsAhead: number
): {
  dateLabelAr: string;
  fajrMin: number;
  ishaMin: number;
  normalNightPlan: DailyRhythmPlan;
  fastingEvePlan: DailyRhythmPlan;
} {
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + monthsAhead);
  const futurePrayers = calculateEgyptianPrayerTimes(location, futureDate);
  const fajrMin = futurePrayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 15;
  const ishaMin = futurePrayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 21 * 60;

  // Normal weekday (e.g., Tue -> Wed)
  const normalNightPlan = computeDailyRhythmPlan(profile, futurePrayers, {
    todayWeekday: 2,
    tomorrowWeekday: 3,
    fastingOverride: 'normal',
  });

  // Fasting eve (Sun -> Mon)
  const fastingEvePlan = computeDailyRhythmPlan(profile, futurePrayers, {
    todayWeekday: 0,
    tomorrowWeekday: 1,
    fastingOverride: 'auto',
  });

  const dateLabelAr = new Intl.DateTimeFormat('ar-EG', {
    month: 'long',
    year: 'numeric',
  }).format(futureDate);

  return {
    dateLabelAr,
    fajrMin,
    ishaMin,
    normalNightPlan,
    fastingEvePlan,
  };
}

export function countCreativeSessionsThisWeek(
  loggedDates: string[],
  todayIso: string
): number {
  if (!Array.isArray(loggedDates) || loggedDates.length === 0) return 0;
  const todayDate = new Date(`${todayIso}T12:00:00Z`);
  if (Number.isNaN(todayDate.getTime())) return 0;
  // Week starts on Saturday (day 6) in Egypt/Arab calendar: offset 0 for Sat, 1 for Sun ... 6 for Fri
  const dow = todayDate.getUTCDay(); // 0=Sun .. 6=Sat
  const daysSinceSaturday = (dow + 1) % 7;
  const weekStartMs = todayDate.getTime() - daysSinceSaturday * 86_400_000;
  const weekEndMs = todayDate.getTime() + 86_400_000;

  const unique = new Set<string>();
  for (const iso of loggedDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const ms = new Date(`${iso}T12:00:00Z`).getTime();
    if (ms >= weekStartMs && ms < weekEndMs) {
      unique.add(iso);
    }
  }
  return unique.size;
}

export function countCreativeSessionsInPeriod(
  loggedDates: string[],
  todayIso: string,
  cadence: CreativeCadence = 'weekly'
): number {
  if (!Array.isArray(loggedDates) || loggedDates.length === 0) return 0;
  if (cadence === 'daily') {
    return loggedDates.includes(todayIso) ? 1 : 0;
  }
  if (cadence === 'monthly') {
    const monthPrefix = todayIso.slice(0, 7);
    const unique = new Set<string>();
    for (const iso of loggedDates) {
      if (iso.startsWith(monthPrefix)) unique.add(iso);
    }
    return unique.size;
  }
  return countCreativeSessionsThisWeek(loggedDates, todayIso);
}

export function analyzeTomorrowAlert(
  calendarEvents: GoogleCalendarEventItem[],
  tomorrowIso: string,
  tomorrowWeekday: number
): TomorrowAlertInfo | null {
  if (!tomorrowIso || !Array.isArray(calendarEvents) || calendarEvents.length === 0) {
    return null;
  }

  const dayNameMap: Record<number, string> = {
    0: 'الأحد',
    1: 'الإثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  };
  const weekdayAr = dayNameMap[tomorrowWeekday] ?? 'غداً';

  const tomorrowEvents = calendarEvents.filter((ev) => {
    const startDate = String(ev.start ?? '').slice(0, 10);
    if (startDate !== tomorrowIso) return false;
    const summary = String(ev.summary ?? '').toLowerCase();
    // Skip automated routine water/prayer mirrors so only real commitments trigger alerts
    if (/💧|كوب ماء|water cup|أذان|صلاة الفجر|صلاة الظهر|صلاة العصر|صلاة المغرب|صلاة العشاء/.test(summary)) {
      return false;
    }
    return true;
  });

  if (tomorrowEvents.length === 0) return null;

  const SPECIAL_PATTERNS: Array<{ re: RegExp; reasonAr: string }> = [
    { re: /سفر|رحلة|طيران|مطار|قطار|أتوبيس|باص|flight|airport|train|travel|trip/i, reasonAr: 'سفر / تنقّل' },
    { re: /دكتور|طبيب|عيادة|مستشفى|تحليل|أشعة|علاج|doctor|clinic|hospital|medical|dentist/i, reasonAr: 'موعد طبي' },
    { re: /مقابلة|إنترفيو|انترفيو|امتحان|اختبار|تسليم|deadline|interview|exam/i, reasonAr: 'موعد هام' },
    { re: /اجتماع|لقاء|مكالمة|مؤتمر|meeting|call|sync/i, reasonAr: 'اجتماع مجدول' },
    { re: /موعد|زيارة|مناسبة|فرح|خطوبة|حجز|appointment|visit|booking/i, reasonAr: 'موعد خاص' },
  ];

  let totalMinutes = 0;
  let timedCount = 0;
  const specialEvents: Array<{ title: string; timeLabel: string; reasonAr: string }> = [];

  for (const ev of tomorrowEvents) {
    const title = String(ev.summary ?? 'حدث').trim();
    const text = `${title} ${ev.description ?? ''} ${ev.location ?? ''}`;
    let timeLabel = 'طوال اليوم';

    if (!ev.isAllDay && ev.start && ev.end) {
      timedCount += 1;
      const startDt = new Date(ev.start);
      const endDt = new Date(ev.end);
      if (!Number.isNaN(startDt.getTime()) && !Number.isNaN(endDt.getTime())) {
        const mins = Math.max(15, Math.min(720, Math.round((endDt.getTime() - startDt.getTime()) / 60_000)));
        totalMinutes += mins;
        const startMin = startDt.getHours() * 60 + startDt.getMinutes();
        timeLabel = formatMinutes12h(startMin);
      }
    }

    for (const pat of SPECIAL_PATTERNS) {
      if (pat.re.test(text)) {
        specialEvents.push({ title, timeLabel, reasonAr: pat.reasonAr });
        break;
      }
    }
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const isBusy = timedCount >= 4 || totalMinutes >= 270;
  const hasSpecialEvent = specialEvents.length > 0;

  if (!isBusy && !hasSpecialEvent) return null;

  const firstSpecial = specialEvents[0];
  let headlineAr = '';
  let detailAr = '';

  if (hasSpecialEvent && isBusy) {
    headlineAr = `غداً ${weekdayAr} مزدحم وفيه ${firstSpecial.reasonAr}`;
    detailAr = `${firstSpecial.title} (${firstSpecial.timeLabel}) ضمن ${tomorrowEvents.length} أحداث (${totalHours} س) — يمكنك التنسيق المسبق مع Gemini الآن.`;
  } else if (hasSpecialEvent) {
    headlineAr = `تذكير مبكر لغد ${weekdayAr} · ${firstSpecial.reasonAr}`;
    detailAr =
      specialEvents.length === 1
        ? `${firstSpecial.title} الساعة ${firstSpecial.timeLabel} — جهّز له من اليوم حتى لا تتفاجأ.`
        : `${firstSpecial.title} (${firstSpecial.timeLabel}) و${specialEvents.length - 1} موعد آخر غداً.`;
  } else {
    headlineAr = `غداً ${weekdayAr} جدولك مزدحم نسبياً`;
    detailAr = `${tomorrowEvents.length} أحداث مجدولة (${totalHours} س) — يمكنك مراجعة وترتيب يومك مسبقاً مع Gemini.`;
  }

  return {
    tomorrowIso,
    weekdayAr,
    isBusy,
    hasSpecialEvent,
    eventCount: tomorrowEvents.length,
    totalHours,
    specialEvents,
    headlineAr,
    detailAr,
  };
}

