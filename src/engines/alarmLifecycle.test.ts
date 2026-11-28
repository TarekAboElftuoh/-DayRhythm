import { beforeEach, describe, expect, it } from 'vitest';
import {
  blockOccurrenceKeys,
  resolveBlockCompleteActions,
  resolveBlockDeleteActions,
  resolveGoogleEventDeletion,
} from './alarmLifecycle';
import { evaluateOccurrenceGate } from './alarmGate';
import {
  drainRingingOccurrences,
  loadDismissedOccurrenceKeys,
  markOccurrencesDismissed,
} from './alarmOccurrence';
import { DEFAULT_LIFE_PROFILE } from './rhythm/constants';
import { buildSleepAlarmEntries } from './rhythm/nativeAlarms';
import { computeDailyRhythmPlan } from './rhythm/dailyPlan';
import type { PrayerTimeItem, ScheduleBlock } from '../types/dayrhythm';

const DATE = '2026-11-28';
const BASE_MS = Date.UTC(2026, 10, 28, 0, 0, 0);

const prayers: PrayerTimeItem[] = [
  { id: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', emojiPair: '🌅', adhanMinutes: 4 * 60 + 8, alarmMinutes: 4 * 60 + 8, isObligatory: true },
  { id: 'sunrise', nameAr: 'الشروق', nameEn: 'Sunrise', emojiPair: '☀️', adhanMinutes: 5 * 60 + 50, alarmMinutes: 5 * 60 + 50, isObligatory: false },
  { id: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', emojiPair: '🕌', adhanMinutes: 12 * 60 + 55, alarmMinutes: 12 * 60 + 55, isObligatory: true },
  { id: 'asr', nameAr: 'العصر', nameEn: 'Asr', emojiPair: '🌤️', adhanMinutes: 16 * 60 + 30, alarmMinutes: 16 * 60 + 30, isObligatory: true },
  { id: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', emojiPair: '🌇', adhanMinutes: 20 * 60, alarmMinutes: 20 * 60, isObligatory: true },
  { id: 'isha', nameAr: 'العشاء', nameEn: 'Isha', emojiPair: '🌙', adhanMinutes: 21 * 60 + 35, alarmMinutes: 21 * 60 + 35, isObligatory: true },
];

function makeBlock(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: 'blk-1',
    emojiPair: '📅',
    categoryAr: 'اجتماع',
    startMin: 600,
    durationMin: 30,
    minDurationMin: 15,
    isAnchor: false,
    travelGroup: 'C_PORTABLE',
    canShiftEvening: true,
    completed: false,
    deleted: false,
    source: 'offline',
    ...overrides,
  };
}

describe('delete cancels the alarm', () => {
  it('produces the same occurrenceKey the reminder gate rings with', () => {
    const block = makeBlock();
    expect(blockOccurrenceKeys(block, DATE)).toEqual(['event_blk-1_2026-11-28_600']);
    expect(resolveBlockDeleteActions(block, DATE).occurrenceKeys).toEqual(['event_blk-1_2026-11-28_600']);
  });

  it('blocks any re-fire after the key is dismissed, even on a drifted clock', () => {
    const block = makeBlock();
    markOccurrencesDismissed(resolveBlockDeleteActions(block, DATE).occurrenceKeys, DATE);

    const dismissedKeys = loadDismissedOccurrenceKeys();
    const firedKeys = new Set<string>();
    for (const minute of [598, 599, 600, 601, 602]) {
      const result = evaluateOccurrenceGate({
        entityId: 'event_blk-1',
        dateIso: DATE,
        scheduledMinute: minute,
        nowMinute: minute,
        previousMinute: minute - 1,
        windowMinutes: 2,
        firedKeys,
        dismissedKeys,
      });
      expect(result.fire).toBe(false);
    }
    expect(firedKeys.size).toBe(0);
  });
});

describe('calendar: delete removes the event, Done preserves it', () => {
  it('delete returns the synced Google event id for removal', () => {
    const block = makeBlock({ id: 'g-1', source: 'google_calendar', googleEventId: 'evt_abc' });
    const actions = resolveBlockDeleteActions(block, DATE);
    expect(actions.deleteGoogleEvent).toBe(true);
    expect(actions.googleEventId).toBe('evt_abc');
    expect(actions.occurrenceKeys).toEqual(['event_g-1_2026-11-28_600']);
  });

  it('delete of a local (non Google) block never calls the Calendar API', () => {
    expect(resolveBlockDeleteActions(makeBlock(), DATE).deleteGoogleEvent).toBe(false);
    expect(resolveGoogleEventDeletion({ source: 'offline', googleEventId: 'evt_abc' }).deleteGoogleEvent).toBe(false);
    expect(resolveGoogleEventDeletion({ source: 'google_calendar' }).deleteGoogleEvent).toBe(false);
  });

  it('Done keeps the Google event intact while still dismissing the alarm', () => {
    const block = makeBlock({ id: 'g-2', source: 'google_calendar', googleEventId: 'evt_keep' });
    const actions = resolveBlockCompleteActions(block, DATE);
    expect(actions.deleteGoogleEvent).toBe(false);
    expect(actions.googleEventId).toBeUndefined();
    expect(actions.occurrenceKeys).toEqual(['event_g-2_2026-11-28_600']);
    expect(block.completed).toBe(false); // resolver never mutates the schedule item
  });
});

describe('wake-up alarm toggle', () => {
  const normalPlan = computeDailyRhythmPlan(DEFAULT_LIFE_PROFILE, prayers, {
    todayWeekday: 2,
    tomorrowWeekday: 3,
    todayIso: '2026-11-24',
    tomorrowIso: '2026-11-25',
    timeZone: 'Africa/Cairo',
  });

  const build = (enableWakeAlarm: boolean, plan = normalPlan) =>
    buildSleepAlarmEntries({
      plan,
      todayIso: DATE,
      nowMs: BASE_MS,
      snoozeMinutes: 5,
      msForMinuteToday: (min) => BASE_MS + min * 60_000,
      enableWakeAlarm,
    });

  it('defaults to enabled and schedules the real wake alarm at the computed wakeTime', () => {
    expect(DEFAULT_LIFE_PROFILE.enableWakeAlarm).toBe(true);
    expect(normalPlan.suhoorStartMin).toBeNull();

    const wake = build(true).find((alarm) => alarm.kind === 'sleep_wake');
    expect(wake).toBeDefined();
    expect(wake?.triggerAtMs).toBe(BASE_MS + normalPlan.wakeMin * 60_000);
    expect(wake?.title).toContain('استيقاظ');
  });

  it('cancels the wake alarm cleanly when disabled, leaving the other sleep alarms', () => {
    const alarms = build(false);
    expect(alarms.some((alarm) => alarm.kind === 'sleep_wake')).toBe(false);
    expect(alarms.some((alarm) => alarm.kind === 'sleep_bedtime')).toBe(true);
  });

  it('labels the same wake slot as Suhoor on a fasting day', () => {
    const fastingPlan = { ...normalPlan, suhoorStartMin: normalPlan.wakeMin };
    const wake = build(true, fastingPlan).find((alarm) => alarm.kind === 'sleep_wake');
    expect(wake?.triggerAtMs).toBe(BASE_MS + fastingPlan.wakeMin * 60_000);
    expect(wake?.title).toContain('السحور');
  });
});

beforeEach(() => {
  drainRingingOccurrences();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
