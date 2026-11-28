import { GEMINI_MODEL_CHAIN } from './config';
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

import { GEMINI_ACTION_CHAIN, getGeminiApiKey, resolveGeminiModelOrder, type GeminiConnectionStatus, type GeminiStreamDonePayload } from './config';
import { getFromCache, setToCache } from './cacheAndTime';

export type {
  GeminiFunctionCall,
  GeminiScheduleGuardContext,
  GeminiScheduleGuardResult,
  GeminiScheduleGuardViolation,
} from '../geminiSanitizer';
export {
  extractPendingProposalFromFunctionCalls,
  validateGeminiScheduleProposal,
  sanitizeGeminiOutputText,
  cleanDisplayMessageText,
} from '../geminiSanitizer';

export function formatFriendlyGeminiErrorAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (raw.includes('GEMINI_API_KEY') || raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return 'مفتاح Gemini API غير صالح أو منتهي الصلاحية — يمكنك تغييره بضغطة واحدة من إعدادات التطبيق.';
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
    return 'تم الوصول للحد المؤقت لطلبات Gemini المجانية — انتظر بضع ثوانٍ وجرّب مرة أخرى أو حدّث مفتاحك في الإعدادات.';
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED')) {
    return 'تم رفض الإذن بمفتاح Gemini الحالي — تأكد من تفعيل Gemini API في حسابك بـ Google AI Studio.';
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    return 'خوادم Google تشهد ضغطاً مؤقتاً الآن — جرت المحاولة مع نماذج بديلة، انتظر لحظات وحاول مرة أخرى.';
  }
  if (raw.includes('AbortError')) {
    return 'تم إلغاء الطلب.';
  }
  return raw.length > 260 ? 'حدث خطأ مؤقت أثناء الاتصال بـ Google Gemini API — يرجى إعادة المحاولة.' : raw || 'تعذر الاتصال بخدمة Gemini.';
}

/**
 * Checks connectivity to Google Gemini API directly from the client.
 * Calls generativelanguage.googleapis.com with the configured API key.
 */
export async function checkGeminiStatus(forceProbe = false): Promise<GeminiConnectionStatus> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: GEMINI_MODEL_CHAIN[0],
      latencyMs: 1,
      checkedAtIso: new Date().toISOString(),
      error: 'مفتاح Gemini API غير مهيأ — يرجى إضافة المفتاح في الإعدادات.',
    };
  }

  const cacheKey = `gemini_probe_${apiKey.slice(-8)}`;
  if (!forceProbe) {
    const cached = getFromCache<GeminiConnectionStatus>(cacheKey);
    if (cached) return cached;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    const roundTrip = Math.max(1, Date.now() - startedAt);

    if (res.ok) {
      const result: GeminiConnectionStatus = {
        ok: true,
        connected: true,
        status: 'online',
        model: resolveGeminiModelOrder('fast')[0],
        latencyMs: roundTrip,
        checkedAtIso: new Date().toISOString(),
      };
      setToCache(cacheKey, result, 3 * 60_000);
      return result;
    }

    if (res.status === 429) {
      return {
        ok: true,
        connected: true,
        status: 'degraded',
        model: resolveGeminiModelOrder('fast')[0],
        latencyMs: roundTrip,
        checkedAtIso: new Date().toISOString(),
        error: 'ضغط مؤقت على Gemini — المحاولة التلقائية نشطة ويمكنك الإرسال مباشرة.',
      };
    }

    const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: resolveGeminiModelOrder('fast')[0],
      latencyMs: roundTrip,
      checkedAtIso: new Date().toISOString(),
      error: errData.error?.message ? formatFriendlyGeminiErrorAr(errData.error.message) : `تعذر التحقق من مفتاح Gemini (${res.status}).`,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: resolveGeminiModelOrder('fast')[0],
      latencyMs: Math.max(1, Date.now() - startedAt),
      checkedAtIso: new Date().toISOString(),
      error: isTimeout ? 'استغرق التحقق وقتاً طويلاً — ستتم إعادة المحاولة تلقائياً.' : formatFriendlyGeminiErrorAr(err),
    };
  }
}

/**
 * Client-Side Direct Gemini Multi-turn Chat with Live SSE Streaming and Automatic Model Fallback.
 * Connects directly to generativelanguage.googleapis.com — Zero intermediate backend needed!
 */
