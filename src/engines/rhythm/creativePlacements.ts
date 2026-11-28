import { countCreativeSessionsThisWeek } from './forecastAndAlerts';
import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';
import {
  calculateEgyptianPrayerTimes, formatMinutes12h, formatMinutes24h,
  formatTime24To12h, getSpecialFastDay, parseIsoToTimeZoneInfo,
} from '../prayerEngine';
import { countCreativeSessionsInPeriod } from './forecastAndAlerts';

export function computeCreativePlacements(
  activities: CreativeActivityItem[],
  freeSlots: FreeTimeSlot[],
  todayIso: string,
  nowMin: number
): CreativeActivityPlacement[] {
  const remaining: FreeTimeSlot[] = freeSlots.map((s) => ({ ...s }));

  const claimSlot = (durationMin: number): { startMin: number; endMin: number; time24: string } | null => {
    const needed = Math.max(15, durationMin);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < remaining.length; i++) {
        const slot = remaining[i];
        const candidateStart =
          pass === 0 ? Math.max(slot.startMin, Math.ceil(nowMin / 5) * 5) : slot.startMin;
        if (slot.endMin - candidateStart >= needed) {
          const endMin = candidateStart + needed;
          const beforeEnd = candidateStart - 10;
          const afterStart = endMin + 10;
          const replacements: FreeTimeSlot[] = [];
          if (beforeEnd - slot.startMin >= 20) {
            replacements.push({
              startMin: slot.startMin,
              endMin: beforeEnd,
              durationMin: beforeEnd - slot.startMin,
            });
          }
          if (slot.endMin - afterStart >= 20) {
            replacements.push({
              startMin: afterStart,
              endMin: slot.endMin,
              durationMin: slot.endMin - afterStart,
            });
          }
          remaining.splice(i, 1, ...replacements);
          return {
            startMin: candidateStart,
            endMin,
            time24: formatMinutes24h(candidateStart),
          };
        }
      }
    }
    return null;
  };

  // Hide temporary activities that have already passed their expiry date
  const activeActivities = activities.filter(
    (act) => !act.expiresOnDate || act.expiresOnDate >= todayIso
  );

  return activeActivities.map((activity) => {
    const cadence: CreativeCadence = activity.cadence ?? 'weekly';
    const goalInPeriod = Math.max(1, activity.goalCount ?? activity.weeklyGoalSessions ?? 3);
    const sessionsThisWeek = countCreativeSessionsThisWeek(activity.loggedDates, todayIso);
    const sessionsInPeriod = countCreativeSessionsInPeriod(activity.loggedDates, todayIso, cadence);
    const periodLabelAr =
      cadence === 'daily' ? 'اليوم' : cadence === 'monthly' ? 'هذا الشهر' : 'هذا الأسبوع';
    const doneToday = activity.loggedDates.includes(todayIso);
    const goalAlreadyMet = sessionsInPeriod >= goalInPeriod;
    const suggestedSlot = doneToday || goalAlreadyMet ? null : claimSlot(activity.sessionMinutes);
    return {
      activity,
      cadence,
      sessionsInPeriod,
      goalInPeriod,
      periodLabelAr,
      sessionsThisWeek,
      doneToday,
      suggestedSlot,
    };
  });
}

