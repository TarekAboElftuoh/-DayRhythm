import {
  sanitizeLifeProfile as firebaseSanitizeLifeProfile,
  sanitizeRhythmPayload as firebaseSanitizeRhythmPayload,
  type SyncedRhythmPayload,
} from '../firebase';
import type { SanctuarySilenceMode } from '../services/cloudStateService';
import type { LifeProfile, TravelState } from '../types/dayrhythm';
import { HOME_LOCATION } from '../engines/prayerEngine';
import { SCHEMA_VERSION } from '../utils/schemaMigration';

export function sanitizeTravelState(raw: Partial<TravelState> | null | undefined): TravelState {
  return {
    active: Boolean(raw?.active),
    location: raw?.location && typeof raw.location.lat === 'number' ? raw.location : HOME_LOCATION,
    distanceKm: typeof raw?.distanceKm === 'number' ? raw.distanceKm : 0,
    durationMode: raw?.durationMode || 'until_return',
    returnDate: typeof raw?.returnDate === 'string' && raw.returnDate ? raw.returnDate : undefined,
    deferredCategories: Array.isArray(raw?.deferredCategories) ? raw.deferredCategories : [],
    deferredMedIds: Array.isArray(raw?.deferredMedIds) ? raw.deferredMedIds : [],
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : 0,
    postponedTaskIds: Array.isArray(raw?.postponedTaskIds) ? raw.postponedTaskIds : ['room_cleanup'],
    enabledWorkTaskIds: Array.isArray(raw?.enabledWorkTaskIds)
      ? raw.enabledWorkTaskIds
      : ['deep_work_1', 'deep_work_2', 'practical_work_3', 'light_workout'],
  };
}

const VALID_SANCTUARY_SILENCE_MODES: ReadonlyArray<SanctuarySilenceMode> = [
  'silent_inbox',
  'silent_notif',
  'vibrate_notif',
  'hide_all',
];

export function sanitizeLifeProfile(raw: Partial<LifeProfile> | undefined): LifeProfile {
  const base = firebaseSanitizeLifeProfile(raw);
  const rawMode = raw?.sanctuarySilenceMode;
  const sanctuarySilenceMode: SanctuarySilenceMode = VALID_SANCTUARY_SILENCE_MODES.includes(
    rawMode as SanctuarySilenceMode
  )
    ? (rawMode as SanctuarySilenceMode)
    : 'silent_inbox';
  const sleepTargetMinutes =
    typeof raw?.sleepTargetMinutes === 'number' && Number.isFinite(raw.sleepTargetMinutes)
      ? Math.max(180, Math.min(840, Math.round(raw.sleepTargetMinutes)))
      : base.sleepTargetMinutes;
  const bedtime24 =
    typeof raw?.bedtime24 === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.bedtime24.trim())
      ? raw.bedtime24.trim()
      : raw?.bedtime24 === ''
        ? ''
        : undefined;
  const wakeLeadBeforeFajrMinutes =
    typeof raw?.wakeLeadBeforeFajrMinutes === 'number' && Number.isFinite(raw.wakeLeadBeforeFajrMinutes)
      ? Math.max(0, Math.min(180, Math.round(raw.wakeLeadBeforeFajrMinutes)))
      : undefined;
  const fastingWhiteDays =
    typeof raw?.fastingWhiteDays === 'boolean' ? raw.fastingWhiteDays : undefined;
  const dailyWaterTargetMl =
    typeof raw?.dailyWaterTargetMl === 'number' && Number.isFinite(raw.dailyWaterTargetMl)
      ? Math.max(1000, Math.min(8000, Math.round(raw.dailyWaterTargetMl)))
      : undefined;

  return {
    ...base,
    sleepTargetMinutes,
    ...(bedtime24 !== undefined ? { bedtime24 } : {}),
    ...(wakeLeadBeforeFajrMinutes !== undefined ? { wakeLeadBeforeFajrMinutes } : {}),
    ...(fastingWhiteDays !== undefined ? { fastingWhiteDays } : {}),
    ...(dailyWaterTargetMl !== undefined ? { dailyWaterTargetMl } : {}),
    sanctuarySilenceMode,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function sanitizeRhythmPayload(payload: SyncedRhythmPayload): SyncedRhythmPayload {
  const clean = firebaseSanitizeRhythmPayload(payload);
  return {
    ...clean,
    lifeProfile: sanitizeLifeProfile(payload.lifeProfile),
  };
}
