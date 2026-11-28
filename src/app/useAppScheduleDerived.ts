import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  CreativeActivityItem,
  CreativeActivityPlacement,
  DailyRhythmPlan,
  DayMode,
  DynamicHabit,
  FreeWindow,
  GoogleCalendarEventItem,
  LifeProfile,
  PrayerTimeItem,
  ResolvedHabitPlacement,
  ScheduleBlock,
  SunlightSettings,
  TravelState,
} from '../types/dayrhythm';
import {
  HOME_LOCATION,
  calculateEgyptianPrayerTimes,
  getWeekdayInTimeZone,
} from '../engines/prayerEngine';
import {
  computeCreativePlacements,
  computeFreeWindows,
  resolveHabitsForDay,
} from '../engines/lifeRhythmEngine';
import { applyTravelMatrix, buildBaseSchedule } from '../engines/scheduleEngine';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import { useBaseLiveBlocks } from './useBaseLiveBlocks';

export interface UseAppScheduleDerivedParams {
  lifeProfile: LifeProfile;
  setOfflineBlocks: Dispatch<SetStateAction<ScheduleBlock[]>>;
  reflowedBlocksOverride: ScheduleBlock[] | null;
  includePrayerAnchors: boolean;
  prayers: PrayerTimeItem[];
  isFridayMode: boolean;
  todayCairoIso: string;
  needsAuth: boolean;
  calendarEvents: GoogleCalendarEventItem[];
  completedOverrides: Record<string, boolean>;
  useOfflineDemo: boolean;
  offlineBlocks: ScheduleBlock[];
  activeTimeZone: string;
  sunlightSettings: SunlightSettings;
  sunlightSessions: ComputedSunlightSession[];
  travelState: TravelState;
  dailyRhythmPlan: DailyRhythmPlan;
  lowEnergyActive: boolean;
  creativeActivities: CreativeActivityItem[];
  nowTickMin: number;
  habits: DynamicHabit[];
}

export function useAppScheduleDerived(p: UseAppScheduleDerivedParams) {
  const {
    lifeProfile,
    setOfflineBlocks,
    reflowedBlocksOverride,
    includePrayerAnchors,
    prayers,
    isFridayMode,
    todayCairoIso,
    needsAuth,
    calendarEvents,
    completedOverrides,
    useOfflineDemo,
    offlineBlocks,
    activeTimeZone,
    sunlightSettings,
    sunlightSessions,
    travelState,
    dailyRhythmPlan,
    lowEnergyActive,
    creativeActivities,
    nowTickMin,
    habits,
  } = p;

  const rebuildOfflineSchedule = useCallback(
    (nextMode: DayMode, nextTravel: TravelState, friday: boolean, biweeklyPc: boolean) => {
      const loc = nextTravel.active ? nextTravel.location : HOME_LOCATION;
      const nextPrayers = calculateEgyptianPrayerTimes(loc, new Date(), lifeProfile.adhanLeadMinutes);
      const base = buildBaseSchedule(nextMode, nextPrayers, {
        isFriday: friday,
        includeBiweeklyPcCleanup: biweeklyPc,
      });
      setOfflineBlocks(nextTravel.active ? applyTravelMatrix(base, nextTravel) : base);
    },
    [lifeProfile.adhanLeadMinutes, setOfflineBlocks]
  );

  const baseLiveBlocks = useBaseLiveBlocks({
    reflowedBlocksOverride,
    includePrayerAnchors,
    prayers,
    isFridayMode,
    todayCairoIso,
    needsAuth,
    calendarEvents,
    completedOverrides,
    useOfflineDemo,
    offlineBlocks,
    lifeProfile,
    activeTimeZone,
    sunlightSettings,
    sunlightSessions,
    travelState,
  });

  const freeSlotsToday: FreeWindow[] = useMemo(
    () =>
      computeFreeWindows({
        prayers,
        plan: dailyRhythmPlan,
        profile: lifeProfile,
        occupiedBlocks: baseLiveBlocks,
      }),
    [prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks]
  );

  const creativePlacements: CreativeActivityPlacement[] = useMemo(
    () =>
      lowEnergyActive
        ? []
        : computeCreativePlacements(creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin),
    [lowEnergyActive, creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin]
  );

  const resolvedHabits: ResolvedHabitPlacement[] = useMemo(
    () =>
      resolveHabitsForDay({
        habits,
        prayers,
        plan: dailyRhythmPlan,
        freeWindows: freeSlotsToday,
        profile: lifeProfile,
        todayIso: todayCairoIso,
        weekday: getWeekdayInTimeZone(activeTimeZone),
        timeZone: activeTimeZone,
      }),
    [habits, prayers, dailyRhythmPlan, freeSlotsToday, lifeProfile, todayCairoIso, activeTimeZone]
  );

  const liveBlocks: ScheduleBlock[] = useMemo(() => {
    const creativeBlocks: ScheduleBlock[] = creativePlacements
      .filter((cp) => !cp.doneToday && cp.suggestedSlot)
      .filter(
        (cp) =>
          !baseLiveBlocks.some(
            (b) =>
              !b.deleted &&
              (b.googleEventId === cp.activity.calendarEventId || b.categoryAr.includes(cp.activity.name))
          )
      )
      .map((cp) => ({
        id: `creative_${cp.activity.id}`,
        emojiPair: cp.activity.emoji || '🎨',
        categoryAr: `${cp.activity.emoji || '🎨'} ${cp.activity.name} (${cp.sessionsInPeriod}/${cp.goalInPeriod} ${cp.periodLabelAr})`,
        categoryEn: `${cp.activity.emoji || '🎨'} ${cp.activity.name}`,
        startMin: cp.suggestedSlot!.startMin,
        durationMin: cp.activity.sessionMinutes,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK' as const,
        canShiftEvening: true,
        completed: completedOverrides[`creative_${cp.activity.id}`] ?? false,
        deleted: false,
        dateIso: todayCairoIso,
        source: 'creative' as const,
        creativeActivityId: cp.activity.id,
      }));

    return [...baseLiveBlocks, ...creativeBlocks].sort((a, b) => a.startMin - b.startMin);
  }, [baseLiveBlocks, completedOverrides, creativePlacements, todayCairoIso]);

  return {
    rebuildOfflineSchedule,
    baseLiveBlocks,
    freeSlotsToday,
    creativePlacements,
    resolvedHabits,
    liveBlocks,
  };
}
