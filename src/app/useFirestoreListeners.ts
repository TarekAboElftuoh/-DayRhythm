import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  CreativeActivityItem,
  DeletedWorkspaceSnapshot,
  DynamicHabit,
  MedicationItem,
  MemoryItem,
  TaskSoundCategory,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import { auth, type SyncedRhythmPayload } from '../firebase';
import {
  subscribeToCloudLiveSignals,
  subscribeToUserDocument,
  type UserSettingsPayload,
} from '../services/cloudStateService';
import { stopContinuousAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { ACTIVE_UID_STORAGE_KEY } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import { addDismissedKeys } from './alarmOccurrenceGuard';
import { useInitialCloudSettingsLoader } from './useInitialCloudSettingsLoader';

export interface UseFirestoreListenersParams {
  firebaseUser: User | null;
  authUser: User | null;
  clientIdRef: React.MutableRefObject<string>;
  persistentAlertRef: React.RefObject<{ id: string; createdAtMs: number } | null>;
  seenSyncOpIdsRef: React.MutableRefObject<Set<string>>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  isLoadingSettingsRef: React.MutableRefObject<boolean>;
  hasHydratedRemoteRef: React.MutableRefObject<boolean>;
  lastServerFieldsRef: React.MutableRefObject<Record<string, string>>;
  pendingPatchesBeforeHydrationRef: React.MutableRefObject<Array<Partial<UserSettingsPayload>>>;
  applyOrDeferRef: React.MutableRefObject<(remote: SyncedRhythmPayload) => void>;
  applyOrDefer: (remote: SyncedRhythmPayload) => void;
  handleIncomingRemoteSyncRef: React.MutableRefObject<(payload: {
    opId?: string;
    clientId?: string;
    scope?: string;
    action?: string;
    undoSnapshot?: DeletedWorkspaceSnapshot;
    extra?: Record<string, unknown>;
  }) => void>;
  handleLogWaterCupRef: React.MutableRefObject<(opts?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void>;
  handleToggleMedicationRef: React.MutableRefObject<(medId: string, doseTime?: string, opts?: { fromRemote?: boolean }) => void>;
  showToastRef: React.MutableRefObject<(msg: string) => void>;
  saveCloudUserSettingsImmediately: (patch?: Partial<UserSettingsPayload>) => Promise<void>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setIsLoadingSettings: React.Dispatch<React.SetStateAction<boolean>>;
  setFirestoreReady: React.Dispatch<React.SetStateAction<boolean>>;
  setFirestoreSynced: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useFirestoreListeners(p: UseFirestoreListenersParams): void {
  useEffect(() => {
    const uid =
      p.firebaseUser?.uid ||
      p.authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    if (!uid || (!p.firebaseUser && !auth.currentUser)) return;

    const unsubscribe = subscribeToUserDocument(
      uid,
      (remote) => {
        if (Array.isArray(remote.dismissedKeys)) {
          addDismissedKeys(remote.dismissedKeys);
        }
        const sig = remote.syncSignal;
        if (sig && sig.clientId !== p.clientIdRef.current) {
          if (sig.scope === 'alarm_dismiss') {
            const sigTs = sig.timestampMs || 0;
            const isFresh = sigTs > 0 && Math.abs(Date.now() - sigTs) <= 300_000;
            const sigOpId = sig.opId || `dism_${sigTs}_${sig.clientId}`;
            if (isFresh && !p.seenSyncOpIdsRef.current.has(sigOpId)) {
              p.seenSyncOpIdsRef.current.add(sigOpId);
              if (p.seenSyncOpIdsRef.current.size > 200) p.seenSyncOpIdsRef.current.clear();
              const extraSig = sig.extra as Record<string, unknown> | undefined;
              const sigAlertId = typeof extraSig?.alertId === 'string' ? extraSig.alertId : undefined;
              const sigOccKey = typeof extraSig?.occurrenceKey === 'string' ? extraSig.occurrenceKey : undefined;
              const activeAlert = p.persistentAlertRef.current;
              const matchesActive = Boolean(
                activeAlert && sigAlertId && sigAlertId === activeAlert.id
              );
              const shouldDismissActive = matchesActive || (activeAlert ? sigTs >= activeAlert.createdAtMs : false);
              if (shouldDismissActive) {
                stopContinuousAlert();
                stopSmartChargeCompleteAlert();
                stopNativeAlerts();
                p.setSmartChargeAudioActive(false);
                p.setActiveAudioAlert(null);
                p.setPersistentAlert(null);
                p.setAlarmRinging(false);
              }

              if (sigOccKey) {
                addDismissedKeys([sigOccKey]);
              }
              if (sig.action === 'water_confirmed' || extraSig?.kind === 'water') {
                const waterOpId = (typeof extraSig?.waterOpId === 'string' && extraSig.waterOpId) || sigOpId;
                const dateKey = typeof extraSig?.hydrationDateKey === 'string' ? extraSig.hydrationDateKey : undefined;
                p.handleLogWaterCupRef.current({ fromRemote: true, waterOpId, dateKey });
              } else if (sig.action === 'medication_confirmed' || sig.action === 'med_confirmed' || extraSig?.kind === 'medication') {
                const medId = (extraSig?.medId as string) || (extraSig?.medicationId as string);
                const doseTime = (extraSig?.doseTime as string) || (extraSig?.doseTime24 as string);
                if (medId) p.handleToggleMedicationRef.current(medId, doseTime, { fromRemote: true });
              }
            }
          } else {
            p.handleIncomingRemoteSyncRef.current(sig);
          }
        }

        const remoteOrigin = remote.originClientId || (remote as unknown as { clientId?: string }).clientId;
        if (remoteOrigin && remoteOrigin === p.clientIdRef.current) return;
        p.applyOrDeferRef.current(
          remote as SyncedRhythmPayload & {
            medications?: MedicationItem[];
            creativeActivities?: CreativeActivityItem[];
            memories?: MemoryItem[];
          }
        );
      },
      (err) => console.warn('[CloudSync] subscribeToUserDocument error:', err)
    );

    const unsubscribeLive = subscribeToCloudLiveSignals(
      uid,
      (signal) => {
        if (!signal) return;
        const rawSender =
          (signal as unknown as { originDeviceId?: string }).originDeviceId ||
          signal.originClientId ||
          (signal as unknown as { dismissedByDeviceId?: string }).dismissedByDeviceId ||
          signal.dismissedBy ||
          signal.clientId;
        if (rawSender && rawSender === p.clientIdRef.current) return;
        const sigOp = signal.opId || signal.sessionId;
        if (sigOp) {
          if (p.seenSyncOpIdsRef.current.has(sigOp)) return;
          p.seenSyncOpIdsRef.current.add(sigOp);
          if (p.seenSyncOpIdsRef.current.size > 150) {
            const oldest = p.seenSyncOpIdsRef.current.values().next().value;
            if (oldest) p.seenSyncOpIdsRef.current.delete(oldest);
          }
        }

        if (signal.status === 'dismissed' || signal.type === 'alarm_dismiss') {
          const dismissedBy =
            (signal as unknown as { dismissedByDeviceId?: string }).dismissedByDeviceId ||
            signal.dismissedBy ||
            signal.clientId;
          if (dismissedBy === p.clientIdRef.current) return;
          const dismissTs =
            (signal as unknown as { dismissedAtMs?: number }).dismissedAtMs || signal.timestampMs || 0;
          if (!dismissTs || Math.abs(Date.now() - dismissTs) > 300_000) return;
          const dismissOpId = signal.opId || `live_dism_${dismissTs}_${dismissedBy}`;
          if (!sigOp && p.seenSyncOpIdsRef.current.has(dismissOpId)) return;
          p.seenSyncOpIdsRef.current.add(dismissOpId);
          if (p.seenSyncOpIdsRef.current.size > 200) p.seenSyncOpIdsRef.current.clear();
          const extraDismiss = signal.extra as { blockId?: string; action?: string; occurrenceKey?: string; extra?: { blockId?: string; occurrenceKey?: string } } | undefined;
          const dismissedOccKey = extraDismiss?.occurrenceKey || extraDismiss?.extra?.occurrenceKey;
          const activeAlert = p.persistentAlertRef.current;
          const matchesActive = Boolean(
            activeAlert && signal.alertId && signal.alertId === activeAlert.id
          );
          const shouldDismissActive = matchesActive || (activeAlert ? dismissTs >= activeAlert.createdAtMs : false);
          if (shouldDismissActive) {
            stopContinuousAlert();
            stopSmartChargeCompleteAlert();
            stopNativeAlerts();
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try { navigator.vibrate(0); } catch { /* ignore */ }
            }
            p.setSmartChargeAudioActive(false);
            p.setActiveAudioAlert(null);
            p.setPersistentAlert(null);
            p.setAlarmRinging(false);
          }
          if (dismissedOccKey) addDismissedKeys([dismissedOccKey]);
          const blockId = signal.blockId || extraDismiss?.blockId || extraDismiss?.extra?.blockId;
          if (blockId) {
            p.acknowledgedBlockIdsRef.current.add(blockId);
            p.setCompletedOverrides((prev) => ({ ...prev, [blockId]: true }));
          }
          const action = signal.action || extraDismiss?.action;
          if (action === 'water_confirmed') {
            const extraW = signal.extra as Record<string, unknown> | undefined;
            const waterOpId = (typeof extraW?.waterOpId === 'string' && extraW.waterOpId) || dismissOpId;
            const dateKey = typeof extraW?.hydrationDateKey === 'string' ? extraW.hydrationDateKey : undefined;
            p.handleLogWaterCupRef.current({ fromRemote: true, waterOpId, dateKey });
          } else if (action === 'medication_confirmed' || action === 'med_confirmed') {
            const extra = signal.extra as Record<string, unknown> | undefined;
            const medId = (extra?.medicationId as string) || (extra?.medId as string) || signal.alertId;
            const doseTime = (extra?.doseTime24 as string) || (extra?.doseTime as string);
            if (medId && medId !== 'all' && medId !== 'medication') {
              p.handleToggleMedicationRef.current(medId, doseTime, { fromRemote: true });
            }
          }
          p.showToastRef.current('🔕 تم إيقاف التنبيه فورياً من جهازك الآخر ✓');
          return;
        }

        if (signal.status === 'ringing' || signal.type === 'alarm_trigger') {
          const origin =
            (signal as unknown as { originDeviceId?: string }).originDeviceId ||
            signal.originClientId ||
            signal.clientId;
          if (origin === p.clientIdRef.current || signal.clientId === p.clientIdRef.current) return;
          const startTs =
            (signal as unknown as { originTimestampMs?: number }).originTimestampMs ||
            signal.startedAtMs ||
            signal.timestampMs ||
            0;
          if (!startTs || Math.abs(Date.now() - startTs) > 300_000) return;

          const opId = signal.opId || signal.sessionId;
          if (opId) {
            if (p.seenSyncOpIdsRef.current.has(opId)) return;
            p.seenSyncOpIdsRef.current.add(opId);
            if (p.seenSyncOpIdsRef.current.size > 150) {
              const oldest = p.seenSyncOpIdsRef.current.values().next().value;
              if (oldest) p.seenSyncOpIdsRef.current.delete(oldest);
            }
          }

          const extra = ((signal.extra as { extra?: Record<string, unknown> })?.extra || signal.extra || {}) as Record<string, unknown>;
          p.handleIncomingRemoteSyncRef.current({
            scope: 'alarm_trigger',
            action: signal.action || 'ring',
            extra: {
              title: signal.title || (extra.title as string) || 'تنبيه إيقاع اليوم',
              body: signal.body || (extra.body as string) || '',
              kind: (signal.kind || (extra.kind as string) || 'general') as TaskSoundCategory,
              blockId: signal.blockId || (extra.blockId as string | undefined),
              ...extra,
            },
            clientId: signal.clientId,
            opId,
          });
          return;
        }

        if (signal.patch && Object.keys(signal.patch).length > 0) {
          p.applyOrDeferRef.current(
            signal.patch as SyncedRhythmPayload & {
              medications?: MedicationItem[];
              creativeActivities?: CreativeActivityItem[];
              habits?: DynamicHabit[];
              memories?: MemoryItem[];
            }
          );
        }

        if (signal.extra) {
          const extra = signal.extra as {
            scope?: string;
            action?: string;
            undoSnapshot?: DeletedWorkspaceSnapshot;
            extra?: Record<string, unknown>;
          };
          if (extra.scope && extra.scope !== 'alarm_dismiss' && extra.scope !== 'alarm_trigger') {
            p.handleIncomingRemoteSyncRef.current({
              scope: extra.scope,
              action: extra.action,
              undoSnapshot: extra.undoSnapshot,
              extra: extra.extra,
              clientId: signal.clientId,
              opId: signal.opId,
            });
          }
        }
      },
      (err) => console.warn('[CloudLiveSync] subscribeToCloudLiveSignals error:', err)
    );

    return () => {
      unsubscribe();
      unsubscribeLive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.firebaseUser?.uid, p.authUser?.uid]);

  useInitialCloudSettingsLoader(p);
}
