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


describe('Phase 3: Day Timeline & Magnetic Snap', () => {
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
  it('routes items colliding with sleep, prayers, Suhoor, nap, or blocked anchors to unplacedBlocks without overlapping locked time', () => {
    const ramadanPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, summerPrayers, {
      todayWeekday: 5,
      tomorrowWeekday: 6,
      todayIso: '2026-02-20',
      tomorrowIso: '2026-02-21',
      timeZone: 'Africa/Cairo',
    });

    const collidingBlocks: ScheduleBlock[] = [
      {
        id: 'blk_sleep_hit',
        emojiPair: '💻',
        categoryAr: 'مراجعة DevOps متأخرة',
        startMin: 1 * 60 + 30, // 01:30 AM inside night sleep
        durationMin: 45,
        minDurationMin: 30,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: false,
        completed: false,
        deleted: false,
        source: 'offline',
      },
      {
        id: 'blk_prayer_hit',
        emojiPair: '📞',
        categoryAr: 'مكالمة عمل',
        startMin: 12 * 60 + 58, // hits Dhuhr (12:55)
        durationMin: 30,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: true,
        completed: false,
        deleted: false,
        source: 'offline',
      },
      {
        id: 'blk_valid',
        emojiPair: '📚',
        categoryAr: 'مذاكرة برمجة',
        startMin: 8 * 60 + 30,
        durationMin: 60,
        minDurationMin: 30,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: false,
        completed: false,
        deleted: false,
        source: 'offline',
      },
    ];

    const habits: DynamicHabit[] = [
      {
        id: 'h_post_fajr_blocked',
        title: 'قراءة بعد الفجر',
        status: 'active',
        anchor: 'after-fajr', // blocked by post-Fajr sleep in short_night -> must route to unplacedBlocks
        durationMin: 25,
        completedDates: [],
      },
      {
        id: 'h_duha_ok',
        title: 'ورد الضحى',
        status: 'active',
        anchor: 'duha',
        durationMin: 20,
        completedDates: [],
      },
    ];

    const timeline = buildDayTimelineModel({
      prayers: summerPrayers,
      plan: ramadanPlan,
      profile: DEFAULT_LIFE_PROFILE,
      habits,
      blocks: collidingBlocks,
      todayIso: '2026-02-20',
      weekday: 5,
      timeZone: 'Africa/Cairo',
    });

    // Locked blocks include prayers, Suhoor, Seasonal Sleep, post-Fajr sleep, and Qailulah nap
    expect(timeline.lockedBlocks.every((b) => b.isLocked)).toBe(true);
    expect(timeline.lockedBlocks.some((b) => b.kind === 'sleep')).toBe(true);
    expect(timeline.lockedBlocks.some((b) => b.kind === 'suhoor')).toBe(true);
    expect(timeline.lockedBlocks.filter((b) => b.kind === 'prayer')).toHaveLength(5);

    // Colliding blocks and blocked-anchor habit must go to unplacedBlocks, never placedBlocks
    const unplacedSourceIds = timeline.unplacedBlocks.map((u) => u.sourceId);
    expect(unplacedSourceIds).toContain('blk_sleep_hit');
    expect(unplacedSourceIds).toContain('blk_prayer_hit');
    expect(unplacedSourceIds).toContain('h_post_fajr_blocked');

    const sleepItem = timeline.unplacedBlocks.find((u) => u.sourceId === 'blk_sleep_hit')!;
    expect(sleepItem.conflictKind).toBe('sleep');
    expect(sleepItem.suggestedSlot).not.toBeNull();
    // Deep focus suggestion must stay outside Wind-Down Zone
    expect(sleepItem.suggestedSlot!.endMin).toBeLessThanOrEqual(timeline.windDownStartMin);

    const prayerItem = timeline.unplacedBlocks.find((u) => u.sourceId === 'blk_prayer_hit')!;
    expect(prayerItem.conflictKind).toBe('prayer');

    const placedIds = timeline.placedBlocks.map((p) => p.sourceId);
    expect(placedIds).toContain('blk_valid');
    expect(placedIds).toContain('h_duha_ok');
    expect(placedIds).not.toContain('blk_sleep_hit');
    expect(placedIds).not.toContain('blk_prayer_hit');
    expect(placedIds).not.toContain('h_post_fajr_blocked');
  });

  it('applies today-only dailyOverrides only on target date while keeping tomorrow dynamic anchor intact', async () => {
    const { sanitizeDynamicHabit } = await import('../../firebase');
    const todayIso = '2026-11-29';
    const tomorrowIso = '2026-11-30';

    const todayPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 0,
      tomorrowWeekday: 1,
      todayIso,
      tomorrowIso,
      fastingOverride: 'normal',
    });
    const tomorrowPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 1,
      tomorrowWeekday: 2,
      todayIso: tomorrowIso,
      tomorrowIso: '2026-12-01',
      fastingOverride: 'normal',
    });

    // Habit anchored permanently to 'duha' (~07:18), overridden today only to 15:30 (930m)
    const rawHabit: DynamicHabit = {
      id: 'h_override_test',
      title: 'قراءة تقنية',
      status: 'active',
      anchor: 'duha',
      durationMin: 30,
      completedDates: [],
      dailyOverrides: {
        [todayIso]: { startMin: 15 * 60 + 30, durationMin: 30, updatedAtMs: 1700000000000 },
      },
    };

    const sanitized = sanitizeDynamicHabit(rawHabit);
    expect(sanitized.dailyOverrides?.[todayIso]?.startMin).toBe(15 * 60 + 30);

    const todayTimeline = buildDayTimelineModel({
      prayers: winterPrayers,
      plan: todayPlan,
      profile: DEFAULT_LIFE_PROFILE,
      habits: [sanitized],
      todayIso,
      weekday: 0,
    });
    const placedToday = todayTimeline.placedBlocks.find((b) => b.habitId === 'h_override_test');
    expect(placedToday?.startMin).toBe(15 * 60 + 30);
    expect(placedToday?.isTodayOverride).toBe(true);

    // Tomorrow has no override -> dynamically uses permanent 'duha' anchor again
    const tomorrowTimeline = buildDayTimelineModel({
      prayers: winterPrayers,
      plan: tomorrowPlan,
      profile: DEFAULT_LIFE_PROFILE,
      habits: [sanitized],
      todayIso: tomorrowIso,
      weekday: 1,
    });
    const placedTomorrow = tomorrowTimeline.placedBlocks.find(
      (b) => b.habitId === 'h_override_test'
    );
    expect(placedTomorrow?.startMin).toBeLessThan(12 * 60);
    expect(placedTomorrow?.isTodayOverride).toBeUndefined();

    const resolvedTomorrow = resolveHabitsForDay({
      habits: [sanitized],
      prayers: winterPrayers,
      plan: tomorrowPlan,
      profile: DEFAULT_LIFE_PROFILE,
      todayIso: tomorrowIso,
      weekday: 1,
    });
    expect(resolvedTomorrow[0].slot?.startMin).toBeLessThan(12 * 60);
  });

  it('magnetic snap strictly rejects locked prayer and sleep intervals and snaps to nearest valid freeWindow', () => {
    const plan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, winterPrayers, {
      todayWeekday: 0,
      tomorrowWeekday: 1,
      todayIso: '2026-11-29',
      tomorrowIso: '2026-11-30',
      fastingOverride: 'normal',
    });
    const freeWindows = computeFreeWindows({
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
      todayIso: '2026-11-29',
    });

    // Target Dhuhr prayer window (12:05) -> must jump over Dhuhr (11:55..12:20) into valid freeWindow
    const dhuhrTarget = 12 * 60 + 5;
    const snapFromPrayer = snapToValidFreeWindow({
      targetStartMin: dhuhrTarget,
      durationMin: 30,
      freeWindows,
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
    });
    expect(snapFromPrayer.snapped).toBe(true);
    expect(snapFromPrayer.jumpedOverLocked).toBe(true);
    // Must not overlap Dhuhr [11:55..12:20]
    expect(snapFromPrayer.startMin < 12 * 60 + 20 && snapFromPrayer.endMin > 12 * 60 - 5).toBe(
      false
    );

    // Target deep inside night sleep (02:00 AM) -> must reject sleep and snap to earliest valid freeWindow after wake
    const snapFromSleep = snapToValidFreeWindow({
      targetStartMin: 2 * 60,
      durationMin: 30,
      freeWindows,
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
    });
    expect(snapFromSleep.snapped).toBe(true);
    expect(snapFromSleep.jumpedOverLocked).toBe(true);
    expect(snapFromSleep.startMin).toBeGreaterThanOrEqual(plan.wakeMin);
    expect(snapFromSleep.endMin).toBeLessThanOrEqual(plan.bedtimeMin);

    // Ghost slots never overlap locked prayers or sleep
    const ghosts = buildGhostSlotsForItem({
      durationMin: 30,
      freeWindows,
      prayers: winterPrayers,
      plan,
      profile: DEFAULT_LIFE_PROFILE,
    });
    expect(ghosts.length).toBeGreaterThan(0);
    for (const g of ghosts) {
      expect(g.startMin).toBeGreaterThanOrEqual(plan.wakeMin);
      expect(g.endMin).toBeLessThanOrEqual(plan.bedtimeMin);
      for (const p of winterPrayers.filter((pr) => pr.isObligatory)) {
        expect(g.startMin < p.adhanMinutes + 20 && g.endMin > p.adhanMinutes - 5).toBe(false);
      }
    }
  });
});

