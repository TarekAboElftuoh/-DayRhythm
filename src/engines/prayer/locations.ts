import { getTimeZoneUtcOffsetHours } from './astronomy';
import { GeoLocation } from '../../types/dayrhythm';

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

