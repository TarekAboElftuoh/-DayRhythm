import {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  DynamicHabitAnchor,
  DynamicHabitStatus,
  FreeWindow,
  GroundingPlace,
  MedicationActionProposal,
  MemoryActionProposal,
  PersistedChatMessage,
  SeasonalSleepMode,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';
import { formatMinutes12h, calculateEgyptianPrayerTimes } from '../../engines/prayerEngine';
import {
  DYNAMIC_HABIT_ANCHOR_LABELS,
  computeDailyRhythmPlan,
  formatDurationAr,
} from '../../engines/lifeRhythmEngine';
import { formatSettingsSchemaForGemini } from '../../utils/settingsPatchValidator';
import {
  type GeminiFunctionCall,
  type GeminiScheduleGuardContext,
  type GeminiScheduleGuardResult,
  type GeminiScheduleGuardViolation,
  extractPendingProposalFromFunctionCalls,
  validateGeminiScheduleProposal,
  sanitizeGeminiOutputText,
  cleanDisplayMessageText,
} from '../geminiSanitizer';


interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}
const localGeminiCache = new Map<string, CacheEntry<unknown>>();

export function getFromCache<T>(key: string): T | null {
  const entry = localGeminiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    localGeminiCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setToCache<T>(key: string, value: T, ttlMs = 10 * 60_000): void {
  if (localGeminiCache.size > 150) {
    const oldest = localGeminiCache.keys().next().value;
    if (oldest !== undefined) localGeminiCache.delete(oldest);
  }
  localGeminiCache.set(key, { value, expiresAtMs: Date.now() + ttlMs });
}

// Time Helpers
export function getCairoTodayIso(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function getCairoNowTime12(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '9');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const period = hh >= 12 ? 'م' : 'ص';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
  } catch {
    return '12:00 م';
  }
}

export function formatServerIsoTo12h(isoStr?: string): string {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return `${isoStr} (طوال اليوم)`;
  }
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const period = hh >= 12 ? 'م' : 'ص';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
  } catch {
    return isoStr;
  }
}

