import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SUNLIGHT_SETTINGS,
  type CreativeActivityItem,
  type DualStreaks,
  type DynamicHabit,
  type LifeProfile,
  type MedicationItem,
  type MemoryItem,
  type PeriodicRitualStatus,
  type PomodoroState,
  type QuietModeType,
  type SunlightSessionId,
  type SunlightSettings,
  type SurfaceTheme,
  type TravelState,
  type WeatherHydrationInfo,
} from '../types/dayrhythm';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import type { OnePlusDeviceSettings } from '../firebase';
import { DEFAULT_LOGO_ID, getLogoConceptById, SELECTED_LOGO_STORAGE_KEY } from '../components/logoRegistry';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import { loadSavedCapsulePrefs, loadSavedMemories } from '../utils/appHelpers';
import type { PrayerTimeEntry } from './buildExactAlarms';
import {
  computeSunlightSessionsWithCloud,
  sanitizeSunlightSettings,
  SUNLIGHT_SETTINGS_STORAGE_KEY,
} from './sunlightHelpers';

export const LAST_FIRESTORE_UPDATED_AT_KEY = 'dayrhythm_firestore_updated_at_v1';

export interface UseSunlightAndUiRefsParams {
  todayCairoIso: string;
  prayers: PrayerTimeEntry[];
  weatherInfo: WeatherHydrationInfo | null;
  nowTickMin: number;
  surfaceTheme: SurfaceTheme;
  quietMode: QuietModeType;
  adhanOverrideSilent: boolean;
  deviceSettings: OnePlusDeviceSettings;
  medications: MedicationItem[];
  creativeActivities: CreativeActivityItem[];
  habits: DynamicHabit[];
  completedOverrides: Record<string, boolean>;
  fastingOverride: 'auto' | 'fasting' | 'normal';
  isFridayMode: boolean;
  includeBiweeklyPcCleanup: boolean;
  travelState: TravelState;
  periodicRituals: PeriodicRitualStatus[];
  lifeProfile: LifeProfile;
}

