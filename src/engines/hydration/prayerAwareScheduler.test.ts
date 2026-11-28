import { describe, expect, it } from 'vitest';
import {
  FRIDAY_DHUHR_BLOCK_MINUTES,
  PRAYER_BLOCK_LEAD_MINUTES,
  applyPrayerAvoidance,
  buildPrayerAwareHydrationSlots,
  buildPrayerBlockedWindows,
  isMinuteInsidePrayerWindow,
  prayerBlockDurationMinutes,
} from './prayerAwareScheduler';
import { computeDailyRhythmPlan } from '../rhythm/dailyPlan';
import { DEFAULT_LIFE_PROFILE } from '../rhythm/constants';
import { wrap1440 } from '../rhythm/constants';
import type { HydrationScheduleSlot, PrayerTimeItem } from '../../types/dayrhythm';

const prayers: PrayerTimeItem[] = [
  { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 8, alarmMinutes: 4 * 60 + 8, isObligatory: true },
  { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 5 * 60 + 50, alarmMinutes: 5 * 60 + 50, isObligatory: false },
  { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60 + 55, alarmMinutes: 12 * 60 + 55, isObligatory: true },
  { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 16 * 60 + 30, alarmMinutes: 16 * 60 + 30, isObligatory: true },
  { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 20 * 60, alarmMinutes: 20 * 60, isObligatory: true },
  { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 21 * 60 + 35, alarmMinutes: 21 * 60 + 35, isObligatory: true },
];

const profile = DEFAULT_LIFE_PROFILE;

function planFor(todayWeekday: number, tomorrowWeekday: number, todayIso: string) {
  return computeDailyRhythmPlan(profile, prayers, {
    todayWeekday,
    tomorrowWeekday,
    todayIso,
    timeZone: 'Africa/Cairo',
  });
}

describe('prayer blocked windows', () => {
  it('starts 3 minutes before the Adhan and uses the configured durations', () => {
    const windows = buildPrayerBlockedWindows({
      prayers,
      prayerSilenceMinutes: 20,
      fajrSilenceMinutes: 40,
      isFriday: false,
    });
    expect(windows.map((w) => w.prayerId)).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

    const fajr = windows.find((w) => w.prayerId === 'fajr')!;
    expect(fajr.startMinutes).toBe(wrap1440(4 * 60 + 8 - PRAYER_BLOCK_LEAD_MINUTES));
    expect(fajr.durationMinutes).toBe(40);

    const dhuhr = windows.find((w) => w.prayerId === 'dhuhr')!;
    expect(dhuhr.durationMinutes).toBe(20);
    expect(dhuhr.endMinutes - dhuhr.startMinutes).toBe(PRAYER_BLOCK_LEAD_MINUTES + 20);
  });

  it('enforces 50 minutes for Friday Dhuhr (Jumu\'ah) even when 20 is configured', () => {
    const friday = buildPrayerBlockedWindows({
      prayers,
      prayerSilenceMinutes: 20,
      fajrSilenceMinutes: 40,
      isFriday: true,
    });
    const dhuhr = friday.find((w) => w.prayerId === 'dhuhr')!;
    expect(dhuhr.durationMinutes).toBe(FRIDAY_DHUHR_BLOCK_MINUTES);
    expect(dhuhr.endMinutes - dhuhr.startMinutes).toBe(PRAYER_BLOCK_LEAD_MINUTES + 50);

    // 12:55 Dhuhr on Friday: blocked from 12:52 through 13:45 (exclusive end = 13:45+).
    const adhan = 12 * 60 + 55;
    expect(isMinuteInsidePrayerWindow(adhan - 3, friday)).toBe(true);
    expect(isMinuteInsidePrayerWindow(adhan + 20, friday)).toBe(true);
    expect(isMinuteInsidePrayerWindow(adhan + 45, friday)).toBe(true);
    expect(isMinuteInsidePrayerWindow(adhan + 51, friday)).toBe(false);

    // Non-Friday the same minute is already allowed again after the configured 20m.
    const saturday = buildPrayerBlockedWindows({
      prayers,
      prayerSilenceMinutes: 20,
      fajrSilenceMinutes: 40,
      isFriday: false,
    });
    expect(isMinuteInsidePrayerWindow(adhan + 45, saturday)).toBe(false);
    expect(prayerBlockDurationMinutes({ id: 'dhuhr' }, {
      prayerSilenceMinutes: 20,
      fajrSilenceMinutes: 40,
      isFriday: true,
    })).toBe(50);
  });
});

