import { describe, expect, it } from 'vitest';
import { PrayerTimeItem } from '../../types/dayrhythm';
import { DEFAULT_LIFE_PROFILE } from '../rhythm/constants';
import { computeDailyRhythmPlan } from '../rhythm/dailyPlan';
import {
  buildPrayerBlockedWindows,
  isMinuteInBlockedWindows,
} from './prayerAwareScheduler';

const SAMPLE_PRAYERS: PrayerTimeItem[] = [
  { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 30, alarmMinutes: 4 * 60 + 27, isObligatory: true },
  { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 6 * 60, alarmMinutes: 6 * 60, isObligatory: false },
  { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60, alarmMinutes: 11 * 60 + 57, isObligatory: true },
  { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 15 * 60 + 15, alarmMinutes: 15 * 60 + 12, isObligatory: true },
  { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 18 * 60, alarmMinutes: 17 * 60 + 57, isObligatory: true },
  { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 19 * 60 + 30, alarmMinutes: 19 * 60 + 27, isObligatory: true },
];

describe('prayerAwareScheduler', () => {
  it('avoids all prayer blocked windows on normal days while hitting full daily target', () => {
    const profile = { ...DEFAULT_LIFE_PROFILE, prayerSilenceMinutes: 25, fajrSilenceMinutes: 35 };
    const plan = computeDailyRhythmPlan(profile, SAMPLE_PRAYERS, {
      todayWeekday: 2, // Tuesday
      tomorrowWeekday: 3,
      fastingOverride: 'normal',
    });
    const blocked = buildPrayerBlockedWindows(SAMPLE_PRAYERS, profile, 2);

    expect(plan.hydrationSlots).toHaveLength(plan.activeTargetCups);
    for (const slot of plan.hydrationSlots) {
      expect(isMinuteInBlockedWindows(slot.timeMinutes, blocked)).toBe(false);
    }
  });

  it('enforces 50m Friday Dhuhr (Jumuah) window and honors larger user durations', () => {
    const defaultProfile = { ...DEFAULT_LIFE_PROFILE, prayerSilenceMinutes: 20 };
    const friWindows = buildPrayerBlockedWindows(SAMPLE_PRAYERS, defaultProfile, 5);
    const dhuhrWin = friWindows.find((w) => w.prayerId === 'dhuhr');
    expect(dhuhrWin).toEqual({
      prayerId: 'dhuhr',
      startMin: 12 * 60 - 3,
      endMin: 12 * 60 + 50,
    });

    const custom60 = { ...DEFAULT_LIFE_PROFILE, prayerSilenceMinutes: 60 };
    const friWindows60 = buildPrayerBlockedWindows(SAMPLE_PRAYERS, custom60, 5);
    expect(friWindows60.find((w) => w.prayerId === 'dhuhr')?.endMin).toBe(12 * 60 + 60);

    const friPlan = computeDailyRhythmPlan(defaultProfile, SAMPLE_PRAYERS, {
      todayWeekday: 5, // Friday
      tomorrowWeekday: 6,
      fastingOverride: 'normal',
    });
    expect(friPlan.hydrationSlots).toHaveLength(friPlan.activeTargetCups);
    for (const slot of friPlan.hydrationSlots) {
      expect(isMinuteInBlockedWindows(slot.timeMinutes, friWindows)).toBe(false);
    }
  });

  it('avoids all prayer windows on fasting days too while keeping full target outside fast', () => {
    const profile = { ...DEFAULT_LIFE_PROFILE, prayerSilenceMinutes: 20, fajrSilenceMinutes: 40 };
    const plan = computeDailyRhythmPlan(profile, SAMPLE_PRAYERS, {
      todayWeekday: 1, // Monday (fasting)
      tomorrowWeekday: 2,
      fastingOverride: 'fasting',
    });
    const blocked = buildPrayerBlockedWindows(SAMPLE_PRAYERS, profile, 1);

    expect(plan.hydrationSlots).toHaveLength(plan.activeTargetCups);
    for (const slot of plan.hydrationSlots) {
      expect(isMinuteInBlockedWindows(slot.timeMinutes, blocked)).toBe(false);
      const insideFast = slot.timeMinutes >= 4 * 60 + 30 && slot.timeMinutes < 18 * 60;
      expect(insideFast).toBe(false);
    }
  });
});
