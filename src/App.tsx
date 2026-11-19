/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ActiveSanctuaryState,
  ActiveTab,
  AppLanguage,
  BatteryGuardState,
  CalendarActionProposal,
  CalendarExecutionResult,
  CalendarTombstone,
  CreativeActivityActionProposal,
  CreativeActivityItem,
  CreativeActivityPlacement,
  CreativeCadence,
  CreativeExecutionResult,
  DayMode,
  DeletedWorkspaceSnapshot,
  DualStreaks,
  FreeTimeSlot,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  HydrationDayLog,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationItem,
  MemoryActionProposal,
  MemoryCategory,
  MemoryItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  PomodoroState,
  QuietModeType,
  ScheduleBlock,
  SharedChangelogEntry,
  SilentNotificationItem,
  SoundRepeatSetting,
  SurfaceTheme,
  SyncTierMode,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  WeatherHydrationInfo,
  WorkspaceSyncSignal,
} from './types/dayrhythm';
import {
  getCalendarAccessToken,
  initCalendarAuth,
  observeFirebaseUser,
  signInWithGoogleCalendar,
  signOutGoogleCalendar,
} from './services/googleCalendarAuth';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_MEDICATIONS,
  DEFAULT_MEMORIES,
  OnePlusDeviceSettings,
  deleteCreativeActivityRecord,
  deleteMedicationRecord,
  deleteMemoryRecord,
  publishWorkspaceSyncSignal,
  sanitizeCreativeActivityId,
  sanitizeCreativeActivityItem,
  sanitizeDeviceSettings,
  sanitizeLifeProfile,
  sanitizeMedicationId,
  sanitizeMedicationItem,
  sanitizeMemoryId,
  sanitizeMemoryItem,
  sanitizeSoundRepeats,
  saveUserRhythmState,
  subscribeCreativeActivities,
  subscribeMedications,
  subscribeMemories,
  subscribeUserRhythmState,
  upsertCreativeActivityRecord,
  upsertMedicationRecord,
  upsertMemoryRecord,
} from './firebase';
import {
  HOME_LOCATION,
  PRESET_LOCATIONS,
  calculateEgyptianPrayerTimes,
  formatCairoNow12h,
  formatIsoTo12h,
  formatMinutes12h,
  getCairoNowMinutes,
  getCairoTodayIso,
  getTimeZoneUtcOffsetHours,
  getTodayCalendarMeta,
  getWeekdayInTimeZone,
  haversineDistanceKm,
  parseIsoToCairoInfo,
} from './engines/prayerEngine';
import {
  DEFAULT_LIFE_PROFILE,
  analyzeTomorrowAlert,
  buildLifeProfileGeminiSummary,
  computeCreativePlacements,
  computeDailyRhythmPlan,
  findFreeTimeSlotsForToday,
} from './engines/lifeRhythmEngine';
import { applyTravelMatrix, buildBaseSchedule } from './engines/scheduleEngine';
import {
  DEFAULT_SOUND_REPEATS,
  TASK_SOUND_META,
  evaluateAudioSanctuary,
  playSoftChime,
  playTaskSignature,
  stopContinuousAlert,
} from './engines/audioEngine';
import { fetchOpenMeteoWeather, loadCachedWeather } from './engines/weatherEngine';
import { triggerHapticWaveform } from './engines/hapticsEngine';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { MobilePreviewView } from './components/MobilePreviewView';
import { OverlaySimulatorView } from './components/OverlaySimulatorView';
import { GeminiAssistantView } from './components/GeminiAssistantView';
import { ArchitectureBlueprintView } from './components/ArchitectureBlueprintView';
import { TravelModeModal } from './components/TravelModeModal';
import { SmartCatchUpModal } from './components/SmartCatchUpModal';
import { PomodoroModal } from './components/PomodoroModal';
import { FloatingPiPCapsule } from './components/FloatingPiPCapsule';
import { LifeProfileModal } from './components/LifeProfileModal';
import { OfflineIndicator } from './components/OfflineIndicator';

const STORAGE_KEY = 'dayrhythm_state_v3';
const MEDS_STORAGE_KEY = 'dayrhythm_medications_v1';
const CREATIVE_STORAGE_KEY = 'dayrhythm_creative_v1';
const MEMORIES_STORAGE_KEY = 'dayrhythm_memories_v1';
const CHAT_STORAGE_KEY = 'dayrhythm_gemini_chats_v1';
const SILENT_NOTIFS_STORAGE_KEY = 'dayrhythm_silent_notifs_v1';
const WATER_REMINDER_STORAGE_KEY = 'dayrhythm_water_reminders_v1';

const WELCOME_MESSAGE: PersistedChatMessage = {
  id: 'welcome-1',
  role: 'model',
  mode: 'chat',
  text: 'أهلاً بك في شات «إيقاع اليوم | DayRhythm» المربوط بـ Google Calendar و Google Tasks والدستور الشخصي وذاكرة Gemini الدائمة. أخبرني بأي تغيير في الوزن أو الشغل أو قاعدة جديدة وسأحفظها دائماً وأجهز التعديلات بعد تأكيدك.',
};

function loadSavedChats(): PersistedChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return [WELCOME_MESSAGE];
}

