import { describe, it, expect } from 'vitest';
import {
  formatDurationAr,
  computeScientificHydration,
  computeMedicationDaysLeft,
  checkSmartScheduleConflict,
  computeDailyRhythmPlan,
  isFastingDay,
  resolveMedicationDosesForDay,
  buildMedicationAlarmEntries,
  DEFAULT_LIFE_PROFILE,
} from './lifeRhythmEngine';
import { MedicationItem, PrayerTimeItem } from '../types/dayrhythm';

describe('Life Rhythm Engine Pure Functions', () => {
  it('formats Arabic duration correctly', () => {
    expect(formatDurationAr(0)).toBe('0 د');
    expect(formatDurationAr(45)).toBe('45 د');
    expect(formatDurationAr(60)).toBe('1 س');
    expect(formatDurationAr(90)).toBe('1 س 30 د');
    expect(formatDurationAr(150)).toBe('2 س 30 د');
  });

  it('computes scientific hydration targets reliably', () => {
    const hydration = computeScientificHydration(DEFAULT_LIFE_PROFILE, false);
    expect(hydration.normalTargetMl).toBeGreaterThan(1500);
    expect(hydration.normalTargetCups).toBeGreaterThan(5);
    expect(hydration.normalTargetCups).toBeLessThan(35);
    expect(hydration.fastingMinTargetMl).toBeLessThanOrEqual(hydration.normalTargetMl);
  });

  it('handles zero-duration events (point-in-time / no duration) in schedule conflict checks', () => {
    const dummyPrayers: PrayerTimeItem[] = [
      {
        id: 'dhuhr',
        nameAr: 'الظهر',
        nameEn: 'Dhuhr',
        emojiPair: '☀️',
        adhanMinutes: 12 * 60,
        alarmMinutes: 12 * 60 - 3,
        isObligatory: true,
      },
    ];

    const plan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, dummyPrayers, {
      todayWeekday: 1,
      tomorrowWeekday: 2,
    });

    // Conflict: 12:05 falls directly inside Dhuhr prayer silence window
    const conflictResult = checkSmartScheduleConflict({
      time24: '12:05',
      durationMinutes: 0,
      prayers: dummyPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks: [],
    });
    expect(conflictResult.hasConflict).toBe(true);
    expect(conflictResult.warnings[0]).toContain('الظهر');

    // Safe: 14:00 is completely outside prayer, sleep, or occupied blocks
    const safeResult = checkSmartScheduleConflict({
      time24: '14:00',
      durationMinutes: 0,
      prayers: dummyPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks: [],
    });
    expect(safeResult.hasConflict).toBe(false);
    expect(safeResult.warnings.length).toBe(0);
  });

  it('orders fasting hydration slots chronologically (Suhoor before evening)', () => {
    const fastingPrayers: PrayerTimeItem[] = [
      { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 30, alarmMinutes: 4 * 60 + 27, isObligatory: true },
      { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 6 * 60, alarmMinutes: 6 * 60, isObligatory: false },
      { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 18 * 60, alarmMinutes: 17 * 60 + 57, isObligatory: true },
      { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 19 * 60 + 30, alarmMinutes: 19 * 60 + 27, isObligatory: true },
    ];
    const plan = computeDailyRhythmPlan(
      { ...DEFAULT_LIFE_PROFILE, fastingDays: [1] },
      fastingPrayers,
      { todayWeekday: 1, tomorrowWeekday: 2 }
    );
    expect(plan.isFastingToday).toBe(true);
    expect(plan.hydrationSlots[0].windowAr).toBe('السحور');
    expect(plan.hydrationSlots[0].timeMinutes).toBeLessThan(4 * 60 + 30);
    const iftarSlot = plan.hydrationSlots.find((s) => s.windowAr === 'عند الإفطار');
    expect(iftarSlot).toBeDefined();
    expect(plan.hydrationSlots.indexOf(iftarSlot!)).toBeGreaterThan(0);
  });

  it('computes medication days left factoring daysOfWeek', () => {
    expect(computeMedicationDaysLeft(6, 1, [1, 4])).toBeCloseTo(21, 1);
    expect(computeMedicationDaysLeft(6, 2)).toBeCloseTo(3, 1);
  });
});

