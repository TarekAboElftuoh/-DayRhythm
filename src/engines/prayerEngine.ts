import { GeoLocation, PrayerTimeItem } from '../types/dayrhythm';

export const HOME_LOCATION: GeoLocation = {
  id: 'cairo',
  nameAr: 'القاهرة',
  nameEn: 'Cairo, Egypt',
  lat: 30.0444,
  lng: 31.2357,
  tzOffsetHours: 2,
  timeZone: 'Africa/Cairo',
};

export const PRESET_LOCATIONS: GeoLocation[] = [
  HOME_LOCATION,
  {
    id: 'alexandria',
    nameAr: 'الإسكندرية · مصر',
    nameEn: 'Alexandria, Egypt',
    lat: 31.2001,
    lng: 29.9187,
    tzOffsetHours: 2,
    timeZone: 'Africa/Cairo',
  },
  {
    id: 'riyadh',
    nameAr: 'الرياض · السعودية',
    nameEn: 'Riyadh, Saudi Arabia',
    lat: 24.7136,
    lng: 46.6753,
    tzOffsetHours: 3,
    timeZone: 'Asia/Riyadh',
  },
  {
    id: 'makkah',
    nameAr: 'مكة المكرمة · الحرم',
    nameEn: 'Makkah, Saudi Arabia',
    lat: 21.4225,
    lng: 39.8262,
    tzOffsetHours: 3,
    timeZone: 'Asia/Riyadh',
  },
  {
    id: 'dubai',
    nameAr: 'دبي · الإمارات',
    nameEn: 'Dubai, UAE',
    lat: 25.2048,
    lng: 55.2708,
    tzOffsetHours: 4,
    timeZone: 'Asia/Dubai',
  },
  {
    id: 'berlin',
    nameAr: 'برلين · ألمانيا',
    nameEn: 'Berlin, Germany',
    lat: 52.52,
    lng: 13.405,
    tzOffsetHours: 1,
    timeZone: 'Europe/Berlin',
  },
  {
    id: 'london',
    nameAr: 'لندن · المملكة المتحدة',
    nameEn: 'London, UK',
    lat: 51.5072,
    lng: -0.1276,
    tzOffsetHours: 0,
    timeZone: 'Europe/London',
  },
  {
    id: 'new_york',
    nameAr: 'نيويورك · الولايات المتحدة',
    nameEn: 'New York, USA',
    lat: 40.7128,
    lng: -74.006,
    tzOffsetHours: -5,
    timeZone: 'America/New_York',
  },
];

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function haversineDistanceKm(a: GeoLocation, b: GeoLocation): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLon = (b.lng - a.lng) * DEG2RAD;
  const lat1 = a.lat * DEG2RAD;
  const lat2 = b.lat * DEG2RAD;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

function julianDay(date: Date): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let yr = y;
  let mo = m;
  if (mo <= 2) {
    yr -= 1;
    mo += 12;
  }
  const A = Math.floor(yr / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + B - 1524.5;
}

function fixAngle(angle: number): number {
  let a = angle - 360 * Math.floor(angle / 360);
  if (a < 0) a += 360;
  return a;
}

export function getTimeZoneUtcOffsetHours(
  timeZone: string = 'Africa/Cairo',
  date: Date = new Date()
): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2';
    if (tzPart === 'GMT' || tzPart === 'UTC') return 0;
    const match = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const hrs = Number(match[2]);
      const mins = Number(match[3] ?? '0');
      return sign * (hrs + mins / 60);
    }
  } catch {
    // fallback below
  }
  return 2;
}

export function getCairoUtcOffsetHours(date: Date = new Date()): number {
  return getTimeZoneUtcOffsetHours('Africa/Cairo', date);
}