describe('hydration cups never collide with a prayer', () => {
  it('keeps every cup out of every window and still hits the full target (Friday, non-fasting)', () => {
    const plan = planFor(5, 6, '2026-11-27');
    const windows = buildPrayerBlockedWindows({
      prayers,
      prayerSilenceMinutes: profile.prayerSilenceMinutes,
      fajrSilenceMinutes: profile.fajrSilenceMinutes,
      isFriday: true,
    });

    expect(plan.hydrationSlots.length).toBe(plan.activeTargetCups);
    const minutes = plan.hydrationSlots.map((slot) => slot.timeMinutes);
    expect(new Set(minutes).size).toBe(minutes.length);
    for (const minute of minutes) {
      expect(isMinuteInsidePrayerWindow(minute, windows)).toBe(false);
    }
    // The 50-minute Jumu'ah window specifically holds zero cups.
    const dhuhrAdhan = 12 * 60 + 55;
    expect(
      minutes.some(
        (m) => m >= wrap1440(dhuhrAdhan - 3) && m <= dhuhrAdhan + FRIDAY_DHUHR_BLOCK_MINUTES
      )
    ).toBe(false);
  });

  it('keeps the target on a fasting day (Suhoor + evening cups)', () => {
    const plan = planFor(1, 2, '2026-11-23');
    const windows = buildPrayerBlockedWindows({
      prayers,
      prayerSilenceMinutes: profile.prayerSilenceMinutes,
      fajrSilenceMinutes: profile.fajrSilenceMinutes,
      isFriday: false,
    });
    expect(plan.isFastingToday).toBe(true);
    expect(plan.hydrationSlots.length).toBe(plan.activeTargetCups);
    for (const slot of plan.hydrationSlots) {
      expect(isMinuteInsidePrayerWindow(slot.timeMinutes, windows)).toBe(false);
    }
    expect(plan.hydrationSlots.some((s) => s.windowAr === 'السحور')).toBe(true);
    expect(plan.hydrationSlots.some((s) => s.windowAr === 'عند الإفطار')).toBe(true);
  });

  it('shifts a cup sitting on the Adhan to right after the prayer, without losing a cup', () => {
    const windows = buildPrayerBlockedWindows({
      prayers,
      prayerSilenceMinutes: 20,
      fajrSilenceMinutes: 40,
      isFriday: false,
    });
    const colliding: HydrationScheduleSlot[] = [
      { cupIndex: 1, timeMinutes: 12 * 60 + 55, windowAr: '', noteAr: '' },
      { cupIndex: 2, timeMinutes: 18 * 60, windowAr: '', noteAr: '' },
    ];
    const shifted = applyPrayerAvoidance(colliding, windows);
    expect(shifted).toHaveLength(2);
    expect(shifted.map((s) => s.cupIndex)).toEqual([1, 2]);
    expect(shifted[0].timeMinutes).not.toBe(12 * 60 + 55);
    expect(isMinuteInsidePrayerWindow(shifted[0].timeMinutes, windows)).toBe(false);
    expect(shifted[1].timeMinutes).toBe(18 * 60);
  });

  it('meets the target with a dense schedule and no windows', () => {
    const slots = buildPrayerAwareHydrationSlots({
      isFastingToday: false,
      activeTargetCups: 12,
      fajr: 4 * 60 + 8,
      maghrib: 20 * 60,
      bedtimeMin: 23 * 60,
      prayers,
      prayerSilenceMinutes: 20,
      fajrSilenceMinutes: 40,
      isFridayToday: false,
    });
    expect(slots).toHaveLength(12);
    expect(new Set(slots.map((s) => s.timeMinutes)).size).toBe(12);
  });
});
