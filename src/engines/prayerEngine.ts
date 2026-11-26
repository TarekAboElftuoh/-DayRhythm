import { GeoLocation, PrayerTimeItem } from '../types/dayrhythm';

export const HOME_LOCATION: GeoLocation = {
  id: 'default_cairo',
  nameAr: 'القاهرة · مصر',
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

interface OfflineCityEntry {
  nameAr: string;
  lat: number;
  lng: number;
}

const OFFLINE_CITY_CATALOG: OfflineCityEntry[] = [
  // User's home & Dakahlia local precision first
  { nameAr: 'الضهرية · شربين (الدقهلية)', lat: 31.227, lng: 31.6148 },
  { nameAr: 'شربين · الدقهلية', lat: 31.1965, lng: 31.5245 },
  // All 27 Egyptian Governorates & major cities (100% offline matching)
  { nameAr: 'القاهرة · مصر', lat: 30.0444, lng: 31.2357 },
  { nameAr: 'الجيزة · مصر', lat: 30.0131, lng: 31.2089 },
  { nameAr: '6 أكتوبر · الجيزة', lat: 29.9285, lng: 30.9188 },
  { nameAr: 'الشيخ زايد · الجيزة', lat: 30.0459, lng: 30.9765 },
  { nameAr: 'القاهرة الجديدة · مصر', lat: 30.0074, lng: 31.4913 },
  { nameAr: 'العاشر من رمضان · الشرقية', lat: 30.2998, lng: 31.7418 },
  { nameAr: 'الإسكندرية · مصر', lat: 31.2001, lng: 29.9187 },
  { nameAr: 'المنصورة · الدقهلية', lat: 31.0409, lng: 31.3785 },
  { nameAr: 'طنطا · الغربية', lat: 30.7865, lng: 31.0004 },
  { nameAr: 'المحلة الكبرى · الغربية', lat: 30.9706, lng: 31.1669 },
  { nameAr: 'الزقازيق · الشرقية', lat: 30.5877, lng: 31.502 },
  { nameAr: 'بنها · القليوبية', lat: 30.466, lng: 31.1848 },
  { nameAr: 'شبين الكوم · المنوفية', lat: 30.5526, lng: 31.0101 },
  { nameAr: 'كفر الشيخ · مصر', lat: 31.1107, lng: 30.9388 },
  { nameAr: 'دمنهور · البحيرة', lat: 31.0341, lng: 30.4682 },
  { nameAr: 'دمياط · مصر', lat: 31.4175, lng: 31.8144 },
  { nameAr: 'بورسعيد · مصر', lat: 31.2653, lng: 32.3019 },
  { nameAr: 'الإسماعيلية · مصر', lat: 30.5965, lng: 32.2715 },
  { nameAr: 'السويس · مصر', lat: 29.9668, lng: 32.5498 },
  { nameAr: 'الفيوم · مصر', lat: 29.3084, lng: 30.8428 },
  { nameAr: 'بني سويف · مصر', lat: 29.0661, lng: 31.0994 },
  { nameAr: 'المنيا · مصر', lat: 28.0871, lng: 30.7618 },
  { nameAr: 'أسيوط · مصر', lat: 27.1809, lng: 31.1837 },
  { nameAr: 'سوهاج · مصر', lat: 26.5569, lng: 31.6948 },
  { nameAr: 'قنا · مصر', lat: 26.1551, lng: 32.716 },
  { nameAr: 'الأقصر · مصر', lat: 25.6872, lng: 32.6396 },
  { nameAr: 'أسوان · مصر', lat: 24.0889, lng: 32.8998 },
  { nameAr: 'الغردقة · البحر الأحمر', lat: 27.2579, lng: 33.8116 },
  { nameAr: 'شرم الشيخ · جنوب سيناء', lat: 27.9158, lng: 34.33 },
  { nameAr: 'الطور · جنوب سيناء', lat: 28.2417, lng: 33.6222 },
  { nameAr: 'العريش · شمال سيناء', lat: 31.1321, lng: 33.8033 },
  { nameAr: 'مرسى مطروح · مصر', lat: 31.3543, lng: 27.2373 },
  { nameAr: 'العلمين · مطروح', lat: 30.8301, lng: 28.955 },
  { nameAr: 'الخارجة · الوادي الجديد', lat: 25.439, lng: 30.5586 },
  // Regional Arab & major international cities
  { nameAr: 'الرياض · السعودية', lat: 24.7136, lng: 46.6753 },
  { nameAr: 'جدة · السعودية', lat: 21.4858, lng: 39.1925 },
  { nameAr: 'مكة المكرمة · السعودية', lat: 21.4225, lng: 39.8262 },
  { nameAr: 'المدينة المنورة · السعودية', lat: 24.5247, lng: 39.5692 },
  { nameAr: 'الدمام · السعودية', lat: 26.4207, lng: 50.0888 },
  { nameAr: 'دبي · الإمارات', lat: 25.2048, lng: 55.2708 },
  { nameAr: 'أبوظبي · الإمارات', lat: 24.4539, lng: 54.3773 },
  { nameAr: 'الدوحة · قطر', lat: 25.2854, lng: 51.531 },
  { nameAr: 'الكويت', lat: 29.3759, lng: 47.9774 },
  { nameAr: 'عمّان · الأردن', lat: 31.9454, lng: 35.9284 },
  { nameAr: 'المنامة · البحرين', lat: 26.2285, lng: 50.586 },
  { nameAr: 'مسقط · عُمان', lat: 23.588, lng: 58.3829 },
  { nameAr: 'الدار البيضاء · المغرب', lat: 33.5731, lng: -7.5898 },
  { nameAr: 'تونس', lat: 36.8065, lng: 10.1815 },
  { nameAr: 'الجزائر', lat: 36.7538, lng: 3.0588 },
  { nameAr: 'إسطنبول · تركيا', lat: 41.0082, lng: 28.9784 },
  { nameAr: 'برلين · ألمانيا', lat: 52.52, lng: 13.405 },
  { nameAr: 'لندن · المملكة المتحدة', lat: 51.5072, lng: -0.1276 },
  { nameAr: 'باريس · فرنسا', lat: 48.8566, lng: 2.3522 },
  { nameAr: 'نيويورك · الولايات المتحدة', lat: 40.7128, lng: -74.006 },
];

export function resolveOfflineCityName(
  lat: number,
  lng: number,
  browserTz: string = 'Africa/Cairo'
): string {
  const probe: GeoLocation = {
    id: 'gps',
    nameAr: '',
    nameEn: '',
    lat,
    lng,
    tzOffsetHours: getTimeZoneUtcOffsetHours(browserTz),
    timeZone: browserTz,
  };

  let best: { nameAr: string; dist: number } | null = null;
  for (const city of OFFLINE_CITY_CATALOG) {
    const dist = haversineDistanceKm(probe, {
      id: city.nameAr,
      nameAr: city.nameAr,
      nameEn: city.nameAr,
      lat: city.lat,
      lng: city.lng,
      tzOffsetHours: probe.tzOffsetHours,
    });
    if (!best || dist < best.dist) {
      best = { nameAr: city.nameAr, dist };
    }
  }

  if (best && best.dist <= 55) {
    return best.nameAr;
  }

  const tzTail = browserTz.split('/').pop()?.replace(/_/g, ' ') || 'موقعك الحالي';
  return `${tzTail} (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}

export async function reverseGeocodeCityName(
  lat: number,
  lng: number,
  fallbackName: string
): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return fallbackName;
  }
  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 3500) : null;
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
      lat.toFixed(4)
    )}&longitude=${encodeURIComponent(lng.toFixed(4))}&localityLanguage=ar`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return fallbackName;
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    const city = (data.city || data.locality || '').trim();
    const region = (data.principalSubdivision || data.countryName || '').trim();
    if (city && region && city !== region) {
      return `${city} · ${region}`.slice(0, 95);
    }
    if (city) return city.slice(0, 95);
    if (region) return region.slice(0, 95);
    return fallbackName;
  } catch {
    return fallbackName;
  } finally {
    if (timeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(timeoutId);
    }
  }
}

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
 * Lead Time Rule: -3 minutes before Adhan for wudu and walking to mosque.
 */
