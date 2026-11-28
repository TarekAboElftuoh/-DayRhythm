import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type {
  ActiveSanctuaryState,
  DayMode,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  LifeProfile,
  PersistedChatMessage,
  QuietModeType,
  ScheduleBlock,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  WeatherHydrationInfo,
} from '../types/dayrhythm';
import type { TasksVaultPayload } from '../types/appTypes';
import type { UserSettingsPayload } from '../services/cloudStateService';
import { evaluateAudioSanctuary } from '../engines/audioEngine';
import { computeDailyRhythmPlan } from '../engines/lifeRhythmEngine';
import {
  calculateEgyptianPrayerTimes,
  getDateIsoInTimeZone,
  getSpecialFastDay,
  getTimeZoneUtcOffsetHours,
  getTodayCalendarMeta,
  getWeekdayInTimeZone,
} from '../engines/prayerEngine';
import { fetchOpenMeteoWeather, loadCachedWeather } from '../engines/weatherEngine';
import { loadSavedChats } from '../utils/appHelpers';
import { computeTomorrowAlert } from './computeTomorrowAlert';
import { sanitizeLifeProfile } from './sanitizers';
import { readMigratedStorageBundle } from './useCoreStates';

export interface UseRhythmDerivedStateParams {
  lifeProfile: LifeProfile;
  travelState: TravelState;
  needsAuth: boolean;
  nowTickMin: number;
  fastingOverride: 'auto' | 'fasting' | 'normal';
  quietMode: QuietModeType;
  isFridayMode: boolean;
  dayMode: DayMode;
  wasInPrayerSanctuaryRef: React.MutableRefObject<boolean>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  lastScheduledAlarmsJsonRef: React.MutableRefObject<string>;
  lastSyncedCloudAlarmsJsonRef: React.MutableRefObject<string>;
  saveCloudUserSettingsRef: React.MutableRefObject<(patch?: Partial<UserSettingsPayload>) => Promise<void>>;
  pushToTasksVaultRef: React.MutableRefObject<(patch?: Partial<TasksVaultPayload>) => Promise<void>>;
  updateLifeProfileLocal: (updater: (prev: LifeProfile) => LifeProfile) => LifeProfile;
}

