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


/**
 * Build-time default key. Never hard-code a key here: this repository is public.
 * Set it as the GitHub Actions secret `GEMINI_API_KEY` (the workflow passes it as
 * VITE_GEMINI_API_KEY), or paste a key in the app's «مفتاح Gemini» settings (stored only on the device).
 */
export const DEFAULT_GEMINI_API_KEY: string = (
  (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined) || ''
).trim();
export const GEMINI_API_KEY_STORAGE_KEY = 'dayrhythm_gemini_api_key_v1';

export function getGeminiApiKey(): string {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_API_KEY;
  try {
    const saved = (localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim();
    if (saved) return saved;
  } catch {
    // ignore storage access errors
  }
  return DEFAULT_GEMINI_API_KEY;
}

export function setGeminiApiKey(rawKey: string): { saved: string; error?: string } {
  const cleaned = rawKey.trim();
  if (typeof window !== 'undefined') {
    try {
      if (cleaned) {
        localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, cleaned);
      } else {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }
  return { saved: cleaned || DEFAULT_GEMINI_API_KEY };
}

export function resetGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return DEFAULT_GEMINI_API_KEY;
}

export function isCustomGeminiApiKeySet(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = (localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim();
    return Boolean(saved && saved !== DEFAULT_GEMINI_API_KEY);
  } catch {
    return false;
  }
}

/**
 * Smart model routing (measured 2026-11-22, time to first streamed token):
 *   gemini-3.1-flash-lite ≈ 0.8 s · gemini-3.5-flash (minimal thinking) ≈ 2 s · gemini-3.5-flash (default thinking) ≈ 3 s.
 *   gemini-2.5-flash now returns 404 ("no longer available to new users") and only wasted a round trip.
 *
 * - Plain chat / questions  → fastest model first.
 * - Requests that may edit the calendar, tasks, meds, profile → stronger model with light thinking
 *   (function-calling accuracy matters more than ~1 s there).
 * Models that answer 404 are remembered for 24 h and skipped; the last model that worked is tried first.
 */
export const GEMINI_FAST_CHAIN = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-4-hydrogen',
] as const;

