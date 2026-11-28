import { getDateIsoInTimeZone } from './formatting';
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
import { GeoLocation, PrayerTimeItem } from '../../types/dayrhythm';
import { HOME_LOCATION } from './locations';

function julianDay(date: Date, timeZone?: string): number {
  let y = date.getFullYear();
  let m = date.getMonth() + 1;
  let d = date.getDate();
  if (timeZone) {
    try {
      const iso = getDateIsoInTimeZone(timeZone, date);
      const parts = iso.split('-').map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        [y, m, d] = parts;
      }
    } catch {
      // fallback to local calendar date
    }
  }
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

export function getTimeZoneOffsetString(
  timeZone: string = 'Africa/Cairo',
  date: Date = new Date()
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2';
    if (tzPart === 'GMT' || tzPart === 'UTC') return '+00:00';
    const match = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hrs = match[2].padStart(2, '0');
      const mins = (match[3] ?? '00').padStart(2, '0');
      return `${sign}${hrs}:${mins}`;
    }
  } catch {
    // fallback below
  }
  const offsetHours = getTimeZoneUtcOffsetHours(timeZone, date);
  const sign = offsetHours >= 0 ? '+' : '-';
  const absTotalMin = Math.round(Math.abs(offsetHours) * 60);
  const hh = String(Math.floor(absTotalMin / 60)).padStart(2, '0');
  const mm = String(absTotalMin % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

export function computeEventRangeInTimeZone(
  dateIso?: string,
  startTime24?: string,
  durationMinutes?: number,
  timeZone: string = 'Africa/Cairo'
): { startDateTime: string; endDateTime: string } {
  const safeTz = timeZone || 'Africa/Cairo';
  const baseDate = dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : getDateIsoInTimeZone(safeTz);
  const timeMatch = startTime24?.match(/^(\d{1,2}):(\d{2})$/);
  const hh = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 9;
  const mm = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;
  // Google Calendar API requires end > start: 0-min events are stored with 1 min window (durationMin = 0 on read)
  const duration =
    durationMinutes === 0
      ? 1
      : typeof durationMinutes === 'number' && durationMinutes > 0
        ? Math.round(durationMinutes)
        : 30;

  const startOffset = getTimeZoneOffsetString(safeTz, new Date(`${baseDate}T12:00:00Z`));
  const startStr = `${baseDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${startOffset}`;
  const startMs = new Date(startStr).getTime();
  const endMs = startMs + duration * 60_000;

  // Format end in safeTz local wall-clock with its offset
  const endParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(endMs));

  const ey = endParts.find((p) => p.type === 'year')?.value ?? baseDate.slice(0, 4);
  const em = endParts.find((p) => p.type === 'month')?.value ?? baseDate.slice(5, 7);
  const ed = endParts.find((p) => p.type === 'day')?.value ?? baseDate.slice(8, 10);
  const ehhRaw = endParts.find((p) => p.type === 'hour')?.value ?? '10';
  const ehh = ehhRaw === '24' ? '00' : ehhRaw;
  const emm = endParts.find((p) => p.type === 'minute')?.value ?? '00';
  const endDateIso = `${ey}-${em}-${ed}`;
  const endOffset = getTimeZoneOffsetString(safeTz, new Date(`${endDateIso}T12:00:00Z`));
  const endStr = `${endDateIso}T${ehh}:${emm}:00${endOffset}`;

  return { startDateTime: startStr, endDateTime: endStr };
}

/**
 * Offline Global Astronomical Prayer Engine
 * Default Authority: Egyptian General Authority of Survey (Fajr 19.5°, Isha 17.5°).
 * High-Latitude Protection: Uses One-Seventh of Night rule automatically when travelling
 * to northern latitudes (e.g., Europe/North America in summer) so Fajr & Isha never break.
 * Lead Time Rule: 0 minutes by default (exact Adhan), configurable in Settings.
 */
export function calculateEgyptianPrayerTimes(
  location: GeoLocation,
  date: Date = new Date(),
  adhanLeadMinutes = 0
): PrayerTimeItem[] {
  const lead = Math.max(0, Math.min(30, Math.round(adhanLeadMinutes)));
  const jd = julianDay(date, location.timeZone) - location.lng / (15 * 24);
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
    return Math.round(normalized * 60) % 1440;
  };

  const sunriseHa = hourAngleForAngle(0.833) ?? 6;
  const sunriseHour = midday - sunriseHa;
  const redSunHa = hourAngleForAngle(-6) ?? Math.max(0, sunriseHa - 0.5);
  const redSunHour = midday + redSunHa;
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
  const dhuhrMin = (toMinutes(midday) + 1) % 1440;
  const asrMin = toMinutes(midday + asrHourAngle());
  const redSunMin = toMinutes(redSunHour);
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
      redSunMinutes: redSunMin,
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

