import { thinkingConfigFor, type GeminiRoute } from './config';
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

import { GEMINI_CHAT_FIRST_TOKEN_TIMEOUT_MS, GEMINI_CHAT_TOTAL_BUDGET_MS, getGeminiApiKey, markModelUnavailable, rememberWorkingModel, resolveGeminiModelOrder, withModelConfig, type ChatRequestPayload, type ChatStreamHandlers } from './config';
import { finalizeChatStreamResult } from './chatStreamFinalize';
import { buildChatSystemInstruction, normalizeGeminiHistory, shouldAttachChatTools } from './chatPromptBuilder';
import { GEMINI_CHAT_TOOLS } from './tools';
import { formatFriendlyGeminiErrorAr } from './errorsAndStatus';
import { fetchGeminiChatNonStream } from './chatNonStreamAndSearch';

export async function apiStreamGeminiChatClient(
  payload: ChatRequestPayload,
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const startedAt = Date.now();
  const userMessage = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!userMessage) {
    throw new Error('الرسالة مطلوبة.');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('مفتاح Google Gemini API غير متوفر — تفضل بإضافته في إعدادات التطبيق.');
  }

  handlers.onStatus?.('جارٍ الرد المباشر من Google Gemini...');

  const needsTools = shouldAttachChatTools(userMessage);
  const { systemInstruction, memoriesAppliedCount } = buildChatSystemInstruction(payload, {
    lean: !needsTools,
  });
  const normalizedHistory = normalizeGeminiHistory(payload.history);
  const contents = [
    ...normalizedHistory,
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  const requestBody: Record<string, unknown> = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (needsTools) {
    requestBody.tools = GEMINI_CHAT_TOOLS;
  }

  let fullText = '';
  const collectedFnCalls: GeminiFunctionCall[] = [];
  let succeeded = false;
  const route: GeminiRoute = needsTools ? 'action' : 'fast';
  const modelOrder = resolveGeminiModelOrder(route);
  let activeModelUsed: string = modelOrder[0];
  let lastErr: unknown = null;

  for (const modelCandidate of modelOrder) {
    if (handlers.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let reqTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCandidate}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      // 10s to the FIRST token, and a 30s total budget across all fallback models: a stalled
      // candidate can no longer burn 28s each and blow past the UI's 45s hang guard.
      const remainingBudgetMs = GEMINI_CHAT_TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remainingBudgetMs < 500) break;
      const reqTimeoutCtrl = new AbortController();
      reqTimeoutId = setTimeout(
        () => reqTimeoutCtrl.abort(),
        Math.min(GEMINI_CHAT_FIRST_TOKEN_TIMEOUT_MS, remainingBudgetMs)
      );
      const composedSignal = (() => {
        if (!handlers.signal) return reqTimeoutCtrl.signal;
        if (typeof AbortSignal.any === 'function') {
          return AbortSignal.any([handlers.signal, reqTimeoutCtrl.signal]);
        }
        const composed = new AbortController();
        const abort = () => composed.abort();
        handlers.signal.addEventListener('abort', abort, { once: true });
        reqTimeoutCtrl.signal.addEventListener('abort', abort, { once: true });
        return composed.signal;
      })();
      const send = (includeThinking: boolean) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withModelConfig(requestBody, modelCandidate, route, includeThinking)),
          signal: composedSignal,
        });
      let res = await send(true);
      // A model that rejects the thinking level (HTTP 400 "Thinking level ... not supported") is retried without it.
      if (res.status === 400 && thinkingConfigFor(modelCandidate, route)) {
        const peek = (await res.clone().json().catch(() => ({}))) as { error?: { message?: string } };
        if (/thinking/i.test(peek.error?.message || '')) {
          res = await send(false);
        }
      }

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
        const errMsg = errorJson?.error?.message || `HTTP ${res.status}`;
        if (res.status === 404) {
          markModelUnavailable(modelCandidate);
        }
        // If 404 (model deprecated for key, e.g. gemini-2.5-flash) or 503 (high demand), try next candidate
        if (res.status === 404 || res.status === 503 || res.status === 429) {
          lastErr = new Error(errMsg);
          continue;
        }
        throw new Error(errMsg);
      }

      if (!res.body) {
        throw new Error('Empty response body stream');
      }

      activeModelUsed = modelCandidate;
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: { name: string; args?: Record<string, unknown> };
                }>;
              };
            }>;
            error?: { message?: string };
          };

          if (parsed.error?.message) {
            throw new Error(parsed.error.message);
          }

          const parts = parsed.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (typeof part.text === 'string' && part.text) {
              fullText += part.text;
              handlers.onDelta(part.text);
            }
            if (part.functionCall && typeof part.functionCall.name === 'string') {
              collectedFnCalls.push(part.functionCall);
            }
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message && !e.message.includes('JSON')) {
            throw e;
          }
        }
      };

      while (true) {
        if (handlers.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const { done, value } = await reader.read();
        if (done) break;
        // First bytes arrived — the stream is alive, so the connect timeout must not kill it.
        if (reqTimeoutId) {
          clearTimeout(reqTimeoutId);
          reqTimeoutId = undefined;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          processLine(line);
        }
      }

      // Flush remaining
      buffer += decoder.decode();
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          processLine(line);
        }
      }

      succeeded = true;
      if (reqTimeoutId) clearTimeout(reqTimeoutId);
      rememberWorkingModel(route, modelCandidate);
      break;
    } catch (modelErr: unknown) {
      if (reqTimeoutId) clearTimeout(reqTimeoutId);
      if (modelErr instanceof DOMException && modelErr.name === 'AbortError') {
        // If the user explicitly aborted, propagate. If the per-request timeout fired, try next model.
        if (handlers.signal?.aborted) throw modelErr;
        lastErr = modelErr;
        if (fullText) break;
        continue; // timeout — try next model candidate
      }
      lastErr = modelErr;
      if (fullText) {
        // We already streamed partial tokens to the user, do not restart
        break;
      }
      // Try next model candidate
      continue;
    }
  }

  if (!succeeded && !fullText) {
    // Non-streaming fallback attempt if SSE had issues
    try {
      const nonStreamFallback = await fetchGeminiChatNonStream(requestBody, apiKey, modelOrder, route);
      if (nonStreamFallback) {
        fullText = nonStreamFallback.text;
        if (nonStreamFallback.fnCalls) {
          collectedFnCalls.push(...nonStreamFallback.fnCalls);
        }
        handlers.onDelta(fullText);
        succeeded = true;
      }
    } catch {
      // ignore
    }
  }

  if (!succeeded && !fullText) {
    throw new Error(formatFriendlyGeminiErrorAr(lastErr));
  }

  finalizeChatStreamResult({
    fullText,
    collectedFnCalls,
    payload,
    startedAt,
    memoriesAppliedCount,
    activeModelUsed,
    handlers,
  });

  return true;
}

