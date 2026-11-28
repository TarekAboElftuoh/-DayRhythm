import { useCallback } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type { DeletedWorkspaceSnapshot, TaskSoundCategory } from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import { stopContinuousAlert } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import {
  collectDismissedOccurrenceKeys,
  pushDismissedOccurrencesToCloud,
  resolveActiveUid,
} from './occurrenceDismiss';

export interface UseAlertAcknowledgementParams {
  activeAudioAlert: { id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null;
  persistentAlert: PersistentAlertItem | null;
  alarmRinging: boolean;
  firebaseUser: User | null;
  authUser: User | null;
  clientIdRef: React.MutableRefObject<string>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  setActiveAudioAlert: React.Dispatch<
    React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>
  >;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  emitCrossDeviceSync: (
    scope: 'alarm_dismiss',
    action: string,
    undoSnapshotPayload?: DeletedWorkspaceSnapshot,
    extra?: Record<string, unknown>
  ) => void;
  showToast: (msg: string) => void;
}

/**
 * Dismiss ("تم") on either device: stop the sound, persist the deterministic occurrenceKeys
 * locally, push them to Firestore and broadcast them so the other device can never re-ring them.
 */
export function useAlertAcknowledgement(p: UseAlertAcknowledgementParams) {
  const {
    activeAudioAlert,
    persistentAlert,
    alarmRinging,
    firebaseUser,
    authUser,
    clientIdRef,
    acknowledgedBlockIdsRef,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    setCompletedOverrides,
    emitCrossDeviceSync,
    showToast,
  } = p;

  return useCallback(() => {
    stopContinuousAlert();
    stopNativeAlerts();
    const hadAlert = Boolean(activeAudioAlert || persistentAlert || alarmRinging);
    const title = activeAudioAlert?.title || persistentAlert?.title || 'التنبيه';
    const alertId = activeAudioAlert?.id || persistentAlert?.id || 'all';
    const dismissedBlockId = persistentAlert?.blockId;
    const occurrenceKeys = collectDismissedOccurrenceKeys();

    if (dismissedBlockId) {
      acknowledgedBlockIdsRef.current.add(dismissedBlockId);
      setCompletedOverrides((prev) => ({ ...prev, [dismissedBlockId]: true }));
    }

    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    triggerHapticWaveform('shake_undo');
    emitCrossDeviceSync('alarm_dismiss', 'dismiss', undefined, {
      blockId: dismissedBlockId,
      alertId,
      occurrenceKeys,
    });
    pushDismissedOccurrencesToCloud({
      uid: resolveActiveUid(firebaseUser?.uid, authUser?.uid),
      alertId,
      clientId: clientIdRef.current,
      occurrenceKeys,
    });

    if (hadAlert) showToast(`✓ تم إيقاف وتأكيد تنبيه «${title}» على أجهزتك`);
  }, [
    acknowledgedBlockIdsRef,
    activeAudioAlert,
    alarmRinging,
    authUser?.uid,
    clientIdRef,
    emitCrossDeviceSync,
    firebaseUser?.uid,
    persistentAlert,
    setActiveAudioAlert,
    setAlarmRinging,
    setCompletedOverrides,
    setPersistentAlert,
    showToast,
  ]);
}
