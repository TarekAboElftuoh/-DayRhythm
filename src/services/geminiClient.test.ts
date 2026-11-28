import { describe, it, expect } from 'vitest';
import { buildChatSystemInstruction, DAYRHYTHM_SYSTEM_INSTRUCTION } from './geminiClient';
import { extractPendingProposalFromFunctionCalls } from './geminiSanitizer';
import { FreeWindow } from '../types/dayrhythm';

describe('Gemini Smart Scheduling Context', () => {
  it('instructs Gemini to pick from freeWindows and never overlap prayers, sleep, naps, Suhoor, or calendar events', () => {
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('freeWindows');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('long-night');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('medium-night');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('short-night');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('السحور');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('القيلولة');
  });

  it('injects formatted freeWindows and seasonalSleepMode without truncation even in lean mode or long contextSummary', () => {
    const freeWindows: FreeWindow[] = [
      { startMin: 5 * 60 + 38, endMin: 9 * 60, durationMin: 202, label: 'بعد الفجر' },
      { startMin: 13 * 60 + 30, endMin: 15 * 60, durationMin: 90, label: 'بعد الظهر' },
    ];

    const longContext = 'سياق '.repeat(600); // > 2400 chars (exceeds lean 600 & full 1800 slice)

    const leanResult = buildChatSystemInstruction(
      {
        message: 'امتى أقدر أذاكر النهارده؟',
        contextSummary: longContext,
        settingsSnapshot: {
          freeWindows,
          seasonalSleepMode: 'short_night',
        },
      },
      { lean: true }
    );

    expect(leanResult.systemInstruction).toContain('short-night');
    expect(leanResult.systemInstruction).toContain('بعد الفجر');
    expect(leanResult.systemInstruction).toContain('05:38 ص – 09:00 ص');
    expect(leanResult.systemInstruction).toContain('202 د');
    expect(leanResult.systemInstruction).toContain('بعد الظهر');
    expect(leanResult.systemInstruction).toContain('01:30 م – 03:00 م');

    const fullResult = buildChatSystemInstruction(
      {
        message: 'جدول لي المهمة المؤجلة في وقت فاضي',
        contextSummary: longContext,
        seasonalSleepMode: 'medium_night',
        freeWindows,
      },
      { lean: false }
    );

    expect(fullResult.systemInstruction).toContain('medium-night');
    expect(fullResult.systemInstruction).toContain('05:38 ص – 09:00 ص');
  });

  it('injects active and planned dynamic habits into Gemini context and parses propose_habit_actions', () => {
    const result = buildChatSystemInstruction(
      {
        message: 'فعّل عادة المشي المستقبلية',
        habits: [
          {
            id: 'h1',
            title: 'قراءة صباحية',
            status: 'active',
            anchor: 'sunrise-light',
            durationMin: 20,
            completedToday: true,
            resolvedTimeLabel: '07:03 ص – 07:23 ص',
          },
          {
            id: 'h2',
            title: 'مشي بعد العصر',
            status: 'planned',
            anchor: 'after-asr',
            durationMin: 30,
          },
        ],
      },
      { lean: true }
    );

    expect(result.systemInstruction).toContain('قراءة صباحية');
    expect(result.systemInstruction).toContain('07:03 ص – 07:23 ص');
    expect(result.systemInstruction).toContain('تم ✓');
    expect(result.systemInstruction).toContain('مشي بعد العصر');
    expect(result.systemInstruction).toContain('planned');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('propose_habit_actions');

    const proposal = extractPendingProposalFromFunctionCalls([
      {
        name: 'propose_habit_actions',
        args: {
          summaryAr: 'تفعيل عادة المشي',
          habitActions: [
            { operation: 'activate', habitId: 'h2', title: 'مشي بعد العصر', anchor: 'after-asr' },
          ],
        },
      },
    ]);
    expect(proposal?.habitActions).toHaveLength(1);
    expect(proposal?.habitActions?.[0].operation).toBe('activate');
  });
});
