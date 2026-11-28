import { TodayCalendarMeta } from '../../types/dayrhythm';
import { getDateIsoInTimeZone, getWeekdayInTimeZone } from './formatting';

function parseArabicOrLatinInt(raw: string): number {
  const normalized = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const parsed = Number.parseInt(normalized.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface SpecialFastDay {
  id: 'ramadan' | 'white_days' | 'arafah' | 'ashura';
  nameAr: string;
  emoji: string;
}

/**
 * Detects Islamic fasting days from the Hijri date (Umm al-Qura calendar):
 *   Ramadan (month 9), White Days (13, 14, 15 except 13 Dhu al-Hijjah),
 *   9 Dhu al-Hijjah → يوم عرفة · 10 Muharram → يوم عاشوراء.
 * Note: Egypt's official start of a Hijri month (moon sighting) can differ by a day from Umm al-Qura;
 * the user can always switch the day back to normal with the fasting override.
 */
export function getSpecialFastDay(
  dateIso: string,
  timeZone = 'Africa/Cairo',
  options?: { whiteDaysEnabled?: boolean }
): SpecialFastDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  // Noon UTC keeps the calendar date stable across time zones.
  const date = new Date(`${dateIso}T12:00:00Z`);
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      timeZone: timeZone || 'Africa/Cairo',
      day: 'numeric',
      month: 'numeric',
    }).formatToParts(date);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    if (month === 9) return { id: 'ramadan', nameAr: 'شهر رمضان', emoji: '🌙' };
    if (month === 12 && day === 9) return { id: 'arafah', nameAr: 'يوم عرفة', emoji: '🕋' };
    if (month === 1 && day === 10) return { id: 'ashura', nameAr: 'يوم عاشوراء', emoji: '🌙' };
    if (
      options?.whiteDaysEnabled &&
      ((day === 13 && month !== 12) || day === 14 || day === 15)
    ) {
      return { id: 'white_days', nameAr: 'الأيام البيض', emoji: '🌕' };
    }
  } catch {
    // Intl without the islamic calendar: no special days
  }
  return null;
}

/**
 * Returns today's Arabic & English weekday, Gregorian date, Islamic Hijri date (Umm al-Qura),
 * numeric Hijri month + automatic Ramadan detection (month === 9),
 * and detects the 3 mid-month Full Moon White Days (13, 14, 15 Hijri).
 */
export function getTodayCalendarMeta(
  timeZone = 'Africa/Cairo',
  date: Date = new Date()
): {
  weekdayAr: string;
  weekdayEn: string;
  gregorianAr: string;
  gregorianEn: string;
  hijriDay: number;
  hijriMonth: number;
  hijriMonthAr: string;
  hijriYear: number;
  hijriFullAr: string;
  isRamadan: boolean;
  isFullMoonWhiteDay: boolean;
} {
  const safeTz = timeZone || 'Africa/Cairo';
  const weekdayAr = new Intl.DateTimeFormat('ar-EG', {
    timeZone: safeTz,
    weekday: 'long',
  }).format(date);
  const weekdayEn = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    weekday: 'long',
  }).format(date);
  const gregorianAr = new Intl.DateTimeFormat('ar-EG', {
    timeZone: safeTz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const gregorianEn = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

  let hijriDay = 0;
  let hijriMonth = 0;
  let hijriMonthAr = '';
  let hijriYear = 0;

  try {
    const hijriParts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      timeZone: safeTz,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(date);
    hijriDay = parseArabicOrLatinInt(hijriParts.find((p) => p.type === 'day')?.value ?? '');
    hijriMonthAr = hijriParts.find((p) => p.type === 'month')?.value ?? '';
    hijriYear = parseArabicOrLatinInt(hijriParts.find((p) => p.type === 'year')?.value ?? '');

    const numericParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      timeZone: safeTz,
      month: 'numeric',
    }).formatToParts(date);
    const parsedMonth = Number(numericParts.find((p) => p.type === 'month')?.value);
    hijriMonth = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : 0;
  } catch {
    try {
      const fallbackParts = new Intl.DateTimeFormat('ar-EG-u-ca-islamic', {
        timeZone: safeTz,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).formatToParts(date);
      hijriDay = parseArabicOrLatinInt(fallbackParts.find((p) => p.type === 'day')?.value ?? '');
      hijriMonthAr = fallbackParts.find((p) => p.type === 'month')?.value ?? '';
      hijriYear = parseArabicOrLatinInt(fallbackParts.find((p) => p.type === 'year')?.value ?? '');

      const numericFallback = new Intl.DateTimeFormat('en-u-ca-islamic-nu-latn', {
        timeZone: safeTz,
        month: 'numeric',
      }).formatToParts(date);
      const parsedMonth = Number(numericFallback.find((p) => p.type === 'month')?.value);
      hijriMonth = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : 0;
    } catch {
      hijriDay = 0;
      hijriMonth = 0;
    }
  }

  const hijriFullAr =
    hijriDay > 0 && hijriMonthAr
      ? `${hijriDay} ${hijriMonthAr}${hijriYear > 0 ? ` ${hijriYear} هـ` : ''}`
      : '';
  const isRamadan = hijriMonth === 9;
  const isFullMoonWhiteDay = hijriDay === 13 || hijriDay === 14 || hijriDay === 15;

  return {
    weekdayAr,
    weekdayEn,
    gregorianAr,
    gregorianEn,
    hijriDay,
    hijriMonth,
    hijriMonthAr,
    hijriYear,
    hijriFullAr,
    isRamadan,
    isFullMoonWhiteDay,
  };
}

