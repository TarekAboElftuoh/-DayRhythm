import type { PersistedChatMessage } from '../../types/dayrhythm';

export function formatGeminiChatError(err: unknown, hangTimedOut: boolean): {
  errMsg: string;
  isTransientRate: boolean;
} {
  const rawMsg =
    err instanceof DOMException && err.name === 'AbortError' && hangTimedOut
      ? 'طلب Gemini استغرق وقتاً أطول من اللازم بدون رد — اضغط «إعادة المحاولة».'
      : err instanceof Error
        ? err.message
        : 'حدث خطأ غير متوقع.';
  const errMsg =
    rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')
      ? 'تم الوصول للحد المؤقت لطلبات Gemini — انتظر بضع ثوانٍ ثم اضغط «إعادة المحاولة».'
      : rawMsg.includes('UNAVAILABLE') || rawMsg.includes('503')
        ? 'خوادم Gemini مشغولة لحظياً — اضغط «إعادة المحاولة» الآن.'
        : rawMsg.startsWith('{') && rawMsg.length > 180
          ? 'تعذر استلام الرد من Gemini لحظياً — اضغط «إعادة المحاولة».'
          : rawMsg;
  const isTransientRate =
    rawMsg.includes('429') ||
    rawMsg.includes('503') ||
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('UNAVAILABLE');
  return { errMsg, isTransientRate };
}

export function canAutoExecuteProposal(
  proposal: PersistedChatMessage['pendingProposal'] | undefined,
  autoExecute: boolean
): boolean {
  if (!proposal || !autoExecute || proposal.fromTextFallback) return false;
  const totalItems =
    proposal.actions.length +
    (proposal.taskActions?.length ?? 0) +
    (proposal.medicationActions?.length ?? 0) +
    (proposal.creativeActions?.length ?? 0) +
    (proposal.habitActions?.length ?? 0) +
    (proposal.profileUpdates ? 1 : 0) +
    (proposal.appSettings ? 1 : 0) +
    (proposal.settingsPatchProposal ? 1 : 0) +
    (proposal.memoryActions?.length ?? 0);
  if (totalItems === 0 || (proposal.settingsPatchProposal?.errors?.length ?? 0) > 0) return false;
  if (proposal.medicationActions?.some((m) => m.operation === 'remove')) return false;
  return true;
}
