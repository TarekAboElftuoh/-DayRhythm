import {
  DEFAULT_SUNLIGHT_SETTINGS,
  type SunlightSessionId,
  type SunlightSettings,
  type WeatherHydrationInfo,
} from '../types/dayrhythm';
import { computeDailySunlightSessions, type ComputedSunlightSession } from '../engines/sunlightEngine';
import type { PrayerTimeEntry } from './buildExactAlarms';

export const SUNLIGHT_SETTINGS_STORAGE_KEY = 'dayrhythm_sunlight_settings_v1';

export function sanitizeSunlightSettings(raw: unknown): SunlightSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SUNLIGHT_SETTINGS;
  const obj = raw as Record<string, unknown>;
  const skinTone =
    obj.skinTone === 'fair' || obj.skinTone === 'wheat' || obj.skinTone === 'dark'
      ? obj.skinTone
      : DEFAULT_SUNLIGHT_SETTINGS.skinTone;
  const exposureMode =
    obj.exposureMode === 'auto' || obj.exposureMode === 'face_hands' || obj.exposureMode === 'arms_light'
      ? obj.exposureMode
      : DEFAULT_SUNLIGHT_SETTINGS.exposureMode;
  const rawSessions =
    obj.sessions && typeof obj.sessions === 'object' ? (obj.sessions as Record<string, unknown>) : {};
  const sanitizeSession = (id: SunlightSessionId) => {
    const def = DEFAULT_SUNLIGHT_SETTINGS.sessions[id];
    const s =
      rawSessions[id] && typeof rawSessions[id] === 'object'
        ? (rawSessions[id] as Record<string, unknown>)
        : {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : def.enabled,
      autoDuration: typeof s.autoDuration === 'boolean' ? s.autoDuration : def.autoDuration,
      customMinutes:
        typeof s.customMinutes === 'number' && Number.isFinite(s.customMinutes)
          ? Math.round(s.customMinutes)
          : def.customMinutes,
      labelAr: typeof s.labelAr === 'string' && s.labelAr.trim() ? s.labelAr : def.labelAr,
      emoji: typeof s.emoji === 'string' && s.emoji.trim() ? s.emoji : def.emoji,
      descAr: typeof s.descAr === 'string' && s.descAr.trim() ? s.descAr : def.descAr,
    };
  };
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_SUNLIGHT_SETTINGS.enabled,
    leadMinutes:
      typeof obj.leadMinutes === 'number' && Number.isFinite(obj.leadMinutes)
        ? Math.max(0, Math.min(15, Math.round(obj.leadMinutes)))
        : DEFAULT_SUNLIGHT_SETTINGS.leadMinutes,
    skinTone,
    exposureMode,
    sessions: {
      morning: sanitizeSession('morning'),
      noon: sanitizeSession('noon'),
      evening: sanitizeSession('evening'),
    },
  };
}

export function computeSunlightSessionsWithCloud(
  prayers: PrayerTimeEntry[],
  weatherInfo: WeatherHydrationInfo | null,
  sunlightSettings: SunlightSettings,
  nowTickMin: number,
  sunlightSnooze: { dateKey: string; offsets: Record<SunlightSessionId, number> },
  todayCairoIso: string
): ComputedSunlightSession[] {
  const base = computeDailySunlightSessions(prayers, weatherInfo, sunlightSettings, nowTickMin);
  const activeOffsets = sunlightSnooze.dateKey === todayCairoIso ? sunlightSnooze.offsets : null;
  const hourlyList = Array.isArray(weatherInfo?.hourly) ? weatherInfo.hourly : [];
  return base.map((s) => {
    const snoozeMin = activeOffsets ? activeOffsets[s.id] ?? 0 : 0;
    const startMinutes = s.startMinutes + snoozeMin;
    const endMinutes = s.endMinutes + snoozeMin;
    const alertMinutes = Math.max(0, startMinutes - s.leadMinutes);
    const canSnooze = Math.max(nowTickMin, startMinutes) + 5 + s.durationMinutes <= s.windowEndMinutes;

    const targetHour = Math.max(0, Math.min(23, Math.floor(startMinutes / 60)));
    const matchedHourly =
      hourlyList.find((h) => h.hour === targetHour) ??
      hourlyList.find((h) => Math.abs(h.hour - targetHour) <= 1) ??
      null;
    const isCloudBlocked = matchedHourly ? matchedHourly.cloudCover >= 75 : false;
    const cloudNoteAr = isCloudBlocked
      ? nowTickMin >= startMinutes && nowTickMin < endMinutes
        ? '☁️ غيوم كثيفة — لا توجد أشعة الآن'
        : '☁️ توقع غيوم كثيفة في وقت الجلسة'
      : null;

    return {
      ...s,
      startMinutes,
      endMinutes,
      alertMinutes,
      canSnooze,
      isCloudBlocked,
      cloudNoteAr,
      cloudCover: matchedHourly?.cloudCover ?? s.cloudCover,
    };
  });
}
