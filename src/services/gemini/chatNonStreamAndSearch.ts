import type { GeminiRoute, GeminiStreamDonePayload } from './config';
import { apiStreamGeminiChatClient } from './chatStream';
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

import { GEMINI_CHAT_NON_STREAM_TIMEOUT_MS, getGeminiApiKey, markModelUnavailable, rememberWorkingModel, resolveGeminiModelOrder, withModelConfig, type ChatRequestPayload, type ChatStreamHandlers } from './config';
import { buildChatSystemInstruction, normalizeGeminiHistory, shouldAttachChatTools } from './chatPromptBuilder';
import { formatFriendlyGeminiErrorAr } from './errorsAndStatus';

export async function fetchGeminiChatNonStream(
  requestBody: Record<string, unknown>,
  apiKey: string,
  modelOrder: string[],
  route: GeminiRoute
): Promise<{ text: string; fnCalls: GeminiFunctionCall[] } | null> {
  for (const modelCandidate of modelOrder) {
    const fallbackCtrl = new AbortController();
    const fallbackTimeout = setTimeout(
      () => fallbackCtrl.abort(),
      GEMINI_CHAT_NON_STREAM_TIMEOUT_MS
    );
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCandidate}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Plain body (no thinking override) — this is the last-resort path.
        body: JSON.stringify(withModelConfig(requestBody, modelCandidate, route, false)),
        signal: fallbackCtrl.signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: { name: string; args?: Record<string, unknown> };
            }>;
          };
        }>;
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      let text = '';
      const fnCalls: GeminiFunctionCall[] = [];
      for (const p of parts) {
        if (p.text) text += p.text;
        if (p.functionCall) fnCalls.push(p.functionCall);
      }
      if (text || fnCalls.length > 0) {
        const sanitized = sanitizeGeminiOutputText(text, fnCalls);
        return { text: sanitized.cleanText, fnCalls: sanitized.recoveredFnCalls };
      }
    } catch {
      continue;
    } finally {
      clearTimeout(fallbackTimeout);
    }
  }
  return null;
}

/**
 * Client-Side Maps Query: Queries free OSM Photon API directly for nearby geographic places,
 * then generates a clean Gemini Arabic summary with live Google Maps URLs!
 */

export async function apiStreamGeminiSearchClient(
  payload: {
    query: string;
    lat?: number;
    lng?: number;
    memories?: Array<{ ruleText: string; category?: string }>;
    constitutionBrief?: string;
  },
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const startedAt = Date.now();
  const query = (payload.query || '').trim();

  handlers.onStatus?.('جارٍ البحث والتحليل العلمي الذكي...');

  const prompt = `أنت الباحث العلمي الذكي في تطبيق «إيقاع اليوم | DayRhythm».
استعلام البحث: "${query}"

أجب باللغة العربية بوضوح ودقة واختصار، مع مراعاة النصائح الصحية والعلمية ونظام التوقيت 12 ساعة (ص/م).`;

  return apiStreamGeminiChatClient(
    {
      message: prompt,
      contextSummary: payload.constitutionBrief,
      memories: payload.memories?.map((m, idx) => ({ id: `m-${idx}`, category: m.category || 'general', ruleText: m.ruleText })),
    },
    {
      signal: handlers.signal,
      onStatus: handlers.onStatus,
      onDelta: handlers.onDelta,
      onDone: (donePayload) => {
        handlers.onDone({
          ...donePayload,
          latencyMs: Math.max(1, Date.now() - startedAt),
        });
      },
    }
  );
}

