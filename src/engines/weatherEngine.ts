import { DailyWeatherPoint, WeatherHydrationInfo } from '../types/dayrhythm';

const WEATHER_CACHE_KEY = 'dayrhythm_weather_v2';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
export const HEAT_EXCEEDANCE_TEMP_C = 32;

interface CachedWeatherRecord {
  latKey: string;
  lngKey: string;
  data: WeatherHydrationInfo;
}

function weatherCodeToMeta(code: number): { labelAr: string; icon: string } {
  if (code === 0) return { labelAr: 'سماء صافية', icon: '☀️' };
  if (code === 1 || code === 2) return { labelAr: 'غائم جزئياً', icon: '🌤️' };
  if (code === 3) return { labelAr: 'غائم', icon: '☁️' };
  if (code === 45 || code === 48) return { labelAr: 'ضباب خفيف', icon: '🌫️' };
  if (code >= 51 && code <= 67) return { labelAr: 'أمطار خفيفة', icon: '🌦️' };
  if (code >= 71 && code <= 77) return { labelAr: 'ثلوج', icon: '❄️' };
  if (code >= 80 && code <= 82) return { labelAr: 'زخات مطر', icon: '🌧️' };
  if (code >= 95) return { labelAr: 'عواصف رعدية', icon: '⛈️' };
  return { labelAr: 'طقس معتدل', icon: '🌡️' };
}

export function computeHeatHydrationBonusMl(maxTempC: number): {
  heatBonusMl: number;
  heatNoteAr: string;
} {
  if (maxTempC >= 38) {
    return {
      heatBonusMl: 500,
      heatNoteAr: 'حر شديد اليوم — إضافة +500 مل تلقائياً',
    };
  }
  if (maxTempC >= 35) {
    return {
      heatBonusMl: 450,
      heatNoteAr: 'طقس حار اليوم — إضافة +450 مل تلقائياً',
    };
  }
  if (maxTempC >= 32) {
    return {
      heatBonusMl: 300,
      heatNoteAr: 'حرارة مرتفعة — إضافة +300 مل تلقائياً',
    };
  }
  return {
    heatBonusMl: 0,
    heatNoteAr: 'طقس معتدل — لا حاجة لزيادة إضافية',
  };
}

export function loadCachedWeather(): WeatherHydrationInfo | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeatherRecord;
    if (parsed?.data && typeof parsed.data.maxTempC === 'number') {
      return parsed.data;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export async function fetchOpenMeteoWeather(
  lat: number,
  lng: number,
  options?: { forceRefresh?: boolean }
): Promise<WeatherHydrationInfo | null> {
  const latKey = lat.toFixed(2);
  const lngKey = lng.toFixed(2);

  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (raw && !options?.forceRefresh) {
      const parsed = JSON.parse(raw) as CachedWeatherRecord;
      if (
        parsed?.latKey === latKey &&
        parsed?.lngKey === lngKey &&
        parsed?.data?.fetchedAtIso &&
        Array.isArray(parsed.data.dailyMaxTemps) &&
        parsed.data.dailyMaxTemps.length >= 7
      ) {
        const ageMs = Date.now() - new Date(parsed.data.fetchedAtIso).getTime();
        if (ageMs >= 0 && ageMs < CACHE_TTL_MS) {
          return parsed.data;
        }
      }
    }
  } catch {
    // ignore cache parse errors
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat.toFixed(4)
    )}&longitude=${encodeURIComponent(
      lng.toFixed(4)
    )}&current=temperature_2m,weather_code&daily=temperature_2m_max&timezone=auto&past_days=6&forecast_days=1`;

    const res = await fetch(url);
    if (!res.ok) {
      return loadCachedWeather();
    }
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { time?: string[]; temperature_2m_max?: number[] };
    };

    const currentTempC = Math.round(Number(json.current?.temperature_2m ?? 25));
    const dailyTimes = Array.isArray(json.daily?.time) ? json.daily.time : [];
    const dailyTemps = Array.isArray(json.daily?.temperature_2m_max)
      ? json.daily.temperature_2m_max
      : [];

    const dailyMaxTemps: DailyWeatherPoint[] = dailyTimes
      .map((dateIso, idx) => {
        const rawTemp = dailyTemps[idx];
        const tempC =
          typeof rawTemp === 'number' && Number.isFinite(rawTemp)
            ? Math.round(rawTemp)
            : currentTempC;
        const bonus = computeHeatHydrationBonusMl(tempC).heatBonusMl;
        return {
          dateIso,
          maxTempC: tempC,
          heatExceeded: tempC >= HEAT_EXCEEDANCE_TEMP_C,
          heatBonusMl: bonus,
        };
      })
      .slice(-7);

    const todayMaxFromDaily =
      dailyMaxTemps.length > 0
        ? dailyMaxTemps[dailyMaxTemps.length - 1].maxTempC
        : currentTempC;
    const maxTempC = Math.round(todayMaxFromDaily);
    const weatherCode = Number(json.current?.weather_code ?? 0);
    const meta = weatherCodeToMeta(weatherCode);
    const { heatBonusMl, heatNoteAr } = computeHeatHydrationBonusMl(maxTempC);

    const info: WeatherHydrationInfo = {
      currentTempC,
      maxTempC,
      weatherCode,
      conditionAr: meta.labelAr,
      icon: meta.icon,
      heatBonusMl,
      heatNoteAr,
      fetchedAtIso: new Date().toISOString(),
      dailyMaxTemps,
    };

    try {
      const record: CachedWeatherRecord = { latKey, lngKey, data: info };
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(record));
    } catch {
      // ignore quota errors
    }

    return info;
  } catch {
    return loadCachedWeather();
  }
}
