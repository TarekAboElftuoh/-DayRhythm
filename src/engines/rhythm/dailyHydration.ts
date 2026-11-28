import { HydrationScheduleSlot } from '../../types/dayrhythm';
import {
  distributeCupsAvoidingPrayers,
  PrayerBlockedWindow,
} from '../hydration/prayerAwareScheduler';
import { durationForward, wrap1440 } from './constants';
import { SEASONAL_SLEEP_CONSTANTS } from './seasonalSleep';

export function buildDailyHydrationSlots(params: {
  isFastingToday: boolean;
  activeTargetCups: number;
  fajr: number;
  maghrib: number;
  bedtimeMin: number;
  prayerBlockedWindows?: PrayerBlockedWindow[];
}): HydrationScheduleSlot[] {
  const {
    isFastingToday,
    activeTargetCups,
    fajr,
    maghrib,
    bedtimeMin,
    prayerBlockedWindows = [],
  } = params;
  const hydrationSlots: HydrationScheduleSlot[] = [];

  if (isFastingToday) {
    const suhoorCups = Math.min(2, Math.max(1, Math.floor(activeTargetCups / 4)));
    const eveningCups = Math.max(1, activeTargetCups - suhoorCups);

    const suhoorLead = SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN;
    const suhoorBegin = wrap1440(fajr - suhoorLead);
    const maxSuhoorSpan = Math.max(0, suhoorLead - 5);
    const suhoorSpan = Math.min(maxSuhoorSpan, Math.max(5, suhoorLead - 10));
    const suhoorTimes = distributeCupsAvoidingPrayers({
      spanStartMin:
        suhoorCups === 1
          ? wrap1440(suhoorBegin + Math.min(10, Math.floor(suhoorLead / 2)))
          : suhoorBegin,
      spanLengthMin: suhoorCups === 1 ? 0 : suhoorSpan,
      count: suhoorCups,
      blockedWindows: prayerBlockedWindows,
    });
    for (let s = 0; s < suhoorTimes.length; s++) {
      hydrationSlots.push({
        cupIndex: s + 1,
        timeMinutes: suhoorTimes[s],
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

    const eveningTimes = distributeCupsAvoidingPrayers({
      spanStartMin: eveningStart,
      spanLengthMin: eveningSpan,
      count: eveningCups,
      blockedWindows: prayerBlockedWindows,
    });

    for (let i = 0; i < eveningTimes.length; i++) {
      let windowAr = '';
      if (i === 0) windowAr = 'عند الإفطار';
      else if (i === eveningCups - 1) windowAr = 'قبل النوم';
      hydrationSlots.push({
        cupIndex: suhoorCups + i + 1,
        timeMinutes: eveningTimes[i],
        windowAr,
        noteAr: '',
      });
    }
  } else {
    const startMin = wrap1440(fajr + 20);
    const stopMin = wrap1440(bedtimeMin - 75);
    const awakeSpan = Math.max(360, durationForward(startMin, stopMin));
    const normalTimes = distributeCupsAvoidingPrayers({
      spanStartMin: startMin,
      spanLengthMin: awakeSpan,
      count: activeTargetCups,
      blockedWindows: prayerBlockedWindows,
    });

    for (let i = 0; i < normalTimes.length; i++) {
      hydrationSlots.push({
        cupIndex: i + 1,
        timeMinutes: normalTimes[i],
        windowAr: '',
        noteAr: '',
      });
    }
  }

  return hydrationSlots;
}
