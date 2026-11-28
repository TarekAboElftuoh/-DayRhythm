import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateOccurrenceGate, observeTick, type OccurrenceGateInput } from './alarmGate';
import {
  applyRemoteDismissedOccurrences,
  isOccurrenceDismissedNear,
  loadDismissedOccurrenceKeys,
  loadFiredOccurrenceKeys,
  markOccurrenceDismissed,
  markOccurrenceFired,
  occurrenceDriftKeys,
  occurrenceKey,
  readOccurrenceKeysFrom,
  rememberRingingOccurrence,
  drainRingingOccurrences,
} from './alarmOccurrence';

const DATE = '2026-11-28';

function gateInput(overrides: Partial<OccurrenceGateInput> = {}): OccurrenceGateInput {
  return {
    entityId: 'water_3',
    dateIso: DATE,
    scheduledMinute: 600,
    nowMinute: 600,
    previousMinute: 599,
    windowMinutes: 4,
    firedKeys: new Set<string>(),
    dismissedKeys: new Set<string>(),
    ...overrides,
  };
}

describe('occurrenceKey', () => {
  it('is deterministic and independent of when the alarm actually rang', () => {
    expect(occurrenceKey('water_3', DATE, 600)).toBe('water_3_2026-11-28_600');
    expect(occurrenceKey('water_3', DATE, 600)).toBe(occurrenceKey('water_3', DATE, 600));
    expect(occurrenceKey('med_abc_120', DATE, 480)).not.toBe(occurrenceKey('med_abc_120', DATE, 481));
  });

  it('tolerates ±120s clock drift when matching a dismissed key', () => {
    const keys = occurrenceDriftKeys('water_3', DATE, 600);
    expect(keys).toContain(occurrenceKey('water_3', DATE, 598));
    expect(keys).toContain(occurrenceKey('water_3', DATE, 600));
    expect(keys).toContain(occurrenceKey('water_3', DATE, 602));
    expect(keys).not.toContain(occurrenceKey('water_3', DATE, 603));
  });
});

describe('(a) dismissed occurrence never re-fires, even with ±120s drift', () => {
  it('blocks the same key on every later tick', () => {
    const dismissedKeys = new Set([occurrenceKey('water_3', DATE, 600)]);

    // PC dismissed at 10:00, mobile clock runs 90s slow and considers 10:00 at minute 599.
    const slow = evaluateOccurrenceGate(
      gateInput({ nowMinute: 599, previousMinute: 598, dismissedKeys })
    );
    expect(slow.fire).toBe(false);
    expect(slow.reason).toBe('already-dismissed');

    // Mobile clock runs 120s fast: it believes the 10:00 alarm is minute 602.
    const fast = evaluateOccurrenceGate(
      gateInput({ nowMinute: 602, previousMinute: 601, dismissedKeys })
    );
    expect(fast.fire).toBe(false);

    // Exactly on time afterwards.
    const exact = evaluateOccurrenceGate(
      gateInput({ nowMinute: 600, previousMinute: 599, dismissedKeys })
    );
    expect(exact.fire).toBe(false);
  });

  it('blocks when the dismissal was written on a drifted clock (599 vs 601)', () => {
    const dismissedOnDriftedClock = new Set([occurrenceKey('med_x', DATE, 601)]);
    for (const minute of [599, 600, 601, 602, 603]) {
      const result = evaluateOccurrenceGate(
        gateInput({
          entityId: 'med_x',
          scheduledMinute: minute,
          nowMinute: minute,
          previousMinute: minute - 1,
          dismissedKeys: dismissedOnDriftedClock,
        })
      );
      expect(result.fire).toBe(false);
      expect(result.reason).toBe('already-dismissed');
    }
  });

  it('persists dismissed keys so a fresh page session still blocks them', () => {
    markOccurrenceDismissed(occurrenceKey('gtask_a', DATE, 420), DATE);

    const stored = loadDismissedOccurrenceKeys();
    expect(stored.has('gtask_a_2026-11-28_420')).toBe(true);
    expect(isOccurrenceDismissedNear('gtask_a', DATE, 420, stored)).toBe(true);

    const refreshed = evaluateOccurrenceGate(
      gateInput({
        entityId: 'gtask_a',
        scheduledMinute: 420,
        nowMinute: 421,
        previousMinute: 420,
        dismissedKeys: loadDismissedOccurrenceKeys(),
      })
    );
    expect(refreshed.fire).toBe(false);
  });

  it('applies dismissals that arrived from the other device (remote payload)', () => {
    applyRemoteDismissedOccurrences({ occurrenceKeys: ['event_abc_2026-11-28_720'] }, DATE);
    applyRemoteDismissedOccurrences('sleep_wake_2026-11-28_285', DATE);

    expect(loadDismissedOccurrenceKeys().has('event_abc_2026-11-28_720')).toBe(true);
    expect(loadDismissedOccurrenceKeys().has('sleep_wake_2026-11-28_285')).toBe(true);
    expect(readOccurrenceKeysFrom(undefined)).toEqual([]);
  });

  it('hands ringing keys to the dismiss handler so "تم" can persist them', () => {
    rememberRingingOccurrence('alert_1', occurrenceKey('water_3', DATE, 600));
    rememberRingingOccurrence('alert_2', occurrenceKey('med_x', DATE, 480));
    const keys = drainRingingOccurrences();
    expect(keys).toEqual(['water_3_2026-11-28_600', 'med_x_2026-11-28_480']);
    expect(drainRingingOccurrences()).toEqual([]);
  });
});

