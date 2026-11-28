import {
  DEFAULT_SUNLIGHT_SETTINGS,
  HourlyWeatherPoint,
  PrayerTimeItem,
  SunlightSessionId,
  SunlightSettings,
  WeatherHydrationInfo,
} from '../types/dayrhythm';

export interface SunlightZoneBounds {
  minUseful: number;
  optimal: number;
  maxUseful: number;
  maxSafe: number;
}

export interface ComputedSunlightSession {
  id: SunlightSessionId;
  enabled: boolean;
  labelAr: string;
  emoji: string;
  descAr: string;
  startMinutes: number;
  endMinutes: number;
  windowEndMinutes: number;
  alertMinutes: number;
  durationMinutes: number;
  leadMinutes: number;
  isCloudBlocked: boolean;
  cloudNoteAr: string | null;
  canSnooze: boolean;
  zones: SunlightZoneBounds;
  uvIndex: number;
  cloudCover: number;
  tempC: number;
}

const SESSION_ZONES: Record<SunlightSessionId, SunlightZoneBounds> = {
  morning: { minUseful: 5, optimal: 12, maxUseful: 18, maxSafe: 20 },
  noon: { minUseful: 5, optimal: 15, maxUseful: 25, maxSafe: 30 },
  evening: { minUseful: 5, optimal: 15, maxUseful: 20, maxSafe: 25 },
};

const SKIN_TONE_MULTIPLIER: Record<SunlightSettings['skinTone'], number> = {
  fair: 0.7,
  wheat: 1.0,
  dark: 1.4,
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function estimateSeasonalNoonUv(): number {
  const month = new Date().getMonth(); // 0..11
  if (month >= 4 && month <= 8) return 8;
  if (month === 2 || month === 3 || month === 9) return 6;
  return 4;
}

function isOvercastOrRainCode(weatherCode: number | undefined): boolean {
  if (typeof weatherCode !== 'number') return false;
  return weatherCode === 3 || (weatherCode >= 51 && weatherCode <= 99);
}

function findHourlyWeather(
  weatherInfo: WeatherHydrationInfo | null,
  targetMinutes: number
): HourlyWeatherPoint | null {
  const hourly = weatherInfo?.hourly;
  if (!Array.isArray(hourly) || hourly.length === 0) return null;
  const targetHour = Math.max(0, Math.min(23, Math.floor(targetMinutes / 60)));
  return (
    hourly.find((h) => h.hour === targetHour) ??
    hourly.reduce((best, cur) =>
      Math.abs(cur.hour - targetHour) < Math.abs(best.hour - targetHour) ? cur : best
    )
  );
}

function computeNoonAutoMinutes(
  uvIndex: number,
  tempC: number,
  settings: SunlightSettings,
  zones: SunlightZoneBounds
): number {
  const safeUv = Math.max(2, uvIndex);
  const baseMinutes = 75 / safeUv;
  const skinMult = SKIN_TONE_MULTIPLIER[settings.skinTone] ?? 1.0;
  const resolvedExposure =
    settings.exposureMode === 'auto'
      ? tempC < 20
        ? 'face_hands'
        : 'arms_light'
      : settings.exposureMode;
  const exposureMult = resolvedExposure === 'face_hands' ? 1.3 : 1.0;

  return clampInt(baseMinutes * skinMult * exposureMult, zones.minUseful, zones.maxSafe);
}

export function computeDailySunlightSessions(
  prayerTimes: PrayerTimeItem[],
  weatherInfo: WeatherHydrationInfo | null,
  settings: SunlightSettings = DEFAULT_SUNLIGHT_SETTINGS,
  nowMinutes: number = 0
): ComputedSunlightSession[] {
  const sunrise = prayerTimes.find((p) => p.id === 'sunrise');
  const dhuhr = prayerTimes.find((p) => p.id === 'dhuhr');
  const maghrib = prayerTimes.find((p) => p.id === 'maghrib');

  const sunriseMin = sunrise?.adhanMinutes ?? 6 * 60;
  const dhuhrMin = dhuhr?.adhanMinutes ?? 12 * 60;
  const maghribMin = maghrib?.adhanMinutes ?? 18 * 60;
  const redSunMin = maghrib?.redSunMinutes ?? maghribMin - 35;

  const leadMinutes = Math.max(0, Math.round(settings.leadMinutes ?? 2));
  const fallbackTemp = weatherInfo?.currentTempC ?? 24;
  const weatherOvercast = isOvercastOrRainCode(weatherInfo?.weatherCode);

  const defs: Array<{
    id: SunlightSessionId;
    startMinutes: number;
    windowEndMinutes: number;
    capAtMaghrib?: boolean;
  }> = [
    {
      id: 'morning',
      startMinutes: sunriseMin + 15,
      windowEndMinutes: sunriseMin + 75,
    },
    {
      id: 'noon',
      startMinutes: dhuhrMin,
      windowEndMinutes: dhuhrMin + 120,
    },
    {
      id: 'evening',
      startMinutes: redSunMin,
      windowEndMinutes: maghribMin,
      capAtMaghrib: true,
    },
  ];

  return defs.map((def) => {
    const cfg = settings.sessions[def.id] ?? DEFAULT_SUNLIGHT_SETTINGS.sessions[def.id];
    const zones = SESSION_ZONES[def.id];
    const hourPoint = findHourlyWeather(weatherInfo, def.startMinutes);

    const cloudCover = hourPoint?.cloudCover ?? 0;
    const tempC = hourPoint?.tempC ?? fallbackTemp;
    const uvIndex =
      hourPoint && hourPoint.uvIndex > 0
        ? hourPoint.uvIndex
        : def.id === 'noon'
          ? estimateSeasonalNoonUv()
          : 1;

    let durationMinutes: number;
    if (cfg.autoDuration) {
      if (def.id === 'noon') {
        durationMinutes = computeNoonAutoMinutes(uvIndex, tempC, settings, zones);
      } else {
        const gentleShift = cloudCover >= 45 && cloudCover < 75 ? 2 : 0;
        durationMinutes = clampInt(zones.optimal + gentleShift, zones.minUseful, zones.maxSafe);
      }
    } else {
      durationMinutes = clampInt(cfg.customMinutes, zones.minUseful, zones.maxSafe);
    }

    if (def.capAtMaghrib) {
      const maxBeforeMaghrib = Math.max(1, maghribMin - def.startMinutes);
      durationMinutes = Math.min(durationMinutes, maxBeforeMaghrib);
    }

    const endMinutes = def.startMinutes + durationMinutes;
    const alertMinutes = Math.max(0, def.startMinutes - leadMinutes);
    const isCloudBlocked = hourPoint ? cloudCover >= 60 : false;
    const cloudNoteAr = isCloudBlocked ? '☁️ غيوم كثيفة — لا توجد أشعة الآن' : null;
    const canSnooze = nowMinutes + 5 + durationMinutes <= def.windowEndMinutes;

    return {
      id: def.id,
      enabled: settings.enabled && cfg.enabled,
      labelAr: cfg.labelAr,
      emoji: cfg.emoji,
      descAr: cfg.descAr,
      startMinutes: def.startMinutes,
      endMinutes,
      windowEndMinutes: def.windowEndMinutes,
      alertMinutes,
      durationMinutes,
      leadMinutes,
      isCloudBlocked,
      cloudNoteAr,
      canSnooze,
      zones,
      uvIndex,
      cloudCover,
      tempC,
    };
  });
}
