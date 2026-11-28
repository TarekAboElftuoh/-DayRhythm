export const FIRED_KEYS_STORAGE_KEY = 'firedKeys';
export const DISMISSED_KEYS_STORAGE_KEY = 'dismissedKeys';
export const CLOCK_DRIFT_TOLERANCE_MS = 120_000;
const CLOCK_DRIFT_TOLERANCE_MIN = 2;
const MAX_STORED_KEYS = 300;

export function buildOccurrenceKey(
  id: string,
  yyyyMmDd: string,
  scheduledMinute: number
): string {
  return `${id}_${yyyyMmDd}_${Math.round(scheduledMinute)}`;
}

/**
 * Fires on a live minute transition (`prevMin < triggerMin` -> `nowMin >= triggerMin`),
 * OR on initial mount / same-minute recalculation ONLY when `nowMin === triggerMin` (happening live right now).
 * Past occurrences (`nowMin > triggerMin` on mount/same-minute) are suppressed.
 */
export function isLiveTransition(
  prevMin: number | null,
  nowMin: number,
  triggerMin: number,
  maxLagMin = 4
): boolean {
  if (prevMin === null || nowMin === prevMin) {
    return nowMin === triggerMin;
  }
  const effectivePrev = nowMin < prevMin ? -1 : prevMin;
  return (
    effectivePrev < triggerMin &&
    nowMin >= triggerMin &&
    nowMin - triggerMin <= maxLagMin
  );
}

function readKeyList(storage: Storage | undefined, storageKey: string): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}

function writeKeyList(
  storage: Storage | undefined,
  storageKey: string,
  keys: string[]
): string[] {
  const deduped = Array.from(new Set(keys.filter((k) => k.length > 0))).slice(-MAX_STORED_KEYS);
  if (!storage) return deduped;
  try {
    storage.setItem(storageKey, JSON.stringify(deduped));
  } catch {
    // ignore storage quota errors
  }
  return deduped;
}

export function hasFiredInSession(occurrenceKey: string): boolean {
  if (!occurrenceKey || typeof window === 'undefined') return false;
  return readKeyList(window.sessionStorage, FIRED_KEYS_STORAGE_KEY).includes(occurrenceKey);
}

export function markFiredInSession(occurrenceKey: string): void {
  if (!occurrenceKey || typeof window === 'undefined') return;
  const existing = readKeyList(window.sessionStorage, FIRED_KEYS_STORAGE_KEY);
  if (existing.includes(occurrenceKey)) return;
  writeKeyList(window.sessionStorage, FIRED_KEYS_STORAGE_KEY, [...existing, occurrenceKey]);
}

export function readDismissedKeys(): string[] {
  if (typeof window === 'undefined') return [];
  return readKeyList(window.localStorage, DISMISSED_KEYS_STORAGE_KEY);
}

export function addDismissedKeys(keys: string[]): string[] {
  if (typeof window === 'undefined') return [];
  const valid = keys.filter((k) => typeof k === 'string' && k.length > 0);
  if (valid.length === 0) return readDismissedKeys();
  const existing = readKeyList(window.localStorage, DISMISSED_KEYS_STORAGE_KEY);
  return writeKeyList(window.localStorage, DISMISSED_KEYS_STORAGE_KEY, [...existing, ...valid]);
}

function parseOccurrenceKey(key: string): { prefix: string; minute: number } | null {
  const lastUnderscore = key.lastIndexOf('_');
  if (lastUnderscore <= 0) return null;
  const minStr = key.slice(lastUnderscore + 1);
  const minute = Number(minStr);
  if (!Number.isFinite(minute)) return null;
  return { prefix: key.slice(0, lastUnderscore + 1), minute };
}

/**
 * Checks whether an occurrence key (or a ±120s / ±2m clock-drifted counterpart) was already dismissed.
 */
export function isOccurrenceDismissed(occurrenceKey?: string): boolean {
  if (!occurrenceKey) return false;
  const dismissed = readDismissedKeys();
  if (dismissed.includes(occurrenceKey)) return true;

  const target = parseOccurrenceKey(occurrenceKey);
  if (!target) return false;
  return dismissed.some((entry) => {
    if (!entry.startsWith(target.prefix)) return false;
    const otherMin = Number(entry.slice(target.prefix.length));
    return Number.isFinite(otherMin) && Math.abs(otherMin - target.minute) <= CLOCK_DRIFT_TOLERANCE_MIN;
  });
}
