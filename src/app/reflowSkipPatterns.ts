import type { MemoryCategory, ScheduleBlock } from '../types/dayrhythm';
import { cleanCalendarText } from '../services/apiClient';
import { normalizeSkipPatternKey, SKIP_PATTERN_STORAGE_KEY } from '../utils/appHelpers';

interface AddMemoryFn {
  (input: { category: MemoryCategory; ruleText: string; source: 'system_seed' }): void;
}

/**
 * "تدارك اليوم" skips: count per normalized title and flag a repeated pattern once it hits 3 days,
 * feeding the assistant a memory it can act on later.
 */
export function recordSkippedBlockPatterns(
  reflowed: ScheduleBlock[],
  memories: ReadonlyArray<{ ruleText: string }>,
  handleAddMemory: AddMemoryFn
): void {
  const skipped = reflowed.filter((b) => b.reflowStatus === 'skipped');
  if (skipped.length === 0) return;
  try {
    const counts: Record<string, number> = JSON.parse(
      localStorage.getItem(SKIP_PATTERN_STORAGE_KEY) || '{}'
    );
    const flaggedTitles: string[] = [];
    skipped.forEach((block) => {
      const titleAr = cleanCalendarText(block.categoryAr) || block.emojiPair;
      const key = normalizeSkipPatternKey(titleAr);
      if (!key) return;
      counts[key] = (counts[key] ?? 0) + 1;
      if (counts[key] === 3 && !memories.some((m) => m.ruleText.includes(titleAr))) {
        flaggedTitles.push(titleAr);
      }
    });
    localStorage.setItem(SKIP_PATTERN_STORAGE_KEY, JSON.stringify(counts));
    flaggedTitles.forEach((titleAr) => {
      handleAddMemory({
        category: 'priority',
        ruleText: `لاحظ النظام أن المستخدم تخطّى «${titleAr}» ٣ أيام على الأقل عبر "تدارك اليوم" — هذا نمط متكرر، فاقترح بنفسك تعديل ميعاده أو تبسيطه أو حذفه بدل الاستمرار في جدولته كما هو دون تغيير.`,
        source: 'system_seed',
      });
    });
  } catch {
    // storage blocked — skip silently
  }
}
