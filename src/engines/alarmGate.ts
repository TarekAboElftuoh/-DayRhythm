/**
 * Pure alarm gate: an alarm may ring only when the clock transitions from
 * `previousMinute < scheduledMinute` to `nowMinute >= scheduledMinute`.
 *
 * Consequences (the bug this fixes):
 * - a page load / right-click refresh has no previous observation, so nothing that is already due
 *   fires on mount;
 * - an alarm whose scheduled minute is already behind the first observation never fires;
 * - an occurrence already fired (this session, persisted) or dismissed (local/remote) never fires.
 */
import {
  OCCURRENCE_DRIFT_SECONDS,
  occurrenceKey,
  isOccurrenceDismissedNear,
} from './alarmOccurrence';

export interface TickObservation {
  dateIso: string;
  minute: number;
}

export interface TickTransition {
  previousMinute: number | null;
  current: TickObservation;
}

export type OccurrenceGateReason =
  | 'fire'
  | 'already-dismissed'
  | 'already-fired'
  | 'baseline'
  | 'not-due'
  | 'past'
  | 'stale';

export interface OccurrenceGateInput {
  entityId: string;
  dateIso: string;
  scheduledMinute: number;
  nowMinute: number;
  previousMinute: number | null;
  windowMinutes?: number;
  firedKeys: Set<string>;
  dismissedKeys: ReadonlySet<string>;
  driftSeconds?: number;
}

export interface OccurrenceGateResult {
  fire: boolean;
  key: string;
  reason: OccurrenceGateReason;
}

/**
 * First observation of a page session (or a new day) is a baseline: previousMinute is null, so no
 * alarm can fire from history on load. Later ticks report the minute last observed.
 */
export function observeTick(
  previous: TickObservation | null,
  dateIso: string,
  nowMinute: number
): TickTransition {
  if (!previous || previous.dateIso !== dateIso) {
    return { previousMinute: null, current: { dateIso, minute: nowMinute } };
  }
  return { previousMinute: previous.minute, current: { dateIso, minute: nowMinute } };
}

export function evaluateOccurrenceGate(input: OccurrenceGateInput): OccurrenceGateResult {
  const key = occurrenceKey(input.entityId, input.dateIso, input.scheduledMinute);
  const windowMinutes = Math.max(0, input.windowMinutes ?? 0);

  if (
    isOccurrenceDismissedNear(
      input.entityId,
      input.dateIso,
      input.scheduledMinute,
      input.dismissedKeys,
      input.driftSeconds ?? OCCURRENCE_DRIFT_SECONDS
    )
  ) {
    return { fire: false, key, reason: 'already-dismissed' };
  }
  if (input.firedKeys.has(key)) {
    return { fire: false, key, reason: 'already-fired' };
  }
  if (input.previousMinute === null) {
    return { fire: false, key, reason: 'baseline' };
  }
  if (input.nowMinute < input.scheduledMinute) {
    return { fire: false, key, reason: 'not-due' };
  }
  if (input.previousMinute >= input.scheduledMinute) {
    return { fire: false, key, reason: 'past' };
  }
  if (input.nowMinute - input.scheduledMinute > windowMinutes) {
    return { fire: false, key, reason: 'stale' };
  }

  input.firedKeys.add(key);
  return { fire: true, key, reason: 'fire' };
}
