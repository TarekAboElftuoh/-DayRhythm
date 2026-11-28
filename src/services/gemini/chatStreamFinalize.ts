import type { ChatRequestPayload, ChatStreamHandlers } from './config';
import {
  extractPendingProposalFromFunctionCalls,
  sanitizeGeminiOutputText,
  type GeminiFunctionCall,
} from '../geminiSanitizer';
import { validateGeminiScheduleProposal } from '../geminiSanitizer';

export function finalizeChatStreamResult(params: {
  fullText: string;
  collectedFnCalls: GeminiFunctionCall[];
  payload: ChatRequestPayload;
  startedAt: number;
  memoriesAppliedCount: number;
  activeModelUsed: string;
  handlers: ChatStreamHandlers;
}): void {
  const { fullText, collectedFnCalls, payload, startedAt, memoriesAppliedCount, activeModelUsed, handlers } = params;
  const sanitized = sanitizeGeminiOutputText(fullText, collectedFnCalls);
  const rawProposal = extractPendingProposalFromFunctionCalls(sanitized.recoveredFnCalls, {
    settingsSnapshot: payload.settingsSnapshot,
    skipScheduleGuard: true,
  });

  let pendingProposal = rawProposal;
  let guardRefusalNote: string | null = null;

  if (rawProposal && payload.settingsSnapshot?.lifeProfile) {
    const guardResult = validateGeminiScheduleProposal(rawProposal, {
      lifeProfile: payload.settingsSnapshot.lifeProfile,
      freeWindows: payload.freeWindows ?? payload.settingsSnapshot.freeWindows,
    });
    pendingProposal = guardResult.filteredProposal;
    if (!guardResult.allowed && guardResult.refusalMessageAr) {
      guardRefusalNote = guardResult.refusalMessageAr;
    }
  }

  const falseAddClaim =
    !pendingProposal &&
    !guardRefusalNote &&
    /(?:تم(?:ت)?\s+(?:إضافة|جدولة|إنشاء)|أضفت|جدولت|added|scheduled|created)\b[\s\S]{0,80}\b(?:حدث|أحداث|موعد|مواعيد|events?)\b/i.test(
      sanitized.cleanText
    );

  const finalText =
    guardRefusalNote && !pendingProposal
      ? guardRefusalNote
      : guardRefusalNote
        ? `${sanitized.cleanText ? `${sanitized.cleanText}\n\n` : ''}${guardRefusalNote}`
        : falseAddClaim
          ? '⚠️ لم يتم تنفيذ أي إضافة في التقويم لأن الأداة لم تُستدعَ — أعد المحاولة بصيغة أوضح (مثل: أضف 5 أحداث عشوائية اليوم).'
          : sanitized.cleanText ||
            pendingProposal?.summaryAr ||
            'أعددتُ التعديلات المطلوبة — راجع التفاصيل وأكد التنفيذ.';

  handlers.onDone({
    text: finalText,
    pendingProposal,
    latencyMs: Math.max(1, Date.now() - startedAt),
    memoriesAppliedCount,
    model: activeModelUsed,
    cached: false,
  });
}
