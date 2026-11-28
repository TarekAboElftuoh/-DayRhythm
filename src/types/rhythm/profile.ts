import type { CalendarActionProposal } from './integrations';
import type { DayMode, GeoLocation } from './core';

export type SleepStrategy = 'night_only_strict' | 'biphasic_qailulah' | 'anchor_early_bed';

export type MemoryCategory =
  | 'priority'
  | 'sleep'
  | 'fasting'
  | 'hydration'
  | 'work_devops'
  | 'travel'
  | 'general';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  ruleText: string;
  source: 'user' | 'gemini' | 'system_seed';
}

export interface MemoryActionProposal {
  operation: 'add' | 'update' | 'remove';
  memoryId?: string;
  category: MemoryCategory;
  ruleText: string;
}

export type TaskSoundCategory =
  | 'prayer'
  | 'water'
  | 'medication'
  | 'focus_work'
  | 'pomodoro'
  | 'walk_health'
  | 'sleep_suhoor'
  | 'meeting_event'
  | 'general';

export type SoundRepeatSetting = 1 | 2 | 3 | 4 | 'continuous';

export type SoundRepeatMap = Record<TaskSoundCategory, SoundRepeatSetting>;

export type SanctuaryType = 'none' | 'prayer' | 'sleep' | 'meeting';

export interface ActiveSanctuaryState {
  type: SanctuaryType;
  labelAr: string;
  endsAtMin?: number;
  vibrateOnly: boolean;
}

export interface SilentNotificationItem {
  id: string;
  title: string;
  reasonAr: string;
  time12h: string;
  soundCategory: TaskSoundCategory;
  createdAtIso: string;
}

export interface LifeProfile {
  weightKg: number;
  heightCm: number;
  cupSizeMl: number;
  fastingDays: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  suhoorLeadMinutes: number;
  sleepTargetMinutes: number; // e.g., 450 = 7.5 hours (5 x 90m cycles), allowed 180..840
  enableWakeAlarm?: boolean; // Optional daily wake-up alarm at computed wakeTime (default true)
  bedtime24?: string; // Optional preferred bedtime override in HH:MM (24h)
  wakeLeadBeforeFajrMinutes?: number; // Optional wake lead before Fajr in minutes (0..180)
  sleepStrategy: SleepStrategy;
  sleepDebtMinutes: number; // 0..480 accumulated sleep deficit for gentle automatic recovery
  sleepDebtLogDateKey: string; // YYYY-MM-DD when user last checked in morning sleep quality
  whiteDaysEnabled?: boolean; // Whether 13/14/15 Hijri White Days auto-fasting is enabled (default false)
  fastingWhiteDays?: boolean; // Legacy alias for whiteDaysEnabled
  dailyWaterTargetMl?: number; // Optional explicit daily hydration target override in ml (1000..8000)
  adhanLeadMinutes: number; // default 0 min (exact Adhan time)
  prayerSilenceMinutes: number; // default 20 min from Adhan for Dhuhr/Asr/Maghrib/Isha
  fajrSilenceMinutes: number; // default 30 min from Adhan for Fajr
  oneTimeSilenceMinutes?: number; // 0 = inactive, 5..120 = one-time silence override via chat
  oneTimeSilenceDateKey?: string; // YYYY-MM-DD when one-time override applies
  lowEnergyDateKey?: string; // YYYY-MM-DD when soft/low-energy day mode is active
  defaultSnoozeMinutes?: number; // 5 | 10 | 15 minutes for alert snooze button (default 5)
  soundRepeats?: SoundRepeatMap; // Ring repeats per category (1..4 or 'continuous')
  ringPauseSeconds?: number; // Pause in seconds between consecutive rings (1..10, default 2)
  careerTrack: string;
  workEnabled: boolean;
  workStart24: string;
  workEnd24: string;
  workDays: number[];
  autoLocationSync: boolean;
  currentCityName: string;
  currentTimeZone: string;
  currentLat: number;
  currentLng: number;
  priorityOrderAr: string;
  personalNotes: string;
}

export interface HydrationScheduleSlot {
  cupIndex: number;
  timeMinutes: number;
  windowAr: string;
  noteAr: string;
}

export interface DailyWeatherPoint {
  dateIso: string;
  maxTempC: number;
  heatExceeded: boolean;
  heatBonusMl: number;
}

export interface HourlyWeatherPoint {
  hour: number;
  cloudCover: number;
  uvIndex: number;
  tempC: number;
}

export interface WeatherHydrationInfo {
  currentTempC: number;
  maxTempC: number;
  weatherCode: number;
  conditionAr: string;
  icon: string;
  heatBonusMl: number;
  heatNoteAr: string;
  fetchedAtIso: string;
  dailyMaxTemps?: DailyWeatherPoint[];
  hourly?: HourlyWeatherPoint[];
}

export type SunlightSessionId = 'morning' | 'noon' | 'evening';
export type SunlightSkinTone = 'fair' | 'wheat' | 'dark';
export type SunlightExposureMode = 'auto' | 'face_hands' | 'arms_light';

export interface SunlightSessionConfig {
  enabled: boolean;
  autoDuration: boolean;
  customMinutes: number;
  labelAr: string;
  emoji: string;
  descAr: string;
}

export interface SunlightSettings {
  enabled: boolean;
  leadMinutes: number;
  skinTone: SunlightSkinTone;
  exposureMode: SunlightExposureMode;
  sessions: Record<SunlightSessionId, SunlightSessionConfig>;
}

export const DEFAULT_SUNLIGHT_SETTINGS: SunlightSettings = {
  enabled: true,
  leadMinutes: 2,
  skinTone: 'wheat',
  exposureMode: 'auto',
  sessions: {
    morning: {
      enabled: true,
      autoDuration: true,
      customMinutes: 12,
      labelAr: 'ضوء الشروق',
      emoji: '🌅',
      descAr: 'ضبط الساعة البيولوجية',
    },
    noon: {
      enabled: true,
      autoDuration: true,
      customMinutes: 15,
      labelAr: 'شمس الظهيرة',
      emoji: '☀️',
      descAr: 'أشعة UVB لفيتامين د',
    },
    evening: {
      enabled: true,
      autoDuration: true,
      customMinutes: 15,
      labelAr: 'الشمس الحمراء',
      emoji: '🌇',
      descAr: 'تهدئة الأعصاب قبل النوم',
    },
  },
};

export interface GmailDigestItem {
  id: string;
  messageId: string;
  category: 'meeting' | 'travel' | 'medical' | 'deadline' | 'delivery' | 'other';
  titleAr: string;
  sender: string;
  summaryAr: string;
  dateIso?: string;
  startTime24?: string;
  durationMinutes?: number;
  suggestedAction: CalendarActionProposal;
}

