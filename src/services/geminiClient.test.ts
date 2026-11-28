import { describe, it, expect } from 'vitest';
import {
  buildChatSystemInstruction,
  DAYRHYTHM_SYSTEM_INSTRUCTION,
  validateGeminiScheduleProposal,
} from './geminiClient';
import { extractPendingProposalFromFunctionCalls } from './geminiSanitizer';
import { DEFAULT_LIFE_PROFILE, computeDailyRhythmPlan } from '../engines/lifeRhythmEngine';
import { FreeWindow, PrayerTimeItem } from '../types/dayrhythm';

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

  it('enforces Hard Guard rejecting sleep/prayer/wind-down overlaps and proposes logical alternatives', () => {
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('ده وقت نومك/صلاتك المحمي');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('Wind-Down Zone');
    expect(DAYRHYTHM_SYSTEM_INSTRUCTION).toContain('10–15');

    const prayers: PrayerTimeItem[] = [
      { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 5 * 60, alarmMinutes: 4 * 60 + 57, isObligatory: true },
      { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 6 * 60 + 30, alarmMinutes: 6 * 60 + 30, isObligatory: false },
      { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60, alarmMinutes: 11 * 60 + 57, isObligatory: true },
      { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 15 * 60, alarmMinutes: 14 * 60 + 57, isObligatory: true },
      { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 17 * 60 + 15, alarmMinutes: 17 * 60 + 12, isObligatory: true },
      { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 18 * 60 + 40, alarmMinutes: 18 * 60 + 37, isObligatory: true },
    ];
    const plan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, prayers, {
      todayWeekday: 0,
      tomorrowWeekday: 1,
      todayIso: '2026-11-29',
      tomorrowIso: '2026-11-30',
      fastingOverride: 'normal',
    });

    // 1. Sleep overlap -> rejected with polite Arabic refusal + alternative
    const sleepOverlap = validateGeminiScheduleProposal(
      {
        summaryAr: 'جدولة جلسة برمجة الساعة 2 صباحاً',
        actions: [
          {
            operation: 'create',
            title: '💻 برمجة مشروع',
            dateIso: '2026-11-29',
            startTime24: '02:00',
            durationMinutes: 60,
          },
        ],
        status: 'pending',
      },
      { lifeProfile: DEFAULT_LIFE_PROFILE, prayers, plan, todayIso: '2026-11-29' }
    );
    expect(sleepOverlap.allowed).toBe(false);
    expect(sleepOverlap.filteredProposal).toBeUndefined();
    expect(sleepOverlap.violations[0].kind).toBe('sleep');
    expect(sleepOverlap.refusalMessageAr).toContain('ده وقت نومك المحمي');
    expect(sleepOverlap.violations[0].suggestedTime24).not.toBeNull();

    // 2. Prayer overlap via extractPendingProposalFromFunctionCalls with guardContext -> suppressed
    const blockedByExtractor = extractPendingProposalFromFunctionCalls(
      [
        {
          name: 'propose_calendar_actions',
          args: {
            summaryAr: 'اجتماع وقت الظهر',
            actions: [
              {
                operation: 'create',
                title: '📞 مكالمة',
                dateIso: '2026-11-29',
                startTime24: '12:05',
                durationMinutes: 30,
              },
            ],
          },
        },
      ],
      { guardContext: { lifeProfile: DEFAULT_LIFE_PROFILE, prayers, plan, todayIso: '2026-11-29' } }
    );
    expect(blockedByExtractor).toBeUndefined();

    // 3. Deep work inside Wind-Down Zone (25 min before bedtime) -> rejected
    const windDownStartMin = plan.bedtimeMin - 30;
    const wdH = String(Math.floor(windDownStartMin / 60)).padStart(2, '0');
    const wdM = String(windDownStartMin % 60).padStart(2, '0');
    const windDownResult = validateGeminiScheduleProposal(
      {
        summaryAr: 'عمل DevOps قبل النوم',
        actions: [
          {
            operation: 'create',
            title: '💻 DevOps deploy',
            dateIso: '2026-11-29',
            startTime24: `${wdH}:${wdM}`,
            durationMinutes: 25,
          },
        ],
        status: 'pending',
      },
      { lifeProfile: DEFAULT_LIFE_PROFILE, prayers, plan, todayIso: '2026-11-29' }
    );
    expect(windDownResult.allowed).toBe(false);
    expect(windDownResult.violations[0].kind).toBe('wind_down');

    // 4. Clean morning Duha deep-work slot -> allowed and returns confirmation proposal
    const cleanSlot = validateGeminiScheduleProposal(
      {
        summaryAr: 'جلسة تركيز صباحية',
        actions: [
          {
            operation: 'create',
            title: '💻 برمجة في الضحى',
            dateIso: '2026-11-29',
            startTime24: '08:30',
            durationMinutes: 45,
          },
        ],
        status: 'pending',
      },
      { lifeProfile: DEFAULT_LIFE_PROFILE, prayers, plan, todayIso: '2026-11-29' }
    );
    expect(cleanSlot.allowed).toBe(true);
    expect(cleanSlot.filteredProposal?.actions).toHaveLength(1);
  });
});
