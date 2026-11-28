import { describe, it, expect } from 'vitest';
import {
  formatDurationAr,
  computeScientificHydration,
  computeMedicationDaysLeft,
  checkSmartScheduleConflict,
  computeDailyRhythmPlan,
  computeSeasonalSleepPlan,
  isFastingDay,
  resolveMedicationDosesForDay,
  buildMedicationAlarmEntries,
  buildSleepAlarmEntries,
  computeFreeWindows,
  findFreeTimeSlotsForToday,
  resolveHabitsForDay,
  buildDayTimelineModel,
  snapToValidFreeWindow,
  buildGhostSlotsForItem,
  DEFAULT_LIFE_PROFILE,
} from './lifeRhythmEngine';
import { DynamicHabit, MedicationItem, PrayerTimeItem, ScheduleBlock } from '../types/dayrhythm';

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

