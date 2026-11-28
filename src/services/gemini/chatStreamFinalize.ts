import type { ChatRequestPayload, ChatStreamHandlers } from './config';
import {
  extractPendingProposalFromFunctionCalls,
  sanitizeGeminiOutputText,
  type GeminiFunctionCall,
} from '../geminiSanitizer';
import { validateGeminiScheduleProposal } from '../geminiSanitizer';
import { countProposalActions } from '../../engines/chat/batchActions';
import { guardUnexecutedClaims } from '../geminiSanitizer/claimGuard';

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

  const finalText =
    guardRefusalNote && !pendingProposal
      ? guardRefusalNote
      : guardRefusalNote
        ? `${sanitized.cleanText ? `${sanitized.cleanText}\n\n` : ''}${guardRefusalNote}`
        : sanitized.cleanText ||
          pendingProposal?.summaryAr ||
          'أعددتُ التعديلات المطلوبة — راجع التفاصيل وأكد التنفيذ.';

  // Pending actions have NOT run yet: no "added" claims until the user confirms execution.
  const guardedText = guardUnexecutedClaims(
    finalText,
    pendingProposal ? countProposalActions(pendingProposal) : 0
  );

  handlers.onDone({
    text: guardedText,
    pendingProposal,
    latencyMs: Math.max(1, Date.now() - startedAt),
    memoriesAppliedCount,
    model: activeModelUsed,
    cached: false,
  });
}
