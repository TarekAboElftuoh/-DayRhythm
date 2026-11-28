import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type { GmailDigestItem } from '../types/dayrhythm';
import { getCalendarAccessToken, refreshGoogleCalendarToken } from '../services/googleCalendarAuth';
import { apiFetchJson, BackendUnavailableError, hasSameOriginBackend } from '../services/apiClient';
import { ACTIVE_UID_STORAGE_KEY, OFFLINE_GMAIL_PREFIX, saveOfflineWorkspaceCache } from '../utils/appHelpers';
import { fetchGmailDigestDirectClient } from './gmailDirectClient';

export interface UseGmailFetcherParams {
  activeTimeZone: string;
  gmailNeedsReauth: boolean;
  authUser: User | null;
  needsAuth: boolean;
  setLoadingGmail: React.Dispatch<React.SetStateAction<boolean>>;
  setGmailError: React.Dispatch<React.SetStateAction<string>>;
  setGmailNeedsReauth: React.Dispatch<React.SetStateAction<boolean>>;
  setGmailScannedCount: React.Dispatch<React.SetStateAction<number>>;
  setGmailDigest: React.Dispatch<React.SetStateAction<GmailDigestItem[]>>;
  setAuthUser: React.Dispatch<React.SetStateAction<User | null>>;
  setNeedsAuth: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceTokenExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRefreshingWorkspaceToken: React.Dispatch<React.SetStateAction<boolean>>;
  handleWorkspaceUnauthorized: () => void;
  fetchCalendarEvents: (tokenOverride?: string) => Promise<void>;
  fetchGoogleTasks: (tokenOverride?: string) => Promise<void>;
  showToast: (msg: string) => void;
}

