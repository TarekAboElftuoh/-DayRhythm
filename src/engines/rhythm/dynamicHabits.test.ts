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


describe('Phase 3: Dynamic DayRhythm Habits (resolveHabitsForDay)', () => {
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

  it('anchors active habits dynamically to prayer/sun windows and shifts cleanly across winter vs summer', () => {
    const habits: DynamicHabit[] = [
      {
        id: 'h_sun',
        title: 'مشي وضوء الشروق',
        status: 'active',
        anchor: 'sunrise-light',
        durationMin: 20,
        completedDates: [],
      },
      {
        id: 'h_asr',
        title: 'قراءة بعد العصر',
        status: 'active',
        anchor: 'after-asr',
        durationMin: 30,
        completedDates: [],
      },
      {
        id: 'h_maghrib',
        title: 'أذكار المساء قبل المغرب',
        status: 'active',
        anchor: 'pre-maghrib',
        durationMin: 20,
        completedDates: [],
      },
    ];

    const winterPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 0,
      tomorrowWeekday: 1,
      todayIso: '2026-11-29',
      tomorrowIso: '2026-11-30',
      fastingOverride: 'normal',
    });
    const summerPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 0,
      tomorrowWeekday: 1,
      todayIso: '2026-06-21',
      tomorrowIso: '2026-06-22',
      fastingOverride: 'normal',
    });

    const winterResolved = resolveHabitsForDay({
      habits,
      prayers: winterPrayers,
      plan: winterPlan,
      profile: DEFAULT_LIFE_PROFILE,
      todayIso: '2026-11-29',
      weekday: 0,
    });
    const summerResolved = resolveHabitsForDay({
      habits,
      prayers: summerPrayers,
      plan: summerPlan,
      profile: DEFAULT_LIFE_PROFILE,
      todayIso: '2026-06-21',
      weekday: 0,
    });

    // Winter sunrise is 06:48 -> sunrise-light starts 07:03; summer sunrise is 05:50 -> 06:05
    expect(winterResolved[0].slot?.startMin).toBe(6 * 60 + 48 + 15);
    expect(summerResolved[0].slot?.startMin).toBe(5 * 60 + 50 + 15);
    expect(summerResolved[0].slot!.startMin).toBeLessThan(winterResolved[0].slot!.startMin);

    // Winter Asr is 14:55 -> after-asr starts 15:15; summer Asr is 16:30 -> 16:50
    expect(winterResolved[1].slot?.startMin).toBe(14 * 60 + 55 + 20);
    expect(summerResolved[1].slot?.startMin).toBe(16 * 60 + 30 + 20);

    // Pre-maghrib hugs Maghrib - 5m buffer in both seasons
    expect(winterResolved[2].slot?.endMin).toBe(17 * 60 + 10 - 5);
    expect(summerResolved[2].slot?.endMin).toBe(20 * 60 - 5);
    expect(winterResolved.every((r) => !r.isFallbackSlot)).toBe(true);
    expect(summerResolved.every((r) => !r.isFallbackSlot)).toBe(true);
  });

  it('never overlaps habits with prayers, naps, Suhoor, or Google Calendar events and falls back gracefully', () => {
    const ramadanPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 5,
      tomorrowWeekday: 6,
      todayIso: '2026-02-20',
      tomorrowIso: '2026-02-21',
      timeZone: 'Africa/Cairo',
    });

    // Block the entire after-asr window (16:30..20:00) with a Google Calendar meeting
    const calendarEvents = [
      {
        id: 'cal_meeting',
        summary: 'اجتماع عمل طويل',
        start: '2026-02-20T16:50:00+02:00',
        end: '2026-02-20T19:55:00+02:00',
        description: '',
      },
    ];

    const habits: DynamicHabit[] = [
      {
        id: 'h_fajr',
        title: 'ورد بعد الفجر',
        status: 'active',
        anchor: 'after-fajr', // Blocked by post-Fajr recovery sleep in short_night -> falls back cleanly
        durationMin: 25,
        completedDates: [],
      },
      {
        id: 'h_dhuhr',
        title: 'مراجعة بعد الظهر',
        status: 'active',
        anchor: 'after-dhuhr', // Must avoid Dhuhr prayer AND post-Dhuhr 25m nap (13:30..13:55)
        durationMin: 30,
        completedDates: [],
      },
      {
        id: 'h_asr_blocked',
        title: 'رياضة بعد العصر',
        status: 'active',
        anchor: 'after-asr', // Entire after-asr blocked by Google Calendar -> nearest free window
        durationMin: 30,
        completedDates: [],
      },
    ];

    const resolved = resolveHabitsForDay({
      habits,
      prayers: summerPrayers,
      plan: ramadanPlan,
      profile: DEFAULT_LIFE_PROFILE,
      calendarEvents,
      todayIso: '2026-02-20',
      weekday: 5,
      timeZone: 'Africa/Cairo',
    });

    const suhoorStart = ramadanPlan.suhoorStartMin!;
    const fajrMin = 4 * 60 + 8;
    const postFajrStart = ramadanPlan.postFajrStartMin!;
    const postFajrEnd = ramadanPlan.postFajrEndMin!;
    const napStart = ramadanPlan.qailulahStartMin!;
    const napEnd = napStart + ramadanPlan.qailulahDurationMin;
    const calStart = 16 * 60 + 50;
    const calEnd = 19 * 60 + 55;

    for (let i = 0; i < resolved.length; i++) {
      const slot = resolved[i].slot!;
      expect(slot).not.toBeNull();
      // Never overlaps Suhoor, post-Fajr sleep, nap, or Google Calendar meeting
      expect(slot.startMin < fajrMin && slot.endMin > suhoorStart).toBe(false);
      expect(slot.startMin < postFajrEnd && slot.endMin > postFajrStart).toBe(false);
      expect(slot.startMin < napEnd && slot.endMin > napStart).toBe(false);
      expect(slot.startMin < calEnd && slot.endMin > calStart).toBe(false);
      // Never overlaps obligatory prayers (-5m..+20m)
      for (const p of summerPrayers.filter((pr) => pr.isObligatory)) {
        expect(slot.startMin < p.adhanMinutes + 20 && slot.endMin > p.adhanMinutes - 5).toBe(false);
      }
      // Never overlaps other habits
      for (let j = i + 1; j < resolved.length; j++) {
        const other = resolved[j].slot!;
        expect(slot.startMin < other.endMin && slot.endMin > other.startMin).toBe(false);
      }
    }

    expect(resolved[0].isFallbackSlot).toBe(true);
    expect(resolved[2].isFallbackSlot).toBe(true);
  });

  it('excludes planned habits from today schedule until activated', () => {
    const plan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 0,
      tomorrowWeekday: 1,
      fastingOverride: 'normal',
    });

    const habits: DynamicHabit[] = [
      {
        id: 'h_active',
        title: 'عادة حالية',
        status: 'active',
        anchor: 'duha',
        durationMin: 30,
        completedDates: ['2026-11-29'],
      },
      {
        id: 'h_planned',
        title: 'عادة مستقبلية',
        status: 'planned',
        anchor: 'duha',
        durationMin: 30,
        completedDates: [],
      },
    ];

    const beforeActivate = resolveHabitsForDay({
      habits,
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      todayIso: '2026-11-29',
      weekday: 0,
    });

    expect(beforeActivate).toHaveLength(1);
    expect(beforeActivate[0].habit.id).toBe('h_active');
    expect(beforeActivate[0].completedToday).toBe(true);
    expect(beforeActivate.some((r) => r.habit.id === 'h_planned')).toBe(false);

    const activatedHabits: DynamicHabit[] = habits.map((h) =>
      h.id === 'h_planned' ? { ...h, status: 'active' } : h
    );
    const afterActivate = resolveHabitsForDay({
      habits: activatedHabits,
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      todayIso: '2026-11-29',
      weekday: 0,
    });

    expect(afterActivate).toHaveLength(2);
    expect(afterActivate.some((r) => r.habit.id === 'h_planned' && r.slot !== null)).toBe(true);
  });

});