/**
 * Offline Global Astronomical Prayer Engine
 * Default Authority: Egyptian General Authority of Survey (Fajr 19.5°, Isha 17.5°).
 * High-Latitude Protection: Uses One-Seventh of Night rule automatically when travelling
 * to northern latitudes (e.g., Europe/North America in summer) so Fajr & Isha never break.
 * Lead Time Rule: -3 minutes before Adhan for wudu and walking to mosque.
 */
export function calculateEgyptianPrayerTimes(
  location: GeoLocation,
  date: Date = new Date(),
  adhanLeadMinutes = 3
): PrayerTimeItem[] {
  const lead = Math.max(0, Math.min(30, Math.round(adhanLeadMinutes)));
  const jd = julianDay(date) - location.lng / (15 * 24);
  const D = jd - 2451545.0;

  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * Math.sin(g * DEG2RAD) + 0.02 * Math.sin(2 * g * DEG2RAD));
  const e = 23.439 - 0.00000036 * D;

  const sinDecl = Math.sin(e * DEG2RAD) * Math.sin(L * DEG2RAD);
  const decl = Math.asin(sinDecl);

  const RA =
    (Math.atan2(Math.cos(e * DEG2RAD) * Math.sin(L * DEG2RAD), Math.cos(L * DEG2RAD)) * RAD2DEG) /
    15;
  const eqt = q / 15 - fixAngle(RA * 15) / 15;

  const effectiveTzOffset = location.timeZone
    ? getTimeZoneUtcOffsetHours(location.timeZone, date)
    : Number.isFinite(location.tzOffsetHours)
      ? location.tzOffsetHours
      : getCairoUtcOffsetHours(date);
  const midday = 12 + effectiveTzOffset - location.lng / 15 - eqt;

  const rawRatioForAngle = (angleDeg: number): number => {
    const num = -Math.sin(angleDeg * DEG2RAD) - Math.sin(location.lat * DEG2RAD) * Math.sin(decl);
    const den = Math.cos(location.lat * DEG2RAD) * Math.cos(decl);
    return num / den;
  };

  const hourAngleForAngle = (angleDeg: number): number | null => {
    const ratio = rawRatioForAngle(angleDeg);
    if (ratio < -1 || ratio > 1 || Number.isNaN(ratio)) return null;
    return (Math.acos(ratio) * RAD2DEG) / 15;
  };

  const asrHourAngle = (): number => {
    const factor = 1; // Shafi/Standard Egyptian
    const angle =
      -Math.atan(1 / (factor + Math.tan(Math.abs(location.lat * DEG2RAD - decl)))) * RAD2DEG;
    const ha = hourAngleForAngle(angle);
    return ha ?? 3.5;
  };

  const toMinutes = (hoursFloat: number): number => {
    const normalized = ((hoursFloat % 24) + 24) % 24;
    return Math.round(normalized * 60);
  };

  const sunriseHa = hourAngleForAngle(0.833) ?? 6;
  const sunriseHour = midday - sunriseHa;
  const maghribHour = midday + sunriseHa;
  const nightDurationHours = ((sunriseHour + 24 - maghribHour) % 24) || 8;

  // Use Egyptian angles (19.5°/17.5°) for Egypt & standard latitudes, 18°/17° or 1/7th night for high latitudes
  const isHighLatitude = Math.abs(location.lat) >= 48;
  const fajrAngle = isHighLatitude ? 18 : 19.5;
  const ishaAngle = isHighLatitude ? 17 : 17.5;

  const fajrHa = hourAngleForAngle(fajrAngle);
  const ishaHa = hourAngleForAngle(ishaAngle);

  const fajrHour = fajrHa !== null ? midday - fajrHa : sunriseHour - nightDurationHours / 7;
  const ishaHour = ishaHa !== null ? midday + ishaHa : maghribHour + nightDurationHours / 7;

  const fajrMin = toMinutes(fajrHour);
  const sunriseMin = toMinutes(sunriseHour);
  const dhuhrMin = toMinutes(midday) + 1;
  const asrMin = toMinutes(midday + asrHourAngle());
  const maghribMin = toMinutes(maghribHour);
  const ishaMin = toMinutes(ishaHour);

  return [
    {
      id: 'fajr',
      nameAr: 'الفجر',
      nameEn: 'Fajr',
      emojiPair: '🕌 🌌',
      adhanMinutes: fajrMin,
      alarmMinutes: (fajrMin - lead + 1440) % 1440,
      isObligatory: true,
    },
    {
      id: 'sunrise',
      nameAr: 'الشروق',
      nameEn: 'Sunrise',
      emojiPair: '🌅 ☀️',
      adhanMinutes: sunriseMin,
      alarmMinutes: sunriseMin,
      isObligatory: false,
    },
    {
      id: 'dhuhr',
      nameAr: 'الظهر',
      nameEn: 'Dhuhr',
      emojiPair: '🕌 ☀️',
      adhanMinutes: dhuhrMin,
      alarmMinutes: (dhuhrMin - lead + 1440) % 1440,
      isObligatory: true,
    },
    {
      id: 'asr',
      nameAr: 'العصر',
      nameEn: 'Asr',
      emojiPair: '🕌 🌤️',
      adhanMinutes: asrMin,
      alarmMinutes: (asrMin - lead + 1440) % 1440,
      isObligatory: true,
    },
    {
      id: 'maghrib',
      nameAr: 'المغرب',
      nameEn: 'Maghrib',
      emojiPair: '🕌 🌆',
      adhanMinutes: maghribMin,
      alarmMinutes: (maghribMin - lead + 1440) % 1440,
      isObligatory: true,
    },
    {
      id: 'isha',
      nameAr: 'العشاء',
      nameEn: 'Isha',
      emojiPair: '🕌 🌃',
      adhanMinutes: ishaMin,
      alarmMinutes: (ishaMin - lead + 1440) % 1440,
      isObligatory: true,
    },
  ];
}

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
  return formatMinutes12h(getCairoNowMinutes(date), lang);
}