export const GEMINI_ACTION_CHAIN = [
  'gemini-3.5-flash',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

/** Kept for callers/labels that need "the" default model. */
export const GEMINI_MODEL_CHAIN = GEMINI_ACTION_CHAIN;

export type GeminiRoute = 'fast' | 'action';
const GEMINI_DEAD_MODELS_KEY = 'dayrhythm_gemini_dead_models_v1';
const GEMINI_LAST_GOOD_KEY = 'dayrhythm_gemini_last_good_v1';
const DEAD_MODEL_TTL_MS = 24 * 60 * 60_000;
export const GEMINI_CHAT_FIRST_TOKEN_TIMEOUT_MS = 10_000;
export const GEMINI_CHAT_TOTAL_BUDGET_MS = 30_000;
export const GEMINI_CHAT_NON_STREAM_TIMEOUT_MS = 8_000;

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function markModelUnavailable(model: string): void {
  const dead = readJsonStorage<Record<string, number>>(GEMINI_DEAD_MODELS_KEY, {});
  dead[model] = Date.now() + DEAD_MODEL_TTL_MS;
  writeJsonStorage(GEMINI_DEAD_MODELS_KEY, dead);
}

export function rememberWorkingModel(route: GeminiRoute, model: string): void {
  const last = readJsonStorage<Record<string, string>>(GEMINI_LAST_GOOD_KEY, {});
  if (last[route] === model) return;
  last[route] = model;
  writeJsonStorage(GEMINI_LAST_GOOD_KEY, last);
}

/** Ordered candidates for a route: last working model first, models known to be gone skipped. */
export function resolveGeminiModelOrder(route: GeminiRoute): string[] {
  const base: string[] = [...(route === 'fast' ? GEMINI_FAST_CHAIN : GEMINI_ACTION_CHAIN)];
  const lastGood = readJsonStorage<Record<string, string>>(GEMINI_LAST_GOOD_KEY, {})[route];
  if (lastGood && base.includes(lastGood)) {
    base.splice(base.indexOf(lastGood), 1);
    base.unshift(lastGood);
  }
  const dead = readJsonStorage<Record<string, number>>(GEMINI_DEAD_MODELS_KEY, {});
  const now = Date.now();
  const alive = base.filter((m) => !(dead[m] && dead[m] > now));
  return alive.length > 0 ? alive : base;
}

/** Light thinking for Gemini 3.x (default thinking added ~1 s+ before the first word). */
export function thinkingConfigFor(model: string, route: GeminiRoute): Record<string, unknown> | undefined {
  if (!model.startsWith('gemini-3')) return undefined;
  return { thinkingLevel: route === 'action' ? 'low' : 'minimal' };
}

export function withModelConfig(
  requestBody: Record<string, unknown>,
  model: string,
  route: GeminiRoute,
  includeThinking: boolean
): Record<string, unknown> {
  const thinking = includeThinking ? thinkingConfigFor(model, route) : undefined;
  if (!thinking) return requestBody;
  const generationConfig = (requestBody.generationConfig as Record<string, unknown> | undefined) ?? {};
  return { ...requestBody, generationConfig: { ...generationConfig, thinkingConfig: thinking } };
}

export interface GeminiConnectionStatus {
  ok: boolean;
  connected: boolean;
  status: 'checking' | 'online' | 'degraded' | 'offline';
  model: string;
  latencyMs: number;
  checkedAtIso?: string;
  error?: string;
}

export interface GeminiStreamDonePayload {
  text: string;
  places?: GroundingPlace[];
  sources?: Array<{ title: string; uri: string }>;
  pendingProposal?: PersistedChatMessage['pendingProposal'];
  latencyMs?: number;
  memoriesAppliedCount?: number;
  model?: string;
  cached?: boolean;
}

export interface ChatStreamHandlers {
  signal?: AbortSignal;
  onStatus?: (statusText: string) => void;
  onDelta: (deltaText: string) => void;
  onDone: (payload: GeminiStreamDonePayload) => void;
}

export interface ChatRequestPayload {
  message: string;
  bypassCache?: boolean;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  contextSummary?: string;
  longTermChatContext?: string;
  memories?: Array<{
    id: string;
    category: string;
    ruleText: string;
    source?: string;
  }>;
  calendarEvents?: Array<{
    id: string;
    calendarId?: string;
    calendarTitle?: string;
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end?: string;
  }>;
  tasks?: Array<{
    id: string;
    taskListId: string;
    taskListTitle?: string;
    title: string;
    status: string;
    due?: string;
  }>;
  medications?: Array<{
    id: string;
    name: string;
    time24?: string;
    times24?: string[];
    daysOfWeek?: number[];
    fastingPolicy?: string;
    doseNote?: string;
    takenToday?: boolean;
    takenDosesToday?: string[];
    courseEndDate?: string;
    remainingDoses?: number;
    totalDoses?: number;
    refillAlertDays?: number;
    takenDates?: string[];
  }>;
  settingsSnapshot?: SettingsSnapshotContext;
  freeWindows?: FreeWindow[];
  seasonalSleepMode?: SeasonalSleepMode;
  creativeActivities?: Array<{
    id: string;
    name: string;
    emoji?: string;
    cadence?: string;
    goalCount?: number;
    sessionsInPeriod?: number;
    weeklyGoalSessions: number;
    sessionsThisWeek: number;
    sessionMinutes: number;
    completedToday?: boolean;
    scheduledTime24?: string;
    expiresOnDate?: string;
  }>;
  habits?: Array<{
    id: string;
    title: string;
    status: DynamicHabitStatus;
    anchor: DynamicHabitAnchor;
    durationMin: number;
    daysOfWeek?: number[];
    skipOnFasting?: boolean;
    completedToday?: boolean;
    resolvedTimeLabel?: string;
    isFallbackSlot?: boolean;
    isFlexibleUnplaced?: boolean;
    skippedReasonAr?: string;
  }>;
}

// Bounded in-memory response cache
