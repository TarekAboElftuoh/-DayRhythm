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


describe('Phase 1: Seasonal Sleep Solver, Mon/Thu Defaults & Hidden-Until-Ramadan', () => {
  it('defaults fasting weekdays to Mon/Thu and disables White Days by default', () => {
    expect(DEFAULT_LIFE_PROFILE.fastingDays).toEqual([1, 4]);
    expect(DEFAULT_LIFE_PROFILE.whiteDaysEnabled).toBe(false);
    expect(DEFAULT_LIFE_PROFILE.fastingWhiteDays).toBe(false);
    // Monday (1) & Thursday (4) fast by default; Tuesday (2) does not even on a White Day
    expect(isFastingDay({ weekday: 1, fastingDays: DEFAULT_LIFE_PROFILE.fastingDays })).toBe(true);
    expect(isFastingDay({ weekday: 4, fastingDays: DEFAULT_LIFE_PROFILE.fastingDays })).toBe(true);
    expect(
      isFastingDay({
        weekday: 2,
        fastingDays: DEFAULT_LIFE_PROFILE.fastingDays,
        dateIso: '2026-11-23',
        timeZone: 'Africa/Cairo',
      })
    ).toBe(false);
  });

  it('solves winter long night as single continuous sleep with zero nap', () => {
    const winterSleep = computeSeasonalSleepPlan({
      fajrMin: 5 * 60 + 18, // 05:18
      sunriseMin: 6 * 60 + 48,
      dhuhrMin: 12 * 60,
      asrMin: 14 * 60 + 55,
      maghribMin: 17 * 60 + 10,
      ishaMin: 18 * 60 + 35, // 18:35 -> earliestBed = 19:05
      isFasting: false,
      isRamadan: false,
    });

    expect(winterSleep.mode).toBe('long_night');
    expect(winterSleep.wakeTimeMin).toBe(5 * 60 + 3); // Fajr - 15m
    expect(winterSleep.earliestBedtimeMin).toBe(19 * 60 + 5); // Isha + 30m
    expect(winterSleep.nightSleepMin).toBe(450);
    expect(winterSleep.bedtimeMin).toBe(21 * 60 + 33); // 05:03 - 7.5h = 21:33
    expect(winterSleep.postDhuhrNapDurationMin).toBe(0);
    expect(winterSleep.postDhuhrNapStartMin).toBeNull();
    expect(winterSleep.postFajrDurationMin).toBe(0);
  });

  it('solves summer medium night (normal & Mon/Thu fasting) with 25m or 90m post-Dhuhr nap without touching sunlight', () => {
    // Normal day with small deficit (<= 45m) -> 25m light post-Dhuhr nap
    // Isha 20:50 -> bed 21:20; Fajr 04:30 -> wake 04:15; available = 415m (deficit = 35m <= 45m)
    const mediumSmallDeficit = computeSeasonalSleepPlan({
      fajrMin: 4 * 60 + 30,
      sunriseMin: 6 * 60,
      dhuhrMin: 12 * 60 + 40,
      asrMin: 16 * 60 + 15,
      maghribMin: 19 * 60 + 30,
      ishaMin: 20 * 60 + 50,
      isFasting: false,
      isRamadan: false,
    });
    expect(mediumSmallDeficit.mode).toBe('medium_night');
    expect(mediumSmallDeficit.availableNightMin).toBe(415);
    expect(mediumSmallDeficit.postDhuhrNapDurationMin).toBe(25);
    expect(mediumSmallDeficit.postDhuhrNapStartMin).toBeGreaterThanOrEqual(12 * 60 + 40 + 35);
    expect(
      mediumSmallDeficit.postDhuhrNapStartMin! + mediumSmallDeficit.postDhuhrNapDurationMin
    ).toBeLessThanOrEqual(19 * 60 + 30 - 45);

    // Mon/Thu fasting day in early summer (deficit > 45m) -> 90m full-cycle post-Dhuhr nap
    // Isha 20:50 -> bed 21:20; Fajr 04:30 -> Suhoor wake 03:45 (Fajr - 45m); available = 385m (deficit = 65m > 45m)
    const mediumFasting = computeSeasonalSleepPlan({
      fajrMin: 4 * 60 + 30,
      sunriseMin: 6 * 60,
      dhuhrMin: 12 * 60 + 40,
      asrMin: 16 * 60 + 15,
      maghribMin: 19 * 60 + 30,
      ishaMin: 20 * 60 + 50,
      isFasting: true,
      isRamadan: false,
    });
    expect(mediumFasting.mode).toBe('medium_night');
    expect(mediumFasting.wakeTimeMin).toBe(3 * 60 + 45);
    expect(mediumFasting.availableNightMin).toBe(385);
    expect(mediumFasting.postDhuhrNapDurationMin).toBe(90);
    expect(mediumFasting.postDhuhrNapStartMin).toBeGreaterThan(6 * 60 + 75); // Strictly after morning sunlight/Duha
    expect(mediumFasting.postDhuhrNapStartMin! + 90).toBeLessThanOrEqual(16 * 60 + 15 - 15); // Before Asr
    expect(mediumFasting.postDhuhrNapStartMin! + 90).toBeLessThanOrEqual(19 * 60 + 30 - 45); // Before pre-Maghrib light
  });

  it('solves summer Ramadan short night with post-Fajr recovery capped at Sunrise + light 25m Dhuhr nap', () => {
    // Summer solstice Ramadan: Isha 21:35 -> Taraweeh bed 23:05; Fajr 04:08 -> Suhoor wake 03:23; available = 258m (< 330m)
    const ramadanSummer = computeSeasonalSleepPlan({
      fajrMin: 4 * 60 + 8,
      sunriseMin: 5 * 60 + 50,
      dhuhrMin: 12 * 60 + 55,
      asrMin: 16 * 60 + 30,
      maghribMin: 20 * 60,
      ishaMin: 21 * 60 + 35,
      isFasting: true,
      isRamadan: true,
    });

    expect(ramadanSummer.mode).toBe('short_night');
    expect(ramadanSummer.earliestBedtimeMin).toBe(23 * 60 + 5); // Isha + 90m
    expect(ramadanSummer.wakeTimeMin).toBe(3 * 60 + 23); // Fajr - 45m
    expect(ramadanSummer.availableNightMin).toBe(258);
    expect(ramadanSummer.postFajrStartMin).toBe(4 * 60 + 33); // Fajr + 25m
    expect(ramadanSummer.postFajrEndMin).toBeLessThanOrEqual(5 * 60 + 50); // Capped at/before Sunrise
    expect(ramadanSummer.postFajrDurationMin).toBe(77);
    expect(ramadanSummer.postDhuhrNapDurationMin).toBe(25);
    expect(ramadanSummer.postDhuhrNapStartMin).toBe(12 * 60 + 55 + 35);
  });

  it('exposes isRamadan === false outside Hijri month 9 and feeds resolved sleep/nap into schedule & Android alarms', () => {
    const summerPrayers: PrayerTimeItem[] = [
      { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 8, alarmMinutes: 4 * 60 + 8, isObligatory: true },
      { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 5 * 60 + 50, alarmMinutes: 5 * 60 + 50, isObligatory: false },
      { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60 + 55, alarmMinutes: 12 * 60 + 55, isObligatory: true },
      { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 16 * 60 + 30, alarmMinutes: 16 * 60 + 30, isObligatory: true },
      { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 20 * 60, alarmMinutes: 20 * 60, isObligatory: true },
      { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 21 * 60 + 35, alarmMinutes: 21 * 60 + 35, isObligatory: true },
    ];

    // Normal non-Ramadan date (18 Jumada II 1448 AH)
    const normalPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 6,
      tomorrowWeekday: 0,
      todayIso: '2026-11-28',
      tomorrowIso: '2026-11-29',
      timeZone: 'Africa/Cairo',
    });
    expect(normalPlan.isRamadan).toBe(false);

    // Eid al-Fitr (1 Shawwal 1447 AH = 2026-03-20) -> Ramadan auto-disappears
    const eidPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 5,
      tomorrowWeekday: 6,
      todayIso: '2026-03-20',
      tomorrowIso: '2026-03-21',
      timeZone: 'Africa/Cairo',
    });
    expect(eidPlan.isRamadan).toBe(false);

    // Ramadan day (3 Ramadan 1447 AH = 2026-02-20) -> auto-detected Ramadan short summer night
    const ramadanPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 5,
      tomorrowWeekday: 6,
      todayIso: '2026-02-20',
      tomorrowIso: '2026-02-21',
      timeZone: 'Africa/Cairo',
    });
    expect(ramadanPlan.isRamadan).toBe(true);
    expect(ramadanPlan.sleepMode).toBe('short_night');
    expect(ramadanPlan.qailulahDurationMin).toBe(25);
    expect(ramadanPlan.postFajrDurationMin).toBe(77);

    // Free slots exclude Post-Fajr recovery & Post-Dhuhr nap
    const freeSlots = findFreeTimeSlotsForToday(summerPrayers, ramadanPlan, DEFAULT_LIFE_PROFILE, []);
    const napStart = ramadanPlan.qailulahStartMin!;
    const napEnd = napStart + ramadanPlan.qailulahDurationMin;
    for (const slot of freeSlots) {
      const overlapsNap = slot.startMin < napEnd && slot.endMin > napStart;
      expect(overlapsNap).toBe(false);
    }

    // Android alarm payloads include wake/Suhoor, bedtime, post-Fajr recovery wake, and nap wake
    const baseMs = Date.UTC(2026, 1, 20, 0, 0, 0);
    const sleepAlarms = buildSleepAlarmEntries({
      plan: ramadanPlan,
      todayIso: '2026-02-20',
      nowMs: baseMs,
      snoozeMinutes: 5,
      msForMinuteToday: (min) => baseMs + min * 60_000,
    });
    expect(sleepAlarms.map((a) => a.kind)).toEqual([
      'sleep_wake',
      'sleep_bedtime',
      'sleep_post_fajr_wake',
      'sleep_nap_wake',
    ]);
  });
});

