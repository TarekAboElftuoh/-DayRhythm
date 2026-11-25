import { describe, it, expect } from 'vitest';
import { formatCountdown, pickActiveCountdownItem } from './useCountdown';

describe('useCountdown helpers', () => {
  it('formats > 60s in Arabic minutes/hours and <= 60s second-by-second down to 00:00 without الآن', () => {
    const atZero = formatCountdown(0);
    const atOneSec = formatCountdown(1_000);
    const atFortySevenSec = formatCountdown(47_000);
    const atSixtySec = formatCountdown(60_000);
    const atTwoMin = formatCountdown(120_000);
    const atNinetyFiveMin = formatCountdown(95 * 60_000);

    expect(atZero).not.toContain('الآن');
    expect(atZero).toMatch(/00:00|0 ث/);
    expect(atOneSec).toMatch(/00:01|1 ث/);
    expect(atFortySevenSec).toMatch(/00:47|47 ث/);
    expect(atSixtySec).toMatch(/01:00|60 ث/);
    expect(atTwoMin).not.toMatch(/:\d{2}/);
    expect(atTwoMin).toMatch(/2/);
    expect(atNinetyFiveMin).toMatch(/1 س/);
  });

  it('rolls over from expired primary item to the next future queue item immediately', () => {
    const now = 1_700_000_000_000;
    const primary = {
      emoji: '💧',
      title: 'كوب الماء 1',
      countdownText: '00:00',
      isNow: false,
      isUrgent: true,
      targetEpochMs: now - 500,
    };
    const queue = [
      primary,
      {
        emoji: '🕌',
        title: 'صلاة العصر',
        countdownText: '18 دقيقة',
        isNow: false,
        isUrgent: false,
        targetEpochMs: now + 18 * 60_000,
      },
      {
        emoji: '📅',
        title: 'موعد لاحق',
        countdownText: '45 دقيقة',
        isNow: false,
        isUrgent: false,
        targetEpochMs: now + 45 * 60_000,
      },
    ];

    const picked = pickActiveCountdownItem(primary, queue, now);
    expect(picked.targetEpochMs).toBe(now + 18 * 60_000);
    expect(picked.title).toBe('صلاة العصر');
  });

  it('keeps primary item while still in the future', () => {
    const now = 1_700_000_000_000;
    const primary = {
      emoji: '🕌',
      title: 'صلاة الظهر',
      countdownText: '00:45',
      isNow: false,
      isUrgent: true,
      targetEpochMs: now + 45_000,
    };
    const queue = [
      primary,
      {
        emoji: '💧',
        title: 'كوب ماء',
        countdownText: '30 دقيقة',
        isNow: false,
        isUrgent: false,
        targetEpochMs: now + 30 * 60_000,
      },
    ];

    const picked = pickActiveCountdownItem(primary, queue, now);
    expect(picked.targetEpochMs).toBe(now + 45_000);
    expect(picked.title).toBe('صلاة الظهر');
  });
});
