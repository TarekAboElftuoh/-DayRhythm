import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import { getNativeCloudAuthPayload, type SyncedRhythmPayload } from '../firebase';
import {
  deleteTasksVaultListIfPresent,
  fetchCloudUserSettings,
  type UserSettingsPayload,
} from '../services/cloudStateService';
import { getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';
import { serializeRhythmFields } from '../utils/appHelpers';
import { sanitizeRhythmPayload } from './sanitizers';

export interface UseInitialCloudSettingsLoaderParams {
  firebaseUser: User | null;
  setIsLoadingSettings: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingSettingsRef: React.MutableRefObject<boolean>;
  hasHydratedRemoteRef: React.MutableRefObject<boolean>;
  setFirestoreReady: React.Dispatch<React.SetStateAction<boolean>>;
  setFirestoreSynced: React.Dispatch<React.SetStateAction<boolean>>;
  applyOrDefer: (remote: SyncedRhythmPayload) => void;
  lastServerFieldsRef: React.MutableRefObject<Record<string, string>>;
  pendingPatchesBeforeHydrationRef: React.MutableRefObject<Array<Partial<UserSettingsPayload>>>;
  saveCloudUserSettingsImmediately: (patch?: Partial<UserSettingsPayload>) => Promise<void>;
}

export function useInitialCloudSettingsLoader(p: UseInitialCloudSettingsLoaderParams): void {
  useEffect(() => {
    const uid = p.firebaseUser?.uid;
    if (!uid || p.firebaseUser?.isAnonymous) {
      p.setIsLoadingSettings(false);
      p.isLoadingSettingsRef.current = false;
      p.hasHydratedRemoteRef.current = true;
      return;
    }

    let isMounted = true;
    p.setIsLoadingSettings(true);
    p.isLoadingSettingsRef.current = true;

    async function loadCloudSettings() {
      try {
        const cloudData = await fetchCloudUserSettings(uid!);
        if (!isMounted) return;

        if (cloudData) {
          p.applyOrDefer(cloudData as unknown as SyncedRhythmPayload);
          try {
            p.lastServerFieldsRef.current = serializeRhythmFields(sanitizeRhythmPayload(cloudData as SyncedRhythmPayload));
          } catch { /* ignore */ }
          p.hasHydratedRemoteRef.current = true;
          p.setFirestoreReady(true);
          p.setFirestoreSynced(true);
        } else {
          p.hasHydratedRemoteRef.current = true;
          p.setFirestoreReady(true);
          p.setFirestoreSynced(true);
        }

        if (p.pendingPatchesBeforeHydrationRef.current.length > 0) {
          const queued = [...p.pendingPatchesBeforeHydrationRef.current];
          p.pendingPatchesBeforeHydrationRef.current = [];
          for (const patch of queued) {
            void p.saveCloudUserSettingsImmediately(patch);
          }
        }

        try {
          const authPayload = getNativeCloudAuthPayload();
          const nativeBridge = (window as Window & { DayRhythmNative?: { setCloudAuth?: (json: string) => void } }).DayRhythmNative;
          if (authPayload && nativeBridge?.setCloudAuth) nativeBridge.setCloudAuth(authPayload);
        } catch { /* ignore */ }

        try {
          const token = await getOrRefreshCalendarAccessToken();
          if (token) void deleteTasksVaultListIfPresent(token);
        } catch { /* ignore */ }
      } catch (err) {
        console.error('[CloudSync] Error fetching cloud settings:', err);
      } finally {
        if (isMounted) {
          p.setIsLoadingSettings(false);
          p.isLoadingSettingsRef.current = false;
        }
      }
    }

    void loadCloudSettings();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.firebaseUser?.uid, p.firebaseUser?.isAnonymous, p.applyOrDefer]);
}
