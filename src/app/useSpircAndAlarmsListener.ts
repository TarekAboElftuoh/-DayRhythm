import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type { PhoneBatteryTelemetry, TaskSoundCategory } from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import { auth, sanitizePhoneBattery, type SyncedRhythmPayload } from '../firebase';
import { cleanupExpiredActiveAlarms, subscribeToActiveAlarms } from '../services/cloudStateService';
import { stopContinuousAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { getSavedCloudApiUrl } from '../services/apiClient';
import {
  connectSpircCluster,
  loadFromNativeSqlite,
  SPIRC_ACTION,
  SPIRC_ENTITY,
  type SpircClusterHandle,
} from '../services/spircClient';
import { ACTIVE_UID_STORAGE_KEY } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import { addDismissedKeys, isOccurrenceDismissed } from './alarmOccurrenceGuard';

export interface UseSpircAndAlarmsListenerParams {
  firebaseUser: User | null;
  authUser: User | null;
  clientIdRef: React.MutableRefObject<string>;
  persistentAlertRef: React.RefObject<{ id: string; createdAtMs: number } | null>;
  spircClusterRef: React.MutableRefObject<SpircClusterHandle | null>;
  seenSyncOpIdsRef: React.MutableRefObject<Set<string>>;
  handledDismissedAlarmIdsRef: React.MutableRefObject<Set<string>>;
  isLoadingSettingsRef: React.MutableRefObject<boolean>;
  applyOrDeferRef: React.MutableRefObject<(remote: SyncedRhythmPayload) => void>;
  handleLogWaterCupRef: React.MutableRefObject<(opts?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void>;
  handleToggleMedicationRef: React.MutableRefObject<(medId: string, doseTime?: string, opts?: { fromRemote?: boolean }) => void>;
  showToastRef: React.MutableRefObject<(msg: string) => void>;
  setPhoneBattery: React.Dispatch<React.SetStateAction<PhoneBatteryTelemetry | null>>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSpircAndAlarmsListener(p: UseSpircAndAlarmsListenerParams): void {
  useEffect(() => {
    const cachedRows = loadFromNativeSqlite();
    const stateRow = cachedRows.find((r) => r.entityId === 'state_v3' && !r.deleted);
    if (stateRow?.payload && typeof stateRow.payload === 'object') {
      p.applyOrDeferRef.current(stateRow.payload as unknown as SyncedRhythmPayload);
    }

    const uid =
      p.firebaseUser?.uid ||
      p.authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    const workerUrl = getSavedCloudApiUrl();
    if (!uid || !workerUrl) {
      p.spircClusterRef.current?.close();
      p.spircClusterRef.current = null;
      return;
    }

    const handle = connectSpircCluster(workerUrl, uid, p.clientIdRef.current, (entityId, entityKind, payload, frame) => {
      if (frame.action === SPIRC_ACTION.BATTERY_TELEMETRY || entityId === 'phone_battery') {
        const incoming = sanitizePhoneBattery(payload);
        if (incoming) p.setPhoneBattery(incoming);
        return;
      }

      if (frame.action === SPIRC_ACTION.DISMISS_ALARM || entityId === 'alarm_dismiss') {
        const spOpId =
          (typeof payload.opId === 'string' && payload.opId) ||
          frame.opId ||
          `spirc_dism_${frame.timestampMs}_${frame.clientId}`;
        if (!p.seenSyncOpIdsRef.current.has(spOpId)) {
          p.seenSyncOpIdsRef.current.add(spOpId);
          if (p.seenSyncOpIdsRef.current.size > 200) p.seenSyncOpIdsRef.current.clear();
          stopContinuousAlert();
          stopSmartChargeCompleteAlert();
          stopNativeAlerts();
          p.setSmartChargeAudioActive(false);
          p.setActiveAudioAlert(null);
          p.setPersistentAlert(null);
          p.setAlarmRinging(false);
          if (typeof payload.occurrenceKey === 'string' && payload.occurrenceKey) {
            addDismissedKeys([payload.occurrenceKey]);
          }
          const remoteAction = typeof payload.action === 'string' ? payload.action : '';
          if (remoteAction === 'water_confirmed') {
            const waterOpId = (typeof payload.waterOpId === 'string' && payload.waterOpId) || spOpId;
            const dateKey = typeof payload.hydrationDateKey === 'string' ? payload.hydrationDateKey : undefined;
            p.handleLogWaterCupRef.current({ fromRemote: true, waterOpId, dateKey });
          } else if (remoteAction === 'medication_confirmed' || remoteAction === 'med_confirmed') {
            const medId = (payload.medicationId as string) || (payload.medId as string);
            const doseTime = (payload.doseTime24 as string) || (payload.doseTime as string);
            if (medId && medId !== 'all' && medId !== 'medication') {
              p.handleToggleMedicationRef.current(medId, doseTime, { fromRemote: true });
            }
          }
          p.showToastRef.current('🔕 تم إيقاف التنبيه فورياً من جهازك الآخر ✓');
        }
        return;
      }

      if (
        frame.action === SPIRC_ACTION.UPSERT &&
        (entityKind === SPIRC_ENTITY.ALARM || entityId === 'alarm_trigger')
      ) {
        const senderId = (typeof payload.clientId === 'string' && payload.clientId) || frame.clientId;
        if (senderId === p.clientIdRef.current) return;
        if (typeof payload.occurrenceKey === 'string' && isOccurrenceDismissed(payload.occurrenceKey)) return;
        const startedMs = Number(payload.startedAtMs || frame.timestampMs || Date.now());
        if (Math.abs(Date.now() - startedMs) <= 300_000) {
          window.dispatchEvent(new CustomEvent('dayrhythm:cloud-alert-trigger', { detail: payload }));
        }
        return;
      }

      if (entityId === 'state_v3' || entityKind === SPIRC_ENTITY.STATE_V3) {
        p.isLoadingSettingsRef.current = true;
        try {
          p.applyOrDeferRef.current(payload as unknown as SyncedRhythmPayload);
        } finally {
          window.setTimeout(() => {
            p.isLoadingSettingsRef.current = false;
          }, 150);
        }
      }
    });
    p.spircClusterRef.current = handle;
    return () => {
      handle.close();
      if (p.spircClusterRef.current === handle) p.spircClusterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.firebaseUser?.uid, p.authUser?.uid]);

  useEffect(() => {
    const uid =
      p.firebaseUser?.uid ||
      p.authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    if (!uid || (!p.firebaseUser && !auth.currentUser)) return;

    void cleanupExpiredActiveAlarms(uid);

    const unsubscribe = subscribeToActiveAlarms(
      uid,
      (alarms) => {
        const relevantDismissal = alarms.find((a) => {
          if (a.status !== 'dismissed') return false;
          if (a.dismissedByClientId === p.clientIdRef.current) return false;
          if (p.handledDismissedAlarmIdsRef.current.has(a.id)) return false;
          return true;
        });

        if (relevantDismissal) {
          p.handledDismissedAlarmIdsRef.current.add(relevantDismissal.id);
          const activeAlert = p.persistentAlertRef.current;
          const shouldDismissActive = !activeAlert || activeAlert.id === relevantDismissal.id;
          if (shouldDismissActive) {
            stopContinuousAlert();
            stopSmartChargeCompleteAlert();
            stopNativeAlerts();
            p.setSmartChargeAudioActive(false);
            p.setActiveAudioAlert(null);
            p.setPersistentAlert(null);
            p.setAlarmRinging(false);
          }
        }
      },
      (err) => {
        console.warn('[CloudSync] active_alarms listener error:', err);
      }
    );

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.firebaseUser?.uid, p.authUser?.uid]);
}
