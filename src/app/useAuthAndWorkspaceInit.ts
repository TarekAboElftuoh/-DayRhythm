import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  CreativeActivityItem,
  DynamicHabit,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
} from '../types/dayrhythm';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_HABITS,
  DEFAULT_MEDICATIONS,
  DEFAULT_MEMORIES,
  type OnePlusDeviceSettings,
} from '../firebase';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import {
  getCalendarAccessToken,
  getOrRefreshCalendarAccessToken,
  initCalendarAuth,
  isCalendarTokenExpiringSoon,
  observeFirebaseUser,
  refreshGoogleCalendarTokenSilently,
} from '../services/googleCalendarAuth';
import { hasPermanentLink } from '../services/googleOfflineAccess';
import {
  ACTIVE_UID_STORAGE_KEY,
  clearAllPersonalLocalStorage,
  loadOfflineWorkspaceCache,
  OFFLINE_CAL_PREFIX,
  OFFLINE_GMAIL_PREFIX,
  OFFLINE_TASKS_PREFIX,
  WELCOME_MESSAGE,
} from '../utils/appHelpers';

export interface UseAuthAndWorkspaceInitParams {
  authUser: User | null;
  needsAuth: boolean;
  workspaceTokenExpired: boolean;
  gmailNeedsReauth: boolean;
  hasHydratedGoogleDriveRef: React.MutableRefObject<boolean>;
  gmailRetryAttemptRef: React.MutableRefObject<number>;
  lastGmailAutoScanMsRef: React.MutableRefObject<number>;
  hasHydratedRemoteRef: React.MutableRefObject<boolean>;
  hasHydratedCloudChatRef: React.MutableRefObject<boolean>;
  syncedChatTextByIdRef: React.MutableRefObject<Map<string, string>>;
  cloudChatIdsRef: React.MutableRefObject<Set<string>>;
  setPermanentLinkActive: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceTokenExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setGmailNeedsReauth: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthUser: React.Dispatch<React.SetStateAction<User | null>>;
  setNeedsAuth: React.Dispatch<React.SetStateAction<boolean>>;
  setUseOfflineDemo: React.Dispatch<React.SetStateAction<boolean>>;
  setCalendarList: React.Dispatch<React.SetStateAction<GoogleCalendarInfo[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<GoogleCalendarEventItem[]>>;
  setGoogleTaskLists: React.Dispatch<React.SetStateAction<GoogleTaskList[]>>;
  setGoogleTasks: React.Dispatch<React.SetStateAction<GoogleTaskItem[]>>;
  setGmailDigest: React.Dispatch<React.SetStateAction<GmailDigestItem[]>>;
  setGmailScannedCount: React.Dispatch<React.SetStateAction<number>>;
  setGmailLastSyncedIso: React.Dispatch<React.SetStateAction<string>>;
  setFirebaseUser: React.Dispatch<React.SetStateAction<User | null>>;
  setFirestoreReady: React.Dispatch<React.SetStateAction<boolean>>;
  setFirestoreSynced: React.Dispatch<React.SetStateAction<boolean>>;
  setMedications: React.Dispatch<React.SetStateAction<MedicationItem[]>>;
  setCreativeActivities: React.Dispatch<React.SetStateAction<CreativeActivityItem[]>>;
  setHabits: React.Dispatch<React.SetStateAction<DynamicHabit[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  setLifeProfile: React.Dispatch<React.SetStateAction<LifeProfile>>;
  setDeviceSettings: React.Dispatch<React.SetStateAction<OnePlusDeviceSettings>>;
  setChatMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  hydrateGoogleDriveOnce: (token?: string) => Promise<boolean>;
  refreshWorkspace: (tokenOverride?: string, options?: { forceGmail?: boolean }) => Promise<void>;
  fetchGmailDigest: (tokenOverride?: string, options?: { silent?: boolean }) => Promise<void>;
  clearGmailRetryTimers: () => void;
  showToast: (msg: string) => void;
}

export function useAuthAndWorkspaceInit(p: UseAuthAndWorkspaceInitParams): void {
  useEffect(() => {
    const w = window as Window & { __dayRhythmPermanentLinkResult?: { ok: boolean; error?: string } };
    const result = w.__dayRhythmPermanentLinkResult;
    if (!result) return;
    delete w.__dayRhythmPermanentLinkResult;
    if (result.ok) {
      p.setPermanentLinkActive(true);
      p.setWorkspaceTokenExpired(false);
      p.showToast('🔗 تم الربط الدائم مع Google — مش هتحتاج تجدد الربط تاني على الجهاز ده ✓');
      void p.hydrateGoogleDriveOnce();
    } else if (result.error) {
      p.showToast(result.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.showToast, p.hydrateGoogleDriveOnce]);

  useEffect(() => {
    if (!p.authUser || p.needsAuth) return;
    let cancelled = false;
    const renewIfNeeded = async (force: boolean) => {
      if (!hasPermanentLink(p.authUser!.uid)) return;
      if (!force && !isCalendarTokenExpiringSoon(5 * 60_000)) return;
      const token = await refreshGoogleCalendarTokenSilently();
      if (cancelled) return;
      if (token) {
        p.setWorkspaceTokenExpired(false);
        p.setGmailNeedsReauth(false);
        if (force) void p.refreshWorkspace(token);
        if (!p.hasHydratedGoogleDriveRef.current) void p.hydrateGoogleDriveOnce(token);
      } else {
        p.setPermanentLinkActive(hasPermanentLink(p.authUser!.uid));
      }
    };
    if (p.workspaceTokenExpired) void renewIfNeeded(true);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    const id = isMobile ? window.setInterval(() => void renewIfNeeded(false), 60_000) : undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') void renewIfNeeded(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.authUser, p.needsAuth, p.workspaceTokenExpired, p.refreshWorkspace]);

  useEffect(() => {
    if (!p.authUser || p.needsAuth || p.gmailNeedsReauth) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false && getCalendarAccessToken()) {
        void p.fetchGmailDigest(undefined, { silent: true });
      }
    }, 10 * 60_000);

    const handleOnlineReconnect = () => {
      if (!getCalendarAccessToken()) return;
      p.gmailRetryAttemptRef.current = 0;
      p.clearGmailRetryTimers();
      void p.refreshWorkspace(undefined, { forceGmail: false });
    };

    const handleVisibilityResume = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine !== false &&
        Date.now() - p.lastGmailAutoScanMsRef.current >= 10 * 60_000 &&
        getCalendarAccessToken()
      ) {
        void p.fetchGmailDigest(undefined, { silent: true });
      }
    };

    window.addEventListener('online', handleOnlineReconnect);
    document.addEventListener('visibilitychange', handleVisibilityResume);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnlineReconnect);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.authUser, p.needsAuth, p.gmailNeedsReauth, p.workspaceTokenExpired, p.fetchGmailDigest, p.refreshWorkspace, p.clearGmailRetryTimers]);