export function calculateEgyptianPrayerTimes(
  location: GeoLocation,
  date: Date = new Date(),
  adhanLeadMinutes = 3
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
    return Math.round(normalized * 60);
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
  const dhuhrMin = toMinutes(midday) + 1;
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

function parseArabicOrLatinInt(raw: string): number {
  const normalized = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const parsed = Number.parseInt(normalized.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface SpecialFastDay {
  id: 'arafah' | 'ashura';
  nameAr: string;
  emoji: string;
}

/**
 * Detects the special Sunnah fasting days from the Hijri date (Umm al-Qura calendar):
 *   9 Dhu al-Hijjah → يوم عرفة · 10 Muharram → يوم عاشوراء.
 * Note: Egypt's official start of a Hijri month (moon sighting) can differ by a day from Umm al-Qura;
 * the user can always switch the day back to normal with the fasting override.
 */
export function getSpecialFastDay(dateIso: string, timeZone = 'Africa/Cairo'): SpecialFastDay | null {
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
    if (month === 12 && day === 9) return { id: 'arafah', nameAr: 'يوم عرفة', emoji: '🕋' };
    if (month === 1 && day === 10) return { id: 'ashura', nameAr: 'يوم عاشوراء', emoji: '🌙' };
  } catch {
    // Intl without the islamic calendar: no special days
  }
  return null;
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
