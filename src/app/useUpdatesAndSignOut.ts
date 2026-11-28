import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  PhoneBatteryTelemetry,
  ScheduleBlock,
  SharedChangelogEntry,
  SilentNotificationItem,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_HABITS,
  DEFAULT_MEDICATIONS,
  DEFAULT_MEMORIES,
  type OnePlusDeviceSettings,
} from '../firebase';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import { signInWithGoogleCalendar, signOutGoogleCalendar } from '../services/googleCalendarAuth';
import { checkForGitHubReleaseUpdate, type UpdateCheckResult } from '../services/updateCheckService';
import { buildInitialHydrationHistory, clearAllPersonalLocalStorage, WELCOME_MESSAGE } from '../utils/appHelpers';

export interface UseUpdatesAndSignOutParams {
  activeTimeZone: string;
  hasHydratedRemoteRef: React.MutableRefObject<boolean>;
  hasHydratedCloudChatRef: React.MutableRefObject<boolean>;
  syncedChatTextByIdRef: React.MutableRefObject<Map<string, string>>;
  cloudChatIdsRef: React.MutableRefObject<Set<string>>;
  lastGmailAutoScanMsRef: React.MutableRefObject<number>;
  gpsFirstAttemptedRef: React.MutableRefObject<boolean>;
  gmailRetryAttemptRef: React.MutableRefObject<number>;
  setIsCheckingUpdates: React.Dispatch<React.SetStateAction<boolean>>;
  setAvailableUpdate: React.Dispatch<React.SetStateAction<UpdateCheckResult | null>>;
  setIsLoggingIn: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthUser: React.Dispatch<React.SetStateAction<User | null>>;
  setNeedsAuth: React.Dispatch<React.SetStateAction<boolean>>;
  setUseOfflineDemo: React.Dispatch<React.SetStateAction<boolean>>;
  setLocationResolutionState: React.Dispatch<React.SetStateAction<'idle' | 'resolving_gps' | 'gps_locked' | 'timezone_fallback'>>;
  setWorkspaceTokenExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setCalendarList: React.Dispatch<React.SetStateAction<GoogleCalendarInfo[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<GoogleCalendarEventItem[]>>;
  setGoogleTaskLists: React.Dispatch<React.SetStateAction<GoogleTaskList[]>>;
  setGoogleTasks: React.Dispatch<React.SetStateAction<GoogleTaskItem[]>>;
  setGmailDigest: React.Dispatch<React.SetStateAction<GmailDigestItem[]>>;
  setGmailScannedCount: React.Dispatch<React.SetStateAction<number>>;
  setGmailLastSyncedIso: React.Dispatch<React.SetStateAction<string>>;
  setGmailError: React.Dispatch<React.SetStateAction<string>>;
  setGmailNeedsReauth: React.Dispatch<React.SetStateAction<boolean>>;
  setMedications: React.Dispatch<React.SetStateAction<MedicationItem[]>>;
  setCreativeActivities: React.Dispatch<React.SetStateAction<CreativeActivityItem[]>>;
  setHabits: React.Dispatch<React.SetStateAction<DynamicHabit[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  setLifeProfile: React.Dispatch<React.SetStateAction<LifeProfile>>;
  setDeviceSettings: React.Dispatch<React.SetStateAction<OnePlusDeviceSettings>>;
  setChatMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  setSilentNotifications: React.Dispatch<React.SetStateAction<SilentNotificationItem[]>>;
  setPeriodicRituals: React.Dispatch<React.SetStateAction<PeriodicRitualStatus[]>>;
  setChangelog: React.Dispatch<React.SetStateAction<SharedChangelogEntry[]>>;
  setPhoneBattery: React.Dispatch<React.SetStateAction<PhoneBatteryTelemetry | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setStreaks: React.Dispatch<React.SetStateAction<DualStreaks>>;
  setHydrationHistory: React.Dispatch<React.SetStateAction<HydrationDayLog[]>>;
  setReflowedBlocksOverride: React.Dispatch<React.SetStateAction<ScheduleBlock[] | null>>;
  refreshWorkspace: (tokenOverride?: string, options?: { forceGmail?: boolean }) => Promise<void>;
  clearGmailRetryTimers: () => void;
  showToast: (msg: string) => void;
}

export function useUpdatesAndSignOut(p: UseUpdatesAndSignOutParams) {
  useEffect(() => {
    const onUpdateStatus = (evt: Event) => {
      const detail = (evt as CustomEvent<{ state?: string; message?: string }>).detail;
      if (!detail) return;
      p.setIsCheckingUpdates(detail.state === 'checking' || detail.state === 'downloading');
      if (detail.message) p.showToast(detail.message);
    };
    window.addEventListener('dayrhythm:update-status', onUpdateStatus);
    return () => window.removeEventListener('dayrhythm:update-status', onUpdateStatus);
  }, [p.setIsCheckingUpdates, p.showToast]);

  useEffect(() => {
    let cancelled = false;
    const timerId = window.setTimeout(() => {
      void checkForGitHubReleaseUpdate({ force: false }).then((res) => {
        if (!cancelled && res?.hasUpdate) p.setAvailableUpdate(res);
      });
    }, 2500);
    return () => { cancelled = true; window.clearTimeout(timerId); };
  }, [p.setAvailableUpdate]);

  const handleCheckAppUpdates = useCallback(() => {
    p.setIsCheckingUpdates(true);
    const stopSpinnerLater = () => window.setTimeout(() => p.setIsCheckingUpdates(false), 8000);
    const androidBridge = (window as Window & { DayRhythmNative?: { checkForUpdates?: () => void } }).DayRhythmNative;
    const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview;

    if (androidBridge?.checkForUpdates) {
      androidBridge.checkForUpdates();
      p.showToast('جاري فحص التحديثات من GitHub...');
      stopSpinnerLater();
      void checkForGitHubReleaseUpdate({ force: true }).then((res) => {
        if (res?.hasUpdate) p.setAvailableUpdate(res);
        else if (res && !res.hasUpdate) p.setAvailableUpdate(null);
      });
      return;
    }
    if (wv?.postMessage) {
      wv.postMessage('check-updates');
      p.showToast('جاري فحص التحديثات من GitHub...');
      stopSpinnerLater();
      void checkForGitHubReleaseUpdate({ force: true }).then((res) => {
        if (res?.hasUpdate) p.setAvailableUpdate(res);
        else if (res && !res.hasUpdate) p.setAvailableUpdate(null);
      });
      return;
    }

    void checkForGitHubReleaseUpdate({ force: true })
      .then(async (res) => {
        if (res?.hasUpdate) {
          p.setAvailableUpdate(res);
          p.showToast(`يتوفر إصدار جديد ${res.latestVersion} — رابط التحميل جاهز بالأعلى`);
          return;
        }
        p.setAvailableUpdate(null);
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
          if (reg) await reg.update().catch(() => undefined);
        }
        p.showToast(res ? 'تم فحص التحديثات — أنت على أحدث إصدار متاح' : 'تعذر الاتصال بـ GitHub حالياً — تحقق من الإنترنت');
      })
      .finally(() => p.setIsCheckingUpdates(false));
  }, [p.setAvailableUpdate, p.setIsCheckingUpdates, p.showToast]);

  const handleGoogleSignIn = useCallback(async () => {
    p.setIsLoggingIn(true);
    try {
      const result = await signInWithGoogleCalendar();
      if (result) {
        p.setAuthUser(result.user);
        p.setNeedsAuth(false);
        p.setUseOfflineDemo(false);
        await p.refreshWorkspace(result.accessToken, { forceGmail: true });
        p.showToast('تم ربط حساب Google Calendar و Tasks و Gmail والسحابة بنجاح ✓');
      }
    } catch (err: unknown) {
      p.showToast(err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.');
      throw err;
    } finally {
      p.setIsLoggingIn(false);
    }
  }, [p.refreshWorkspace, p.setAuthUser, p.setIsLoggingIn, p.setNeedsAuth, p.setUseOfflineDemo, p.showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    await signOutGoogleCalendar();
    clearAllPersonalLocalStorage();
    p.hasHydratedRemoteRef.current = false;
    p.hasHydratedCloudChatRef.current = false;
    p.syncedChatTextByIdRef.current.clear();
    p.cloudChatIdsRef.current.clear();
    p.lastGmailAutoScanMsRef.current = 0;
    p.gpsFirstAttemptedRef.current = false;
    p.setLocationResolutionState('idle');
    p.setAuthUser(null);
    p.setNeedsAuth(true);
    p.setWorkspaceTokenExpired(false);
    p.clearGmailRetryTimers();
    p.gmailRetryAttemptRef.current = 0;
    p.setCalendarList([]);
    p.setCalendarEvents([]);
    p.setGoogleTaskLists([]);
    p.setGoogleTasks([]);
    p.setGmailDigest([]);
    p.setGmailScannedCount(0);
    p.setGmailLastSyncedIso('');
    p.setGmailError('');
    p.setGmailNeedsReauth(false);
    p.setMedications(DEFAULT_MEDICATIONS);
    p.setCreativeActivities(DEFAULT_CREATIVE_ACTIVITIES);
    p.setHabits(DEFAULT_HABITS);
    p.setMemories(DEFAULT_MEMORIES);
    p.setLifeProfile(DEFAULT_LIFE_PROFILE);
    p.setDeviceSettings(DEFAULT_DEVICE_SETTINGS);
    p.setChatMessages([WELCOME_MESSAGE]);
    p.setSilentNotifications([]);
    p.setPeriodicRituals([]);
    p.setChangelog([]);
    p.setPhoneBattery(null);
    p.setPersistentAlert(null);
    p.setStreaks({ dailyCommitmentDays: 0, dailyCommitmentDoneToday: false, waterTargetDays: 0, waterTargetDoneToday: false });
    p.setHydrationHistory(buildInitialHydrationHistory(10, p.activeTimeZone));
    p.setReflowedBlocksOverride(null);
    p.showToast('تم تسجيل الخروج وتنظيف جميع البيانات الشخصية من هذا الجهاز ✓');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.activeTimeZone, p.showToast, p.clearGmailRetryTimers]);

  return { handleCheckAppUpdates, handleGoogleSignIn, handleGoogleSignOut };
}
