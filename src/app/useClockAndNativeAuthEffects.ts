import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import {
  AppLanguage,
  BatteryGuardState,
  PersistedChatMessage,
  PhoneBatteryTelemetry,
  SharedChangelogEntry,
  SilentNotificationItem,
} from '../types/dayrhythm';
import { sanitizePersistedChats } from '../services/apiClient';
import {
  auth,
  firebaseConfig,
  getNativeCloudAuthPayload,
  publishPhoneBatteryTelemetry,
  type AppSyncSettings,
} from '../firebase';
import {
  formatNow12hInTimeZone,
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
} from '../engines/prayerEngine';
import { trueNowMs } from '../engines/trueClock';
import {
  ACTIVE_UID_STORAGE_KEY,
  CHAT_STORAGE_KEY,
  SILENT_NOTIFS_STORAGE_KEY,
  WELCOME_MESSAGE,
  detectIsMobileDeviceClient,
} from '../utils/appHelpers';

export interface UseClockAndNativeAuthEffectsParams {
  activeBrandLogo: { src: string };
  setToastMessage: Dispatch<SetStateAction<string>>;
  phoneChargeNotifiedCycleRef: MutableRefObject<boolean>;
  setPhoneChargeAlertDismissed: Dispatch<SetStateAction<boolean>>;
  updateAppSettings: (patch: Partial<AppSyncSettings>) => void;
  setBatteryGuard: Dispatch<SetStateAction<BatteryGuardState>>;
  setPhoneBattery: Dispatch<SetStateAction<PhoneBatteryTelemetry | null>>;
  firebaseUser: User | null;
  authUser: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null } | null;
  activeTimeZone: string;
  setChangelog: Dispatch<SetStateAction<SharedChangelogEntry[]>>;
  language: AppLanguage;
  chatMessages: PersistedChatMessage[];
  setChatMessages: Dispatch<SetStateAction<PersistedChatMessage[]>>;
  silentNotifications: SilentNotificationItem[];
  setSilentNotifications: Dispatch<SetStateAction<SilentNotificationItem[]>>;
  setNowTickMin: Dispatch<SetStateAction<number>>;
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
}