export function parseIsoToCairoInfo(isoStr?: string): {
  dateIso: string;
  minutesSinceMidnight: number;
  isAllDay: boolean;
} {
  if (!isoStr) {
    return { dateIso: getCairoTodayIso(), minutesSinceMidnight: 9 * 60, isAllDay: true };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return { dateIso: isoStr, minutesSinceMidnight: 9 * 60, isAllDay: true };
  }
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) {
    return { dateIso: getCairoTodayIso(), minutesSinceMidnight: 9 * 60, isAllDay: false };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
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
}

export function formatIsoTo12h(
  isoStr?: string,
  lang: 'ar' | 'en' = 'ar',
  options?: { includeDate?: boolean }
): string {
  if (!isoStr) return '';
  const info = parseIsoToCairoInfo(isoStr);
  const todayIso = getCairoTodayIso();
  const tomorrowIso = getCairoTodayIso(new Date(Date.now() + 86_400_000));

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

function parseArabicOrLatinInt(raw: string): number {
  const normalized = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const parsed = Number.parseInt(normalized.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Returns today's Arabic & English weekday, Gregorian date, Islamic Hijri date (Umm al-Qura),
 * and detects the 3 mid-month Full Moon White Days (13, 14, 15 Hijri) for the 🌕 badge.
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
  hijriMonthAr: string;
  hijriYear: number;
  hijriFullAr: string;
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
    } catch {
      hijriDay = 0;
    }
  }

  const hijriFullAr =
    hijriDay > 0 && hijriMonthAr
      ? `${hijriDay} ${hijriMonthAr}${hijriYear > 0 ? ` ${hijriYear} هـ` : ''}`
      : '';
  const isFullMoonWhiteDay = hijriDay === 13 || hijriDay === 14 || hijriDay === 15;

  return {
    weekdayAr,
    weekdayEn,
    gregorianAr,
    gregorianEn,
    hijriDay,
    hijriMonthAr,
    hijriYear,
    hijriFullAr,
    isFullMoonWhiteDay,
  };
}
