import {
  CalendarActionProposal,
  CalendarTombstone,
  CreativeActivityItem,
  DynamicHabit,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  HydrationDayLog,
  MemoryItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  ScheduleBlock,
  SharedChangelogEntry,
  SilentNotificationItem,
  TaskActionProposal,
} from '../../types/dayrhythm';
import type { CapsulePrefs } from '../../components/FloatingPiPCapsule';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_HABITS,
  DEFAULT_MEMORIES,
  sanitizeCreativeActivityItem,
  sanitizeDynamicHabit,
  sanitizeMemoryItem,
  type SyncedRhythmPayload,
} from '../../firebase';
import { MEDS_STORAGE_KEY } from '../../hooks/useMedications';
import {
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
  getTimeZoneOffsetString,
  parseIsoToTimeZoneInfo,
} from '../../engines/prayerEngine';
import { clearGeminiClientCache, sanitizePersistedChats } from '../../services/apiClient';

export function getLast7DayLabels(timeZone = 'Africa/Cairo'): string[] {
  const now = new Date();
  const map: Record<string, string> = {
    Sun: 'الأحد',
    Mon: 'الإثنين',
    Tue: 'الثلاثاء',
    Wed: 'الأربعاء',
    Thu: 'الخميس',
    Fri: 'الجمعة',
    Sat: 'السبت',
  };
  return Array.from({ length: 7 }, (_, i) => {
    if (i === 6) return 'اليوم';
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    let weekdayEn = '';
    try {
      weekdayEn = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
      }).format(d);
    } catch {
      weekdayEn = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        weekday: 'short',
      }).format(d);
    }
    return map[weekdayEn] ?? 'يوم';
  });
}

export function buildInitialHydrationHistory(
  targetCups: number,
  timeZone = 'Africa/Cairo'
): HydrationDayLog[] {
  const labels = getLast7DayLabels(timeZone);
  const todayIso = getDateIsoInTimeZone(timeZone);

  return labels.map((labelAr, idx) => ({
    dateKey: idx === 6 ? todayIso : `day-${idx}`,
    labelAr,
    cupsLogged: 0,
    targetCups,
    slots: Array.from({ length: targetCups }, () => false),
  }));
}

export function rollOverHydrationHistoryIfNeeded(
  history: HydrationDayLog[],
  targetCups: number,
  timeZone = 'Africa/Cairo'
): HydrationDayLog[] {
  const todayIso = getDateIsoInTimeZone(timeZone);
  const labels = getLast7DayLabels(timeZone);
  const last = history[history.length - 1];
  if (last && last.dateKey === todayIso) {
    return history.map((d, idx) => ({ ...d, labelAr: labels[idx] ?? d.labelAr }));
  }
  // New day in user's active timezone started: shift history left and start today fresh at 0 cups
  const shiftedCounts = [...history.slice(1).map((d) => d.cupsLogged), 0];
  return labels.map((labelAr, idx) => {
    const c = Math.min(targetCups, shiftedCounts[idx] ?? 0);
    return {
      dateKey: idx === 6 ? todayIso : `day-${idx}`,
      labelAr,
      cupsLogged: c,
      targetCups,
      slots: Array.from({ length: targetCups }, (_, sIdx) => sIdx < c),
    };
  });
}

/**
 * Gemini sometimes invents an event id (e.g. "test_event_123") when the target event was not in
 * its context. Google then answers 404 on DELETE, which the executor treats as "already deleted",
 * so the user saw "done" while nothing changed. Resolve every update/delete target against the
 * events we actually fetched: exact id first, then exact title (+ date when given), and refuse
 * clearly when the event can't be found or the title is ambiguous.
 */