export function useRhythmDerivedState(p: UseRhythmDerivedStateParams) {
  const [calendarList, setCalendarList] = useState<GoogleCalendarInfo[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const recentlyCreatedEventIdsRef = useRef<Set<string>>(new Set());
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [googleTaskLists, setGoogleTaskLists] = useState<GoogleTaskList[]>([]);
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  const recentlyCreatedTaskIdsRef = useRef<Set<string>>(new Set());
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [weatherInfo, setWeatherInfo] = useState<WeatherHydrationInfo | null>(loadCachedWeather);
  const [gmailDigest, setGmailDigest] = useState<GmailDigestItem[]>([]);
  const [gmailScannedCount, setGmailScannedCount] = useState<number>(0);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailNeedsReauth, setGmailNeedsReauth] = useState(false);
  const [gmailError, setGmailError] = useState('');
  const [chatMessages, setChatMessages] = useState<PersistedChatMessage[]>(loadSavedChats);

  const [includePrayerAnchors, setIncludePrayerAnchors] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_include_prayer_anchors');
      if (saved !== null) return saved === 'true';
    } catch { /* ignore */ }
    return true;
  });
  const [useOfflineDemo, setUseOfflineDemo] = useState<boolean>(false);
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({});
  const [reflowedBlocksOverride, setReflowedBlocksOverride] = useState<ScheduleBlock[] | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ScheduleBlock[] | null>(null);

  const profileLocation = useMemo(
    () => ({
      id: 'profile_loc',
      nameAr: p.lifeProfile.currentCityName,
      nameEn: p.lifeProfile.currentCityName,
      lat: p.lifeProfile.currentLat,
      lng: p.lifeProfile.currentLng,
      tzOffsetHours: getTimeZoneUtcOffsetHours(p.lifeProfile.currentTimeZone),
      timeZone: p.lifeProfile.currentTimeZone,
    }),
    [p.lifeProfile]
  );

  const activeLocation = p.travelState.active ? p.travelState.location : profileLocation;
  const activeTimeZone = useMemo(() => {
    const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Africa/Cairo';
    return activeLocation.timeZone || p.lifeProfile.currentTimeZone || browserTz || 'Africa/Cairo';
  }, [activeLocation.timeZone, p.lifeProfile.currentTimeZone]);

  useEffect(() => {
    if (p.needsAuth) return;
    let cancelled = false;
    void fetchOpenMeteoWeather(activeLocation.lat, activeLocation.lng).then((info) => {
      if (!cancelled && info) setWeatherInfo(info);
    });
    return () => { cancelled = true; };
  }, [p.needsAuth, activeLocation.lat, activeLocation.lng]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayCairoIso = useMemo(() => getDateIsoInTimeZone(activeTimeZone), [activeTimeZone, p.nowTickMin]);

  const prayers = useMemo(
    () => calculateEgyptianPrayerTimes(activeLocation, new Date(), p.lifeProfile.adhanLeadMinutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLocation, p.lifeProfile.adhanLeadMinutes, todayCairoIso]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayCalendarMeta: TodayCalendarMeta = useMemo(() => getTodayCalendarMeta(activeTimeZone), [activeTimeZone, todayCairoIso]);

  const tomorrowInfo = useMemo(() => {
    const tz = activeLocation.timeZone ?? p.lifeProfile.currentTimeZone ?? 'Africa/Cairo';
    const todayW = getWeekdayInTimeZone(tz);
    const base = new Date(`${todayCairoIso}T12:00:00Z`);
    const nextIso = Number.isNaN(base.getTime()) ? '' : new Date(base.getTime() + 86_400_000).toISOString().slice(0, 10);
    return { todayW, tomorrowW: (todayW + 1) % 7, tomorrowIso: nextIso };
  }, [activeLocation.timeZone, p.lifeProfile.currentTimeZone, todayCairoIso]);

  const specialFastToday = useMemo(() => getSpecialFastDay(todayCairoIso, activeTimeZone), [todayCairoIso, activeTimeZone]);
  const specialFastTomorrow = useMemo(
    () => getSpecialFastDay(tomorrowInfo.tomorrowIso, activeTimeZone),
    [tomorrowInfo.tomorrowIso, activeTimeZone]
  );

  const dailyRhythmPlan = useMemo(
    () =>
      computeDailyRhythmPlan(p.lifeProfile, prayers, {
        todayWeekday: tomorrowInfo.todayW,
        tomorrowWeekday: tomorrowInfo.tomorrowW,
        todayIso: todayCairoIso,
        tomorrowIso: tomorrowInfo.tomorrowIso,
        timeZone: activeTimeZone,
        fastingOverride: p.fastingOverride,
        heatBonusMl: weatherInfo?.heatBonusMl ?? 0,
        specialFastTodayAr: specialFastToday?.nameAr ?? null,
        specialFastTomorrowAr: specialFastTomorrow?.nameAr ?? null,
      }),
    [
      tomorrowInfo.todayW, tomorrowInfo.tomorrowW, todayCairoIso, tomorrowInfo.tomorrowIso,
      activeTimeZone, p.fastingOverride, p.lifeProfile, prayers, weatherInfo?.heatBonusMl,
      specialFastToday, specialFastTomorrow,
    ]
  );

  const tomorrowAlert: TomorrowAlertInfo | null = useMemo(
    () => computeTomorrowAlert(calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW, specialFastTomorrow),
    [calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW, specialFastTomorrow]
  );

  const lowEnergyActive = p.lifeProfile.lowEnergyDateKey === todayCairoIso;
  const activeOneTimeSilenceMinutes =
    p.lifeProfile.oneTimeSilenceDateKey === todayCairoIso ? p.lifeProfile.oneTimeSilenceMinutes ?? 0 : 0;

  const [sanctuaryOverrideUntilMs, setSanctuaryOverrideUntilMs] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('dayrhythm_sanctuary_override_until_v1');
      if (raw !== null) {
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
      }
      const migrated = readMigratedStorageBundle();
      if (migrated && migrated.sanctuaryOverrideUntilMs > Date.now()) return migrated.sanctuaryOverrideUntilMs;
    } catch { return 0; }
    return 0;
  });
  const sanctuaryOverrideUntilMsRef = useRef<number>(sanctuaryOverrideUntilMs);
  sanctuaryOverrideUntilMsRef.current = sanctuaryOverrideUntilMs;

  const rawActiveSanctuary: ActiveSanctuaryState = useMemo(
    () =>
      evaluateAudioSanctuary({
        nowMin: p.nowTickMin,
        prayers,
        bedtimeMin: dailyRhythmPlan.bedtimeMin,
        wakeMin: dailyRhythmPlan.wakeMin,
        prayerSilenceMinutes: p.lifeProfile.prayerSilenceMinutes,
        fajrSilenceMinutes: p.lifeProfile.fajrSilenceMinutes,
        oneTimeSilenceMinutes: activeOneTimeSilenceMinutes,
        meetingActive: p.quietMode !== 'normal',
        meetingMuteFully: p.quietMode === 'mute_audio' || p.quietMode === 'silent_all',
        isFriday: p.isFridayMode,
      }),
    [
      p.nowTickMin, prayers, dailyRhythmPlan.bedtimeMin, dailyRhythmPlan.wakeMin,
      p.lifeProfile.prayerSilenceMinutes, p.lifeProfile.fajrSilenceMinutes,
      activeOneTimeSilenceMinutes, p.quietMode, p.isFridayMode,
    ]
  );

  const activeSanctuary: ActiveSanctuaryState = useMemo(() => {
    if ((rawActiveSanctuary.type === 'prayer' || rawActiveSanctuary.type === 'sleep') && sanctuaryOverrideUntilMs > Date.now()) {
      return { type: 'none', labelAr: 'الوضع العادي', muteAll: false, vibrateOnly: false };
    }
    return rawActiveSanctuary;
  }, [rawActiveSanctuary, sanctuaryOverrideUntilMs]);

  const handleCancelActiveSanctuaryEarly = useCallback(() => {
    const endsAtMin = rawActiveSanctuary.endsAtMin;
    const deltaMin =
      endsAtMin !== undefined
        ? endsAtMin >= p.nowTickMin ? endsAtMin - p.nowTickMin : 1440 - p.nowTickMin + endsAtMin
        : 60;
    const untilMs = Date.now() + Math.max(1, deltaMin) * 60_000;
    p.localWriteLockUntilRef.current = Date.now() + 5000;
    sanctuaryOverrideUntilMsRef.current = untilMs;
    setSanctuaryOverrideUntilMs(untilMs);
    try { localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(untilMs)); } catch { /* ignore */ }
    p.lastScheduledAlarmsJsonRef.current = '';
    p.lastSyncedCloudAlarmsJsonRef.current = '';
    void p.saveCloudUserSettingsRef.current({ sanctuaryOverrideUntilMs: untilMs });
    void p.pushToTasksVaultRef.current({ sanctuaryOverrideUntilMs: untilMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawActiveSanctuary.endsAtMin, p.nowTickMin]);

  useEffect(() => {
    if (activeSanctuary.type === 'prayer' && activeOneTimeSilenceMinutes >= 5) {
      p.wasInPrayerSanctuaryRef.current = true;
      return;
    }
    if (activeSanctuary.type !== 'prayer' && p.wasInPrayerSanctuaryRef.current) {
      p.wasInPrayerSanctuaryRef.current = false;
      p.updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({ ...prev, oneTimeSilenceMinutes: 0, oneTimeSilenceDateKey: '' })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSanctuary.type, activeOneTimeSilenceMinutes]);

  const effectiveDayMode: DayMode = dailyRhythmPlan.isFastingToday ? 'fasting' : p.dayMode;

  return {
    calendarList, setCalendarList, calendarEvents, setCalendarEvents, recentlyCreatedEventIdsRef,
    loadingEvents, setLoadingEvents, googleTaskLists, setGoogleTaskLists, googleTasks, setGoogleTasks,
    recentlyCreatedTaskIdsRef, loadingTasks, setLoadingTasks, weatherInfo, setWeatherInfo,
    gmailDigest, setGmailDigest, gmailScannedCount, setGmailScannedCount, loadingGmail, setLoadingGmail,
    gmailNeedsReauth, setGmailNeedsReauth, gmailError, setGmailError, chatMessages, setChatMessages,
    includePrayerAnchors, setIncludePrayerAnchors, useOfflineDemo, setUseOfflineDemo,
    completedOverrides, setCompletedOverrides, reflowedBlocksOverride, setReflowedBlocksOverride,
    undoSnapshot, setUndoSnapshot, profileLocation, activeLocation, activeTimeZone, todayCairoIso,
    prayers, todayCalendarMeta, tomorrowInfo, dailyRhythmPlan, tomorrowAlert, lowEnergyActive,
    activeOneTimeSilenceMinutes, sanctuaryOverrideUntilMs, setSanctuaryOverrideUntilMs,
    sanctuaryOverrideUntilMsRef, activeSanctuary, handleCancelActiveSanctuaryEarly, effectiveDayMode,
  };
}
