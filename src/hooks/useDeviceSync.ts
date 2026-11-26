import { useCallback, type MutableRefObject } from 'react';
import type { User } from 'firebase/auth';
import { auth, publishWorkspaceSyncSignal } from '../firebase';
import { ACTIVE_UID_STORAGE_KEY } from '../utils/appHelpers';
import { SPIRC_ACTION, SPIRC_ENTITY, type SpircClusterHandle } from '../services/spircClient';
import { broadcastAlertDismiss, emitCloudLiveSignal } from '../services/cloudStateService';
import type { EmitCrossDeviceSync, TasksVaultPayload } from '../types/appTypes';

export interface UseDeviceSyncParams {
  authUser: User | null;
  clientIdRef: MutableRefObject<string>;
  firebaseUser: User | null;
  firestoreSynced: boolean;
  pushToTasksVaultRef: MutableRefObject<(patch?: Partial<TasksVaultPayload>) => Promise<void>>;
  seenSyncOpIdsRef: MutableRefObject<Set<string>>;
  spircClusterRef: MutableRefObject<SpircClusterHandle | null>;
}

export interface UseDeviceSyncResult {
  emitCrossDeviceSync: EmitCrossDeviceSync;
}

/**
 * Cross-device sync transport: BroadcastChannel + Spirc cluster + Firestore signals.
 * Owns no React state — callers keep their refs so identity stays stable.
 */
export function useDeviceSync(params: UseDeviceSyncParams): UseDeviceSyncResult {
  const {
    authUser,
    clientIdRef,
    firebaseUser,
    firestoreSynced,
    pushToTasksVaultRef,
    seenSyncOpIdsRef,
    spircClusterRef,
  } = params;

  const emitCrossDeviceSync = useCallback<EmitCrossDeviceSync>(
    (scope, action, undoSnapshotPayload, extraPayload) => {
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
        extra: extraPayload,
        timestampMs,
      };

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('dayrhythm_sync');
          bc.postMessage({ ...packet, type: 'sync' });
          bc.close();
        } catch {
          // ignore BroadcastChannel errors
        }
      }

      const effectiveSyncUid =
        firebaseUser?.uid ||
        authUser?.uid ||
        auth.currentUser?.uid ||
        localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
        '';
      if (scope === 'alarm_dismiss') {
        const alertId =
          typeof extraPayload?.alertId === 'string' && extraPayload.alertId
            ? extraPayload.alertId
            : 'all';
        // Generate a shared opId so both Spirc and Firestore echoes are deduped together
        const dismissOpId = `dism_${Date.now().toString(36)}_${clientIdRef.current.slice(-4)}`;
        const dismissExtra = { ...(extraPayload || {}), opId: dismissOpId };
        // 1️⃣ Spirc first (< 35ms) — immediate cross-device dismiss
        const sentDismissViaSpirc =
          spircClusterRef.current?.sendDismissAlarm(alertId, action, dismissExtra) ?? false;
        // 2️⃣ Firestore only as the fallback (never duplicate the live Spirc broadcast)
        if (!sentDismissViaSpirc && effectiveSyncUid) {
          void broadcastAlertDismiss(
            effectiveSyncUid,
            clientIdRef.current,
            alertId,
            action,
            dismissExtra
          );
        }
        // Pre-register opId locally so our own Spirc echo is ignored
        seenSyncOpIdsRef.current.add(dismissOpId);
        if (seenSyncOpIdsRef.current.size > 200) seenSyncOpIdsRef.current.clear();
      } else if (scope === 'alarm_trigger') {
        const sentTriggerViaSpirc =
          spircClusterRef.current?.sendJsonState(
            'alarm_trigger',
            SPIRC_ENTITY.ALARM,
            SPIRC_ACTION.UPSERT,
            {
              scope: 'alarm_trigger',
              action,
              opId,
              clientId: clientIdRef.current,
              timestampMs,
              startedAtMs: timestampMs,
              ...(extraPayload || {}),
            }
          ) ?? false;
        // Firestore stays the fallback for devices that are offline / have no open socket
        if (!sentTriggerViaSpirc && effectiveSyncUid) {
          void publishWorkspaceSyncSignal(effectiveSyncUid, {
            opId,
            clientId: clientIdRef.current,
            scope,
            action,
            timestampMs,
            extra: extraPayload,
          });
        }
      } else if (effectiveSyncUid) {
        void publishWorkspaceSyncSignal(effectiveSyncUid, {
          opId,
          clientId: clientIdRef.current,
          scope,
          action,
          timestampMs,
          extra: extraPayload,
        });
        void emitCloudLiveSignal(effectiveSyncUid, {
          opId,
          clientId: clientIdRef.current,
          timestampMs,
          type:
            scope === 'tasks'
              ? 'tasks'
              : scope === 'calendar'
              ? 'schedule_blocks'
              : 'settings_patch',
          action,
          extra: packet,
        });
      }

      // Also persist to Google Tasks Cloud Sync Vault so devices without active Firestore stop immediately
      void pushToTasksVaultRef.current({
        lastDismissSignal: {
          timestampMs,
          scope,
          action,
          clientId: clientIdRef.current,
        },
      });
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced]
  );

  return { emitCrossDeviceSync };
}
