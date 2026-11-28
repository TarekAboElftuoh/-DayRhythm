/**
 * Gemini may describe an intent, but it must never state that events were added while the proposal
 * is still pending execution. Only an executed proposal (status confirmed) may claim that.
 */
const EXECUTED_CLAIM_PATTERN =
  /(تم(?:ت)?\s+(?:إضافة|اضافة|إنشاء|انشاء|جدولة|إدراج|ادراج|حذف|تعديل)|أضفت|اضفت|أنشأت|انشأت|جدولت|حذفت)/;

export const UNEXECUTED_CLAIM_NOTE_AR =
  '⚠️ لم يُنفَّذ أي تعديل بعد — راجع البطاقة واضغط «تأكيد وتنفيذ» ليُضاف فعلياً إلى جدولك وتقويم Google.';

export function guardUnexecutedClaims(text: string, pendingActionCount: number): string {
  const clean = (text || '').trim();
  if (pendingActionCount <= 0) return clean;
  if (!EXECUTED_CLAIM_PATTERN.test(clean)) return clean;
  return clean.includes(UNEXECUTED_CLAIM_NOTE_AR) ? clean : `${clean}\n\n${UNEXECUTED_CLAIM_NOTE_AR}`;
}