  useEffect(() => {
    const unsubCalendar = initCalendarAuth(
      (user, token) => {
        p.setAuthUser(user);
        p.setNeedsAuth(false);
        p.setUseOfflineDemo(false);
        p.setWorkspaceTokenExpired(!token);
        const cachedCal = loadOfflineWorkspaceCache<{ calendars?: GoogleCalendarInfo[]; events?: GoogleCalendarEventItem[] }>(OFFLINE_CAL_PREFIX, user.uid);
        if (cachedCal) {
          if (Array.isArray(cachedCal.calendars) && cachedCal.calendars.length > 0) p.setCalendarList(cachedCal.calendars);
          if (Array.isArray(cachedCal.events)) p.setCalendarEvents(cachedCal.events);
        }
        const cachedTasks = loadOfflineWorkspaceCache<{ taskLists?: GoogleTaskList[]; tasks?: GoogleTaskItem[] }>(OFFLINE_TASKS_PREFIX, user.uid);
        if (cachedTasks) {
          if (Array.isArray(cachedTasks.taskLists) && cachedTasks.taskLists.length > 0) p.setGoogleTaskLists(cachedTasks.taskLists);
          if (Array.isArray(cachedTasks.tasks)) p.setGoogleTasks(cachedTasks.tasks);
        }
        const cachedGmail = loadOfflineWorkspaceCache<{ digestItems?: GmailDigestItem[]; scannedCount?: number; syncedIso?: string }>(OFFLINE_GMAIL_PREFIX, user.uid);
        if (cachedGmail) {
          if (Array.isArray(cachedGmail.digestItems)) p.setGmailDigest(cachedGmail.digestItems);
          if (typeof cachedGmail.scannedCount === 'number') p.setGmailScannedCount(cachedGmail.scannedCount);
          if (typeof cachedGmail.syncedIso === 'string') p.setGmailLastSyncedIso(cachedGmail.syncedIso);
        }
        if (token && navigator.onLine !== false) void p.refreshWorkspace(token, { forceGmail: true });
        if (token) {
          void p.hydrateGoogleDriveOnce(token);
        } else {
          void getOrRefreshCalendarAccessToken().then((freshToken) => {
            if (freshToken) {
              p.setWorkspaceTokenExpired(false);
              void p.hydrateGoogleDriveOnce(freshToken);
            } else {
              p.hasHydratedGoogleDriveRef.current = true;
            }
          });
        }
      },
      () => {
        p.setAuthUser(null);
        p.setNeedsAuth(true);
        p.setWorkspaceTokenExpired(false);
      }
    );

    const unsubFirebase = observeFirebaseUser((user) => {
      if (!user || user.isAnonymous) {
        p.setFirebaseUser(null);
        p.hasHydratedRemoteRef.current = false;
        p.hasHydratedCloudChatRef.current = false;
        p.syncedChatTextByIdRef.current.clear();
        p.cloudChatIdsRef.current.clear();
        p.setFirestoreReady(false);
        p.setFirestoreSynced(false);
        return;
      }
      p.setFirebaseUser(user);
      try {
        const prevUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (prevUid && prevUid !== user.uid) {
          clearAllPersonalLocalStorage();
          p.setMedications(DEFAULT_MEDICATIONS);
          p.setCreativeActivities(DEFAULT_CREATIVE_ACTIVITIES);
          p.setHabits(DEFAULT_HABITS);
          p.setMemories(DEFAULT_MEMORIES);
          p.setLifeProfile(DEFAULT_LIFE_PROFILE);
          p.setDeviceSettings(DEFAULT_DEVICE_SETTINGS);
          p.setChatMessages([WELCOME_MESSAGE]);
          p.setGmailDigest([]);
          p.setGmailScannedCount(0);
          p.setGmailLastSyncedIso('');
        }
        localStorage.setItem(ACTIVE_UID_STORAGE_KEY, user.uid);
      } catch { /* ignore */ }
    });
    return () => { unsubCalendar(); unsubFirebase(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.refreshWorkspace]);
}
