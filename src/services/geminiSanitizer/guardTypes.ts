import type {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  DailyRhythmPlan,
  DynamicHabitAnchor,
  FreeWindow,
  HabitActionProposal,
  LifeProfile,
  MedicationActionProposal,
  MemoryActionProposal,
  PendingProposal,
  PrayerTimeItem,
  ScheduleBlock,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';
import {
  DEFAULT_LIFE_PROFILE,
  SEASONAL_SLEEP_CONSTANTS,
  classifyScientificTaskEnergy,
  computeDailyRhythmPlan,
  computeFreeWindows,
  pickScientificFreeSlot,
} from '../../engines/lifeRhythmEngine';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  getCairoNowMinutes,
  getCairoTodayIso,
} from '../../engines/prayerEngine';
import { validateAndNormalizeSettingsPatch } from '../../utils/settingsPatchValidator';


export interface GeminiScheduleGuardContext {
  lifeProfile: LifeProfile;
  prayers?: PrayerTimeItem[];
  plan?: DailyRhythmPlan;
  occupiedBlocks?: ScheduleBlock[];
  freeWindows?: FreeWindow[];
  todayIso?: string;
  nowMinutes?: number;
  timeZone?: string;
}

export interface GeminiScheduleGuardViolation {
  kind:
    | 'sleep'
    | 'prayer'
    | 'suhoor'
    | 'nap'
    | 'wind_down'
    | 'exercise_near_sleep'
    | 'fasting_curve'
    | 'focus_buffer';
  itemTitle: string;
  requestedTime24?: string;
  reasonAr: string;
  suggestedTime24: string | null;
  suggestedTime12Ar: string | null;
}

export interface GeminiScheduleGuardResult {
  allowed: boolean;
  filteredProposal: PendingProposal | undefined;
  violations: GeminiScheduleGuardViolation[];
  refusalMessageAr: string | null;
}

export function parseExplicitClockMinutes(text: string): number | null {
  const tagged24 = text.match(/(?:⏰|@|\[)\s*(\d{1,2}):(\d{2})\s*\]?/);
  if (tagged24) {
    const h = Number(tagged24[1]);
    const m = Number(tagged24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
  }
  const time12 = text.match(/(\d{1,2}):(\d{2})\s*(ص|صباحاً|صباحا|م|مساءً|مساءا|مساء|am|pm)\b/i);
  if (time12) {
    let h = Number(time12[1]);
    const m = Number(time12[2]);
    const marker = time12[3].toLowerCase();
    const isPm = marker.startsWith('م') || marker === 'pm';
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return h * 60 + m;
    }
  }
  const plain24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (plain24) {
    return Number(plain24[1]) * 60 + Number(plain24[2]);
  }
  return null;
}

export function wrapMinutes1440(min: number): number {
  return ((Math.round(min) % 1440) + 1440) % 1440;
}

export function formatMinutes24Str(min: number): string {
  const w = wrapMinutes1440(min);
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
}

