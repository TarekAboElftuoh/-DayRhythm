import type { TravelState } from './plan';
import type { CapsuleOrientation, CapsuleSize, QuietModeType, SurfaceTheme, TravelDeferrableCategory, TravelDurationMode } from './core';
import type { FreeWindow } from './habits';
import type { MedicationFastingPolicy } from './integrations';
import type { SeasonalSleepMode } from './plan';
import type { LifeProfile, SleepStrategy } from './profile';

/**
 * App settings Gemini can change from the chat (everything outside the life profile).
 * Every field is optional; only the ones present are applied.
 */
export interface AppSettingsPatch {
  phoneChargeLimitPct?: number; // 50..100
  chargeAlertEnabled?: boolean;
  chargeAlertKeepUntilUnplugged?: boolean;
  waterRemindersEnabled?: boolean;
  quietMode?: 'normal' | 'mute_audio' | 'vibrate_only' | 'silent_all';
  quietModeMinutes?: number; // 0 = until turned off
  adhanSoundInSilent?: boolean;
  sunMode?: boolean;
  language?: 'ar' | 'en';
  capsuleOrientation?: 'horizontal' | 'vertical';
  capsuleSize?: 'sm' | 'md' | 'lg';
  liveAlertsEnabled?: boolean;
  liveAlertsLeadMinutes?: 5 | 10 | 15 | 20 | 30;
  liveAlertsAlwaysOn?: boolean;
  liveAlertsShowCharging?: boolean;
  persistentCountdownNotif?: boolean;
  includePrayerAnchors?: boolean;
  // NOTE: deliberately no "autoExecuteChat" here — manual-confirm vs instant-execute is a trust
  // setting only a direct tap on the toggle may change, never Gemini on the user's behalf.
  soundRepeats?: Partial<Record<
    'prayer' | 'water' | 'medication' | 'focus_work' | 'walk_health' | 'sleep_suhoor' | 'meeting_event' | 'general',
    number | 'continuous'
  >>;
}

export type SanctuarySilenceModeOption =
  | 'silent_inbox'
  | 'silent_notif'
  | 'vibrate_notif'
  | 'hide_all';

export interface MedicationFastingPolicyUpdate {
  medicationId?: string;
  name: string;
  fastingPolicy: MedicationFastingPolicy;
}

export interface TravelStatePatch {
  active?: boolean;
  cityName?: string;
  lat?: number;
  lng?: number;
  timeZone?: string;
  distanceKm?: number;
  durationMode?: TravelDurationMode;
  returnDate?: string;
  deferredCategories?: TravelDeferrableCategory[];
  deferredMedIds?: string[];
}

export interface UnifiedSettingsPatch extends AppSettingsPatch {
  // Sleep & wake targets
  bedtime24?: string;
  sleepTargetHours?: number;
  sleepTargetMinutes?: number;
  wakeLeadBeforeFajrMinutes?: number;
  suhoorLeadMinutes?: number;
  sleepStrategy?: SleepStrategy;
  sleepDebtMinutes?: number;

  // Fasting settings
  fastingDays?: number[];
  addFastingDays?: number[];
  removeFastingDays?: number[];
  fastingMonThu?: boolean;
  fastingWhiteDays?: boolean;
  fastingOverride?: 'auto' | 'fasting' | 'normal';

  // Hydration & body targets
  dailyWaterTargetLiters?: number;
  dailyWaterTargetMl?: number;
  cupSizeMl?: number;
  weightKg?: number;
  heightCm?: number;

  // Audio Silence Sanctuaries
  adhanLeadMinutes?: number;
  prayerSilenceMinutes?: number;
  fajrSilenceMinutes?: number;
  oneTimeSilenceMinutes?: number;
  oneTimeSilenceDateKey?: string;
  sanctuarySilenceMode?: SanctuarySilenceModeOption;
  sanctuaryOverrideUntilMs?: number;
  sanctuaryOverrideMinutes?: number;
  cancelActiveSanctuaryEarly?: boolean;
  defaultSnoozeMinutes?: 5 | 10 | 15;

  // Daily modes & work / location
  meetingMode?: boolean;
  meetingModeMinutes?: number;
  travelState?: TravelStatePatch;
  lowEnergyDateKey?: string;
  careerTrack?: string;
  workEnabled?: boolean;
  workStart24?: string;
  workEnd24?: string;
  workDays?: number[];
  autoLocationSync?: boolean;
  currentCityName?: string;
  currentTimeZone?: string;
  currentLat?: number;
  currentLng?: number;
  priorityOrderAr?: string;
  personalNotes?: string;

  // Medication fasting policies
  medicationFastingPolicies?: MedicationFastingPolicyUpdate[];
}

export interface SettingsDiffItem {
  key: string;
  labelAr: string;
  beforeDisplay: string;
  afterDisplay: string;
}

export interface SettingsPatchProposal {
  summaryAr: string;
  patch: UnifiedSettingsPatch;
  diffs?: SettingsDiffItem[];
  warnings?: string[];
  errors?: string[];
  blockedKeys?: string[];
}

export interface SettingsSnapshotContext {
  lifeProfile?: LifeProfile;
  appSettings?: AppSettingsPatch;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  travelState?: TravelState;
  sanctuaryOverrideUntilMs?: number;
  freeWindows?: FreeWindow[];
  seasonalSleepMode?: SeasonalSleepMode;
  medications?: Array<{
    id: string;
    name: string;
    fastingPolicy?: MedicationFastingPolicy;
  }>;
}

/**
 * Global application version tag displayed across desktop and mobile clients.
 * Automatically injected by CI/CD (VITE_APP_VERSION) or falls back to current release.
 */
export const APP_VERSION =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_VERSION)
    ? String(import.meta.env.VITE_APP_VERSION)
    : 'v2.0.126';