export function useSunlightAndUiRefs(p: UseSunlightAndUiRefsParams) {
  const [sunlightSettings, setSunlightSettings] = useState<SunlightSettings>(() => {
    try {
      const saved = localStorage.getItem(SUNLIGHT_SETTINGS_STORAGE_KEY);
      return saved ? sanitizeSunlightSettings(JSON.parse(saved)) : DEFAULT_SUNLIGHT_SETTINGS;
    } catch {
      return DEFAULT_SUNLIGHT_SETTINGS;
    }
  });

  const handleUpdateSunlightSettings = useCallback((next: SunlightSettings) => {
    const clean = sanitizeSunlightSettings(next);
    setSunlightSettings(clean);
    try { localStorage.setItem(SUNLIGHT_SETTINGS_STORAGE_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  }, []);

  const [sunlightSnooze, setSunlightSnooze] = useState<{
    dateKey: string;
    offsets: Record<SunlightSessionId, number>;
  }>(() => ({ dateKey: p.todayCairoIso, offsets: { morning: 0, noon: 0, evening: 0 } }));

  useEffect(() => {
    setSunlightSnooze((prev) =>
      prev.dateKey === p.todayCairoIso
        ? prev
        : { dateKey: p.todayCairoIso, offsets: { morning: 0, noon: 0, evening: 0 } }
    );
  }, [p.todayCairoIso]);

  const sunlightSessions = useMemo<ComputedSunlightSession[]>(
    () =>
      computeSunlightSessionsWithCloud(
        p.prayers,
        p.weatherInfo,
        sunlightSettings,
        p.nowTickMin,
        sunlightSnooze,
        p.todayCairoIso
      ),
    [p.prayers, p.weatherInfo, sunlightSettings, p.nowTickMin, sunlightSnooze, p.todayCairoIso]
  );

  const handleSnoozeSunlight = useCallback(
    (id: SunlightSessionId) => {
      setSunlightSnooze((prev) => {
        const baseOffsets = prev.dateKey === p.todayCairoIso ? prev.offsets : { morning: 0, noon: 0, evening: 0 };
        return {
          dateKey: p.todayCairoIso,
          offsets: { ...baseOffsets, [id]: (baseOffsets[id] ?? 0) + 5 },
        };
      });
    },
    [p.todayCairoIso]
  );

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const firedReminderKeysRef = useRef<Set<string>>(new Set());
  const acknowledgedBlockIdsRef = useRef<Set<string>>(new Set());

  const [memories, setMemories] = useState<MemoryItem[]>(loadSavedMemories);
  const seededDefaultMemoriesRef = useRef(false);
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [autoStartVoice, setAutoStartVoice] = useState(false);
  const shortcutHandledRef = useRef(false);

  const [streaks, setStreaks] = useState<DualStreaks>({
    dailyCommitmentDays: 0, dailyCommitmentDoneToday: false, waterTargetDays: 0, waterTargetDoneToday: false,
  });

  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    phase: 'focus', presetMinutes: 25, remainingSeconds: 25 * 60, totalSeconds: 25 * 60, isRunning: false, completedCycles: 0,
  });

  const [isTravelModalOpen, setIsTravelModalOpen] = useState(false);
  const [isCatchUpModalOpen, setIsCatchUpModalOpen] = useState(false);
  const [isPomodoroModalOpen, setIsPomodoroModalOpen] = useState(false);
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);
  const [selectedLogoId, setSelectedLogoId] = useState<string>(() => {
    try { return window.localStorage.getItem(SELECTED_LOGO_STORAGE_KEY) || DEFAULT_LOGO_ID; } catch { return DEFAULT_LOGO_ID; }
  });
  const [capsulePrefs, setCapsulePrefs] = useState<CapsulePrefs>(loadSavedCapsulePrefs);

  const surfaceThemeRef = useRef(p.surfaceTheme); surfaceThemeRef.current = p.surfaceTheme;
  const quietModeRef = useRef(p.quietMode); quietModeRef.current = p.quietMode;
  const adhanOverrideSilentRef = useRef(p.adhanOverrideSilent); adhanOverrideSilentRef.current = p.adhanOverrideSilent;
  const deviceSettingsRef = useRef(p.deviceSettings); deviceSettingsRef.current = p.deviceSettings;
  const medicationsRef = useRef(p.medications); medicationsRef.current = p.medications;
  const creativeActivitiesRef = useRef(p.creativeActivities); creativeActivitiesRef.current = p.creativeActivities;
  const habitsRef = useRef(p.habits); habitsRef.current = p.habits;
  const memoriesRef = useRef(memories); memoriesRef.current = memories;
  const selectedLogoIdRef = useRef(selectedLogoId); selectedLogoIdRef.current = selectedLogoId;
  const capsulePrefsRef = useRef(capsulePrefs); capsulePrefsRef.current = capsulePrefs;
  const completedOverridesRef = useRef(p.completedOverrides); completedOverridesRef.current = p.completedOverrides;
  const fastingOverrideRef = useRef(p.fastingOverride); fastingOverrideRef.current = p.fastingOverride;
  const isFridayModeRef = useRef(p.isFridayMode); isFridayModeRef.current = p.isFridayMode;
  const includeBiweeklyPcCleanupRef = useRef(p.includeBiweeklyPcCleanup); includeBiweeklyPcCleanupRef.current = p.includeBiweeklyPcCleanup;
  const travelStateRef = useRef(p.travelState); travelStateRef.current = p.travelState;
  const pomodoroRef = useRef(pomodoro); pomodoroRef.current = pomodoro;
  const periodicRitualsRef = useRef(p.periodicRituals); periodicRitualsRef.current = p.periodicRituals;

  const lastFirestoreUpdatedAtRef = useRef<number>((() => {
    try {
      const parsed = Number(localStorage.getItem(LAST_FIRESTORE_UPDATED_AT_KEY) || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch { return 0; }
  })());

  const activeBrandLogo = useMemo(() => getLogoConceptById(selectedLogoId), [selectedLogoId]);

  return {
    sunlightSettings, setSunlightSettings, handleUpdateSunlightSettings, sunlightSessions,
    handleSnoozeSunlight, notificationPermission, setNotificationPermission, firedReminderKeysRef,
    acknowledgedBlockIdsRef, memories, setMemories, seededDefaultMemoriesRef,
    pendingAssistantPrompt, setPendingAssistantPrompt, autoStartVoice, setAutoStartVoice,
    shortcutHandledRef, streaks, setStreaks, pomodoro, setPomodoro,
    isTravelModalOpen, setIsTravelModalOpen, isCatchUpModalOpen, setIsCatchUpModalOpen,
    isPomodoroModalOpen, setIsPomodoroModalOpen, isLogoPickerOpen, setIsLogoPickerOpen,
    selectedLogoId, setSelectedLogoId, capsulePrefs, setCapsulePrefs,
    surfaceThemeRef, quietModeRef, adhanOverrideSilentRef, deviceSettingsRef,
    medicationsRef, creativeActivitiesRef, habitsRef, memoriesRef, selectedLogoIdRef,
    capsulePrefsRef, completedOverridesRef, fastingOverrideRef, isFridayModeRef,
    includeBiweeklyPcCleanupRef, travelStateRef, pomodoroRef, periodicRitualsRef,
    lastFirestoreUpdatedAtRef, activeBrandLogo,
  };
}
