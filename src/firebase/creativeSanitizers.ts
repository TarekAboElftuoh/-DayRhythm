import type { CreativeActivityItem, CreativeCadence } from '../types/dayrhythm';

const VALID_CADENCES: ReadonlyArray<CreativeCadence> = ['daily', 'weekly', 'monthly'];

function clampIntLocal(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function sanitizeCreativeActivityId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return clean || `act_${Date.now().toString(36)}`;
}

export function sanitizeCreativeActivityItem(
  raw: Partial<CreativeActivityItem>
): CreativeActivityItem {
  const id = sanitizeCreativeActivityId(raw.id || `act_${Date.now().toString(36)}`);
  const name = String(raw.name ?? '').trim().slice(0, 80) || 'نشاط إبداعي';
  const emoji = String(raw.emoji ?? '🎨').trim().slice(0, 16) || '🎨';
  const cadence: CreativeCadence =
    raw.cadence && VALID_CADENCES.includes(raw.cadence) ? raw.cadence : 'weekly';
  const fallbackGoal = cadence === 'daily' ? 1 : cadence === 'monthly' ? 8 : 3;
  const goalCount = clampIntLocal(raw.goalCount ?? raw.weeklyGoalSessions, 1, 31, fallbackGoal);
  const weeklyGoalSessions = clampIntLocal(
    raw.weeklyGoalSessions ?? Math.min(14, goalCount),
    1,
    14,
    Math.min(14, goalCount)
  );
  const sessionMinutes = clampIntLocal(raw.sessionMinutes, 15, 240, 45);
  const loggedDates: string[] = [];
  if (Array.isArray(raw.loggedDates)) {
    for (const d of raw.loggedDates) {
      const s = String(d ?? '').trim();
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) && !loggedDates.includes(s)) {
        loggedDates.push(s);
      }
    }
  }
  loggedDates.sort();
  const trimmedDates = loggedDates.slice(-31);
  const rawSched = String(raw.scheduledTime24 ?? '').trim();
  const scheduledTime24 = /^[0-2][0-9]:[0-5][0-9]$/.test(rawSched) ? rawSched : '';
  const calendarEventId = String(raw.calendarEventId ?? '').trim().slice(0, 128);
  const rawExpires = String(raw.expiresOnDate ?? '').trim();
  const expiresOnDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawExpires) ? rawExpires : '';
  return {
    id,
    name,
    emoji,
    cadence,
    goalCount,
    weeklyGoalSessions,
    sessionMinutes,
    loggedDates: trimmedDates,
    scheduledTime24,
    calendarEventId,
    expiresOnDate,
  };
}