describe('Year-Round Seasonal Sleep System', () => {
  it('computes annual summer vs winter Isha-to-Fajr bounds cleanly', async () => {
    const { computeAnnualSleepForecast } = await import('./lifeRhythmEngine');
    const forecast = computeAnnualSleepForecast({
      cityName: 'الدقهلية',
      lat: 31.227,
      lng: 31.6148,
      timeZone: 'Africa/Cairo',
    } as any);

    expect(forecast.summerMinNightMin).toBeLessThan(forecast.winterMaxNightMin);
    expect(forecast.summerMinNightMin).toBeLessThanOrEqual(420);
    expect(forecast.winterMaxNightMin).toBeGreaterThanOrEqual(540);
  });

  it('activates short_summer_night and abundant_winter seasonal sleep phases in daily plan', async () => {
    const { computeDailyRhythmPlan, DEFAULT_LIFE_PROFILE } = await import('./lifeRhythmEngine');

    const summerPrayers = [
      { id: 'fajr', nameAr: 'الفجر', adhanMinutes: 4 * 60 + 8, isObligatory: true },
      { id: 'sunrise', nameAr: 'الشروق', adhanMinutes: 5 * 60 + 50, isObligatory: false },
      { id: 'dhuhr', nameAr: 'الظهر', adhanMinutes: 12 * 60 + 55, isObligatory: true },
      { id: 'asr', nameAr: 'العصر', adhanMinutes: 16 * 60 + 30, isObligatory: true },
      { id: 'maghrib', nameAr: 'المغرب', adhanMinutes: 20 * 60 + 0, isObligatory: true },
      { id: 'isha', nameAr: 'العشاء', adhanMinutes: 21 * 60 + 35, isObligatory: true },
    ] as any;

    const winterPrayers = [
      { id: 'fajr', nameAr: 'الفجر', adhanMinutes: 5 * 60 + 18, isObligatory: true },
      { id: 'sunrise', nameAr: 'الشروق', adhanMinutes: 6 * 60 + 48, isObligatory: false },
      { id: 'dhuhr', nameAr: 'الظهر', adhanMinutes: 12 * 60 + 0, isObligatory: true },
      { id: 'asr', nameAr: 'العصر', adhanMinutes: 14 * 60 + 55, isObligatory: true },
      { id: 'maghrib', nameAr: 'المغرب', adhanMinutes: 17 * 60 + 10, isObligatory: true },
      { id: 'isha', nameAr: 'العشاء', adhanMinutes: 18 * 60 + 35, isObligatory: true },
    ] as any;

    const summerPlan = computeDailyRhythmPlan(
      DEFAULT_LIFE_PROFILE,
      summerPrayers,
      { todayWeekday: 0, tomorrowWeekday: 1, heatBonusMl: 400 }
    );
    const winterPlan = computeDailyRhythmPlan(
      DEFAULT_LIFE_PROFILE,
      winterPrayers,
      { todayWeekday: 0, tomorrowWeekday: 1 }
    );

    expect(summerPlan.seasonalSleep?.phase).toBe('short_summer_night');
    expect(winterPlan.seasonalSleep?.phase).toBe('abundant_winter');
    expect(summerPlan.seasonalSleep?.completedCycles).toBeLessThanOrEqual(4);
    expect(winterPlan.seasonalSleep?.completedCycles).toBeGreaterThanOrEqual(5);
  });
});

