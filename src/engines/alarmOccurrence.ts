/**
 * Deterministic alarm occurrence identity + durable fired/dismissed key stores.
 *
 * Every alarm card (task, habit, water, med, sleep, wake, prayer, solar, event) is identified by
 * `${entityId}_${yyyyMmDd}_${scheduledMinute}`. The key never depends on the device clock or on the
 * moment the alarm actually rang, so PC + mobile agree even when their clocks drift by minutes.
 * A dismissed occurrence can never ring again on any device that has the key.
 */

export const OCCURRENCE_DRIFT_SECONDS = 120;
export const FIRED_OCCURRENCES_STORAGE_KEY = 'dayrhythm_fired_occurrences_v1';
export const DISMISSED_OCCURRENCES_STORAGE_KEY = 'dayrhythm_dismissed_occurrences_v1';
const MAX_STORED_KEYS = 400;
const DATE_TOKEN = /\d{4}-\d{2}-\d{2}/;

const memoryFallback = new Map<string, Set<string>>();
const ringingOccurrences = new Map<string, string>();

export function occurrenceKey(entityId: string, dateIso: string, scheduledMinute: number): string {
  return `${entityId}_${dateIso}_${scheduledMinute}`;
}

/** Same occurrence ± drift, so a key written on a drifting clock still matches. */
export function occurrenceDriftKeys(
  entityId: string,
  dateIso: string,
  scheduledMinute: number,
  driftSeconds: number = OCCURRENCE_DRIFT_SECONDS
): string[] {
  const span = Math.max(0, Math.ceil(driftSeconds / 60));
  const keys: string[] = [];
  for (let offset = -span; offset <= span; offset += 1) {
    keys.push(occurrenceKey(entityId, dateIso, scheduledMinute + offset));
  }
  return keys;
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function prune(keys: Set<string>, dateIso?: string): Set<string> {
  const list = [...keys];
  const kept = dateIso
    ? list.filter((key) => !DATE_TOKEN.test(key) || key.includes(`_${dateIso}_`))
    : list;
  return new Set(kept.slice(-MAX_STORED_KEYS));
}

function readKeys(storageKey: string): Set<string> {
  if (!hasLocalStorage()) return new Set(memoryFallback.get(storageKey) ?? []);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function writeKeys(storageKey: string, keys: Set<string>, dateIso?: string): Set<string> {
  const pruned = prune(keys, dateIso);
  try {
    if (!hasLocalStorage()) {
      memoryFallback.set(storageKey, pruned);
      return pruned;
    }
    localStorage.setItem(storageKey, JSON.stringify([...pruned]));
  } catch {
    memoryFallback.set(storageKey, pruned);
  }
  return pruned;
}

export function loadFiredOccurrenceKeys(): Set<string> {
  return readKeys(FIRED_OCCURRENCES_STORAGE_KEY);
}

export function loadDismissedOccurrenceKeys(): Set<string> {
  return readKeys(DISMISSED_OCCURRENCES_STORAGE_KEY);
}

export function markOccurrenceFired(key: string, dateIso?: string): void {
  if (!key) return;
  const keys = readKeys(FIRED_OCCURRENCES_STORAGE_KEY);
  if (keys.has(key)) return;
  keys.add(key);
  writeKeys(FIRED_OCCURRENCES_STORAGE_KEY, keys, dateIso);
}

export function markOccurrenceDismissed(key: string, dateIso?: string): void {
  if (!key) return;
  const keys = readKeys(DISMISSED_OCCURRENCES_STORAGE_KEY);
  keys.add(key);
  writeKeys(DISMISSED_OCCURRENCES_STORAGE_KEY, keys, dateIso);
}

export function markOccurrencesDismissed(keys: Iterable<string>, dateIso?: string): string[] {
  const stored = readKeys(DISMISSED_OCCURRENCES_STORAGE_KEY);
  const added: string[] = [];
  for (const key of keys) {
    if (!key || stored.has(key)) continue;
    stored.add(key);
    added.push(key);
  }
  if (added.length > 0) writeKeys(DISMISSED_OCCURRENCES_STORAGE_KEY, stored, dateIso);
  return added;
}

export function isOccurrenceDismissed(key: string): boolean {
  return Boolean(key) && readKeys(DISMISSED_OCCURRENCES_STORAGE_KEY).has(key);
}

/** True when the occurrence — or the same occurrence on a clock drift of ±120s — was dismissed. */
export function isOccurrenceDismissedNear(
  entityId: string,
  dateIso: string,
  scheduledMinute: number,
  dismissedKeys: ReadonlySet<string> = loadDismissedOccurrenceKeys(),
  driftSeconds: number = OCCURRENCE_DRIFT_SECONDS
): boolean {
  return occurrenceDriftKeys(entityId, dateIso, scheduledMinute, driftSeconds).some((key) =>
    dismissedKeys.has(key)
  );
}

/** Remote dismissal payloads carry `occurrenceKeys` (array) or `occurrenceKey` (string). */
export function readOccurrenceKeysFrom(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readOccurrenceKeysFrom(record.occurrenceKeys ?? record.occurrenceKey);
  }
  return [];
}

/** Persist dismissals received from the other device, so a refresh here cannot re-ring them. */
export function applyRemoteDismissedOccurrences(value: unknown, dateIso?: string): string[] {
  return markOccurrencesDismissed(readOccurrenceKeysFrom(value), dateIso);
}

/** Alarms currently audible on this device, mapped alertId -> occurrenceKey. */
export function rememberRingingOccurrence(alertId: string, key: string): void {
  if (!alertId || !key) return;
  ringingOccurrences.set(alertId, key);
}

/** Hand over the ringing occurrence keys (used when the user hits "تم"/Dismiss). */
export function drainRingingOccurrences(): string[] {
  const keys = [...new Set(ringingOccurrences.values())];
  ringingOccurrences.clear();
  return keys;
}

export function forgetRingingOccurrence(alertId: string): void {
  ringingOccurrences.delete(alertId);
}

export function forgetRingingOccurrences(): void {
  ringingOccurrences.clear();
}
