import { getTimeZoneUtcOffsetHours } from './astronomy';

export function formatMinutes12h(
  totalMin: number,
  lang: 'ar' | 'en' = 'ar'
): string {
  const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mins = m % 60;
  const period =
    lang === 'en' ? (h24 >= 12 ? 'PM' : 'AM') : h24 >= 12 ? 'م' : 'ص';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`;
}

export function formatTime24To12h(
  hhmm?: string,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (!hhmm) return '';
  const match = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return hhmm;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return formatMinutes12h(h * 60 + m, lang);
}

export function getDateIsoInTimeZone(
  timeZone: string = 'Africa/Cairo',
  date: Date = new Date()
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function getWeekdayInTimeZone(
  timeZone: string = 'Africa/Cairo',
  date: Date = new Date()
): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  try {
    const weekdayEn = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(date);
    return map[weekdayEn] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

export function getNowMinutesInTimeZone(
  timeZone: string = 'Africa/Cairo',
  date: Date = new Date()
): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const h = hRaw === 24 ? 0 : hRaw;
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return h * 60 + m;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

export function formatNow12hInTimeZone(
  timeZone: string = 'Africa/Cairo',
  lang: 'ar' | 'en' = 'ar',
  date: Date = new Date()
): string {
  return formatMinutes12h(getNowMinutesInTimeZone(timeZone, date), lang);
}

export function getCairoTodayIso(date: Date = new Date()): string {
  return getDateIsoInTimeZone('Africa/Cairo', date);
}

export function getCairoNowMinutes(date: Date = new Date()): number {
  return getNowMinutesInTimeZone('Africa/Cairo', date);
}

export function formatCairoNow12h(
  lang: 'ar' | 'en' = 'ar',
  date: Date = new Date()
): string {
  return formatNow12hInTimeZone('Africa/Cairo', lang, date);
}

export function parseIsoToTimeZoneInfo(
  isoStr?: string,
  timeZone: string = 'Africa/Cairo'
): {
  dateIso: string;
  minutesSinceMidnight: number;
  isAllDay: boolean;
} {
  const safeTz = timeZone || 'Africa/Cairo';
  if (!isoStr) {
    return { dateIso: getDateIsoInTimeZone(safeTz), minutesSinceMidnight: 9 * 60, isAllDay: true };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return { dateIso: isoStr, minutesSinceMidnight: 9 * 60, isAllDay: true };
  }
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) {
    return { dateIso: getDateIsoInTimeZone(safeTz), minutesSinceMidnight: 9 * 60, isAllDay: false };
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '9');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return {
      dateIso: `${y}-${mo}-${day}`,
      minutesSinceMidnight: hh * 60 + mm,
      isAllDay: false,
    };
  } catch {
    return {
      dateIso: d.toISOString().slice(0, 10),
      minutesSinceMidnight: d.getHours() * 60 + d.getMinutes(),
      isAllDay: false,
    };
  }
}

export function parseIsoToCairoInfo(isoStr?: string): {
  dateIso: string;
  minutesSinceMidnight: number;
  isAllDay: boolean;
} {
  return parseIsoToTimeZoneInfo(isoStr, 'Africa/Cairo');
}

export function formatIsoTo12h(
  isoStr?: string,
  lang: 'ar' | 'en' = 'ar',
  options?: { includeDate?: boolean; timeZone?: string }
): string {
  if (!isoStr) return '';
  const safeTz = options?.timeZone || 'Africa/Cairo';
  const info = parseIsoToTimeZoneInfo(isoStr, safeTz);
  const todayIso = getDateIsoInTimeZone(safeTz);
  const tomorrowIso = getDateIsoInTimeZone(safeTz, new Date(Date.now() + 86_400_000));

  const dayLabel =
    info.dateIso === todayIso
      ? lang === 'en'
        ? 'Today'
        : 'اليوم'
      : info.dateIso === tomorrowIso
        ? lang === 'en'
          ? 'Tomorrow'
          : 'غداً'
        : info.dateIso;

  if (info.isAllDay) {
    return lang === 'en' ? `${dayLabel} · All day` : `${dayLabel} · طوال اليوم`;
  }
  const timeStr = formatMinutes12h(info.minutesSinceMidnight, lang);
  if (options?.includeDate === false) {
    return timeStr;
  }
  return `${dayLabel} · ${timeStr}`;
}

export function formatMinutes24h(totalMin: number): string {
  const m = ((totalMin % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(h24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

