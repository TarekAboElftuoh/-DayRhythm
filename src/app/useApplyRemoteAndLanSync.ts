import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  CreativeActivityItem,
  DynamicHabit,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  UiPrefs,
} from '../types/dayrhythm';
import {
  triggerFirestoreRecovery,
  type AppSyncSettings,
  type OnePlusDeviceSettings,
  type SyncedRhythmPayload,
} from '../firebase';
import { applyRemotePayload, type ApplyRemoteFullCtx } from './applyRemote';
import type { LiveSyncSignal } from '../services/cloudStateService';

function mergeSyncedRhythmPayloads(
  base: SyncedRhythmPayload | null,
  incoming: SyncedRhythmPayload
): SyncedRhythmPayload {
  if (!base) return incoming;
  return {
    ...base,
    ...incoming,
    appSettings: incoming.appSettings
      ? ({ ...(base.appSettings || {}), ...incoming.appSettings } as AppSyncSettings)
      : base.appSettings,
    deviceSettings: incoming.deviceSettings
      ? ({ ...(base.deviceSettings || {}), ...incoming.deviceSettings } as OnePlusDeviceSettings)
      : base.deviceSettings,
    uiPrefs: incoming.uiPrefs
      ? ({ ...(base.uiPrefs || {}), ...incoming.uiPrefs } as UiPrefs)
      : base.uiPrefs,
    lifeProfile: incoming.lifeProfile
      ? ({ ...(base.lifeProfile || {}), ...incoming.lifeProfile } as LifeProfile)
      : base.lifeProfile,
  };
}

export interface UseApplyRemoteAndLanSyncParams {
  refreshWorkspace: (tokenOverride?: string, options?: { forceGmail?: boolean }) => Promise<void>;
  handleIncomingRemoteSyncRef: MutableRefObject<(signal: LiveSyncSignal) => void>;
  clientIdRef: MutableRefObject<string>;
  localWriteLockUntilRef: MutableRefObject<number>;
  pendingRemoteRef: MutableRefObject<SyncedRhythmPayload | null>;
  pendingRemoteTimerRef: MutableRefObject<number | null>;
  isLoadingSettingsRef: MutableRefObject<boolean>;
  applyCtx: ApplyRemoteFullCtx;
  activeTimeZone: string;
}

export function useApplyRemoteAndLanSync(p: UseApplyRemoteAndLanSyncParams) {
  const {
    refreshWorkspace,
    handleIncomingRemoteSyncRef,
    clientIdRef,
    localWriteLockUntilRef,
    pendingRemoteRef,
    pendingRemoteTimerRef,
    isLoadingSettingsRef,
    applyCtx,
    activeTimeZone,
  } = p;

  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;

  type ExtendedRemotePayload = SyncedRhythmPayload & {
    medications?: MedicationItem[];
    creativeActivities?: CreativeActivityItem[];
    habits?: DynamicHabit[];
    memories?: MemoryItem[];
  };

  const applyRemoteRef = useRef<(remote: ExtendedRemotePayload) => void>(() => {});
  const callRemoteSync = useCallback(
    (payload: LiveSyncSignal) => handleIncomingRemoteSyncRef.current(payload),
    [handleIncomingRemoteSyncRef]
  );
  const callRefreshWorkspace = useCallback(() => refreshWorkspaceRef.current(), []);

  useEffect(() => {
    let lastVisibleAtMs = Date.now();
    const handleResumeSync = () => {
      if (document.visibilityState === 'visible') {
        const sleptMs = Date.now() - lastVisibleAtMs;
        lastVisibleAtMs = Date.now();
        triggerFirestoreRecovery(sleptMs > 45_000);
        void callRefreshWorkspace();
      } else {
        lastVisibleAtMs = Date.now();
      }
    };
    const handleOnline = () => {
      triggerFirestoreRecovery(true);
      void callRefreshWorkspace();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleResumeSync);
    window.addEventListener('dayrhythm:network-recovered', handleOnline);
    document.addEventListener('visibilitychange', handleResumeSync);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleResumeSync);
      window.removeEventListener('dayrhythm:network-recovered', handleOnline);
      document.removeEventListener('visibilitychange', handleResumeSync);
    };
  }, [callRefreshWorkspace]);

  const applyCtxRef = useRef(applyCtx);
  applyCtxRef.current = applyCtx;

  const applyRemote = useCallback(
    (remote: ExtendedRemotePayload) => {
      applyRemotePayload(remote, applyCtxRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTimeZone]
  );
  applyRemoteRef.current = applyRemote;

  const applyOrDefer = useCallback(
    (remote: ExtendedRemotePayload) => {
      const waitMs = localWriteLockUntilRef.current - Date.now();
      if (waitMs > 0) {
        pendingRemoteRef.current = mergeSyncedRhythmPayloads(pendingRemoteRef.current, remote);
        if (pendingRemoteTimerRef.current !== null) {
          window.clearTimeout(pendingRemoteTimerRef.current);
        }
        pendingRemoteTimerRef.current = window.setTimeout(() => {
          pendingRemoteTimerRef.current = null;
          const latest = pendingRemoteRef.current;
          pendingRemoteRef.current = null;
          if (latest) {
            isLoadingSettingsRef.current = true;
            try {
              applyOrDefer(latest as ExtendedRemotePayload);
            } finally {
              window.setTimeout(() => {
                isLoadingSettingsRef.current = false;
              }, 150);
            }
          }
        }, waitMs + 20);
        return;
      }
      applyRemote(remote);
    },
    [applyRemote, isLoadingSettingsRef, localWriteLockUntilRef, pendingRemoteRef, pendingRemoteTimerRef]
  );

  const lastAppliedTasksSyncMsRef = useRef<number>(0);

  useEffect(() => {
    const processIncomingObj = (data: Record<string, unknown>) => {
      const settingsObj = data.settings as Record<string, unknown> | undefined;
      const senderId = data.clientId || settingsObj?.originClientId;
      if (senderId === clientIdRef.current) return;
      if (settingsObj) {
        applyRemoteRef.current(settingsObj as unknown as ExtendedRemotePayload);
      } else {
        callRemoteSync(data as unknown as LiveSyncSignal);
      }
    };

    const handleNativeWsSync = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent<string>).detail;
        if (typeof detail === 'string') {
          const parsed = JSON.parse(detail);
          if (parsed && typeof parsed === 'object') processIncomingObj(parsed);
        }
      } catch {
        // ignore malformed native WS payload
      }
    };

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('dayrhythm_sync');
        bc.onmessage = (event) => {
          if (event.data && typeof event.data === 'object') processIncomingObj(event.data);
        };
      } catch {
        // BroadcastChannel unsupported or blocked
      }
    }

    window.addEventListener('dayrhythm:ws-sync', handleNativeWsSync);
    return () => {
      window.removeEventListener('dayrhythm:ws-sync', handleNativeWsSync);
      bc?.close();
    };
  }, [callRemoteSync, clientIdRef]);

  const applyOrDeferRef = useRef(applyOrDefer);
  useEffect(() => {
    applyOrDeferRef.current = applyOrDefer;
  }, [applyOrDefer]);

  return {
    applyRemote,
    applyRemoteRef,
    applyOrDefer,
    applyOrDeferRef,
    lastAppliedTasksSyncMsRef,
    callRemoteSync,
  };
}
