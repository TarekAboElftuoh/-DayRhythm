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
} from '../lifeRhythmEngine';
import { DynamicHabit, MedicationItem, PrayerTimeItem, ScheduleBlock } from '../../types/dayrhythm';


describe('Phase 2: Free-Slot Engine (computeFreeWindows)', () => {
  const winterPrayers: PrayerTimeItem[] = [
    { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 5 * 60 + 18, alarmMinutes: 5 * 60 + 18, isObligatory: true },
    { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 6 * 60 + 48, alarmMinutes: 6 * 60 + 48, isObligatory: false },
    { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60, alarmMinutes: 12 * 60, isObligatory: true },
    { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 14 * 60 + 55, alarmMinutes: 14 * 60 + 55, isObligatory: true },
    { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 17 * 60 + 10, alarmMinutes: 17 * 60 + 10, isObligatory: true },
    { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 18 * 60 + 35, alarmMinutes: 18 * 60 + 35, isObligatory: true },
  ];

  const summerPrayers: PrayerTimeItem[] = [
    { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 8, alarmMinutes: 4 * 60 + 8, isObligatory: true },
    { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 5 * 60 + 50, alarmMinutes: 5 * 60 + 50, isObligatory: false },
    { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60 + 55, alarmMinutes: 12 * 60 + 55, isObligatory: true },
    { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 16 * 60 + 30, alarmMinutes: 16 * 60 + 30, isObligatory: true },
    { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 20 * 60, alarmMinutes: 20 * 60, isObligatory: true },
    { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 21 * 60 + 35, alarmMinutes: 21 * 60 + 35, isObligatory: true },
  ];

  const makeBlock = (id: string, startMin: number, durationMin: number): ScheduleBlock => ({
    id,
    emojiPair: '📅',
    categoryAr: id,
    categoryEn: id,
    startMin,
    durationMin,
    minDurationMin: durationMin,
    isAnchor: false,
    travelGroup: 'B_WORK',
    canShiftEvening: true,
    completed: false,
    deleted: false,
    source: 'google_calendar',
  });

  it('merges overlapping busy blocks cleanly and returns exact non-overlapping free slots with Arabic period labels', () => {
    const plan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 0, // Sun (non-fasting)
      tomorrowWeekday: 1,
      todayIso: '2026-11-29',
      tomorrowIso: '2026-11-30',
      timeZone: 'Africa/Cairo',
    });

    // Overlapping Google Calendar events + event overlapping Dhuhr prayer (12:00)
    const occupiedBlocks: ScheduleBlock[] = [
      makeBlock('ev1', 9 * 60, 90), // 09:00-10:30
      makeBlock('ev2', 10 * 60, 75), // 10:00-11:15 (overlaps ev1 -> merged 09:00-11:15)
      makeBlock('ev3', 11 * 60 + 45, 45), // 11:45-12:30 (overlaps Dhuhr 11:55-12:20 -> merged)
    ];

    const windows = computeFreeWindows({
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks,
    });

    expect(windows).toEqual([
      { startMin: 5 * 60 + 38, endMin: 9 * 60, durationMin: 202, label: 'بعد الفجر' },
      { startMin: 11 * 60 + 15, endMin: 11 * 60 + 45, durationMin: 30, label: 'الصباح' },
      { startMin: 12 * 60 + 30, endMin: 14 * 60 + 50, durationMin: 140, label: 'بعد الظهر' },
      { startMin: 15 * 60 + 15, endMin: 17 * 60 + 5, durationMin: 110, label: 'بعد العصر' },
      { startMin: 17 * 60 + 30, endMin: 18 * 60 + 30, durationMin: 60, label: 'بعد المغرب' },
      { startMin: 18 * 60 + 55, endMin: plan.bedtimeMin, durationMin: plan.bedtimeMin - (18 * 60 + 55), label: 'بعد العشاء' },
    ]);

    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startMin).toBeGreaterThan(windows[i - 1].endMin);
    }
  });

  it('excludes micro-gaps strictly shorter than 20 minutes while keeping >= 20m gaps', () => {
    const plan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 0,
      tomorrowWeekday: 0,
      fastingOverride: 'normal',
    });

    // Fajr ends at 05:38. Block 05:38-09:00, then 19m gap (09:00-09:19) excluded,
    // block 09:19-10:00, then 20m gap (10:00-10:20) included, block 10:20-11:55.
    const occupiedBlocks: ScheduleBlock[] = [
      makeBlock('morning_fill', 5 * 60 + 38, 9 * 60 - (5 * 60 + 38)),
      makeBlock('after_19m_gap', 9 * 60 + 19, 41), // ends 10:00
      makeBlock('after_20m_gap', 10 * 60 + 20, 95), // ends 11:55
    ];

    const windows = computeFreeWindows({
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks,
    });

    expect(windows.every((w) => w.durationMin >= 20)).toBe(true);
    expect(windows.some((w) => w.startMin === 9 * 60 && w.endMin === 9 * 60 + 19)).toBe(false);
    expect(windows).toContainEqual({
      startMin: 10 * 60,
      endMin: 10 * 60 + 20,
      durationMin: 20,
      label: 'الصباح',
    });
  });

  it('blocks out fasting Suhoor window, post-Fajr recovery, and summer recovery nap from free windows', () => {
    // 1. Ramadan summer short_night: Suhoor (03:23-04:08) + Post-Fajr (04:33-05:50) + Post-Dhuhr nap (13:30-13:55)
    const ramadanPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 5,
      tomorrowWeekday: 6,
      todayIso: '2026-02-20',
      tomorrowIso: '2026-02-21',
      timeZone: 'Africa/Cairo',
    });

    expect(ramadanPlan.isFastingToday).toBe(true);
    expect(ramadanPlan.suhoorStartMin).toBe(3 * 60 + 23);
    expect(ramadanPlan.postFajrStartMin).toBe(4 * 60 + 33);
    expect(ramadanPlan.postFajrEndMin).toBe(5 * 60 + 50);
    expect(ramadanPlan.qailulahStartMin).toBe(12 * 60 + 55 + 35);
    expect(ramadanPlan.qailulahDurationMin).toBe(25);

    const ramadanWindows = computeFreeWindows({
      prayers: summerPrayers,
      plan: ramadanPlan,
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks: [],
    });

    const suhoorStart = ramadanPlan.suhoorStartMin!;
    const fajrEnd = 4 * 60 + 8;
    const postFajrStart = ramadanPlan.postFajrStartMin!;
    const postFajrEnd = ramadanPlan.postFajrEndMin!;
    const napStart = ramadanPlan.qailulahStartMin!;
    const napEnd = napStart + ramadanPlan.qailulahDurationMin;

    for (const w of ramadanWindows) {
      expect(w.startMin < fajrEnd && w.endMin > suhoorStart).toBe(false);
      expect(w.startMin < postFajrEnd && w.endMin > postFajrStart).toBe(false);
      expect(w.startMin < napEnd && w.endMin > napStart).toBe(false);
      expect(w.durationMin).toBeGreaterThanOrEqual(20);
    }

    // 2. Mon/Thu early-summer medium_night: Suhoor (03:45-04:30) + 90m full-cycle Post-Dhuhr nap both excluded
    const earlySummerPrayers: PrayerTimeItem[] = [
      { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 30, alarmMinutes: 4 * 60 + 30, isObligatory: true },
      { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 6 * 60, alarmMinutes: 6 * 60, isObligatory: false },
      { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60 + 40, alarmMinutes: 12 * 60 + 40, isObligatory: true },
      { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 16 * 60 + 15, alarmMinutes: 16 * 60 + 15, isObligatory: true },
      { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 19 * 60 + 30, alarmMinutes: 19 * 60 + 30, isObligatory: true },
      { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 20 * 60 + 50, alarmMinutes: 20 * 60 + 50, isObligatory: true },
    ];
    const monThuSummerPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, earlySummerPrayers, {
      todayWeekday: 1, // Mon fasting
      tomorrowWeekday: 4, // Thu fasting -> Suhoor set
      fastingOverride: 'fasting',
    });
    expect(monThuSummerPlan.sleepMode).toBe('medium_night');
    expect(monThuSummerPlan.qailulahDurationMin).toBe(90);

    const mediumWindows = computeFreeWindows({
      prayers: earlySummerPrayers,
      plan: monThuSummerPlan,
      profile: DEFAULT_LIFE_PROFILE,
      occupiedBlocks: [],
    });
    const medNapStart = monThuSummerPlan.qailulahStartMin!;
    const medNapEnd = medNapStart + 90;
    for (const w of mediumWindows) {
      expect(w.startMin < medNapEnd && w.endMin > medNapStart).toBe(false);
      expect(w.startMin < 4 * 60 + 30 && w.endMin > 3 * 60 + 45).toBe(false);
    }
  });
});