function loadSavedMedications(): MedicationItem[] {
  try {
    const raw = localStorage.getItem(MEDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((m) => sanitizeMedicationItem(m));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MEDICATIONS;
}

function loadSavedCreativeActivities(): CreativeActivityItem[] {
  try {
    const raw = localStorage.getItem(CREATIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((a) => sanitizeCreativeActivityItem(a));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_CREATIVE_ACTIVITIES;
}

function loadSavedMemories(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(MEMORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((m) => sanitizeMemoryItem(m));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MEMORIES;
}

function loadSavedSilentNotifications(): SilentNotificationItem[] {
  try {
    const raw = localStorage.getItem(SILENT_NOTIFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 25);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function getLast7CairoLabels(): string[] {
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
    const weekdayEn = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      weekday: 'short',
    }).format(d);
    return map[weekdayEn] ?? 'يوم';
  });
}

function buildInitialHydrationHistory(targetCups: number): HydrationDayLog[] {
  const labels = getLast7CairoLabels();
  const todayIso = getCairoTodayIso();

  return labels.map((labelAr, idx) => ({
    dateKey: idx === 6 ? todayIso : `day-${idx}`,
    labelAr,
    cupsLogged: 0,
    targetCups,
    slots: Array.from({ length: targetCups }, () => false),
  }));
}

function rollOverHydrationHistoryIfNeeded(
  history: HydrationDayLog[],
  targetCups: number
): HydrationDayLog[] {
  const todayIso = getCairoTodayIso();
  const labels = getLast7CairoLabels();
  const last = history[history.length - 1];
  if (last && last.dateKey === todayIso) {
    return history.map((d, idx) => ({ ...d, labelAr: labels[idx] ?? d.labelAr }));
  }
  // New Cairo day started: shift history left and start today fresh at 0 cups
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

const INITIAL_TOMBSTONES: CalendarTombstone[] = [];

const INITIAL_PERIODIC_RITUALS: PeriodicRitualStatus[] = [
  {
    id: 'room_weekly',
    emojiPair: '🧹 🛏️',
    titleAr: 'تنظيف الغرفة الأسبوعي',
    titleEn: 'Weekly Room Cleanup',
    intervalDays: 7,
    timeLabelAr: 'كل جمعة 03:30 م',
    daysSinceLast: 5,
    lastCompletedIso: '2026-11-13',
  },
  {
    id: 'pc_biweekly',
    emojiPair: '💻 🧼',
    titleAr: 'تنظيف الكمبيوتر كل جمعتين',
    titleEn: 'Biweekly PC Cleanup',
    intervalDays: 14,
    timeLabelAr: 'كل جمعتين 04:15 م',
    daysSinceLast: 12,
    lastCompletedIso: '2026-11-06',
  },
  {
    id: 'personal_monthly',
    emojiPair: '✂️ 🚿',
    titleAr: 'التنظيف الشخصي الدوري (كل 30 يوماً)',
    titleEn: 'Personal Grooming Cycle (30d)',
    intervalDays: 30,
    timeLabelAr: 'دورة كل 30 يوماً',
    daysSinceLast: 24,
    lastCompletedIso: '2026-10-25',
  },
];

const INITIAL_CHANGELOG: SharedChangelogEntry[] = [
  { id: 'cl-13', version: 13, timestampStr: '2026-11-18 · 12:35 م', device: 'Gemini API', noteAr: 'تحويل التطبيق لنظام 12 ساعة + عرض بيانات Google Calendar و Google Tasks وشات Gemini الحقيقية', noteEn: 'Switched to 12-hour format & live Google Calendar + Tasks + Gemini Chat' },
  { id: 'cl-12', version: 12, timestampStr: '2026-11-18 · 11:15 ص', device: 'Gemini API', noteAr: 'دمج Google Calendar API v3 المباشر مع شات Gemini والتأكيد الصريح', noteEn: 'Integrated Google Calendar API v3 with Gemini Chat' },
  { id: 'cl-11', version: 11, timestampStr: '2026-11-18 · 10:40 ص', device: 'OnePlus 12R', noteAr: 'تفعيل بلاطات Quick Settings + حارس قبل النوم 8:35–9:10 م + الشحن التجاوزي 80%/90%', noteEn: 'Enabled Quick Settings Tiles & Bypass/Bedtime Guard' },
  { id: 'cl-10', version: 10, timestampStr: '2026-11-18 · 10:12 ص', device: 'Web/PC', noteAr: 'إضافة التعافي من Sleep (WM_POWERBROADCAST) وقفل QLocalServer والتبديل AR/EN', noteEn: 'Added Sleep/Wake recovery, QLocalServer & AR/EN switch' },
  { id: 'cl-9', version: 9, timestampStr: '2026-11-17 · 09:05 م', device: 'OnePlus 12R', noteAr: 'تفعيل حساس التراجع بالهز لمدة 8 ثوانٍ (gForce > 2.6f)', noteEn: 'Enabled 8s Shake-to-Undo accelerometer threshold' },
  { id: 'cl-8', version: 8, timestampStr: '2026-11-17 · 07:30 م', device: 'Web/PC', noteAr: 'إطلاق كبسولة سطح المكتب العائمة PiP وتنظيف 14-يوم Tombstones', noteEn: 'Launched Mini Floating PiP Capsule & 14-day sweeper' },
  { id: 'cl-7', version: 7, timestampStr: '2026-11-16 · 02:20 م', device: 'Web/PC', noteAr: 'اعتماد مرساة طقوس الجمعة (1:15 م، 3:30 م، 4:15 م) + دورة 30 يوماً', noteEn: 'Locked Friday Rituals Anchor Engine + 30d grooming cycle' },
  { id: 'cl-6', version: 6, timestampStr: '2026-11-15 · 04:00 م', device: 'OnePlus 12R', noteAr: 'ضبط حارس شحن 100W SUPERVOOC 90% وكتم الكمبيوتر عند ACTION_POWER_DISCONNECTED', noteEn: 'Configured 100W SUPERVOOC 90% disconnect auto-dismiss' },
  { id: 'cl-5', version: 5, timestampStr: '2026-11-14 · 09:45 ص', device: 'Web/PC', noteAr: 'إضافة الرسم البياني الأسبوعي Recharts لمحرك الترطيب (177 مل)', noteEn: 'Added Recharts weekly hydration visualization' },
  { id: 'cl-4', version: 4, timestampStr: '2026-11-13 · 06:10 م', device: 'OnePlus 12R', noteAr: 'تطبيق قناة USAGE_ALARM لأذان الصلوات الخمس بصوت نقي فوق الصامت', noteEn: 'Enabled USAGE_ALARM pure-audio override' },
  { id: 'cl-3', version: 3, timestampStr: '2026-11-12 · 12:30 م', device: 'Web/PC', noteAr: 'اعتماد خوارزمية امتصاص الفجوة W = T_anchor - T_now ومصفوفة السفر', noteEn: 'Finalized Collision-Free Reflow & Travel Matrix' },
  { id: 'cl-2', version: 2, timestampStr: '2026-11-11 · 08:00 ص', device: 'OnePlus 12R', noteAr: 'تشفير مفاتيح LAN via DPAPI + Android Keystore + HMAC-SHA256', noteEn: 'Hardened Zero-Cloud LAN DPAPI/Keystore security' },
  { id: 'cl-1', version: 1, timestampStr: '2026-11-10 · 05:00 ص', device: 'Web/PC', noteAr: 'تأسيس نواة DayRhythm ومواقيت الهيئة المصرية (-3 د) للضهرية', noteEn: 'Initialized DayRhythm Egyptian Survey (-3m) engine' },
];

function extractEmojiPair(summary: string, fallback = '📅'): string {
  const tokens = summary.trim().split(/\s+/).filter(Boolean);
  const emojiRe = /\p{Extended_Pictographic}/u;
  const leading: string[] = [];
  for (const tok of tokens) {
    // Token is purely emoji / variation selectors / ZWJ
    const stripped = tok.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
    if (emojiRe.test(tok) && stripped.length === 0) {
      leading.push(tok);
      if (leading.length === 3) break;
    } else {
      break;
    }
  }
  if (leading.length > 0) {
    return leading.join(' ');
  }
  if (tokens.length > 0 && emojiRe.test(tokens[0])) {
    return tokens[0];
  }
  return fallback;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [dayMode] = useState<DayMode>('normal');
  const [isFridayMode, setIsFridayMode] = useState<boolean>(
    () => new Date().getDay() === 5
  );
  const [includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup] = useState<boolean>(true);
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>('amoled');

  // 4 Smart Timed Quiet Modes + Auto-Revert Timer
  const [quietMode, setQuietMode] = useState<QuietModeType>('normal');
  const [quietRemainingSec, setQuietRemainingSec] = useState<number>(0);
  const [stealthAudioOnly, setStealthAudioOnly] = useState<boolean>(false);
  const [adhanOverrideSilent, setAdhanOverrideSilent] = useState<boolean>(true);
  const [alarmRinging, setAlarmRinging] = useState<boolean>(false);

  const [syncTier, setSyncTier] = useState<SyncTierMode>('google_calendar_api');
  const [periodicRituals, setPeriodicRituals] = useState<PeriodicRitualStatus[]>(
    INITIAL_PERIODIC_RITUALS
  );
  const [changelog, setChangelog] = useState<SharedChangelogEntry[]>(INITIAL_CHANGELOG);

  const [travelState, setTravelState] = useState<TravelState>({
    active: false,
    location: HOME_LOCATION,
    distanceKm: 0,
    durationMode: 'today',
    postponedTaskIds: ['room_cleanup'],
    enabledWorkTaskIds: ['deep_work_1', 'deep_work_2', 'practical_work_3', 'light_workout'],
  });

  // Live Google Workspace & Firebase Sync State (Calendar + Tasks + Firestore + Persisted Gemini Chat)
  const [needsAuth, setNeedsAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [deviceSettings, setDeviceSettings] = useState<OnePlusDeviceSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.deviceSettings) {
          return sanitizeDeviceSettings(parsed.deviceSettings);
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_DEVICE_SETTINGS;
  });

  const [lifeProfile, setLifeProfile] = useState<LifeProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lifeProfile) {
          return sanitizeLifeProfile(parsed.lifeProfile);
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_LIFE_PROFILE;
  });

  const [fastingOverride, setFastingOverride] = useState<'auto' | 'fasting' | 'normal'>('auto');
  const [isLifeProfileModalOpen, setIsLifeProfileModalOpen] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);

  // Automatic Audio Silence Sanctuaries + 1-Tap Meeting Mode + Preserved Silent Notifications
  const [meetingModeActive, setMeetingModeActive] = useState(false);
  const [nowTickMin, setNowTickMin] = useState<number>(() => getCairoNowMinutes());
  const [silentNotifications, setSilentNotifications] = useState<SilentNotificationItem[]>(
    loadSavedSilentNotifications
  );
  const [activeAudioAlert, setActiveAudioAlert] = useState<{
    id: string;
    title: string;
    category: TaskSoundCategory;
    isContinuous?: boolean;
  } | null>(null);

  const clientIdRef = useRef<string>(
    `dr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const seenSyncOpIdsRef = useRef<Set<string>>(new Set());
  const restoredOpIdsRef = useRef<Set<string>>(new Set());
  const wasInPrayerSanctuaryRef = useRef<boolean>(false);
  const [lastDeletedWorkspaceItem, setLastDeletedWorkspaceItem] =
    useState<DeletedWorkspaceSnapshot | null>(null);

  const skipNextRemotePushRef = useRef(false);
  const hasHydratedRemoteRef = useRef(false);

  const [calendarList, setCalendarList] = useState<GoogleCalendarInfo[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [googleTaskLists, setGoogleTaskLists] = useState<GoogleTaskList[]>([]);
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Free Open-Meteo Weather Hydration Sync + Read-Only Smart Gmail Digest
  const [weatherInfo, setWeatherInfo] = useState<WeatherHydrationInfo | null>(loadCachedWeather);
  const [gmailDigest, setGmailDigest] = useState<GmailDigestItem[]>([]);
  const [gmailScannedCount, setGmailScannedCount] = useState<number>(0);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailNeedsReauth, setGmailNeedsReauth] = useState(false);
  const [gmailError, setGmailError] = useState('');

  // Persisted Gemini chat messages across sessions/tabs
  const [chatMessages, setChatMessages] = useState<PersistedChatMessage[]>(loadSavedChats);

  // Toggles for Prayer Anchors overlay & Explicit Offline Demo fallback (false by default!)
  const [includePrayerAnchors, setIncludePrayerAnchors] = useState<boolean>(true);
  const [useOfflineDemo, setUseOfflineDemo] = useState<boolean>(false);
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({});
  const [reflowedBlocksOverride, setReflowedBlocksOverride] = useState<ScheduleBlock[] | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ScheduleBlock[] | null>(null);

  const profileLocation = useMemo(
    () => ({
      id: 'profile_loc',
      nameAr: lifeProfile.currentCityName,
      nameEn: lifeProfile.currentCityName,
      lat: lifeProfile.currentLat,
      lng: lifeProfile.currentLng,
      tzOffsetHours: getTimeZoneUtcOffsetHours(lifeProfile.currentTimeZone),
      timeZone: lifeProfile.currentTimeZone,
    }),
    [lifeProfile]
  );

  const activeLocation = travelState.active ? travelState.location : profileLocation;

  // Auto-sync free Open-Meteo temperature for active location (cached 60m for offline resilience)
  useEffect(() => {
    let cancelled = false;
    void fetchOpenMeteoWeather(activeLocation.lat, activeLocation.lng).then((info) => {
      if (!cancelled && info) {
        setWeatherInfo(info);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeLocation.lat, activeLocation.lng]);

  const prayers = useMemo(
    () =>
      calculateEgyptianPrayerTimes(
        activeLocation,
        new Date(),
        lifeProfile.adhanLeadMinutes
      ),
    [activeLocation, lifeProfile.adhanLeadMinutes]
  );

  const todayCalendarMeta: TodayCalendarMeta = useMemo(
    () =>
      getTodayCalendarMeta(
        activeLocation.timeZone ?? lifeProfile.currentTimeZone ?? 'Africa/Cairo'
      ),
    // Refresh metadata when timezone changes or date rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLocation.timeZone, lifeProfile.currentTimeZone, Math.floor(nowTickMin / 60)]
  );

  const todayCairoIso = getCairoTodayIso();

  const tomorrowInfo = useMemo(() => {
    const tz = activeLocation.timeZone ?? lifeProfile.currentTimeZone ?? 'Africa/Cairo';
    const todayW = getWeekdayInTimeZone(tz);
    const base = new Date(`${todayCairoIso}T12:00:00Z`);
    const nextIso = Number.isNaN(base.getTime())
      ? ''
      : new Date(base.getTime() + 86_400_000).toISOString().slice(0, 10);
    return {
      todayW,
      tomorrowW: (todayW + 1) % 7,
      tomorrowIso: nextIso,
    };
  }, [activeLocation.timeZone, lifeProfile.currentTimeZone, todayCairoIso]);

  const dailyRhythmPlan = useMemo(
    () =>
      computeDailyRhythmPlan(lifeProfile, prayers, {
        todayWeekday: tomorrowInfo.todayW,
        tomorrowWeekday: tomorrowInfo.tomorrowW,
        fastingOverride,
        heatBonusMl: weatherInfo?.heatBonusMl ?? 0,
      }),
    [tomorrowInfo.todayW, tomorrowInfo.tomorrowW, fastingOverride, lifeProfile, prayers, weatherInfo?.heatBonusMl]
  );

  const tomorrowAlert: TomorrowAlertInfo | null = useMemo(
    () => analyzeTomorrowAlert(calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW),
    [calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW]
  );

  const lowEnergyActive = lifeProfile.lowEnergyDateKey === todayCairoIso;
  const activeOneTimeSilenceMinutes =
    lifeProfile.oneTimeSilenceDateKey === todayCairoIso
      ? lifeProfile.oneTimeSilenceMinutes ?? 0
      : 0;

  const activeSanctuary: ActiveSanctuaryState = useMemo(
    () =>
      evaluateAudioSanctuary({
        nowMin: nowTickMin,
        prayers,
        bedtimeMin: dailyRhythmPlan.bedtimeMin,
        wakeMin: dailyRhythmPlan.wakeMin,
        prayerSilenceMinutes: lifeProfile.prayerSilenceMinutes,
        fajrSilenceMinutes: lifeProfile.fajrSilenceMinutes,
        oneTimeSilenceMinutes: activeOneTimeSilenceMinutes,
        meetingActive: meetingModeActive,
        isFriday: isFridayMode,
      }),
    [
      nowTickMin,
      prayers,
      dailyRhythmPlan.bedtimeMin,
      dailyRhythmPlan.wakeMin,
      lifeProfile.prayerSilenceMinutes,
      lifeProfile.fajrSilenceMinutes,
      activeOneTimeSilenceMinutes,
      meetingModeActive,
      isFridayMode,
    ]
  );

  // Auto-revert one-time prayer silence override immediately after that single prayer finishes
  useEffect(() => {
    if (activeSanctuary.type === 'prayer' && activeOneTimeSilenceMinutes >= 5) {
      wasInPrayerSanctuaryRef.current = true;
      return;
    }
    if (activeSanctuary.type !== 'prayer' && wasInPrayerSanctuaryRef.current) {
      wasInPrayerSanctuaryRef.current = false;
      setLifeProfile((prev) =>
        sanitizeLifeProfile({
          ...prev,
          oneTimeSilenceMinutes: 0,
          oneTimeSilenceDateKey: '',
        })
      );
    }
  }, [activeSanctuary.type, activeOneTimeSilenceMinutes]);

  const effectiveDayMode: DayMode = dailyRhythmPlan.isFastingToday ? 'fasting' : dayMode;

  const [offlineBlocks, setOfflineBlocks] = useState<ScheduleBlock[]>(() =>
    buildBaseSchedule('normal', calculateEgyptianPrayerTimes(HOME_LOCATION), {
      isFriday: new Date().getDay() === 5,
      includeBiweeklyPcCleanup: true,
    })
  );

  const [lastDeletedBlock, setLastDeletedBlock] = useState<ScheduleBlock | null>(null);
  const [shakeUndoSecondsLeft, setShakeUndoSecondsLeft] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string>('');

  const [tombstones, setTombstones] = useState<CalendarTombstone[]>(INITIAL_TOMBSTONES);

  const [batteryGuard, setBatteryGuard] = useState<BatteryGuardState>({
    levelPct: 78,
    cableConnected: true,
    bypassChargingLimitPct: null,
    eveningTimeSimMin: 20 * 60 + 45,
    pcAlertActive: false,
    autoSilencedByDisconnect: false,
    bedtimeGuardTriggered: false,
  });

  const targetCups = dailyRhythmPlan.activeTargetCups;

  const [hydrationHistory, setHydrationHistory] = useState<HydrationDayLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.hydrationHistory) && parsed.hydrationHistory.length === 7) {
          return rollOverHydrationHistoryIfNeeded(parsed.hydrationHistory, targetCups);
        }
      }
    } catch {
      // ignore storage errors
    }
    return buildInitialHydrationHistory(targetCups);
  });

  // Sync today's hydration target & slot count whenever weight/height/cupSize/fasting changes
  useEffect(() => {
    setHydrationHistory((prev) => {
      const today = prev[prev.length - 1];
      if (!today || today.targetCups === targetCups) return prev;
      const next = [...prev];
      const clampedLogged = Math.min(today.cupsLogged, targetCups);
      next[next.length - 1] = {
        ...today,
        targetCups,
        cupsLogged: clampedLogged,
        slots: Array.from({ length: targetCups }, (_, idx) => idx < clampedLogged),
      };
      return next;
    });
  }, [targetCups]);

  const [medications, setMedications] = useState<MedicationItem[]>(loadSavedMedications);
  const seededDefaultMedRef = useRef(false);

  const [creativeActivities, setCreativeActivities] = useState<CreativeActivityItem[]>(
    loadSavedCreativeActivities
  );
  const seededDefaultCreativeRef = useRef(false);

  const [waterRemindersEnabled, setWaterRemindersEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WATER_REMINDER_STORAGE_KEY);
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const firedReminderKeysRef = useRef<Set<string>>(new Set());

  const [memories, setMemories] = useState<MemoryItem[]>(loadSavedMemories);
  const seededDefaultMemoriesRef = useRef(false);
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [autoStartVoice, setAutoStartVoice] = useState(false);
  const shortcutHandledRef = useRef(false);

  const [streaks, setStreaks] = useState<DualStreaks>({
    dailyCommitmentDays: 0,
    dailyCommitmentDoneToday: false,
    waterTargetDays: 0,
    waterTargetDoneToday: false,
  });

  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    phase: 'focus',
    presetMinutes: 25,
    remainingSeconds: 25 * 60,
    totalSeconds: 25 * 60,
    isRunning: false,
    completedCycles: 0,
  });

  const [isTravelModalOpen, setIsTravelModalOpen] = useState(false);
  const [isCatchUpModalOpen, setIsCatchUpModalOpen] = useState(false);
  const [isPomodoroModalOpen, setIsPomodoroModalOpen] = useState(false);

  const [simulateUnder60s, setSimulateUnder60s] = useState(false);
  const [liveCountdownSec, setLiveCountdownSec] = useState(47);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 4000);
  }, []);

  const appendChangelog = useCallback(
    (
      device: SharedChangelogEntry['device'],
      noteAr: string,
      noteEn: string
    ) => {
      const ts = `${getCairoTodayIso()} · ${formatCairoNow12h('ar')}`;
      setChangelog((prev) => [
        {
          id: `cl-${Date.now()}`,
          version: (prev[0]?.version ?? 13) + 1,
          timestampStr: ts,
          device,
          noteAr,
          noteEn,
        },
        ...prev,
      ]);
    },
    []
  );

  // Instant AR <-> EN DOM dir + lang switching without reload
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Persist Gemini chat messages
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages.slice(-60)));
    } catch {
      // ignore quota errors
    }
  }, [chatMessages]);

  // Persist preserved silent notifications (during Prayer, Sleep, or Meeting sanctuaries)
  useEffect(() => {
    try {
      localStorage.setItem(
        SILENT_NOTIFS_STORAGE_KEY,
        JSON.stringify(silentNotifications.slice(0, 25))
      );
    } catch {
      // ignore quota errors
    }
  }, [silentNotifications]);

  // Keep current minute ticking every 30s for automatic Prayer & Sleep audio sanctuaries
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTickMin(getCairoNowMinutes());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleToggleMeetingMode = useCallback(() => {
    setMeetingModeActive((prev) => {
      const next = !prev;
      showToast(
        next
          ? '🎙️ تم تفعيل وضع الاجتماع — كتم الصوت + اهتزاز فقط مع حفظ كل الإشعارات'
          : '🔊 تم إنهاء وضع الاجتماع وعاد الصوت لوضعه الطبيعي'
      );
      return next;
    });
  }, [showToast]);

  const handleClearSilentNotifications = useCallback(() => {
    setSilentNotifications([]);
    showToast('تم مسح الإشعارات الصامتة المحفوظة ✓');
  }, [showToast]);

  const emitCrossDeviceSync = useCallback(
    (
      scope: WorkspaceSyncSignal['scope'],
      action: string,
      undoSnapshotPayload?: DeletedWorkspaceSnapshot
    ) => {
      const opId = `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      seenSyncOpIdsRef.current.add(opId);
      const timestampMs = Date.now();
      const packet = {
        type: 'broadcast',
        opId,
        clientId: clientIdRef.current,
        scope,
        action,
        undoSnapshot: undoSnapshotPayload,
        timestampMs,
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(packet));
        } catch {
          // ignore transient WS send error
        }
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('dayrhythm_sync');
          bc.postMessage({ ...packet, type: 'sync' });
          bc.close();
        } catch {
          // ignore BroadcastChannel errors
        }
      }

      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void publishWorkspaceSyncSignal(firebaseUser.uid, {
          opId,
          clientId: clientIdRef.current,
          scope,
          action,
          timestampMs,
        });
      }
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]
  );

  const handleAcknowledgeAudioAlert = useCallback(() => {
    stopContinuousAlert();
    if (!activeAudioAlert) return;
    const title = activeAudioAlert.title;
    setActiveAudioAlert(null);
    triggerHapticWaveform('shake_undo');
    emitCrossDeviceSync('alarm_dismiss', 'dismiss');
    showToast(`✓ تم إيقاف وتأكيد تنبيه «${title}» على أجهزتك`);
  }, [activeAudioAlert, emitCrossDeviceSync, showToast]);

  // Auto-dismiss non-continuous active audio alert banner after 12 seconds (continuous loops stay until user stops!)
  useEffect(() => {
    if (!activeAudioAlert || activeAudioAlert.isContinuous) return;
    const id = window.setTimeout(() => {
      setActiveAudioAlert(null);
    }, 12_000);
    return () => window.clearTimeout(id);
  }, [activeAudioAlert]);

  // Hardware Shake-to-Acknowledge listener (gForce > 2.5g when a distinct task alert is active)
  useEffect(() => {
    if (!activeAudioAlert || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      const gForce = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (gForce > 2.5) {
        handleAcknowledgeAudioAlert();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [activeAudioAlert, handleAcknowledgeAudioAlert]);

  const triggerTaskAlert = useCallback(
    (
      title: string,
      category: TaskSoundCategory,
      options?: { bypassSanctuary?: boolean }
    ) => {
      const meta = TASK_SOUND_META[category];
      const repeatCount: SoundRepeatSetting =
        (lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS)[category] ??
        DEFAULT_SOUND_REPEATS[category] ??
        1;

      if (!options?.bypassSanctuary && activeSanctuary.type !== 'none') {
        playTaskSignature(category, { sanctuary: activeSanctuary, repeatCount: 1 });
        const reasonAr =
          activeSanctuary.type === 'prayer'
            ? 'وقت الصلاة'
            : activeSanctuary.type === 'sleep'
              ? 'وقت النوم'
              : 'وضع الاجتماع';
        const item: SilentNotificationItem = {
          id: `sn_${Date.now().toString(36)}`,
          title,
          reasonAr,
          time12h: formatCairoNow12h('ar'),
          soundCategory: category,
          createdAtIso: new Date().toISOString(),
        };
        setSilentNotifications((prev) => [item, ...prev].slice(0, 25));
        showToast(`🔕 تم حفظ تنبيه «${title}» صامتاً (${reasonAr}) دون صوت`);
        return;
      }

      const playRes = playTaskSignature(category, {
        bypassSanctuary: true,
        repeatCount,
      });
      setActiveAudioAlert({
        id: `alert_${Date.now().toString(36)}`,
        title,
        category,
        isContinuous: playRes.isContinuous,
      });
      showToast(
        playRes.isContinuous
          ? `${meta.icon} رنين مستمر «${meta.labelAr}»: ${title} — اضغط إيقاف أو هُز الهاتف`
          : `${meta.icon} نغمة «${meta.labelAr}» (${repeatCount}×): ${title}`
      );
    },
    [activeSanctuary, lifeProfile.soundRepeats, showToast]
  );

  // Auto-revert countdown for Smart Timed Quiet Modes
  useEffect(() => {
    if (quietMode === 'normal' || quietRemainingSec <= 0) return;
    const id = window.setInterval(() => {
      setQuietRemainingSec((prev) => {
        if (prev <= 1) {
          setQuietMode('normal');
          showToast('🔊 انتهى مؤقت الهدوء — عاد النظام للوضع العادي تلقائياً');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [quietMode, quietRemainingSec, showToast]);

  const handleSetQuietMode = useCallback(
    (mode: QuietModeType, durationMinutes: number) => {
      setQuietMode(mode);
      if (mode === 'normal' || durationMinutes <= 0) {
        setQuietRemainingSec(0);
        showToast('🔊 تم التبديل للوضع العادي الكامل');
      } else {
        setQuietRemainingSec(durationMinutes * 60);
        showToast(`🔕 تفعيل وضع الهدوء (${mode}) لمدة ${durationMinutes} دقيقة`);
      }
      appendChangelog('Web/PC', `ضبط وضع الهدوء إلى ${mode}`, `Set quiet mode to ${mode}`);
    },
    [appendChangelog, showToast]
  );

  const handleCycleQuietMode = useCallback(() => {
    const order: QuietModeType[] = ['normal', 'mute_audio', 'vibrate_only', 'silent_all'];
    const next = order[(order.indexOf(quietMode) + 1) % order.length];
    handleSetQuietMode(next, next === 'normal' ? 0 : 30);
  }, [handleSetQuietMode, quietMode]);

  const fetchCalendarEvents = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/calendar/events', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setNeedsAuth(true);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        if (Array.isArray(data.calendars)) setCalendarList(data.calendars);
        if (Array.isArray(data.events)) setCalendarEvents(data.events);
      }
    } catch {
      // ignore transient network errors
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchGoogleTasks = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? getCalendarAccessToken();
    if (!token) return;
    setLoadingTasks(true);
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setNeedsAuth(true);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        if (Array.isArray(data.taskLists)) setGoogleTaskLists(data.taskLists);
        if (Array.isArray(data.tasks)) setGoogleTasks(data.tasks);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const fetchGmailDigest = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      setGmailNeedsReauth(true);
      return;
    }
    setLoadingGmail(true);
    setGmailError('');
    setGmailNeedsReauth(false);
    try {
      const res = await fetch('/api/gmail/digest', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403 || data.needsReauth) {
        setGmailNeedsReauth(true);
        setGmailError(
          data.error || 'يرجى إعادة تسجيل الدخول بحساب Google لتفعيل صلاحية قراءة Gmail.'
        );
        return;
      }
      if (!res.ok) {
        setGmailError(data.error || 'تعذر قراءة ملخص Gmail حالياً.');
        return;
      }
      setGmailScannedCount(Number(data.scannedCount ?? 0));
      setGmailDigest(Array.isArray(data.digestItems) ? data.digestItems : []);
    } catch {
      setGmailError('تعذر الاتصال بخدمة ملخص Gmail (تأكد من الاتصال بالإنترنت).');
    } finally {
      setLoadingGmail(false);
    }
  }, []);

  const refreshWorkspace = useCallback(
    async (tokenOverride?: string) => {
      await Promise.all([
        fetchCalendarEvents(tokenOverride),
        fetchGoogleTasks(tokenOverride),
      ]);
    },
    [fetchCalendarEvents, fetchGoogleTasks]
  );

  useEffect(() => {
    const unsubCalendar = initCalendarAuth(
      (user, token) => {
        setAuthUser(user);
        setNeedsAuth(false);
        refreshWorkspace(token);
      },
      () => {
        setAuthUser(null);
        setNeedsAuth(true);
      }
    );
    const unsubFirebase = observeFirebaseUser((user) => {
      setFirebaseUser(user);
      if (!user) {
        hasHydratedRemoteRef.current = false;
        setFirestoreReady(false);
        setFirestoreSynced(false);
      }
    });
    return () => {
      unsubCalendar();
      unsubFirebase();
    };
  }, [refreshWorkspace]);

  const handleIncomingRemoteSync = useCallback(
    (payload: {
      opId?: string;
      clientId?: string;
      scope?: string;
      action?: string;
      undoSnapshot?: DeletedWorkspaceSnapshot;
    }) => {
      if (!payload || payload.clientId === clientIdRef.current) return;
      if (payload.opId) {
        if (seenSyncOpIdsRef.current.has(payload.opId)) return;
        seenSyncOpIdsRef.current.add(payload.opId);
        if (seenSyncOpIdsRef.current.size > 150) {
          const oldest = seenSyncOpIdsRef.current.values().next().value;
          if (oldest) seenSyncOpIdsRef.current.delete(oldest);
        }
      }

      if (payload.scope === 'alarm_dismiss') {
        stopContinuousAlert();
        setActiveAudioAlert(null);
        setAlarmRinging(false);
        return;
      }

      if (payload.action === 'undo_restore') {
        setLastDeletedWorkspaceItem(null);
      } else if (payload.undoSnapshot) {
        setLastDeletedWorkspaceItem(payload.undoSnapshot);
      }

      if (payload.scope === 'calendar') {
        void fetchCalendarEvents();
      } else if (payload.scope === 'tasks') {
        void fetchGoogleTasks();
      } else {
        void refreshWorkspace();
      }
    },
    [fetchCalendarEvents, fetchGoogleTasks, refreshWorkspace]
  );

  // Instant Cross-Device WebSocket Sync Hub (/ws/sync) + Same-Origin BroadcastChannel + Tab Focus Refresh
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || !firebaseUser?.emailVerified) {
      setWsConnected(false);
      return;
    }

    let closedByCleanup = false;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let retryDelayMs = 1000;

    const connectWs = () => {
      if (closedByCleanup) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/sync`);
        wsRef.current = ws;

        ws.onopen = () => {
          retryDelayMs = 1000;
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: 'join',
              uid,
              clientId: clientIdRef.current,
            })
          );
          if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
          heartbeatTimer = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25_000);
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type?: string;
              opId?: string;
              clientId?: string;
              scope?: string;
              action?: string;
              undoSnapshot?: DeletedWorkspaceSnapshot;
            };
            if (msg.type === 'sync') {
              handleIncomingRemoteSync(msg);
            }
          } catch {
            // ignore malformed message
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (heartbeatTimer !== null) {
            window.clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          if (!closedByCleanup) {
            reconnectTimer = window.setTimeout(connectWs, retryDelayMs);
            retryDelayMs = Math.min(10_000, retryDelayMs * 1.6);
          }
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            // ignore
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('dayrhythm_sync');
        bc.onmessage = (ev) => {
          if (ev.data?.type === 'sync') {
            handleIncomingRemoteSync(ev.data);
          }
        };
      } catch {
        // ignore BroadcastChannel errors
      }
    }

    const handleResumeSync = () => {
      if (document.visibilityState === 'visible') {
        void refreshWorkspace();
      }
    };
    window.addEventListener('focus', handleResumeSync);
    document.addEventListener('visibilitychange', handleResumeSync);

    return () => {
      closedByCleanup = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
      bc?.close();
      window.removeEventListener('focus', handleResumeSync);
      document.removeEventListener('visibilitychange', handleResumeSync);
    };
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, handleIncomingRemoteSync, refreshWorkspace]);

  // Real-time Firebase Firestore listener (Phone <-> PC instant sync for hydration, streaks, quiet mode & OnePlus 12R settings)
  useEffect(() => {
    if (!firebaseUser?.uid || !firebaseUser.emailVerified) {
      return;
    }

    const uid = firebaseUser.uid;
    const unsubscribe = subscribeUserRhythmState(
      uid,
      (remote) => {
        skipNextRemotePushRef.current = true;
        hasHydratedRemoteRef.current = true;
        setFirestoreReady(true);
        setFirestoreSynced(true);

        setQuietMode(remote.quietMode);
        setAdhanOverrideSilent(remote.adhanOverrideSilent);
        setSurfaceTheme(remote.surfaceTheme);
        setDeviceSettings(remote.deviceSettings);
        setLifeProfile(remote.lifeProfile);

        if (remote.syncSignal) {
          handleIncomingRemoteSync(remote.syncSignal);
        }

        setStreaks({
          dailyCommitmentDays: remote.dailyCommitmentDays,
          dailyCommitmentDoneToday: remote.dailyCommitmentDoneToday,
          waterTargetDays: remote.waterTargetDays,
          waterTargetDoneToday: remote.waterTargetDoneToday,
        });

        const labels = getLast7CairoLabels();
        const todayIso = getCairoTodayIso();
        const isSameDay = remote.hydrationDateKey === todayIso;
        const baseCounts = isSameDay
          ? remote.hydrationWeeklyCounts
          : [...remote.hydrationWeeklyCounts.slice(1), 0];

        setHydrationHistory(
          labels.map((labelAr, idx) => {
            const isToday = idx === 6;
            const t = remote.targetCups;
            const c = isToday
              ? isSameDay
                ? remote.cupsLogged
                : 0
              : baseCounts[idx] ?? 0;
            return {
              dateKey: isToday ? todayIso : `day-${idx}`,
              labelAr,
              cupsLogged: Math.min(t, c),
              targetCups: t,
              slots: Array.from({ length: t }, (_, sIdx) => sIdx < c),
            };
          })
        );
      },
      () => {
        // First time this user connects to Firestore: seed cloud doc from current local state
        hasHydratedRemoteRef.current = true;
        setFirestoreReady(true);
        setFirestoreSynced(false);
      },
      () => {
        setFirestoreSynced(false);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, handleIncomingRemoteSync]);

  // Real-time Firebase Firestore subscription for user's dynamic medications & supplements
  useEffect(() => {
    if (!firebaseUser?.uid || !firebaseUser.emailVerified || !firestoreSynced) {
      return;
    }

    const uid = firebaseUser.uid;
    const unsubscribe = subscribeMedications(
      uid,
      (remoteItems) => {
        if (remoteItems.length === 0 && !seededDefaultMedRef.current) {
          seededDefaultMedRef.current = true;
          for (const localMed of medications) {
            void upsertMedicationRecord(uid, localMed).catch(() => {});
          }
          return;
        }
        seededDefaultMedRef.current = true;
        setMedications(remoteItems);
      },
      () => {
        // Fallback to local state if Firestore temporarily unreachable
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]);

  useEffect(() => {
    try {
      localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(medications));
    } catch {
      // ignore storage errors
    }
  }, [medications]);

  // Real-time Firebase Firestore subscription for Creative Activities (hobbies & side projects)
  useEffect(() => {
    if (!firebaseUser?.uid || !firebaseUser.emailVerified || !firestoreSynced) {
      return;
    }

    const uid = firebaseUser.uid;
    const unsubscribe = subscribeCreativeActivities(
      uid,
      (remoteItems) => {
        if (remoteItems.length === 0 && !seededDefaultCreativeRef.current) {
          seededDefaultCreativeRef.current = true;
          for (const localAct of creativeActivities) {
            void upsertCreativeActivityRecord(uid, localAct).catch(() => {});
          }
          return;
        }
        seededDefaultCreativeRef.current = true;
        setCreativeActivities(remoteItems);
      },
      () => {
        // Fallback to local state if Firestore temporarily unreachable
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]);

  useEffect(() => {
    try {
      localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(creativeActivities));
    } catch {
      // ignore storage errors
    }
  }, [creativeActivities]);

  useEffect(() => {
    try {
      localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(waterRemindersEnabled));
    } catch {
      // ignore storage errors
    }
  }, [waterRemindersEnabled]);

  const handleToggleWaterReminders = useCallback(() => {
    setWaterRemindersEnabled((prev) => {
      const next = !prev;
      showToast(
        next
          ? '🔔 تم تفعيل تنبيهات كل كوب ماء تلقائياً حسب جدولك العلمي'
          : '🔕 تم إيقاف تنبيهات أكواب الماء مؤقتاً'
      );
      return next;
    });
  }, [showToast]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      showToast('المتصفح لا يدعم إشعارات النظام — ستعمل التنبيهات الصوتية داخل التطبيق');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setWaterRemindersEnabled(true);
        showToast('🔔 تم تفعيل إشعارات النظام لكل كوب ماء وجرعة علاج بنجاح ✓');
      } else {
        showToast('تم رفض إشعارات المتصفح — ستظل التنبيهات الصوتية تعمل داخل التطبيق');
      }
    } catch {
      showToast('تعذر طلب صلاحية الإشعارات — ستعمل التنبيهات الصوتية داخل التطبيق');
    }
  }, [showToast]);

  // Real-time Firebase Firestore subscription for Gemini's permanent long-term memory bank
  useEffect(() => {
    if (!firebaseUser?.uid || !firebaseUser.emailVerified || !firestoreSynced) {
      return;
    }

    const uid = firebaseUser.uid;
    const unsubscribe = subscribeMemories(
      uid,
      (remoteItems) => {
        if (remoteItems.length === 0 && !seededDefaultMemoriesRef.current) {
          seededDefaultMemoriesRef.current = true;
          for (const localMem of memories) {
            void upsertMemoryRecord(uid, localMem).catch(() => {});
          }
          return;
        }
        seededDefaultMemoriesRef.current = true;
        setMemories(remoteItems);
      },
      () => {
        // Fallback to local state if Firestore temporarily unreachable
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]);

  useEffect(() => {
    try {
      localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(memories));
    } catch {
      // ignore storage errors
    }
  }, [memories]);

  // Persist local cache & push changes IMMEDIATELY to Firebase Firestore across devices (zero debounce lag)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hydrationHistory, deviceSettings, lifeProfile })
      );
    } catch {
      // ignore quota errors
    }

    if (!firebaseUser?.uid || !firebaseUser.emailVerified || !firestoreReady) {
      return;
    }

    if (skipNextRemotePushRef.current) {
      skipNextRemotePushRef.current = false;
      return;
    }

    if (!hasHydratedRemoteRef.current) {
      return;
    }

    const todayEntry = hydrationHistory[hydrationHistory.length - 1];
    if (!todayEntry) return;

    void saveUserRhythmState(firebaseUser.uid, {
      hydrationDateKey: getCairoTodayIso(),
      cupsLogged: todayEntry.cupsLogged,
      targetCups: todayEntry.targetCups,
      hydrationWeeklyCounts: hydrationHistory.map((d) => d.cupsLogged),
      dailyCommitmentDays: streaks.dailyCommitmentDays,
      dailyCommitmentDoneToday: streaks.dailyCommitmentDoneToday,
      waterTargetDays: streaks.waterTargetDays,
      waterTargetDoneToday: streaks.waterTargetDoneToday,
      quietMode,
      adhanOverrideSilent,
      surfaceTheme,
      deviceSettings,
      lifeProfile,
    })
      .then(() => setFirestoreSynced(true))
      .catch(() => setFirestoreSynced(false));
  }, [
    firebaseUser?.uid,
    firebaseUser?.emailVerified,
    firestoreReady,
    hydrationHistory,
    streaks,
    quietMode,
    adhanOverrideSilent,
    surfaceTheme,
    deviceSettings,
    lifeProfile,
  ]);

  const handleUpdateDeviceSettings = useCallback(
    (patch: Partial<OnePlusDeviceSettings>) => {
      setDeviceSettings((prev) => sanitizeDeviceSettings({ ...prev, ...patch }));
    },
    []
  );

  const handleUpdateLifeProfile = useCallback(
    (patch: Partial<LifeProfile>) => {
      setLifeProfile((prev) => sanitizeLifeProfile({ ...prev, ...patch }));
      showToast('تم حفظ وتحديث «الدستور الشخصي» ومزامنته سحابياً ✓');
    },
    [showToast]
  );

  const handleQuickUpdateWeight = useCallback(
    (nextWeightKg: number) => {
      const clamped = Math.max(35, Math.min(220, Math.round(nextWeightKg * 2) / 2));
      setLifeProfile((prev) => sanitizeLifeProfile({ ...prev, weightKg: clamped }));
      showToast(`⚖️ تم تحديث الوزن إلى ${clamped} كجم وإعادة حساب الماء تلقائياً`);
    },
    [showToast]
  );

  const handleToggleLowEnergyToday = useCallback(() => {
    const todayIso = getCairoTodayIso();
    setLifeProfile((prev) => {
      const nextActive = prev.lowEnergyDateKey !== todayIso;
      showToast(
        nextActive
          ? '🌿 تم تفعيل وضع اليوم الهادئ — الصلاة والنوم محميان ويمكنك تنسيق أي تأجيل مع Gemini'
          : '✓ تم إنهاء وضع اليوم الهادئ وعاد الإيقاع العادي'
      );
      return sanitizeLifeProfile({
        ...prev,
        lowEnergyDateKey: nextActive ? todayIso : '',
      });
    });
  }, [showToast]);

  const handleUpdateSoundRepeat = useCallback(
    (category: TaskSoundCategory, setting: SoundRepeatSetting) => {
      setLifeProfile((prev) => {
        const nextRepeats = sanitizeSoundRepeats({
          ...(prev.soundRepeats ?? DEFAULT_SOUND_REPEATS),
          [category]: setting,
        });
        return sanitizeLifeProfile({
          ...prev,
          soundRepeats: nextRepeats,
        });
      });
      const label = TASK_SOUND_META[category].labelAr;
      showToast(
        setting === 'continuous'
          ? `🔊 «${label}»: رنين مستمر حتى الإيقاف ✓`
          : `🔊 «${label}»: تكرار الرنين ${setting}× ✓`
      );
    },
    [showToast]
  );

  const handleLogSleepQuality = useCallback(
    (mode: 'good' | 'short_30' | 'short_60' | 'reset') => {
      const todayIso = getCairoTodayIso();
      if (mode === 'reset') {
        setLifeProfile((prev) =>
          sanitizeLifeProfile({
            ...prev,
            sleepDebtMinutes: 0,
            sleepDebtLogDateKey: todayIso,
          })
        );
        triggerHapticWaveform('water_cup');
        showToast('😴 تم تصفير رصيد النوم — نومك متوازن الآن ✓');
        return;
      }
      if (mode === 'good') {
        const currentDebt = lifeProfile.sleepDebtMinutes;
        const paidBack =
          currentDebt > 0
            ? Math.min(currentDebt, Math.max(dailyRhythmPlan.nightlyRecoveryMin, 30))
            : 0;
        const nextDebt = Math.max(0, currentDebt - paidBack);
        setLifeProfile((prev) =>
          sanitizeLifeProfile({
            ...prev,
            sleepDebtMinutes: nextDebt,
            sleepDebtLogDateKey: todayIso,
          })
        );
        triggerHapticWaveform('water_cup');
        showToast(
          paidBack > 0
            ? nextDebt === 0
              ? '✨ ممتاز! تم تعويض رصيد النوم بالكامل وعاد نومك لوضعه الطبيعي ✓'
              : `✨ ممتاز! تم تعويض ${paidBack} د من رصيد النوم — المتبقي ${nextDebt} د`
            : '✨ ممتاز! نومك متوازن اليوم (صفر عجز) ✓'
        );
        return;
      }
      const addMin = mode === 'short_60' ? 60 : 30;
      const nextDebt = Math.min(480, lifeProfile.sleepDebtMinutes + addMin);
      setLifeProfile((prev) =>
        sanitizeLifeProfile({
          ...prev,
          sleepDebtMinutes: nextDebt,
          sleepDebtLogDateKey: todayIso,
        })
      );
      triggerHapticWaveform('water_cup');
      showToast(
        `🌙 سُجّل نقص ${addMin} د (الإجمالي ${nextDebt} د) — سيُبكّر موعد نوم الليلة تلقائياً للتعويض بهدوء`
      );
    },
    [dailyRhythmPlan.nightlyRecoveryMin, lifeProfile.sleepDebtMinutes, showToast]
  );

  const handleOpenAssistantWithPrompt = useCallback((prompt: string) => {
    setPendingAssistantPrompt(prompt);
    setActiveTab('assistant');
  }, []);

  const handleAddMemory = useCallback(
    (input: { category: MemoryCategory; ruleText: string; source?: MemoryItem['source'] }) => {
      const trimmed = input.ruleText.trim();
      if (!trimmed) return;
      const item = sanitizeMemoryItem({
        id: sanitizeMemoryId(`mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        category: input.category,
        ruleText: trimmed,
        source: input.source ?? 'user',
      });
      setMemories((prev) => [item, ...prev]);
      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void upsertMemoryRecord(firebaseUser.uid, item).catch(() => {});
      }
      showToast('🧠 تم حفظ القاعدة في ذاكرة Gemini الدائمة (Firestore) ✓');
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleDeleteMemory = useCallback(
    (id: string) => {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void deleteMemoryRecord(firebaseUser.uid, id).catch(() => {});
      }
      showToast('تم حذف القاعدة من ذاكرة Gemini الدائمة');
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleExecuteMemoryActions = useCallback(
    (memoryActions: MemoryActionProposal[]) => {
      setMemories((prev) => {
        let next = [...prev];
        for (const act of memoryActions) {
          if (act.operation === 'remove') {
            const target = next.find(
              (m) =>
                (act.memoryId && m.id === act.memoryId) ||
                m.ruleText.trim() === act.ruleText.trim()
            );
            if (target) {
              next = next.filter((m) => m.id !== target.id);
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void deleteMemoryRecord(firebaseUser.uid, target.id).catch(() => {});
              }
            }
          } else {
            const existing = next.find((m) => m.ruleText.trim() === act.ruleText.trim());
            if (!existing) {
              const created = sanitizeMemoryItem({
                id: sanitizeMemoryId(
                  act.memoryId || `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                category: act.category,
                ruleText: act.ruleText,
                source: 'gemini',
              });
              next = [created, ...next];
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertMemoryRecord(firebaseUser.uid, created).catch(() => {});
              }
            }
          }
        }
        return next;
      });
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]
  );

  const handleDetectGpsLocation = useCallback(async () => {
    const browserTz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
    if (!navigator.geolocation) {
      setLifeProfile((prev) =>
        sanitizeLifeProfile({ ...prev, currentTimeZone: browserTz })
      );
      showToast(`تم ضبط المنطقة الزمنية تلقائياً (${browserTz})`);
      return;
    }
    setIsDetectingGps(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000,
          enableHighAccuracy: false,
        });
      });
      const lat = Math.round(pos.coords.latitude * 10000) / 10000;
      const lng = Math.round(pos.coords.longitude * 10000) / 10000;

      // Match nearest preset city within 45 km, otherwise show clean timezone/coords label (100% offline)
      const probe = {
        id: 'gps',
        nameAr: '',
        nameEn: '',
        lat,
        lng,
        tzOffsetHours: getTimeZoneUtcOffsetHours(browserTz),
        timeZone: browserTz,
      };
      const nearest = PRESET_LOCATIONS.map((loc) => ({
        loc,
        dist: haversineDistanceKm(probe, loc),
      })).sort((a, b) => a.dist - b.dist)[0];

      const cityName =
        nearest && nearest.dist <= 45
          ? nearest.loc.nameAr
          : `${browserTz.split('/').pop()?.replace(/_/g, ' ') || 'موقعك الحالي'} (${lat.toFixed(2)}, ${lng.toFixed(2)})`;

      setLifeProfile((prev) =>
        sanitizeLifeProfile({
          ...prev,
          currentCityName: cityName,
          currentTimeZone: browserTz,
          currentLat: lat,
          currentLng: lng,
        })
      );
      showToast(`📍 تم التحقق من موقعك وحساب المواقيت أوفلاين: ${cityName}`);
    } catch {
      setLifeProfile((prev) =>
        sanitizeLifeProfile({ ...prev, currentTimeZone: browserTz })
      );
      showToast(`تعذر قراءة GPS — تم اعتماد المنطقة الزمنية للجهاز (${browserTz})`);
    } finally {
      setIsDetectingGps(false);
    }
  }, [showToast]);

  // Continuous live GPS tracking (> 5 km movement automatically updates Prayer, Sunrise, Sunset & Sleep 100% offline)
  const lastCoordsRef = useRef<{ lat: number; lng: number }>({
    lat: lifeProfile.currentLat,
    lng: lifeProfile.currentLng,
  });
  useEffect(() => {
    lastCoordsRef.current = {
      lat: lifeProfile.currentLat,
      lng: lifeProfile.currentLng,
    };
  }, [lifeProfile.currentLat, lifeProfile.currentLng]);

  useEffect(() => {
    if (!lifeProfile.autoLocationSync) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Math.round(pos.coords.latitude * 10000) / 10000;
          const lng = Math.round(pos.coords.longitude * 10000) / 10000;
          const prevCoords = lastCoordsRef.current;
          const movedKm = haversineDistanceKm(
            { id: 'prev', nameAr: '', nameEn: '', lat: prevCoords.lat, lng: prevCoords.lng, tzOffsetHours: 2 },
            { id: 'curr', nameAr: '', nameEn: '', lat, lng, tzOffsetHours: 2 }
          );
          if (movedKm < 5) return;

          const browserTz =
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
          const probe = {
            id: 'gps',
            nameAr: '',
            nameEn: '',
            lat,
            lng,
            tzOffsetHours: getTimeZoneUtcOffsetHours(browserTz),
            timeZone: browserTz,
          };
          const nearest = PRESET_LOCATIONS.map((loc) => ({
            loc,
            dist: haversineDistanceKm(probe, loc),
          })).sort((a, b) => a.dist - b.dist)[0];

          const cityName =
            nearest && nearest.dist <= 45
              ? nearest.loc.nameAr
              : `${browserTz.split('/').pop()?.replace(/_/g, ' ') || 'موقعك الحالي'} (${lat.toFixed(2)}, ${lng.toFixed(2)})`;

          lastCoordsRef.current = { lat, lng };
          setLifeProfile((prev) =>
            sanitizeLifeProfile({
              ...prev,
              currentCityName: cityName,
              currentTimeZone: browserTz,
              currentLat: lat,
              currentLng: lng,
            })
          );
          showToast(`📍 تم رصد انتقالك تلقائياً (${Math.round(movedKm)} كم) وتحديث المواقيت أوفلاين: ${cityName}`);
        },
        () => {
          // Silently ignore background watch errors; user can tap location name anytime
        },
        { enableHighAccuracy: false, maximumAge: 180_000, timeout: 12_000 }
      );
    };

    // Only start passive watch if permission is already granted so we don't spam prompts on first load
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            startWatch();
          }
        })
        .catch(() => {});
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [lifeProfile.autoLocationSync, showToast]);

  // Auto-adapt to a new country/timezone automatically when traveling abroad
  const autoSyncedTzRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lifeProfile.autoLocationSync) return;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTz || browserTz === lifeProfile.currentTimeZone) return;
    if (autoSyncedTzRef.current === browserTz) return;
    autoSyncedTzRef.current = browserTz;

    const tzPreset = PRESET_LOCATIONS.find((l) => l.timeZone === browserTz);
    if (tzPreset) {
      setLifeProfile((prev) =>
        sanitizeLifeProfile({
          ...prev,
          currentCityName: tzPreset.nameAr,
          currentTimeZone: browserTz,
          currentLat: tzPreset.lat,
          currentLng: tzPreset.lng,
        })
      );
      showToast(`🌍 تم اكتشاف منطقة زمنية جديدة (${tzPreset.nameAr}) وتحديث المواقيت والنوم تلقائياً`);
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            void handleDetectGpsLocation();
          } else {
            setLifeProfile((prev) =>
              sanitizeLifeProfile({
                ...prev,
                currentCityName: browserTz.split('/').pop()?.replace(/_/g, ' ') || prev.currentCityName,
                currentTimeZone: browserTz,
              })
            );
          }
        })
        .catch(() => {});
    }
  }, [lifeProfile.autoLocationSync, lifeProfile.currentTimeZone, handleDetectGpsLocation, showToast]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsLoggingIn(true);
    try {
      const result = await signInWithGoogleCalendar();
      if (result) {
        setAuthUser(result.user);
        setNeedsAuth(false);
        setUseOfflineDemo(false);
        await refreshWorkspace(result.accessToken);
        showToast('تم ربط حساب Google Calendar و Google Tasks بنجاح ✓');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.';
      showToast(msg);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, [refreshWorkspace, showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    await signOutGoogleCalendar();
    setAuthUser(null);
    setNeedsAuth(true);
    setCalendarList([]);
    setCalendarEvents([]);
    setGoogleTaskLists([]);
    setGoogleTasks([]);
    setReflowedBlocksOverride(null);
    showToast('تم فصل اتصال حساب Google.');
  }, [showToast]);

  const rebuildOfflineSchedule = useCallback(
    (
      nextMode: DayMode,
      nextTravel: TravelState,
      friday: boolean,
      biweeklyPc: boolean
    ) => {
      const loc = nextTravel.active ? nextTravel.location : HOME_LOCATION;
      const nextPrayers = calculateEgyptianPrayerTimes(
        loc,
        new Date(),
        lifeProfile.adhanLeadMinutes
      );
      const base = buildBaseSchedule(nextMode, nextPrayers, {
        isFriday: friday,
        includeBiweeklyPcCleanup: biweeklyPc,
      });
      setOfflineBlocks(nextTravel.active ? applyTravelMatrix(base, nextTravel) : base);
    },
    [lifeProfile.adhanLeadMinutes]
  );

  // Build LIVE ScheduleBlocks from Real Google Calendar + optional Astronomical Prayer Anchors!

  const baseLiveBlocks: ScheduleBlock[] = useMemo(() => {
    if (reflowedBlocksOverride) {
      return reflowedBlocksOverride.map((b) => ({
        ...b,
        completed: completedOverrides[b.id] ?? b.completed,
      }));
    }

    // Compute real Google Calendar blocks for today first so we avoid duplicating prayers already in Calendar
    let todaysGoogleBlocks: ScheduleBlock[] = [];
    if (!needsAuth) {
      todaysGoogleBlocks = calendarEvents
        .map((ev): ScheduleBlock | null => {
          const startInfo = parseIsoToCairoInfo(ev.start);
          if (startInfo.dateIso !== todayCairoIso) return null;
          const endInfo = ev.end ? parseIsoToCairoInfo(ev.end) : null;
          let durationMin = 30;
          if (!startInfo.isAllDay && endInfo && endInfo.dateIso === startInfo.dateIso) {
            durationMin = Math.max(15, endInfo.minutesSinceMidnight - startInfo.minutesSinceMidnight);
          } else if (!startInfo.isAllDay && ev.start && ev.end) {
            const diff = Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000);
            if (diff > 0 && diff < 1440) durationMin = diff;
          }
          const blockId = `gcal_${ev.calendarId ?? 'primary'}_${ev.id}`;
          const emojiPair = extractEmojiPair(ev.summary, '📅');
          return {
            id: blockId,
            emojiPair,
            categoryAr: ev.summary,
            categoryEn: ev.summary,
            startMin: startInfo.minutesSinceMidnight,
            durationMin,
            minDurationMin: Math.min(15, durationMin),
            isAnchor: emojiPair.includes('🕌'),
            travelGroup: emojiPair.includes('🕌') ? 'ANCHOR' : 'B_WORK',
            canShiftEvening: !emojiPair.includes('🕌'),
            completed: completedOverrides[blockId] ?? false,
            deleted: false,
            googleEventId: ev.id,
            googleCalendarId: ev.calendarId ?? 'primary',
            calendarTitle: ev.calendarTitle,
            calendarColor: ev.calendarColor,
            googleHtmlLink: ev.htmlLink,
            dateIso: startInfo.dateIso,
            startIso: ev.start,
            endIso: ev.end,
            isAllDay: startInfo.isAllDay || ev.isAllDay,
            description: ev.description,
            source: 'google_calendar',
          };
        })
        .filter((x): x is ScheduleBlock => x !== null);
    }

    // Prayer anchors computed astronomically — skip any prayer already represented in Google Calendar
    const prayerAnchors: ScheduleBlock[] = includePrayerAnchors
      ? prayers
          .filter((p) => p.isObligatory)
          .filter(
            (p) =>
              !todaysGoogleBlocks.some(
                (gb) =>
                  Math.abs(gb.startMin - p.alarmMinutes) <= 10 ||
                  Math.abs(gb.startMin - p.adhanMinutes) <= 10 ||
                  (gb.emojiPair.includes('🕌') && Math.abs(gb.startMin - p.alarmMinutes) <= 25)
              )
          )
          .map((p) => ({
            id: `prayer_${p.id}`,
            emojiPair: p.emojiPair,
            categoryAr: `أذان -${lifeProfile.adhanLeadMinutes} د · ${p.nameAr}`,
            categoryEn: `-${lifeProfile.adhanLeadMinutes}m Adhan · ${p.nameEn}`,
            startMin: p.alarmMinutes,
            durationMin: 20,
            minDurationMin: 20,
            isAnchor: true,
            isFridayRitual: isFridayMode && p.id === 'dhuhr',
            travelGroup: 'ANCHOR' as const,
            canShiftEvening: false,
            completed: completedOverrides[`prayer_${p.id}`] ?? false,
            deleted: false,
            dateIso: todayCairoIso,
            source: 'prayer' as const,
          }))
      : [];

    if (!needsAuth) {
      return [...todaysGoogleBlocks, ...prayerAnchors].sort((a, b) => a.startMin - b.startMin);
    }

    // Disconnected mode: NEVER show hardcoded tasks unless user explicitly activates Offline Demo!
    if (useOfflineDemo) {
      return offlineBlocks.map((b) => ({
        ...b,
        completed: completedOverrides[b.id] ?? b.completed,
        source: b.source ?? 'offline',
      }));
    }

    return prayerAnchors.sort((a, b) => a.startMin - b.startMin);
  }, [
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
    lifeProfile.adhanLeadMinutes,
  ]);

  // Genuinely free time slots today (away from Prayers, Sleep, Work & existing Google Calendar events)
  const freeSlotsToday: FreeTimeSlot[] = useMemo(
    () => findFreeTimeSlotsForToday(prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks),
    [prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks]
  );

  // Auto-place Creative Activities ONLY into genuinely free slots today
  const creativePlacements: CreativeActivityPlacement[] = useMemo(
    () => computeCreativePlacements(creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin),
    [creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin]
  );

  // Merge free-slot Creative Activities gently into the daily timeline (skip duplicates already in Calendar)
  const liveBlocks: ScheduleBlock[] = useMemo(() => {
    const creativeBlocks: ScheduleBlock[] = creativePlacements
      .filter((p) => !p.doneToday && p.suggestedSlot)
      .filter(
        (p) =>
          !baseLiveBlocks.some(
            (b) =>
              !b.deleted &&
              (b.googleEventId === p.activity.calendarEventId ||
                b.categoryAr.includes(p.activity.name))
          )
      )
      .map((p) => ({
        id: `creative_${p.activity.id}`,
        emojiPair: p.activity.emoji || '🎨',
        categoryAr: `${p.activity.emoji || '🎨'} ${p.activity.name} (${p.sessionsInPeriod}/${p.goalInPeriod} ${p.periodLabelAr})`,
        categoryEn: `${p.activity.emoji || '🎨'} ${p.activity.name}`,
        startMin: p.suggestedSlot!.startMin,
        durationMin: p.activity.sessionMinutes,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK' as const,
        canShiftEvening: true,
        completed: false,
        deleted: false,
        dateIso: todayCairoIso,
        source: 'creative' as const,
        creativeActivityId: p.activity.id,
      }));

    return [...baseLiveBlocks, ...creativeBlocks].sort((a, b) => a.startMin - b.startMin);
  }, [baseLiveBlocks, creativePlacements, todayCairoIso]);


  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveCountdownSec((s) => (s <= 1 ? 59 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (shakeUndoSecondsLeft <= 0) return;
    const id = window.setTimeout(() => {
      setShakeUndoSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [shakeUndoSecondsLeft]);

  const handleTriggerShakeUndo = useCallback(() => {
    if (!lastDeletedBlock || shakeUndoSecondsLeft <= 0) return;
    const targetId = lastDeletedBlock.id;
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === targetId ? { ...b, deleted: false } : b))
    );
    setLastDeletedBlock(null);
    setShakeUndoSecondsLeft(0);
    triggerHapticWaveform('shake_undo');
    showToast(`تم التراجع واسترجاع الحدث بنجاح (${lastDeletedBlock.emojiPair})`);
  }, [lastDeletedBlock, shakeUndoSecondsLeft, showToast]);

  useEffect(() => {
    if (shakeUndoSecondsLeft <= 0 || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      const gForce = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (gForce > 2.6) {
        handleTriggerShakeUndo();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [shakeUndoSecondsLeft, handleTriggerShakeUndo]);

  useEffect(() => {
    if (!pomodoro.isRunning) return;
    const id = window.setInterval(() => {
      setPomodoro((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.remainingSeconds > 1) {
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        }
        if (prev.phase === 'focus') {
          if (quietMode === 'normal') {
            playSoftChime('focus_done', activeSanctuary);
          }
          triggerHapticWaveform('pomodoro');
          return {
            ...prev,
            phase: 'break',
            remainingSeconds: 5 * 60,
            totalSeconds: 5 * 60,
            isRunning: true,
            completedCycles: prev.completedCycles + 1,
          };
        }
        if (quietMode === 'normal') {
          playSoftChime('break_done', activeSanctuary);
        }
        triggerHapticWaveform('pomodoro');
        return {
          ...prev,
          phase: 'focus',
          remainingSeconds: prev.presetMinutes * 60,
          totalSeconds: prev.presetMinutes * 60,
          isRunning: false,
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pomodoro.isRunning, quietMode, activeSanctuary]);

  const handleToggleFridayMode = (v: boolean) => {
    setIsFridayMode(v);
    setUndoSnapshot(null);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, travelState, v, includeBiweeklyPcCleanup);
  };

  const handleToggleBiweeklyPcCleanup = (v: boolean) => {
    setIncludeBiweeklyPcCleanup(v);
    setUndoSnapshot(null);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, travelState, isFridayMode, v);
  };

  const handleApplyTravel = (nextTravel: TravelState) => {
    setTravelState(nextTravel);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, nextTravel, isFridayMode, includeBiweeklyPcCleanup);
    appendChangelog('Web/PC', `تفعيل وضع السفر (${nextTravel.location.nameAr})`, `Activated Travel Mode`);
    showToast('تم تفعيل وضع السفر وتحديث المواقيت.');
  };

  const handleDisableTravel = () => {
    const resetTravel: TravelState = {
      ...travelState,
      active: false,
      location: profileLocation,
      distanceKm: 0,
    };
    setTravelState(resetTravel);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, resetTravel, isFridayMode, includeBiweeklyPcCleanup);
  };

  const handleApplyOfflineActions = useCallback(
    (actions: CalendarActionProposal[]) => {
      setOfflineBlocks((prev) => {
        let next = [...prev];
        actions.forEach((act) => {
          const parseMin = (hhmm?: string): number => {
            if (!hhmm || !hhmm.includes(':')) return 9 * 60;
            const [hStr, mStr] = hhmm.split(':');
            return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
          };

          if (act.operation === 'delete') {
            next = next.map((b) =>
              b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
                ? { ...b, deleted: true }
                : b
            );
          } else if (act.operation === 'update' || act.operation === 'shift') {
            const newStart = parseMin(act.startTime24);
            next = next.map((b) =>
              b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
                ? {
                    ...b,
                    startMin: newStart,
                    durationMin: act.durationMinutes ?? b.durationMin,
                    reflowStatus: 'shifted_evening',
                  }
                : b
            );
          } else {
            const startMin = parseMin(act.startTime24);
            next.push({
              id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              emojiPair: extractEmojiPair(act.title, '📅 ✨'),
              categoryAr: act.title,
              startMin,
              durationMin: act.durationMinutes ?? 30,
              minDurationMin: 15,
              isAnchor: false,
              travelGroup: 'B_WORK',
              canShiftEvening: true,
              completed: false,
              deleted: false,
              source: 'offline',
            });
          }
        });
        return next.sort((a, b) => a.startMin - b.startMin);
      });
    },
    []
  );

  const handleExecuteCalendarActions = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      const token = getCalendarAccessToken();
      let results: CalendarExecutionResult[] = [];
      let googleSynced = false;

      // Capture reversible undo snapshot & apply optimistic removal for delete operations
      const deleteAct = actions.find((a) => a.operation === 'delete' && a.eventId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingEv = calendarEvents.find((e) => e.id === deleteAct.eventId);
        const startInfo = existingEv?.start ? parseIsoToCairoInfo(existingEv.start) : null;
        let durationMinutes = 30;
        if (existingEv?.start && existingEv?.end && !existingEv.isAllDay) {
          const diff = Math.round(
            (new Date(existingEv.end).getTime() - new Date(existingEv.start).getTime()) / 60_000
          );
          if (diff >= 15 && diff <= 720) durationMinutes = diff;
        }
        const h24 = startInfo ? Math.floor(startInfo.minutesSinceMidnight / 60) : 9;
        const m24 = startInfo ? startInfo.minutesSinceMidnight % 60 : 0;
        undoSnap = {
          opId: `del_ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'event',
          title: existingEv?.summary || deleteAct.title,
          calendarId: existingEv?.calendarId || deleteAct.calendarId || 'primary',
          dateIso: startInfo?.dateIso || getCairoTodayIso(),
          startTime24: `${String(h24).padStart(2, '0')}:${String(m24).padStart(2, '0')}`,
          durationMinutes,
          description: existingEv?.description || '',
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(
          actions.filter((a) => a.operation === 'delete' && a.eventId).map((a) => a.eventId!)
        );
        if (deleteIds.size > 0) {
          setCalendarEvents((prev) => prev.filter((ev) => !deleteIds.has(ev.id)));
        }
      }

      if (token) {
        const res = await fetch('/api/calendar/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(firebaseUser?.uid ? { 'x-user-uid': firebaseUser.uid } : {}),
            'x-client-id': clientIdRef.current,
          },
          body: JSON.stringify({ actions, undoSnapshot: undoSnap }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            setNeedsAuth(true);
          }
          // Restore latest calendar state if server rejected
          await fetchCalendarEvents(token);
          throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Calendar.');
        }
        results = Array.isArray(data.results) ? data.results : [];
        googleSynced = true;
        setReflowedBlocksOverride(null);
        await fetchCalendarEvents(token);

        if (undoSnap) {
          setLastDeletedWorkspaceItem(undoSnap);
        }
        emitCrossDeviceSync(
          'calendar',
          options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update',
          undoSnap
        );

        appendChangelog(
          'Gemini API',
          `تحديث ${results.length} حدثاً في Google Calendar الحقيقي`,
          `Updated ${results.length} events in Google Calendar`
        );
        showToast(
          options?.isUndoRestore
            ? '↩️ تم استرجاع الحدث ومزامنته على جميع أجهزتك ✓'
            : deleteAct
              ? 'تم حذف الحدث ومزامنته فوراً — يمكنك التراجع الآن ✓'
              : `تمت المزامنة مع Google Calendar (${results.length} عمليات) ✓`
        );
      } else {
        handleApplyOfflineActions(actions);
        showToast('تم التطبيق في وضع المعاينة (سجّل الدخول بحساب Google للتنفيذ في تقويمك).');
      }

      return { googleSynced, results };
    },
    [
      appendChangelog,
      calendarEvents,
      emitCrossDeviceSync,
      fetchCalendarEvents,
      firebaseUser?.uid,
      handleApplyOfflineActions,
      showToast,
    ]
  );

  const handleExecuteTaskActions = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      const token = getCalendarAccessToken();
      if (!token) {
        throw new Error('يرجى تسجيل الدخول بحساب Google لتنفيذ تعديلات Google Tasks.');
      }

      // Capture reversible undo snapshot & apply optimistic removal for delete operations
      const deleteAct = taskActions.find((a) => a.operation === 'delete' && a.taskId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingTk = googleTasks.find((tk) => tk.id === deleteAct.taskId);
        undoSnap = {
          opId: `del_tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'task',
          title: existingTk?.title || deleteAct.title,
          taskListId: existingTk?.taskListId || deleteAct.taskListId || '@default',
          notes: existingTk?.notes || '',
          dueDateIso: existingTk?.due ? existingTk.due.slice(0, 10) : undefined,
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(
          taskActions.filter((a) => a.operation === 'delete' && a.taskId).map((a) => a.taskId!)
        );
        if (deleteIds.size > 0) {
          setGoogleTasks((prev) => prev.filter((tk) => !deleteIds.has(tk.id)));
        }
      }

      const res = await fetch('/api/tasks/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(firebaseUser?.uid ? { 'x-user-uid': firebaseUser.uid } : {}),
          'x-client-id': clientIdRef.current,
        },
        body: JSON.stringify({ taskActions, undoSnapshot: undoSnap }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setNeedsAuth(true);
        }
        await fetchGoogleTasks(token);
        throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Tasks.');
      }

      const results: TaskExecutionResult[] = Array.isArray(data.results) ? data.results : [];
      await fetchGoogleTasks(token);

      if (undoSnap) {
        setLastDeletedWorkspaceItem(undoSnap);
      }
      emitCrossDeviceSync(
        'tasks',
        options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update',
        undoSnap
      );

      appendChangelog(
        'Gemini API',
        `تحديث ${results.length} مهمة في Google Tasks الحقيقي`,
        `Updated ${results.length} tasks in Google Tasks`
      );
      showToast(
        options?.isUndoRestore
          ? '↩️ تم استرجاع المهمة ومزامنتها على جميع أجهزتك ✓'
          : deleteAct
            ? 'تم حذف المهمة ومزامنتها فوراً — يمكنك التراجع الآن ✓'
            : `تم تحديث Google Tasks بنجاح (${results.length} عمليات) ✓`
      );
      return { googleSynced: true, results };
    },
    [appendChangelog, emitCrossDeviceSync, fetchGoogleTasks, firebaseUser?.uid, googleTasks, showToast]
  );

  const handleUndoWorkspaceDelete = useCallback(async () => {
    const snap = lastDeletedWorkspaceItem;
    if (!snap) return;
    // Idempotency guard: prevent duplicate re-creation if Undo is clicked rapidly or across devices
    if (restoredOpIdsRef.current.has(snap.opId)) {
      setLastDeletedWorkspaceItem(null);
      return;
    }
    restoredOpIdsRef.current.add(snap.opId);
    setLastDeletedWorkspaceItem(null);

    try {
      if (snap.kind === 'task') {
        await handleExecuteTaskActions(
          [
            {
              operation: 'create',
              taskListId: snap.taskListId || '@default',
              title: snap.title,
              notes: snap.notes,
              dueDateIso: snap.dueDateIso,
            },
          ],
          { isUndoRestore: true }
        );
      } else {
        await handleExecuteCalendarActions(
          [
            {
              operation: 'create',
              calendarId: snap.calendarId || 'primary',
              title: snap.title,
              dateIso: snap.dateIso || getCairoTodayIso(),
              startTime24: snap.startTime24 || '09:00',
              durationMinutes: snap.durationMinutes || 30,
              description: snap.description,
            },
          ],
          { isUndoRestore: true }
        );
      }
    } catch {
      restoredOpIdsRef.current.delete(snap.opId);
      showToast('تعذر الاسترجاع — تأكد من الاتصال بحساب Google');
    }
  }, [handleExecuteCalendarActions, handleExecuteTaskActions, lastDeletedWorkspaceItem, showToast]);

  const handleImportIcsBlocks = useCallback(
    (newBlocks: ScheduleBlock[]) => {
      setUseOfflineDemo(true);
      setOfflineBlocks((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        const filtered = newBlocks.filter((nb) => !existingIds.has(nb.id));
        return [...prev, ...filtered].sort((a, b) => a.startMin - b.startMin);
      });
      appendChangelog(
        'Web/PC',
        `استيراد ${newBlocks.length} أحداث عبر خلاصة .ics (RRULE)`,
        `Imported ${newBlocks.length} ICS RRULE events`
      );
      showToast(`تم استيراد ${newBlocks.length} أحداث من خلاصة .ics ✓`);
    },
    [appendChangelog, showToast]
  );

  const handleCompletePeriodicRitual = useCallback(
    (id: PeriodicRitualStatus['id']) => {
      const todayIso = getCairoTodayIso();
      setPeriodicRituals((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, daysSinceLast: 0, lastCompletedIso: todayIso } : r
        )
      );
      appendChangelog('Web/PC', `تسجيل إتمام المهمة الدورية (${id})`, `Completed periodic ritual ${id}`);
      showToast('تم تسجيل إنجاز المهمة الدورية وتصفير العداد ✓');
    },
    [appendChangelog, showToast]
  );

  const handleToggleCreativeToday = useCallback(
    (activityId: string) => {
      const todayIso = getCairoTodayIso();
      setCreativeActivities((prev) =>
        prev.map((act) => {
          if (act.id !== activityId) return act;
          const exists = act.loggedDates.includes(todayIso);
          const nextDates = exists
            ? act.loggedDates.filter((d) => d !== todayIso)
            : [...act.loggedDates, todayIso].slice(-30);
          const updated: CreativeActivityItem = { ...act, loggedDates: nextDates };
          if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
            void upsertCreativeActivityRecord(firebaseUser.uid, updated).catch(() => {});
          }
          showToast(
            exists
              ? `تم إلغاء تسجيل جلسة «${act.name}» اليوم`
              : `${act.emoji} أحسنت! تم تسجيل جلسة «${act.name}» اليوم ✓`
          );
          return updated;
        })
      );
      triggerHapticWaveform('water_cup');
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleToggleComplete = (id: string) => {
    if (id.startsWith('creative_')) {
      handleToggleCreativeToday(id.slice('creative_'.length));
      return;
    }
    setCompletedOverrides((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleDeleteBlock = (id: string) => {
    const target = liveBlocks.find((b) => b.id === id) ?? null;
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: true } : b))
    );
    if (target) {
      setLastDeletedBlock(target);
      setShakeUndoSecondsLeft(8);
      setTombstones((prev) => [
        {
          id: `tomb-${Date.now()}`,
          blockId: target.id,
          emojiPair: target.emojiPair,
          categoryAr: target.categoryAr,
          deletedAtIso: getCairoTodayIso(),
          ageDays: 0,
        },
        ...prev,
      ]);
    }
  };

  const handleRestoreBlock = (id: string) => {
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: false } : b))
    );
  };

  const handleRestoreAllDeleted = () => {
    setOfflineBlocks((prev) => prev.map((b) => ({ ...b, deleted: false })));
  };

  const handleSweepOldTombstones = () => {
    const expired = tombstones.filter((t) => t.ageDays > 14).length;
    setTombstones((prev) => prev.filter((t) => t.ageDays <= 14));
    if (expired > 0) {
      appendChangelog('OnePlus 12R', `تنظيف ${expired} سجل Tombstones > 14 يوماً`, `Purged ${expired} tombstones > 14d`);
    }
    return expired;
  };

  const handleCommitReflow = (reflowed: ScheduleBlock[]) => {
    if (!undoSnapshot) {
      setUndoSnapshot(liveBlocks);
    }
    setReflowedBlocksOverride(reflowed);
    appendChangelog('Web/PC', 'تطبيق زحزحة وتدارك اليوم الخالية من التصادم', 'Applied Collision-Free Reflow');
  };

  const handleUndoReflow = () => {
    if (undoSnapshot) {
      setReflowedBlocksOverride(null);
      setUndoSnapshot(null);
    }
  };

  const handleTestAdhanChime = () => {
    if (quietMode === 'normal' || adhanOverrideSilent) {
      playSoftChime('alarm_pulse');
      triggerHapticWaveform('wake_fajr');
      showToast(
        quietMode !== 'normal'
          ? '🔊 نداء الصلاة يعمل بصوت نقي (تم تجاوز الصامت والاهتزاز)'
          : '🔊 نداء الصلاة نشط بصوت نقي'
      );
    } else {
      showToast('🔇 الهاتف صامت والتجاوز معطّل');
    }
  };

  const handleDismissTwoWay = useCallback(() => {
    stopContinuousAlert();
    setActiveAudioAlert(null);
    setAlarmRinging(false);
    emitCrossDeviceSync('alarm_dismiss', 'dismiss');
    showToast('🔕 تم الإيقاف المتزامن في الاتجاهين (الموبايل ↔ الكمبيوتر عبر WebSocket)');
  }, [emitCrossDeviceSync, showToast]);

  const handleTriggerRing = useCallback(() => {
    setAlarmRinging(true);
    if (quietMode === 'normal' || quietMode === 'vibrate_only') {
      if (quietMode === 'normal') playSoftChime('alarm_pulse');
      triggerHapticWaveform('wake_fajr');
    }
  }, [quietMode]);

  const handleSimulateCharge90 = () => {
    if (batteryGuard.bypassChargingLimitPct !== null) {
      showToast(
        `🎮 الشحن التجاوزي (${batteryGuard.bypassChargingLimitPct}%) نشط — تم منع تنبيه الامتلاء الوهمي`
      );
      return;
    }
    setBatteryGuard((prev) => ({
      ...prev,
      levelPct: 90,
      cableConnected: true,
      pcAlertActive: true,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: false,
    }));
    playSoftChime('focus_done');
    showToast('⚡ SUPERVOOC وصل 90%: تم إرسال التنبيه إلى الكمبيوتر');
  };

  const handleSimulatePowerDisconnect = () => {
    setBatteryGuard((prev) => ({
      ...prev,
      cableConnected: false,
      pcAlertActive: false,
      autoSilencedByDisconnect: true,
    }));
    showToast('🔌 ACTION_POWER_DISCONNECTED: تم كتم الصوت وإغلاق كارد التنبيه بالكمبيوتر تلقائياً');
  };

  const handleSimulateBedtimeLowBattery = () => {
    setBatteryGuard((prev) => ({
      ...prev,
      levelPct: 22,
      cableConnected: false,
      pcAlertActive: false,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: true,
      eveningTimeSimMin: 20 * 60 + 45,
    }));
    showToast('🔋 تنبيه وقائي قبل النوم (08:45 م · 22%): اشحن الهاتف قبل 09:15 م');
  };

  const handleToggleBypassCharging = (limit: 80 | 90 | null) => {
    setBatteryGuard((prev) => ({
      ...prev,
      bypassChargingLimitPct: limit,
      pcAlertActive: limit !== null ? false : prev.pcAlertActive,
    }));
    showToast(
      limit === null
        ? 'تم الرجوع لوضع الشحن العادي'
        : `🎮 تفعيل الشحن التجاوزي عند ${limit}% (منع الإنذارات الوهمية)`
    );
  };

  const handleSimulateWindowsWake = () => {
    const ts = formatCairoNow12h('ar');
    appendChangelog('Web/PC', `تعافي فوري من Sleep عبر WM_POWERBROADCAST (${ts})`, `Win32 Sleep/Wake recovery (${ts})`);
    showToast('💻 WM_POWERBROADCAST: تمت إعادة جدولة المنبهات والمزامنة فور استيقاظ ويندوز');
    return `PBT_APMRESUMEAUTOMATIC (${ts}) — تم تحديث المنبهات وجدول اليوم ✓`;
  };

  const hydrationToday = hydrationHistory[hydrationHistory.length - 1];

  const updateTodayHydration = (updater: (today: HydrationDayLog) => HydrationDayLog) => {
    setHydrationHistory((prev) => {
      const next = [...prev];
      const updated = updater(next[next.length - 1]);
      next[next.length - 1] = updated;

      const reachedTarget = updated.cupsLogged >= updated.targetCups;
      setStreaks((s) => {
        if (reachedTarget && !s.waterTargetDoneToday) {
          return {
            ...s,
            waterTargetDoneToday: true,
            waterTargetDays: s.waterTargetDays + 1,
          };
        }
        if (!reachedTarget && s.waterTargetDoneToday) {
          return {
            ...s,
            waterTargetDoneToday: false,
            waterTargetDays: Math.max(0, s.waterTargetDays - 1),
          };
        }
        return s;
      });

      return next;
    });
  };

  const handleLogWaterCup = () => {
    updateTodayHydration((today) => {
      const nextIdx = today.slots.findIndex((filled) => !filled);
      if (nextIdx === -1) return today;
      const nextSlots = [...today.slots];
      nextSlots[nextIdx] = true;
      return {
        ...today,
        slots: nextSlots,
        cupsLogged: nextSlots.filter(Boolean).length,
      };
    });
  };

  const handleToggleWaterSlot = (index: number) => {
    updateTodayHydration((today) => {
      const nextSlots = [...today.slots];
      nextSlots[index] = !nextSlots[index];
      return {
        ...today,
        slots: nextSlots,
        cupsLogged: nextSlots.filter(Boolean).length,
      };
    });
  };

  // Handle PWA Home Screen App Shortcuts (/?action=water | meeting | voice)
  useEffect(() => {
    if (shortcutHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;

    shortcutHandledRef.current = true;
    try {
      window.history.replaceState({}, '', window.location.pathname || '/');
    } catch {
      // ignore history errors
    }

    if (action === 'water') {
      setActiveTab('dashboard');
      setHydrationHistory((prev) => {
        const next = [...prev];
        const today = next[next.length - 1];
        if (!today) return prev;
        const nextIdx = today.slots.findIndex((filled) => !filled);
        if (nextIdx === -1) return prev;
        const nextSlots = [...today.slots];
        nextSlots[nextIdx] = true;
        const newCount = nextSlots.filter(Boolean).length;
        next[next.length - 1] = {
          ...today,
          slots: nextSlots,
          cupsLogged: newCount,
        };
        if (newCount >= today.targetCups) {
          setStreaks((s) =>
            s.waterTargetDoneToday
              ? s
              : {
                  ...s,
                  waterTargetDoneToday: true,
                  waterTargetDays: s.waterTargetDays + 1,
                }
          );
        }
        return next;
      });
      triggerHapticWaveform('water_cup');
      showToast('💧 اختصار سريع: تم تسجيل +1 كوب ماء بنجاح ✓');
    } else if (action === 'meeting') {
      setActiveTab('dashboard');
      setMeetingModeActive(true);
      triggerHapticWaveform('water_cup');
      showToast('🔇 اختصار سريع: تم تفعيل وضع الاجتماع (صامت — الأذان محفوظ)');
    } else if (action === 'voice') {
      setActiveTab('assistant');
      setAutoStartVoice(true);
      showToast('🎙️ اختصار سريع: فتح شات Gemini بالصوت');
    }
  }, [showToast]);

  // Active Water Cup & Multi-Dose Medication Reminder Engine (fires every 30s tick, respects Fasting & Silence Sanctuaries)
  useEffect(() => {
    const todayIso = getCairoTodayIso();
    const tz = activeLocation.timeZone ?? lifeProfile.currentTimeZone ?? 'Africa/Cairo';
    const todayW = getWeekdayInTimeZone(tz);

    const sendSystemNotification = (title: string, body: string, tag: string) => {
      if (
        activeSanctuary.type !== 'none' ||
        quietMode === 'silent_all' ||
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        Notification.permission !== 'granted'
      ) {
        return;
      }
      try {
        new Notification(title, { body, tag, icon: '/icon-192.png' });
      } catch {
        // ignore browser notification errors in restricted iframes
      }
    };

    // 1. Water cup reminders (dailyRhythmPlan.hydrationSlots automatically excludes fasting hours!)
    if (waterRemindersEnabled && hydrationToday) {
      dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
        if (hydrationToday.slots[idx]) return;
        const diff = nowTickMin - slot.timeMinutes;
        if (diff >= 0 && diff <= 4) {
          const key = `${todayIso}:water:${slot.cupIndex}`;
          if (firedReminderKeysRef.current.has(key)) return;
          firedReminderKeysRef.current.add(key);
          const msg = `كوب الماء رقم ${slot.cupIndex} (${dailyRhythmPlan.cupSizeMl} مل) · ${slot.windowAr}`;
          triggerTaskAlert(msg, 'water');
          sendSystemNotification('💧 حان وقت شرب الماء — إيقاع اليوم', msg, key);
        }
      });
    }

    // 2. Medication & Supplement multi-dose + weekday-aware reminders
    medications.forEach((med) => {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
        return;
      }
      const times =
        med.times24 && med.times24.length > 0
          ? med.times24
          : med.time24
            ? [med.time24]
            : [];
      times.forEach((t24) => {
        const match = t24.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return;
        const medMin = Number(match[1]) * 60 + Number(match[2]);
        const diff = nowTickMin - medMin;
        if (diff < 0 || diff > 4) return;
        const takenDoses = med.takenDateKey === todayIso ? med.takenDosesToday ?? [] : [];
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayIso;
        if (alreadyTaken) return;

        const key = `${todayIso}:med:${med.id}:${t24}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        const msg = `جرعة ${med.name}${med.doseNote ? ` — ${med.doseNote}` : ''}`;
        triggerTaskAlert(msg, 'medication');
        sendSystemNotification('💊 موعد علاجك / مكملك — إيقاع اليوم', msg, key);
      });
    });
  }, [
    nowTickMin,
    waterRemindersEnabled,
    dailyRhythmPlan.hydrationSlots,
    dailyRhythmPlan.cupSizeMl,
    hydrationToday,
    medications,
    activeLocation.timeZone,
    lifeProfile.currentTimeZone,
    activeSanctuary.type,
    quietMode,
    triggerTaskAlert,
  ]);

  const handleToggleMedication = useCallback(
    (id: string, doseTime24?: string) => {
      const todayIso = getCairoTodayIso();
      let lowStockMsg = '';
      setMedications((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const allTimes =
            m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
          let updated: MedicationItem;
          let deltaDoses = 0;

          if (doseTime24 && allTimes.length > 1) {
            const currentTaken = m.takenDateKey === todayIso ? m.takenDosesToday ?? [] : [];
            const exists = currentTaken.includes(doseTime24);
            const nextTaken = exists
              ? currentTaken.filter((t) => t !== doseTime24)
              : [...currentTaken, doseTime24];
            deltaDoses = exists ? 1 : -1;
            updated = {
              ...m,
              takenDosesToday: nextTaken,
              takenDateKey: nextTaken.length > 0 ? todayIso : '',
            };
          } else {
            const isFullyTaken =
              m.takenDateKey === todayIso &&
              (allTimes.length <= 1 ||
                allTimes.every((t) => (m.takenDosesToday ?? []).includes(t)));
            const currentCount = m.takenDateKey === todayIso ? (m.takenDosesToday?.length || 1) : 0;
            const totalToday = Math.max(1, allTimes.length);
            deltaDoses = isFullyTaken ? currentCount : -(totalToday - currentCount);
            updated = {
              ...m,
              takenDateKey: isFullyTaken ? '' : todayIso,
              takenDosesToday: isFullyTaken ? [] : allTimes,
            };
          }

          if (typeof m.remainingDoses === 'number' && m.remainingDoses >= 0) {
            const maxCap =
              typeof m.totalDoses === 'number' && m.totalDoses > 0 ? m.totalDoses : 500;
            const nextRem = Math.max(0, Math.min(maxCap, m.remainingDoses + deltaDoses));
            updated = { ...updated, remainingDoses: nextRem };
            if (deltaDoses < 0 && nextRem <= 3) {
              lowStockMsg =
                nextRem === 0
                  ? `⚠️ نفدت جرعات «${m.name}» — حان وقت إعادة التعبئة أو انتهاء الكورس`
                  : `💊 تنبيه مخزون: متبقٍ ${nextRem} جرعات فقط من «${m.name}»`;
            }
          }

          if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
            void upsertMedicationRecord(firebaseUser.uid, updated).catch(() => {});
          }
          return updated;
        })
      );
      if (lowStockMsg) {
        showToast(lowStockMsg);
      }
      triggerHapticWaveform('water_cup');
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleAddMedication = useCallback(
    (input: {
      name: string;
      time24?: string;
      times24?: string[];
      daysOfWeek?: number[];
      doseNote?: string;
      calendarEventId?: string;
      courseEndDate?: string;
      remainingDoses?: number;
      totalDoses?: number;
    }) => {
      const cleanTimes =
        input.times24 && input.times24.length > 0
          ? input.times24
          : input.time24
            ? [input.time24]
            : [];
      const rem =
        typeof input.remainingDoses === 'number' && input.remainingDoses >= 0
          ? input.remainingDoses
          : -1;
      const tot =
        typeof input.totalDoses === 'number' && input.totalDoses >= 0
          ? input.totalDoses
          : rem;
      const med = sanitizeMedicationItem({
        id: sanitizeMedicationId(`med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        name: input.name,
        time24: cleanTimes[0] ?? '',
        times24: cleanTimes,
        daysOfWeek: input.daysOfWeek ?? [],
        doseNote: input.doseNote ?? '',
        takenDateKey: '',
        takenDosesToday: [],
        calendarEventId: input.calendarEventId ?? '',
        courseEndDate: input.courseEndDate ?? '',
        remainingDoses: rem,
        totalDoses: tot,
      });
      setMedications((prev) => [...prev, med]);
      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void upsertMedicationRecord(firebaseUser.uid, med).catch(() => {});
      }
      showToast(`💊 تمت إضافة «${med.name}» إلى قائمة العلاجات والمكملات`);
      return med;
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleDeleteMedication = useCallback(
    (id: string) => {
      setMedications((prev) => prev.filter((m) => m.id !== id));
      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void deleteMedicationRecord(firebaseUser.uid, id).catch(() => {});
      }
      showToast('تم حذف العلاج من القائمة اليومية');
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleExecuteMedicationActions = useCallback(
    async (
      medActions: MedicationActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<MedicationExecutionResult[]> => {
      const todayIso = getCairoTodayIso();
      const results: MedicationExecutionResult[] = [];

      setMedications((prev) => {
        let next = [...prev];
        for (const act of medActions) {
          const op = act.operation;
          const actTimes =
            act.times24 && act.times24.length > 0
              ? act.times24
              : act.time24
                ? [act.time24]
                : undefined;

          if (op === 'remove') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.trim() === act.name.trim()
            );
            if (target) {
              next = next.filter((m) => m.id !== target.id);
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void deleteMedicationRecord(firebaseUser.uid, target.id).catch(() => {});
              }
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
            }
          } else if (op === 'mark_taken') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.includes(act.name.trim())
            );
            if (target) {
              const allTimes =
                target.times24 && target.times24.length > 0
                  ? target.times24
                  : target.time24
                    ? [target.time24]
                    : [];
              const alreadyTakenToday = target.takenDateKey === todayIso;
              const nextRem =
                !alreadyTakenToday &&
                typeof target.remainingDoses === 'number' &&
                target.remainingDoses > 0
                  ? target.remainingDoses - 1
                  : target.remainingDoses;
              const updated: MedicationItem = {
                ...target,
                takenDateKey: todayIso,
                takenDosesToday: allTimes,
                remainingDoses: nextRem,
              };
              next = next.map((m) => (m.id === target.id ? updated : m));
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertMedicationRecord(firebaseUser.uid, updated).catch(() => {});
              }
              results.push({ name: target.name, operation: 'mark_taken', status: 'taken', id: target.id });
            }
          } else if (op === 'update') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.trim() === act.name.trim()
            );
            if (target) {
              const updated = sanitizeMedicationItem({
                ...target,
                name: act.name || target.name,
                time24: actTimes?.[0] ?? act.time24 ?? target.time24,
                times24: actTimes ?? target.times24,
                daysOfWeek: act.daysOfWeek ?? target.daysOfWeek,
                doseNote: act.doseNote ?? target.doseNote,
                courseEndDate: act.courseEndDate ?? target.courseEndDate,
                remainingDoses:
                  typeof act.remainingDoses === 'number'
                    ? act.remainingDoses
                    : target.remainingDoses,
                totalDoses:
                  typeof act.totalDoses === 'number'
                    ? act.totalDoses
                    : target.totalDoses,
              });
              next = next.map((m) => (m.id === target.id ? updated : m));
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertMedicationRecord(firebaseUser.uid, updated).catch(() => {});
              }
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            }
          } else {
            const existing = next.find((m) => m.name.trim() === act.name.trim());
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const updated = sanitizeMedicationItem({
                ...existing,
                time24: actTimes?.[0] ?? act.time24 ?? existing.time24,
                times24: actTimes ?? existing.times24,
                daysOfWeek: act.daysOfWeek ?? existing.daysOfWeek,
                doseNote: act.doseNote ?? existing.doseNote,
                calendarEventId: calId || existing.calendarEventId,
                courseEndDate: act.courseEndDate ?? existing.courseEndDate,
                remainingDoses:
                  typeof act.remainingDoses === 'number'
                    ? act.remainingDoses
                    : existing.remainingDoses,
                totalDoses:
                  typeof act.totalDoses === 'number'
                    ? act.totalDoses
                    : existing.totalDoses,
              });
              next = next.map((m) => (m.id === existing.id ? updated : m));
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertMedicationRecord(firebaseUser.uid, updated).catch(() => {});
              }
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const rem =
                typeof act.remainingDoses === 'number' && act.remainingDoses >= 0
                  ? act.remainingDoses
                  : -1;
              const tot =
                typeof act.totalDoses === 'number' && act.totalDoses >= 0
                  ? act.totalDoses
                  : rem;
              const created = sanitizeMedicationItem({
                id: sanitizeMedicationId(
                  act.medicationId || `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                name: act.name,
                time24: actTimes?.[0] ?? act.time24 ?? '',
                times24: actTimes ?? [],
                daysOfWeek: act.daysOfWeek ?? [],
                doseNote: act.doseNote ?? '',
                takenDateKey: '',
                takenDosesToday: [],
                calendarEventId: calId,
                courseEndDate: act.courseEndDate ?? '',
                remainingDoses: rem,
                totalDoses: tot,
              });
              next = [...next, created];
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertMedicationRecord(firebaseUser.uid, created).catch(() => {});
              }
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        return next;
      });

      return results;
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]
  );

  const handleAddCreativeActivity = useCallback(
    (input: {
      name: string;
      emoji?: string;
      cadence?: CreativeCadence;
      goalCount?: number;
      weeklyGoalSessions: number;
      sessionMinutes: number;
      expiresOnDate?: string;
    }) => {
      const cadence: CreativeCadence = input.cadence ?? 'weekly';
      const goalCount = input.goalCount ?? input.weeklyGoalSessions;
      const act = sanitizeCreativeActivityItem({
        id: sanitizeCreativeActivityId(
          `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        ),
        name: input.name,
        emoji: input.emoji || '🎨',
        cadence,
        goalCount,
        weeklyGoalSessions: Math.min(14, goalCount),
        sessionMinutes: input.sessionMinutes,
        loggedDates: [],
        scheduledTime24: '',
        calendarEventId: '',
        expiresOnDate: input.expiresOnDate ?? '',
      });
      setCreativeActivities((prev) => [...prev, act]);
      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void upsertCreativeActivityRecord(firebaseUser.uid, act).catch(() => {});
      }
      showToast(`${act.emoji} تمت إضافة «${act.name}» وسيُوضع تلقائياً في أوقاتك الفاضية ✓`);
      return act;
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleDeleteCreativeActivity = useCallback(
    (id: string) => {
      setCreativeActivities((prev) => prev.filter((a) => a.id !== id));
      if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
        void deleteCreativeActivityRecord(firebaseUser.uid, id).catch(() => {});
      }
      showToast('تم حذف النشاط الإبداعي');
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const handleScheduleCreativeInCalendar = useCallback(
    async (placement: CreativeActivityPlacement) => {
      if (!placement.suggestedSlot) {
        showToast('لا توجد فترة فراغ كافية متبقية اليوم — يمكنك جدولته عبر شات Gemini لغدٍ');
        return;
      }
      const action: CalendarActionProposal = {
        operation: 'create',
        calendarId: 'primary',
        title: `${placement.activity.emoji} ${placement.activity.name}`,
        dateIso: getCairoTodayIso(),
        startTime24: placement.suggestedSlot.time24,
        durationMinutes: placement.activity.sessionMinutes,
        description: `نشاط إبداعي مجدول في وقت فراغك · الهدف: ${placement.goalInPeriod} جلسات (${placement.periodLabelAr})`,
      };
      const res = await handleExecuteCalendarActions([action]);
      const createdId = res.results[0]?.id ?? '';
      setCreativeActivities((prev) =>
        prev.map((a) => {
          if (a.id !== placement.activity.id) return a;
          const updated: CreativeActivityItem = {
            ...a,
            scheduledTime24: placement.suggestedSlot!.time24,
            calendarEventId: createdId || a.calendarEventId,
          };
          if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
            void upsertCreativeActivityRecord(firebaseUser.uid, updated).catch(() => {});
          }
          return updated;
        })
      );
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, handleExecuteCalendarActions, showToast]
  );

  const handleExecuteCreativeActions = useCallback(
    async (
      creativeActions: CreativeActivityActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<CreativeExecutionResult[]> => {
      const todayIso = getCairoTodayIso();
      const results: CreativeExecutionResult[] = [];

      setCreativeActivities((prev) => {
        let next = [...prev];
        for (const act of creativeActions) {
          const op = act.operation;
          if (op === 'remove') {
            const target = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.trim() === act.name.trim()
            );
            if (target) {
              next = next.filter((a) => a.id !== target.id);
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void deleteCreativeActivityRecord(firebaseUser.uid, target.id).catch(() => {});
              }
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
            }
          } else if (op === 'log_session' || op === 'log_today') {
            const target = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.includes(act.name.trim())
            );
            if (target) {
              const nextDates = target.loggedDates.includes(todayIso)
                ? target.loggedDates
                : [...target.loggedDates, todayIso].slice(-30);
              const updated: CreativeActivityItem = { ...target, loggedDates: nextDates };
              next = next.map((a) => (a.id === target.id ? updated : a));
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertCreativeActivityRecord(firebaseUser.uid, updated).catch(() => {});
              }
              results.push({ name: target.name, operation: 'log_session', status: 'logged', id: target.id });
            }
          } else {
            const existing = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.trim() === act.name.trim()
            );
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const nextCadence = act.cadence ?? existing.cadence ?? 'weekly';
              const nextGoal =
                act.goalCount ?? act.weeklyGoalSessions ?? existing.goalCount ?? existing.weeklyGoalSessions;
              const updated = sanitizeCreativeActivityItem({
                ...existing,
                name: act.name || existing.name,
                emoji: act.emoji ?? existing.emoji,
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? existing.sessionMinutes,
                scheduledTime24: act.scheduledTime24 ?? existing.scheduledTime24,
                calendarEventId: calId || existing.calendarEventId,
                expiresOnDate: act.expiresOnDate ?? existing.expiresOnDate,
              });
              next = next.map((a) => (a.id === existing.id ? updated : a));
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertCreativeActivityRecord(firebaseUser.uid, updated).catch(() => {});
              }
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const nextCadence: CreativeCadence = act.cadence ?? 'weekly';
              const nextGoal =
                act.goalCount ??
                act.weeklyGoalSessions ??
                (nextCadence === 'daily' ? 1 : nextCadence === 'monthly' ? 8 : 3);
              const created = sanitizeCreativeActivityItem({
                id: sanitizeCreativeActivityId(
                  act.activityId || `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                name: act.name,
                emoji: act.emoji ?? '🎨',
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? 30,
                loggedDates: [],
                scheduledTime24: act.scheduledTime24 ?? '',
                calendarEventId: calId,
                expiresOnDate: act.expiresOnDate ?? '',
              });
              next = [...next, created];
              if (firebaseUser?.uid && firebaseUser.emailVerified && firestoreSynced) {
                void upsertCreativeActivityRecord(firebaseUser.uid, created).catch(() => {});
              }
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        return next;
      });

      return results;
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]
  );

  const handleToggleDailyCommitmentStreak = () => {
    setStreaks((s) => ({
      ...s,
      dailyCommitmentDoneToday: !s.dailyCommitmentDoneToday,
      dailyCommitmentDays: !s.dailyCommitmentDoneToday
        ? s.dailyCommitmentDays + 1
        : Math.max(0, s.dailyCommitmentDays - 1),
    }));
  };

  const nextActiveBlock = useMemo(() => {
    const nowMin = getCairoNowMinutes();
    const upcoming = liveBlocks.find(
      (b) => !b.completed && !b.deleted && b.startMin >= nowMin
    );
    return upcoming ?? liveBlocks.find((b) => !b.completed && !b.deleted) ?? liveBlocks[0];
  }, [liveBlocks]);

  const pipCountdownText = useMemo(() => {
    if (simulateUnder60s) {
      return `00:${String(liveCountdownSec).padStart(2, '0')}`;
    }
    if (!nextActiveBlock) return '00:00';
    const nowMin = getCairoNowMinutes();
    let diff = nextActiveBlock.startMin - nowMin;
    if (diff < 0) diff += 1440;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [nextActiveBlock, simulateUnder60s, liveCountdownSec]);

  const assistantContextSummary = useMemo(() => {
    const lifeConstitution = buildLifeProfileGeminiSummary(
      lifeProfile,
      dailyRhythmPlan,
      memories,
      weatherInfo,
      todayCalendarMeta,
      creativePlacements,
      freeSlotsToday,
      tomorrowAlert,
      todayCairoIso
    );
    const prayerLines = prayers
      .filter((p) => p.isObligatory)
      .map((p) => `${p.nameAr}: ${formatMinutes12h(p.adhanMinutes, 'ar')} (تنبيه ${formatMinutes12h(p.alarmMinutes, 'ar')})`)
      .join(' | ');

    const calendarLines =
      calendarEvents.length > 0
        ? calendarEvents
            .map(
              (ev) =>
                `- [eventId=${ev.id} | calendarId=${ev.calendarId ?? 'primary'}] ${ev.summary} (${formatIsoTo12h(ev.start, 'ar')})`
            )
            .join('\n')
        : 'لا توجد أحداث تقويم محملة حالياً.';

    const taskLines =
      googleTasks.length > 0
        ? googleTasks
            .map(
              (tk) =>
                `- [taskId=${tk.id} | list=${tk.taskListTitle}] ${tk.title} (${tk.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'})`
            )
            .join('\n')
        : 'لا توجد مهام محملة حالياً.';

    return `
${lifeConstitution}
حالة حماية الصوت الآن: ${activeSanctuary.type === 'none' ? 'عادي' : activeSanctuary.labelAr}
مواقيت الصلاة اليوم (${activeLocation.nameAr}): ${prayerLines}
الترطيب المسجل اليوم: ${hydrationToday.cupsLogged}/${hydrationToday.targetCups} كوب (${hydrationToday.cupsLogged * lifeProfile.cupSizeMl} / ${dailyRhythmPlan.activeTargetMl} مل)
الحدث القادم: ${nextActiveBlock ? `${nextActiveBlock.emojiPair} ${nextActiveBlock.categoryAr} (${formatMinutes12h(nextActiveBlock.startMin, 'ar')})` : 'لا يوجد'}
ملخص أحداث اليوم على الشاشة:
${calendarLines}
ملخص مهام Google Tasks:
${taskLines}
`.trim();
  }, [
    activeLocation.nameAr,
    activeSanctuary,
    calendarEvents,
    creativePlacements,
    dailyRhythmPlan,
    freeSlotsToday,
    googleTasks,
    hydrationToday.cupsLogged,
    hydrationToday.targetCups,
    lifeProfile,
    memories,
    nextActiveBlock,
    prayers,
    todayCairoIso,
    todayCalendarMeta,
    tomorrowAlert,
    weatherInfo,
  ]);

  return (
    <div
      className={`min-h-screen transition-colors ${
        surfaceTheme === 'amoled' ? 'bg-black' : 'bg-[#070A0F]'
      } text-zinc-100 pb-16`}
    >
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
        language={language}
        onToggleLanguage={() => setLanguage((l) => (l === 'ar' ? 'en' : 'ar'))}
      />

      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#7FFFD4]/50 bg-black/95 px-4 py-2.5 text-xs font-semibold text-[#7FFFD4] shadow-2xl">
          {toastMessage}
        </div>
      )}

      <main className="pb-24 md:pb-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            language={language}
            isFridayMode={isFridayMode}
            onToggleFridayMode={handleToggleFridayMode}
            includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
            onToggleBiweeklyPcCleanup={handleToggleBiweeklyPcCleanup}
            adhanOverrideSilent={adhanOverrideSilent}
            onToggleAdhanOverrideSilent={() => setAdhanOverrideSilent((v) => !v)}
            onTestAdhanChime={handleTestAdhanChime}
            surfaceTheme={surfaceTheme}
            onToggleSurfaceTheme={setSurfaceTheme}
            prayers={prayers}
            blocks={liveBlocks}
            includePrayerAnchors={includePrayerAnchors}
            onToggleIncludePrayerAnchors={() => setIncludePrayerAnchors((v) => !v)}
            useOfflineDemo={useOfflineDemo}
            onToggleOfflineDemo={() => setUseOfflineDemo((v) => !v)}
            onToggleComplete={handleToggleComplete}
            onDeleteBlock={handleDeleteBlock}
            onRestoreBlock={handleRestoreBlock}
            onRestoreAllDeleted={handleRestoreAllDeleted}
            lastDeletedBlock={lastDeletedBlock}
            shakeUndoSecondsLeft={shakeUndoSecondsLeft}
            onTriggerShakeUndo={handleTriggerShakeUndo}
            tombstones={tombstones}
            onSweepOldTombstones={handleSweepOldTombstones}
            hydrationToday={hydrationToday}
            hydrationHistory={hydrationHistory}
            onLogWaterCup={handleLogWaterCup}
            onToggleWaterSlot={handleToggleWaterSlot}
            medications={medications}
            onToggleMedication={handleToggleMedication}
            onAddMedication={handleAddMedication}
            onDeleteMedication={handleDeleteMedication}
            streaks={streaks}
            onToggleDailyCommitmentStreak={handleToggleDailyCommitmentStreak}
            pomodoro={pomodoro}
            onOpenPomodoro={() => setIsPomodoroModalOpen(true)}
            travelState={travelState}
            onOpenTravel={() => setIsTravelModalOpen(true)}
            onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
            hasUndoSnapshot={!!undoSnapshot}
            onUndoReflow={handleUndoReflow}
            quietMode={quietMode}
            quietRemainingSec={quietRemainingSec}
            onSetQuietMode={handleSetQuietMode}
            liveCountdownSec={liveCountdownSec}
            simulateUnder60s={simulateUnder60s}
            onToggleSimulateUnder60s={() => setSimulateUnder60s((v) => !v)}
            calendarConnected={!needsAuth}
            calendarUserEmail={authUser?.email ?? undefined}
            isLoggingIn={isLoggingIn}
            loadingCalendarEvents={loadingEvents}
            calendarList={calendarList}
            calendarEvents={calendarEvents}
            googleTaskLists={googleTaskLists}
            googleTasks={googleTasks}
            loadingTasks={loadingTasks}
            chatMessages={chatMessages}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onRefreshWorkspace={() => refreshWorkspace()}
            onExecuteCalendarActions={handleExecuteCalendarActions}
            onExecuteTaskActions={handleExecuteTaskActions}
            onOpenAssistant={() => setActiveTab('assistant')}
            syncTier={syncTier}
            onChangeSyncTier={setSyncTier}
            onImportIcsBlocks={handleImportIcsBlocks}
            periodicRituals={periodicRituals}
            onCompletePeriodicRitual={handleCompletePeriodicRitual}
            batteryGuard={batteryGuard}
            firestoreSynced={firestoreSynced}
            aquaTouchMode={deviceSettings.aquaTouchMode}
            alertSliderLinked={deviceSettings.alertSliderLinked}
            lifeProfile={lifeProfile}
            dailyRhythmPlan={dailyRhythmPlan}
            fastingOverride={fastingOverride}
            onChangeFastingOverride={setFastingOverride}
            onOpenLifeProfile={() => setIsLifeProfileModalOpen(true)}
            onQuickUpdateWeight={handleQuickUpdateWeight}
            memoryCount={memories.length}
            onDetectGpsLocation={handleDetectGpsLocation}
            isDetectingGps={isDetectingGps}
            activeSanctuary={activeSanctuary}
            meetingModeActive={meetingModeActive}
            onToggleMeetingMode={handleToggleMeetingMode}
            silentNotifications={silentNotifications}
            onClearSilentNotifications={handleClearSilentNotifications}
            activeAudioAlert={activeAudioAlert}
            onAcknowledgeAudioAlert={handleAcknowledgeAudioAlert}
            onTriggerTaskAlert={triggerTaskAlert}
            weatherInfo={weatherInfo}
            gmailDigest={gmailDigest}
            gmailScannedCount={gmailScannedCount}
            loadingGmail={loadingGmail}
            gmailNeedsReauth={gmailNeedsReauth}
            gmailError={gmailError}
            onFetchGmailDigest={() => fetchGmailDigest()}
            onLogSleepQuality={handleLogSleepQuality}
            onOpenAssistantWithPrompt={handleOpenAssistantWithPrompt}
            todayCalendarMeta={todayCalendarMeta}
            creativePlacements={creativePlacements}
            freeSlotsToday={freeSlotsToday}
            onAddCreativeActivity={handleAddCreativeActivity}
            onToggleCreativeToday={handleToggleCreativeToday}
            onDeleteCreativeActivity={handleDeleteCreativeActivity}
            onScheduleCreativeInCalendar={handleScheduleCreativeInCalendar}
            waterRemindersEnabled={waterRemindersEnabled}
            notificationPermission={notificationPermission}
            onToggleWaterReminders={handleToggleWaterReminders}
            onRequestNotificationPermission={handleRequestNotificationPermission}
            tomorrowAlert={tomorrowAlert}
            lowEnergyActive={lowEnergyActive}
            onToggleLowEnergyToday={handleToggleLowEnergyToday}
            soundRepeats={lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS}
            onUpdateSoundRepeat={handleUpdateSoundRepeat}
            lastDeletedWorkspaceItem={lastDeletedWorkspaceItem}
            onUndoWorkspaceDelete={handleUndoWorkspaceDelete}
            onDismissWorkspaceUndo={() => setLastDeletedWorkspaceItem(null)}
            wsConnected={wsConnected}
            activeOneTimeSilenceMinutes={activeOneTimeSilenceMinutes}
          />
        )}

        {activeTab === 'mobile' && (
          <MobilePreviewView
            language={language}
            prayers={prayers}
            blocks={liveBlocks}
            hydrationToday={hydrationToday}
            onLogWaterCup={handleLogWaterCup}
            quietMode={quietMode}
            quietRemainingSec={quietRemainingSec}
            onCycleQuietMode={handleCycleQuietMode}
            onSetQuietMode={handleSetQuietMode}
            adhanOverrideSilent={adhanOverrideSilent}
            onTestAdhanChime={handleTestAdhanChime}
            travelState={travelState}
            onOpenTravel={() => setIsTravelModalOpen(true)}
            onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
            onOpenPomodoro={() => setIsPomodoroModalOpen(true)}
            liveCountdownSec={liveCountdownSec}
            batteryGuard={batteryGuard}
            onSimulateCharge90={handleSimulateCharge90}
            onSimulatePowerDisconnect={handleSimulatePowerDisconnect}
            onSimulateBedtimeLowBattery={handleSimulateBedtimeLowBattery}
            onToggleBypassCharging={handleToggleBypassCharging}
            hasShakeUndoActive={!!lastDeletedBlock && shakeUndoSecondsLeft > 0}
            onTriggerShakeUndo={handleTriggerShakeUndo}
            alarmRinging={alarmRinging}
            onDismissTwoWay={handleDismissTwoWay}
            deviceSettings={deviceSettings}
            onUpdateDeviceSettings={handleUpdateDeviceSettings}
            firestoreSynced={firestoreSynced}
          />
        )}

        {activeTab === 'overlay' && (
          <OverlaySimulatorView
            blocks={liveBlocks}
            batteryGuard={batteryGuard}
            quietMode={quietMode}
            stealthAudioOnly={stealthAudioOnly}
            onToggleStealthAudioOnly={() => setStealthAudioOnly((v) => !v)}
            alarmRinging={alarmRinging}
            onTriggerRing={handleTriggerRing}
            onDismissTwoWay={handleDismissTwoWay}
            onSimulateCharge90={handleSimulateCharge90}
            onSimulatePowerDisconnect={handleSimulatePowerDisconnect}
            onSimulateWindowsWake={handleSimulateWindowsWake}
          />
        )}

        {activeTab === 'assistant' && (
          <GeminiAssistantView
            language={language}
            activeLocation={activeLocation}
            contextSummary={assistantContextSummary}
            needsAuth={needsAuth}
            authUser={authUser}
            isLoggingIn={isLoggingIn}
            calendarEvents={calendarEvents}
            googleTasks={googleTasks}
            medications={medications}
            creativePlacements={creativePlacements}
            loadingEvents={loadingEvents}
            loadingTasks={loadingTasks}
            messages={chatMessages}
            onChangeMessages={setChatMessages}
            onResetChat={() => setChatMessages([WELCOME_MESSAGE])}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onRefreshWorkspace={() => refreshWorkspace()}
            onExecuteCalendarActions={handleExecuteCalendarActions}
            onExecuteTaskActions={handleExecuteTaskActions}
            onExecuteMedicationActions={handleExecuteMedicationActions}
            onExecuteCreativeActions={handleExecuteCreativeActions}
            onApplyProfileUpdates={handleUpdateLifeProfile}
            onExecuteMemoryActions={handleExecuteMemoryActions}
            onOpenLifeProfile={() => setIsLifeProfileModalOpen(true)}
            initialPrompt={pendingAssistantPrompt}
            onConsumeInitialPrompt={() => setPendingAssistantPrompt(null)}
            autoStartVoice={autoStartVoice}
            onConsumeAutoStartVoice={() => setAutoStartVoice(false)}
            memoryCount={memories.length}
          />
        )}

        {activeTab === 'blueprint' && (
          <ArchitectureBlueprintView changelog={changelog} />
        )}
      </main>

      <FloatingPiPCapsule
        nextEmoji={nextActiveBlock?.emojiPair.split(' ')[0] ?? '📅'}
        countdownText={pipCountdownText}
        cupsLogged={hydrationToday.cupsLogged}
        targetCups={hydrationToday.targetCups}
        onLogWaterCup={handleLogWaterCup}
        onOpenDashboard={() => setActiveTab('dashboard')}
      />

      <OfflineIndicator language={language} />

      <LifeProfileModal
        isOpen={isLifeProfileModalOpen}
        onClose={() => setIsLifeProfileModalOpen(false)}
        profile={lifeProfile}
        prayers={prayers}
        activeLocation={activeLocation}
        memories={memories}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onSaveProfile={handleUpdateLifeProfile}
        onDetectGpsLocation={handleDetectGpsLocation}
        isDetectingGps={isDetectingGps}
      />

      <TravelModeModal
        isOpen={isTravelModalOpen}
        onClose={() => setIsTravelModalOpen(false)}
        travelState={travelState}
        scheduleBlocks={liveBlocks}
        onApplyTravel={handleApplyTravel}
        onDisableTravel={handleDisableTravel}
      />

      <SmartCatchUpModal
        isOpen={isCatchUpModalOpen}
        onClose={() => setIsCatchUpModalOpen(false)}
        blocks={liveBlocks}
        hasUndoSnapshot={!!undoSnapshot}
        onCommitReflow={handleCommitReflow}
        onUndoToOriginal={handleUndoReflow}
      />

      <PomodoroModal
        isOpen={isPomodoroModalOpen}
        onClose={() => setIsPomodoroModalOpen(false)}
        state={pomodoro}
        onToggleRun={() =>
          setPomodoro((p) => ({ ...p, isRunning: !p.isRunning }))
        }
        onReset={() =>
          setPomodoro((p) => ({
            ...p,
            phase: 'focus',
            remainingSeconds: p.presetMinutes * 60,
            totalSeconds: p.presetMinutes * 60,
            isRunning: false,
          }))
        }
        onSelectPreset={(minutes) =>
          setPomodoro((p) => ({
            ...p,
            phase: minutes === 5 ? 'break' : 'focus',
            presetMinutes: minutes,
            remainingSeconds: minutes * 60,
            totalSeconds: minutes * 60,
            isRunning: false,
          }))
        }
        onFastForwardTest={() =>
          setPomodoro((p) => ({
            ...p,
            phase: 'focus',
            remainingSeconds: 3,
            totalSeconds: p.presetMinutes * 60,
            isRunning: true,
          }))
        }
      />
    </div>
  );
}
