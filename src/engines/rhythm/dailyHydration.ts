import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';

import { durationForward, wrap1440 } from './constants';
import { SEASONAL_SLEEP_CONSTANTS } from './seasonalSleep';

export function buildDailyHydrationSlots(params: {
  isFastingToday: boolean;
  activeTargetCups: number;
  fajr: number;
  maghrib: number;
  bedtimeMin: number;
}): HydrationScheduleSlot[] {
  const { isFastingToday, activeTargetCups, fajr, maghrib, bedtimeMin } = params;
  const hydrationSlots: HydrationScheduleSlot[] = [];

  if (isFastingToday) {
    const suhoorCups = Math.min(2, Math.max(1, Math.floor(activeTargetCups / 4)));
    const eveningCups = Math.max(1, activeTargetCups - suhoorCups);

    const suhoorLead = SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN;
    const suhoorBegin = wrap1440(fajr - suhoorLead);
    const maxSuhoorSpan = Math.max(0, suhoorLead - 5);
    const suhoorSpan = Math.min(maxSuhoorSpan, Math.max(5, suhoorLead - 10));
    for (let s = 0; s < suhoorCups; s++) {
      const offset =
        suhoorCups === 1
          ? Math.min(10, Math.floor(suhoorLead / 2))
          : Math.round((s * suhoorSpan) / (suhoorCups - 1));
      hydrationSlots.push({
        cupIndex: s + 1,
        timeMinutes: wrap1440(suhoorBegin + offset),
        windowAr: 'السحور',
        noteAr: '',
      });
    }

    const eveningStart = maghrib;
    const maxAllowedEveningSpan = Math.max(10, durationForward(eveningStart, fajr) - 10);
    const rawEveningEnd = wrap1440(bedtimeMin - 45);
    const rawEveningSpan = durationForward(eveningStart, rawEveningEnd);
    const eveningSpan =
      rawEveningSpan < maxAllowedEveningSpan
        ? Math.min(maxAllowedEveningSpan, Math.max(45, rawEveningSpan))
        : Math.min(
            maxAllowedEveningSpan,
            Math.max(15, Math.min(durationForward(eveningStart, bedtimeMin), maxAllowedEveningSpan))
          );
    const step = eveningCups > 1 ? Math.floor(eveningSpan / (eveningCups - 1)) : 0;

    for (let i = 0; i < eveningCups; i++) {
      const tMin = wrap1440(eveningStart + i * step);
      let windowAr = '';
      if (i === 0) windowAr = 'عند الإفطار';
      else if (i === eveningCups - 1) windowAr = 'قبل النوم';
      hydrationSlots.push({
        cupIndex: suhoorCups + i + 1,
        timeMinutes: tMin,
        windowAr,
        noteAr: '',
      });
    }
  } else {
    const startMin = wrap1440(fajr + 20);
    const stopMin = wrap1440(bedtimeMin - 75);
    const awakeSpan = Math.max(360, durationForward(startMin, stopMin));
    const total = activeTargetCups;
    const step = total > 1 ? awakeSpan / (total - 1) : 0;

    for (let i = 0; i < total; i++) {
      const tMin = wrap1440(startMin + Math.round(i * step));
      hydrationSlots.push({
        cupIndex: i + 1,
        timeMinutes: tMin,
        windowAr: '',
        noteAr: '',
      });
    }
  }

  return hydrationSlots;
}