describe('Unified Fasting Detection, Hydration Decoupling & Smart Medication Shifting', () => {
  const samplePrayers: PrayerTimeItem[] = [
    { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 30, alarmMinutes: 4 * 60 + 27, isObligatory: true },
    { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 6 * 60, alarmMinutes: 6 * 60, isObligatory: false },
    { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60, alarmMinutes: 11 * 60 + 57, isObligatory: true },
    { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 15 * 60 + 15, alarmMinutes: 15 * 60 + 12, isObligatory: true },
    { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 18 * 60, alarmMinutes: 17 * 60 + 57, isObligatory: true },
    { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 19 * 60 + 30, alarmMinutes: 19 * 60 + 27, isObligatory: true },
  ];

  it('detects custom Saturday, Mon/Thu, White Days, Ramadan, and one-off toggles uniformly', () => {
    // 1. Custom weekday: Saturday (6)
    expect(isFastingDay({ weekday: 6, fastingDays: [6] })).toBe(true);
    expect(isFastingDay({ weekday: 0, fastingDays: [6] })).toBe(false);

    // 2. Mon/Thu (1, 4)
    expect(isFastingDay({ weekday: 1, fastingDays: [1, 4] })).toBe(true);
    expect(isFastingDay({ weekday: 4, fastingDays: [1, 4] })).toBe(true);

    // 3. White Days (2026-11-23 = 13 Jumada II 1448 AH)
    expect(
      isFastingDay({ weekday: 1, fastingDays: [], dateIso: '2026-11-23', timeZone: 'Africa/Cairo' })
    ).toBe(true);

    // 4. Ramadan (2026-02-20 = 3 Ramadan 1447 AH)
    expect(
      isFastingDay({ weekday: 5, fastingDays: [], dateIso: '2026-02-20', timeZone: 'Africa/Cairo' })
    ).toBe(true);

    // 5. One-off fasting toggles override auto detection
    expect(
      isFastingDay({ weekday: 2, fastingDays: [], fastingOverride: 'fasting' })
    ).toBe(true);
    expect(
      isFastingDay({ weekday: 6, fastingDays: [6], fastingOverride: 'normal' })
    ).toBe(false);

    // Unified across computeDailyRhythmPlan (hydration + Suhoor) for Saturday & tomorrow=Saturday
    const friBeforeSat = computeDailyRhythmPlan(
      { ...DEFAULT_LIFE_PROFILE, fastingDays: [6] },
      samplePrayers,
      { todayWeekday: 5, tomorrowWeekday: 6 }
    );
    expect(friBeforeSat.isFastingToday).toBe(false);
    expect(friBeforeSat.isFastingTomorrow).toBe(true);
    expect(friBeforeSat.suhoorStartMin).toBe(4 * 60 + 30 - DEFAULT_LIFE_PROFILE.suhoorLeadMinutes);

    const satPlan = computeDailyRhythmPlan(
      { ...DEFAULT_LIFE_PROFILE, fastingDays: [6] },
      samplePrayers,
      { todayWeekday: 6, tomorrowWeekday: 0 }
    );
    expect(satPlan.isFastingToday).toBe(true);
    expect(satPlan.isFastingTomorrow).toBe(false);

    // Conflict check also honors Ramadan / one-off fasting even when fastingDays is empty
    const conflictOnOneOffFast = checkSmartScheduleConflict({
      time24: '10:00',
      isOralMedication: true,
      prayers: samplePrayers,
      plan: computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, samplePrayers, {
        todayWeekday: 2,
        tomorrowWeekday: 3,
        fastingOverride: 'fasting',
      }),
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks: [],
    });
    expect(conflictOnOneOffFast.hasConflict).toBe(true);
    expect(conflictOnOneOffFast.warnings.some((w) => w.includes('الصيام'))).toBe(true);
  });

  it('suppresses all hydration slots between Fajr and Maghrib and redistributes to Maghrib-Fajr on any fasting day', () => {
    const fajrMin = 4 * 60 + 30;
    const maghribMin = 18 * 60;

    const plans = [
      // Saturday custom fast + tight 10-min suhoor lead edge case
      computeDailyRhythmPlan(
        { ...DEFAULT_LIFE_PROFILE, fastingDays: [6], suhoorLeadMinutes: 10 },
        samplePrayers,
        { todayWeekday: 6, tomorrowWeekday: 0 }
      ),
      // White day
      computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, samplePrayers, {
        todayWeekday: 1,
        tomorrowWeekday: 2,
        todayIso: '2026-11-23',
        timeZone: 'Africa/Cairo',
      }),
      // Ramadan
      computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, samplePrayers, {
        todayWeekday: 5,
        tomorrowWeekday: 6,
        todayIso: '2026-02-20',
        timeZone: 'Africa/Cairo',
      }),
      // One-off toggle
      computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, samplePrayers, {
        todayWeekday: 2,
        tomorrowWeekday: 3,
        fastingOverride: 'fasting',
      }),
    ];

    for (const plan of plans) {
      expect(plan.isFastingToday).toBe(true);
      expect(plan.hydrationSlots.length).toBeGreaterThanOrEqual(3);
      for (const slot of plan.hydrationSlots) {
        const insideFast = slot.timeMinutes >= fajrMin && slot.timeMinutes < maghribMin;
        expect(insideFast).toBe(false);
      }
      expect(plan.hydrationSlots[0].windowAr).toBe('السحور');
      expect(plan.hydrationSlots.some((s) => s.windowAr === 'عند الإفطار')).toBe(true);
    }
  });

  it('applies all medication fastingPolicy behaviors without mutating saved recurring times', () => {
    const fajrMin = 4 * 60 + 30; // 04:30 -> Fajr - 15m = 04:15
    const maghribMin = 18 * 60; // 18:00 -> Maghrib + 15m = 18:15

    const baseMed: MedicationItem = {
      id: 'med_1',
      name: 'فيتامين د',
      time24: '08:00',
      times24: ['08:00', '15:00', '21:00'],
      doseNote: 'مع وجبة',
      takenDateKey: '',
      calendarEventId: '',
    };

    // 1. auto-nearest (default): 08:00 -> 04:15, 15:00 -> 18:15, 21:00 -> 21:00
    const autoRes = resolveMedicationDosesForDay(baseMed, {
      isFastingToday: true,
      fajrMin,
      maghribMin,
    });
    expect(autoRes.doses.map((d) => d.effectiveTime24)).toEqual(['04:15', '18:15', '21:00']);
    expect(autoRes.doses.map((d) => d.wasShifted)).toEqual([true, true, false]);
    // Original recurring times must remain untouched
    expect(baseMed.time24).toBe('08:00');
    expect(baseMed.times24).toEqual(['08:00', '15:00', '21:00']);

    // 2. before-fajr: all daytime doses -> 04:15
    const beforeFajrRes = resolveMedicationDosesForDay(
      { ...baseMed, fastingPolicy: 'before-fajr' },
      { isFastingToday: true, fajrMin, maghribMin }
    );
    expect(beforeFajrRes.doses.map((d) => d.effectiveTime24)).toEqual(['04:15', '04:15', '21:00']);

    // 3. after-maghrib: all daytime doses -> 18:15
    const afterMaghribRes = resolveMedicationDosesForDay(
      { ...baseMed, fastingPolicy: 'after-maghrib' },
      { isFastingToday: true, fajrMin, maghribMin }
    );
    expect(afterMaghribRes.doses.map((d) => d.effectiveTime24)).toEqual(['18:15', '18:15', '21:00']);

    // 4. skip: omits daytime doses, keeps 21:00
    const skipRes = resolveMedicationDosesForDay(
      { ...baseMed, fastingPolicy: 'skip' },
      { isFastingToday: true, fajrMin, maghribMin }
    );
    expect(skipRes.skippedCount).toBe(2);
    expect(skipRes.doses.map((d) => d.effectiveTime24)).toEqual(['21:00']);

    // 5. unchanged: keeps all original times
    const unchangedRes = resolveMedicationDosesForDay(
      { ...baseMed, fastingPolicy: 'unchanged' },
      { isFastingToday: true, fajrMin, maghribMin }
    );
    expect(unchangedRes.doses.map((d) => d.effectiveTime24)).toEqual(['08:00', '15:00', '21:00']);
    expect(unchangedRes.doses.every((d) => !d.wasShifted)).toBe(true);

    // 6. Normal (non-fasting) day keeps all times unchanged regardless of policy
    const normalRes = resolveMedicationDosesForDay(
      { ...baseMed, fastingPolicy: 'skip' },
      { isFastingToday: false, fajrMin, maghribMin }
    );
    expect(normalRes.doses.map((d) => d.effectiveTime24)).toEqual(['08:00', '15:00', '21:00']);
  });

  it('reflects shifted and skipped medication doses in Android alarm payloads for fasting day only', () => {
    const fajrMin = 4 * 60 + 30;
    const maghribMin = 18 * 60;
    const meds: MedicationItem[] = [
      {
        id: 'med_morning',
        name: 'أوميجا 3',
        time24: '08:00',
        times24: ['08:00'],
        fastingPolicy: 'auto-nearest',
        doseNote: '',
        takenDateKey: '',
        calendarEventId: '',
      },
      {
        id: 'med_skip',
        name: 'مكمل نهاري',
        time24: '13:00',
        times24: ['13:00'],
        fastingPolicy: 'skip',
        doseNote: '',
        takenDateKey: '',
        calendarEventId: '',
      },
    ];

    const baseMs = Date.UTC(2026, 10, 28, 0, 0, 0);
    const common = {
      medications: meds,
      todayIso: '2026-11-28',
      todayWeekday: 6,
      fajrMin,
      maghribMin,
      nowMs: baseMs,
      snoozeMinutes: 5,
      msForMinuteToday: (min: number) => baseMs + min * 60_000,
      isSilencedAt: () => false,
    };

    const fastingAlarms = buildMedicationAlarmEntries({ ...common, isFastingToday: true });
    expect(fastingAlarms).toHaveLength(1);
    expect(fastingAlarms[0].id).toBe('med_2026-11-28_med_morning_04:15');
    expect(fastingAlarms[0].triggerAtMs).toBe(baseMs + (4 * 60 + 15) * 60_000);

    const normalAlarms = buildMedicationAlarmEntries({ ...common, isFastingToday: false });
    expect(normalAlarms).toHaveLength(2);
    expect(normalAlarms.map((a) => a.id)).toEqual([
      'med_2026-11-28_med_morning_08:00',
      'med_2026-11-28_med_skip_13:00',
    ]);
  });
});
