import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import { HOME_LOCATION } from '../engines/prayerEngine';
import type { SanctuarySilenceMode } from '../services/cloudStateService';
import type { LifeProfile, TravelDurationMode, TravelState } from '../types/dayrhythm';

export const SCHEMA_VERSION = 2;

declare module '../types/dayrhythm' {
  interface LifeProfile {
    schemaVersion?: number;
  }
}

const VALID_SANCTUARY_SILENCE_MODES: ReadonlyArray<SanctuarySilenceMode> = [
  'silent_inbox',
  'silent_notif',
  'vibrate_notif',
  'hide_all',
];

const VALID_TRAVEL_DURATION_MODES: ReadonlyArray<TravelDurationMode> = [
  'until_return',
  '1d',
  '2d',
  '7d',
  '14d',
  'custom_date',
  'today',
  'tomorrow',
  'manual',
];

const DEFAULT_TRAVEL_POSTPONED_IDS = ['room_cleanup'];
const DEFAULT_TRAVEL_WORK_IDS = [
  'deep_work_1',
  'deep_work_2',
  'practical_work_3',
  'light_workout',
];

export const DEFAULT_TRAVEL_STATE: TravelState = {
  active: false,
  location: HOME_LOCATION,
  distanceKm: 0,
  durationMode: 'until_return',
  deferredCategories: [],
  deferredMedIds: [],
  updatedAt: 0,
  postponedTaskIds: [...DEFAULT_TRAVEL_POSTPONED_IDS],
  enabledWorkTaskIds: [...DEFAULT_TRAVEL_WORK_IDS],
};

export interface MigratedAppState extends Record<string, unknown> {
  schemaVersion: number;
  lifeProfile: LifeProfile;
  phoneChargeLimitPct: number;
  travelState: TravelState;
  sanctuaryOverrideUntilMs: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizePhoneChargeLimitPct(rawValue: unknown): number {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.max(60, Math.min(100, Math.round(rawValue)));
  }
  return 90;
}

function sanitizeSanctuaryOverrideUntilMs(rawValue: unknown): number {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
    return Math.round(rawValue);
  }
  return 0;
}

function sanitizeTravelStateForMigration(rawValue: unknown): TravelState {
  if (!isPlainObject(rawValue)) {
    return {
      ...DEFAULT_TRAVEL_STATE,
      deferredCategories: [],
      deferredMedIds: [],
      postponedTaskIds: [...DEFAULT_TRAVEL_POSTPONED_IDS],
      enabledWorkTaskIds: [...DEFAULT_TRAVEL_WORK_IDS],
    };
  }

  const rawLoc = isPlainObject(rawValue.location) ? rawValue.location : null;
  const hasValidCoords =
    rawLoc !== null &&
    typeof rawLoc.lat === 'number' &&
    Number.isFinite(rawLoc.lat) &&
    typeof rawLoc.lng === 'number' &&
    Number.isFinite(rawLoc.lng);

  const durationMode: TravelDurationMode =
    VALID_TRAVEL_DURATION_MODES.find((mode) => mode === rawValue.durationMode) ?? 'until_return';

  return {
    active: Boolean(rawValue.active),
    location: hasValidCoords
      ? (rawLoc as unknown as TravelState['location'])
      : HOME_LOCATION,
    distanceKm:
      typeof rawValue.distanceKm === 'number' && Number.isFinite(rawValue.distanceKm)
        ? rawValue.distanceKm
        : 0,
    durationMode,
    ...(typeof rawValue.returnDate === 'string' && rawValue.returnDate
      ? { returnDate: rawValue.returnDate }
      : {}),
    deferredCategories: Array.isArray(rawValue.deferredCategories)
      ? ([...rawValue.deferredCategories] as TravelState['deferredCategories'])
      : [],
    deferredMedIds: Array.isArray(rawValue.deferredMedIds)
      ? rawValue.deferredMedIds.filter((id): id is string => typeof id === 'string')
      : [],
    updatedAt:
      typeof rawValue.updatedAt === 'number' && Number.isFinite(rawValue.updatedAt)
        ? rawValue.updatedAt
        : 0,
    postponedTaskIds: Array.isArray(rawValue.postponedTaskIds)
      ? rawValue.postponedTaskIds.filter((id): id is string => typeof id === 'string')
      : [...DEFAULT_TRAVEL_POSTPONED_IDS],
    enabledWorkTaskIds: Array.isArray(rawValue.enabledWorkTaskIds)
      ? rawValue.enabledWorkTaskIds.filter((id): id is string => typeof id === 'string')
      : [...DEFAULT_TRAVEL_WORK_IDS],
  };
}

function migrateLifeProfile(rawValue: unknown): LifeProfile {
  const input = isPlainObject(rawValue) ? rawValue : {};
  const rawMode = input.sanctuarySilenceMode;
  const sanctuarySilenceMode: SanctuarySilenceMode = VALID_SANCTUARY_SILENCE_MODES.includes(
    rawMode as SanctuarySilenceMode
  )
    ? (rawMode as SanctuarySilenceMode)
    : 'silent_inbox';

  const fastingDays = Array.isArray(input.fastingDays)
    ? input.fastingDays.filter(
        (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6
      )
    : [...DEFAULT_LIFE_PROFILE.fastingDays];

  const whiteDaysEnabled =
    typeof input.whiteDaysEnabled === 'boolean'
      ? input.whiteDaysEnabled
      : typeof input.fastingWhiteDays === 'boolean'
        ? input.fastingWhiteDays
        : false;

  return {
    ...DEFAULT_LIFE_PROFILE,
    ...(input as Partial<LifeProfile>),
    fastingDays,
    whiteDaysEnabled,
    fastingWhiteDays: whiteDaysEnabled,
    sanctuarySilenceMode,
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Pure, idempotent schema migration runner for localStorage and cloud backup payloads.
 * Upgrades any v0/v1 payload to SCHEMA_VERSION = 2 and fills missing defaults without
 * discarding existing user preferences or records.
 */
export function migrateAppState(raw: unknown): MigratedAppState {
  const source = isPlainObject(raw) ? raw : {};
  const nestedAppSettings = isPlainObject(source.appSettings) ? source.appSettings : null;

  const phoneChargeLimitPct = sanitizePhoneChargeLimitPct(
    source.phoneChargeLimitPct !== undefined
      ? source.phoneChargeLimitPct
      : nestedAppSettings?.phoneChargeLimitPct
  );

  const lifeProfile = migrateLifeProfile(source.lifeProfile);
  const travelState = sanitizeTravelStateForMigration(source.travelState);
  const sanctuaryOverrideUntilMs = sanitizeSanctuaryOverrideUntilMs(
    source.sanctuaryOverrideUntilMs
  );

  return {
    ...source,
    schemaVersion: SCHEMA_VERSION,
    lifeProfile,
    phoneChargeLimitPct,
    travelState,
    sanctuaryOverrideUntilMs,
  };
}