describe('(b) page load / refresh never re-fires past or current alarms', () => {
  it('does not fire anything on the first observation after mount', () => {
    const first = observeTick(null, DATE, 720);
    expect(first.previousMinute).toBeNull();

    const currentMinuteAlarm = evaluateOccurrenceGate(
      gateInput({
        entityId: 'water_5',
        scheduledMinute: 720,
        nowMinute: 720,
        previousMinute: first.previousMinute,
      })
    );
    expect(currentMinuteAlarm.fire).toBe(false);
    expect(currentMinuteAlarm.reason).toBe('baseline');
  });

  it('does not fire an alarm whose trigger time is already in the past at load', () => {
    const loadTick = observeTick(null, DATE, 800);
    const firedKeys = new Set<string>();

    // 10 such alarms are "due" in the 4-minute window right after a 13:20 refresh.
    const pastMinutes = [796, 797, 798, 799];
    for (const minute of pastMinutes) {
      const result = evaluateOccurrenceGate(
        gateInput({
          entityId: `event_${minute}`,
          scheduledMinute: minute,
          nowMinute: 800,
          previousMinute: loadTick.previousMinute,
          firedKeys,
        })
      );
      expect(result.fire).toBe(false);
    }
    expect(firedKeys.size).toBe(0);
  });

  it('does not fire an alarm that was missed before the app was opened', () => {
    const loadTick = observeTick(null, DATE, 800);
    const lateAtLoad = evaluateOccurrenceGate(
      gateInput({ scheduledMinute: 640, nowMinute: 800, previousMinute: loadTick.previousMinute })
    );
    expect(lateAtLoad.fire).toBe(false);
    expect(lateAtLoad.reason).toBe('baseline');

    // Inside a live session the minute is already behind the schedule: still never fires.
    const lateInSession = evaluateOccurrenceGate(
      gateInput({ scheduledMinute: 640, nowMinute: 800, previousMinute: 799 })
    );
    expect(lateInSession.fire).toBe(false);
    expect(lateInSession.reason).toBe('past');
  });

  it('does not re-fire an alarm already fired in this session after a re-render', () => {
    const firedKeys = new Set<string>();
    const live = evaluateOccurrenceGate(
      gateInput({ nowMinute: 600, previousMinute: 599, firedKeys })
    );
    expect(live.fire).toBe(true);
    markOccurrenceFired(live.key, DATE);

    // Same tick content re-renders (deps changed) — previousMinute equals nowMinute now.
    const again = evaluateOccurrenceGate(
      gateInput({ nowMinute: 600, previousMinute: 600, firedKeys })
    );
    expect(again.fire).toBe(false);
    expect(again.reason).toBe('already-fired');
    expect(loadFiredOccurrenceKeys().has(live.key)).toBe(true);
  });

  it('still fires the alarm that transitions live from before to at/after its time', () => {
    const live = evaluateOccurrenceGate(
      gateInput({ nowMinute: 600, previousMinute: 599 })
    );
    expect(live.fire).toBe(true);
    expect(live.key).toBe('water_3_2026-11-28_600');
  });

  it('never fires across a midnight rollover with the previous day as baseline', () => {
    const transition = observeTick({ dateIso: '2026-11-27', minute: 1439 }, DATE, 0);
    expect(transition.previousMinute).toBeNull();

    const result = evaluateOccurrenceGate(
      gateInput({
        entityId: 'sleep_wake',
        scheduledMinute: 0,
        nowMinute: 0,
        previousMinute: transition.previousMinute,
      })
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('baseline');
  });
});

beforeEach(() => {
  loadDismissedOccurrenceKeys().clear();
  loadFiredOccurrenceKeys().clear();
  drainRingingOccurrences();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