export function useClockAndNativeAuthEffects(p: UseClockAndNativeAuthEffectsParams) {
  const {
    activeBrandLogo,
    setToastMessage,
    phoneChargeNotifiedCycleRef,
    setPhoneChargeAlertDismissed,
    updateAppSettings,
    setBatteryGuard,
    setPhoneBattery,
    firebaseUser,
    authUser,
    activeTimeZone,
    setChangelog,
    language,
    chatMessages,
    setChatMessages,
    silentNotifications,
    setSilentNotifications,
    setNowTickMin,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
  } = p;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = activeBrandLogo.src;
  }, [activeBrandLogo]);

  const showToast = useCallback(
    (msg: string) => {
      setToastMessage(msg);
      window.setTimeout(() => {
        setToastMessage((prev) => (prev === msg ? '' : prev));
      }, 4000);
    },
    [setToastMessage]
  );

  const handleUpdatePhoneChargeLimit = useCallback(
    (nextLimit: number) => {
      const clamped = Math.max(50, Math.min(100, Math.round(nextLimit)));
      phoneChargeNotifiedCycleRef.current = false;
      setPhoneChargeAlertDismissed(false);
      updateAppSettings({ phoneChargeLimitPct: clamped });
      setBatteryGuard((prev) => ({
        ...prev,
        bypassChargingLimitPct: prev.bypassChargingLimitPct === null ? null : clamped <= 80 ? 80 : 90,
      }));
      try {
        const savedBypass = localStorage.getItem('dayrhythm_bypass_limit_v1');
        if (savedBypass !== 'off' && savedBypass !== 'null') {
          localStorage.setItem('dayrhythm_bypass_limit_v1', String(clamped));
        }
      } catch {
        // ignore storage errors
      }
      setPhoneBattery((prev) => {
        if (!prev) return prev;
        const updated: PhoneBatteryTelemetry = {
          ...prev,
          chargeLimitPct: clamped,
          updatedAtMs: Date.now(),
        };
        if (firebaseUser?.uid && firebaseUser.emailVerified) {
          void publishPhoneBatteryTelemetry(firebaseUser.uid, updated).catch(() => {});
        }
        return updated;
      });
      showToast(`🔋 تم ضبط حد تنبيه شحن الموبايل على ${clamped}%`);
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, phoneChargeNotifiedCycleRef, setBatteryGuard, setPhoneBattery, setPhoneChargeAlertDismissed, showToast, updateAppSettings]
  );

  const appendChangelog = useCallback(
    (device: SharedChangelogEntry['device'], noteAr: string, noteEn: string) => {
      const ts = `${getDateIsoInTimeZone(activeTimeZone)} · ${formatNow12hInTimeZone(activeTimeZone, 'ar')}`;
      setChangelog((prev) => [
        { id: `cl-${Date.now()}`, version: (prev[0]?.version ?? 13) + 1, timestampStr: ts, device, noteAr, noteEn },
        ...prev,
      ]);
    },
    [activeTimeZone, setChangelog]
  );

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!firebaseUser?.uid && !authUser) return;
    try {
      const safeChats = sanitizePersistedChats(chatMessages, WELCOME_MESSAGE);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(safeChats.slice(-100)));
    } catch {
      // ignore quota errors
    }
  }, [chatMessages, firebaseUser?.uid, authUser]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== CHAT_STORAGE_KEY || !ev.newValue) return;
      try {
        setChatMessages(sanitizePersistedChats(JSON.parse(ev.newValue), WELCOME_MESSAGE));
      } catch {
        // ignore invalid external payload
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setChatMessages]);

  useEffect(() => {
    try {
      localStorage.setItem(SILENT_NOTIFS_STORAGE_KEY, JSON.stringify(silentNotifications.slice(0, 25)));
    } catch {
      // ignore quota errors
    }
  }, [silentNotifications]);

  useEffect(() => {
    const syncClockNow = () => {
      setNowTickMin(getNowMinutesInTimeZone(activeTimeZone, new Date(trueNowMs())));
    };
    syncClockNow();
    let boundaryTimer = 0;
    const scheduleNextBoundary = () => {
      const msToNextMinute = 60_000 - (trueNowMs() % 60_000) + 25;
      boundaryTimer = window.setTimeout(() => {
        syncClockNow();
        scheduleNextBoundary();
      }, msToNextMinute);
    };
    scheduleNextBoundary();
    const id = window.setInterval(syncClockNow, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncClockNow();
    };
    window.addEventListener('focus', syncClockNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(boundaryTimer);
      window.clearInterval(id);
      window.removeEventListener('focus', syncClockNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTimeZone, setNowTickMin]);

  const handleClearSilentNotifications = useCallback(() => {
    setSilentNotifications([]);
    showToast('تم مسح الإشعارات الصامتة المحفوظة ✓');
  }, [setSilentNotifications, showToast]);

  useEffect(() => {
    const effectiveUid =
      firebaseUser?.uid || authUser?.uid || auth.currentUser?.uid || localStorage.getItem(ACTIVE_UID_STORAGE_KEY) || '';
    try {
      const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview;
      wv?.postMessage?.(JSON.stringify({ type: 'sync-uid', uid: effectiveUid }));
    } catch {
      // ignore WebView2 postMessage errors
    }
    const native = (window as Window & { DayRhythmNative?: { setCloudAuth?: (json: string) => void } }).DayRhythmNative;
    if (!native?.setCloudAuth || !effectiveUid) return;

    const pushNativeAuthSnapshot = async () => {
      let idToken: string | undefined;
      try {
        idToken = await auth.currentUser?.getIdToken();
      } catch {
        // ignore token error
      }
      const rawPayload = getNativeCloudAuthPayload();
      let payloadObj: Record<string, unknown> = {};
      if (rawPayload) {
        try {
          payloadObj = JSON.parse(rawPayload);
        } catch {}
      } else {
        payloadObj = {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          databaseId:
            (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
            'ai-studio-dayrhythm-1f2dd321-5d9e-4566-bb4c-87a3962fa6f7',
          uid: effectiveUid,
        };
      }
      if (idToken) payloadObj.idToken = idToken;
      try {
        native?.setCloudAuth?.(JSON.stringify(payloadObj));
      } catch {
        // older APK without this bridge method
      }
    };
    void pushNativeAuthSnapshot();
    const unsubToken = auth.onIdTokenChanged(() => {
      void pushNativeAuthSnapshot();
    });
    return () => unsubToken();
  }, [firebaseUser?.uid, authUser?.uid]);

  useEffect(() => {
    try {
      (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
        .DayRhythmNative?.setChargeLimit?.(phoneChargeLimitPct, smartChargeAlertEnabled);
    } catch {
      // older APK without this bridge method
    }
  }, [phoneChargeLimitPct, smartChargeAlertEnabled]);

  const isPhoneClient = useMemo(() => detectIsMobileDeviceClient(), []);

  return {
    showToast,
    handleUpdatePhoneChargeLimit,
    appendChangelog,
    handleClearSilentNotifications,
    isPhoneClient,
  };
}
