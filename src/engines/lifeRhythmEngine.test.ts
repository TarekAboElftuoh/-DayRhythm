import { describe, it, expect } from 'vitest';
import {
  formatDurationAr,
  computeScientificHydration,
  checkSmartScheduleConflict,
  computeDailyRhythmPlan,
  DEFAULT_LIFE_PROFILE,
} from './lifeRhythmEngine';
import { PrayerTimeItem } from '../types/dayrhythm';

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
});