export function useGmailAndWorkspace({
  activeTimeZone,
  gmailNeedsReauth,
  authUser,
  needsAuth,
  setLoadingGmail,
  setGmailError,
  setGmailNeedsReauth,
  setGmailScannedCount,
  setGmailDigest,
  setAuthUser,
  setNeedsAuth,
  setWorkspaceTokenExpired,
  setIsRefreshingWorkspaceToken,
  handleWorkspaceUnauthorized,
  fetchCalendarEvents,
  fetchGoogleTasks,
  showToast,
}: UseGmailFetcherParams) {
  const lastGmailAutoScanMsRef = useRef<number>(0);
  const gmailNeedsReauthRef = useRef<boolean>(false);
  const gmailRetryAttemptRef = useRef<number>(0);
  const gmailRetryTimerRef = useRef<number | null>(null);
  const gmailCountdownTimerRef = useRef<number | null>(null);
  const [gmailLastSyncedIso, setGmailLastSyncedIso] = useState<string>('');
  const [gmailNextRetryInSec, setGmailNextRetryInSec] = useState<number>(0);

  useEffect(() => {
    gmailNeedsReauthRef.current = gmailNeedsReauth;
  }, [gmailNeedsReauth]);

  const clearGmailRetryTimers = useCallback(() => {
    if (gmailRetryTimerRef.current !== null) {
      window.clearTimeout(gmailRetryTimerRef.current);
      gmailRetryTimerRef.current = null;
    }
    if (gmailCountdownTimerRef.current !== null) {
      window.clearInterval(gmailCountdownTimerRef.current);
      gmailCountdownTimerRef.current = null;
    }
    setGmailNextRetryInSec(0);
  }, []);

  useEffect(() => {
    return () => clearGmailRetryTimers();
  }, [clearGmailRetryTimers]);

  const fetchGmailDigest = useCallback(
    async (tokenOverride?: string, options?: { silent?: boolean }) => {
      const token = tokenOverride ?? getCalendarAccessToken();
      if (!token) {
        clearGmailRetryTimers();
        setGmailNeedsReauth(true);
        return;
      }
      clearGmailRetryTimers();
      setLoadingGmail(true);
      if (!options?.silent) setGmailError('');
      setGmailNeedsReauth(false);
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 18_000);

      const scheduleSmartGmailRetry = (errMsg: string) => {
        const backoffStepsSec = [15, 30, 60, 120, 300];
        const attempt = gmailRetryAttemptRef.current;
        if (attempt >= backoffStepsSec.length) {
          setGmailError(errMsg);
          return;
        }
        const delaySec = backoffStepsSec[attempt];
        gmailRetryAttemptRef.current = attempt + 1;
        setGmailError(errMsg);
        setGmailNextRetryInSec(delaySec);

        gmailCountdownTimerRef.current = window.setInterval(() => {
          setGmailNextRetryInSec((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        gmailRetryTimerRef.current = window.setTimeout(() => {
          clearGmailRetryTimers();
          if (navigator.onLine !== false && !gmailNeedsReauthRef.current) {
            void fetchGmailDigest(undefined, { silent: true });
          }
        }, delaySec * 1000);
      };

      const applyGmailSuccess = (scannedCount: number, digestItems: GmailDigestItem[]) => {
        gmailRetryAttemptRef.current = 0;
        lastGmailAutoScanMsRef.current = Date.now();
        const syncedIso = new Date().toISOString();
        setGmailError('');
        setGmailLastSyncedIso(syncedIso);
        setGmailScannedCount(scannedCount);
        setGmailDigest(digestItems);
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        saveOfflineWorkspaceCache(OFFLINE_GMAIL_PREFIX, activeUid, {
          digestItems,
          scannedCount,
          syncedIso,
        });
      };

      try {
        type GmailProxyReply = {
          needsReauth?: boolean;
          error?: string;
          scannedCount?: number;
          digestItems?: GmailDigestItem[];
        };
        let proxied: { ok: boolean; status: number; data: GmailProxyReply } | null = null;
        if (hasSameOriginBackend()) {
          try {
            proxied = await apiFetchJson<GmailProxyReply>('/api/gmail/digest', {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            });
          } catch (proxyErr: unknown) {
            if (!(proxyErr instanceof BackendUnavailableError)) throw proxyErr;
          }
        }

        if (!proxied) {
          const direct = await fetchGmailDigestDirectClient(token, controller.signal, activeTimeZone);
          if (direct.needsReauth || direct.status === 401 || direct.status === 403) {
            clearGmailRetryTimers();
            gmailRetryAttemptRef.current = 0;
            setGmailNeedsReauth(true);
            if (direct.status === 401) handleWorkspaceUnauthorized();
            setGmailError(direct.error || 'انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى.');
            return;
          }
          if (!direct.ok) {
            scheduleSmartGmailRetry(direct.error || 'تعذر قراءة ملخص Gmail حالياً.');
            return;
          }
          applyGmailSuccess(direct.scannedCount, direct.digestItems);
          return;
        }

        const { ok, status, data } = proxied;
        if (status === 401 || status === 403 || data.needsReauth) {
          clearGmailRetryTimers();
          gmailRetryAttemptRef.current = 0;
          setGmailNeedsReauth(true);
          if (status === 401) handleWorkspaceUnauthorized();
          setGmailError(data.error || 'انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى.');
          return;
        }
        if (!ok) {
          const direct = await fetchGmailDigestDirectClient(token, controller.signal, activeTimeZone);
          if (direct.ok) {
            applyGmailSuccess(direct.scannedCount, direct.digestItems);
            return;
          }
          scheduleSmartGmailRetry(direct.error || data.error || 'تعذر قراءة ملخص Gmail حالياً.');
          return;
        }
        applyGmailSuccess(Number(data.scannedCount ?? 0), Array.isArray(data.digestItems) ? data.digestItems : []);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          scheduleSmartGmailRetry('استغرق فحص Gmail وقتاً أطول من المعتاد — جاري إعادة المحاولة تلقائياً.');
        } else {
          scheduleSmartGmailRetry(
            err instanceof Error ? err.message : 'انقطع الاتصال بخدمة Gmail — جاري إعادة الاتصال تلقائياً.'
          );
        }
      } finally {
        window.clearTimeout(timer);
        setLoadingGmail(false);
      }
    },
    [
      activeTimeZone,
      clearGmailRetryTimers,
      handleWorkspaceUnauthorized,
      setGmailDigest,
      setGmailError,
      setGmailNeedsReauth,
      setGmailScannedCount,
      setLoadingGmail,
    ]
  );

  const refreshWorkspace = useCallback(
    async (tokenOverride?: string, options?: { forceGmail?: boolean }) => {
      const effectiveToken = tokenOverride ?? getCalendarAccessToken();
      if (!effectiveToken) {
        if (authUser && !needsAuth) setWorkspaceTokenExpired(true);
        return;
      }
      const tasks: Promise<unknown>[] = [
        fetchCalendarEvents(effectiveToken),
        fetchGoogleTasks(effectiveToken),
      ];
      const shouldAutoScanGmail =
        Boolean(options?.forceGmail) ||
        (!gmailNeedsReauthRef.current && Date.now() - lastGmailAutoScanMsRef.current >= 5 * 60_000);
      if (shouldAutoScanGmail) {
        lastGmailAutoScanMsRef.current = Date.now();
        tasks.push(fetchGmailDigest(effectiveToken, { silent: !options?.forceGmail }));
      }
      await Promise.all(tasks);
    },
    [authUser, needsAuth, fetchCalendarEvents, fetchGoogleTasks, fetchGmailDigest, setWorkspaceTokenExpired]
  );

  const handleRefreshWorkspaceToken = useCallback(async () => {
    setIsRefreshingWorkspaceToken(true);
    try {
      const res = await refreshGoogleCalendarToken();
      if (res) {
        setAuthUser(res.user);
        setNeedsAuth(false);
        setWorkspaceTokenExpired(false);
        setGmailNeedsReauth(false);
        setGmailError('');
        await refreshWorkspace(res.accessToken, { forceGmail: true });
        showToast('🔄 تم تجديد ربط Google Workspace بنجاح ومزامنة التقويم والمهام ✓');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تجديد رمز Google Workspace الآن.');
    } finally {
      setIsRefreshingWorkspaceToken(false);
    }
  }, [
    refreshWorkspace,
    setAuthUser,
    setGmailError,
    setGmailNeedsReauth,
    setIsRefreshingWorkspaceToken,
    setNeedsAuth,
    setWorkspaceTokenExpired,
    showToast,
  ]);

  return {
    lastGmailAutoScanMsRef,
    gmailRetryAttemptRef,
    gmailLastSyncedIso,
    setGmailLastSyncedIso,
    gmailNextRetryInSec,
    clearGmailRetryTimers,
    fetchGmailDigest,
    refreshWorkspace,
    handleRefreshWorkspaceToken,
  };
}
