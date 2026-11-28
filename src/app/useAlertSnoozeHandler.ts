import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { LifeProfile, TaskSoundCategory } from '../types/dayrhythm';
import { stopContinuousAlert } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';

const snoozeTargetMap = new Map<number, { blockId?: string; taskId?: string }>();

/** Cancels any pending JS snooze timers matching a deleted or completed block/task. */
export function cancelSnoozeTimersForTarget(
  target: { blockId?: string; taskId?: string },
  snoozeTimersRef?: React.MutableRefObject<number[]>
): void {
  for (const [timerId, meta] of snoozeTargetMap.entries()) {
    const matchesBlock = Boolean(target.blockId && meta.blockId === target.blockId);
    const matchesTask = Boolean(target.taskId && meta.taskId === target.taskId);
    if (!matchesBlock && !matchesTask) continue;
    window.clearTimeout(timerId);
    snoozeTargetMap.delete(timerId);
    if (snoozeTimersRef) {
      snoozeTimersRef.current = snoozeTimersRef.current.filter((id) => id !== timerId);
    }
  }
}

/** Cancels JS snooze timers and stops active audio/native alerts for a deleted or completed item. */
export function cancelTargetAlarms(
  target: { blockId?: string; taskId?: string },
  snoozeTimersRef?: React.MutableRefObject<number[]>
): void {
  cancelSnoozeTimersForTarget(target, snoozeTimersRef);
  stopContinuousAlert();
  stopNativeAlerts();
}

export function useAlertSnoozeHandler(p: {
  lifeProfile: LifeProfile;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  emitCrossDeviceSync: (scope: 'alarm_dismiss', action: string, undoSnapshot?: undefined, extra?: Record<string, unknown>) => void;
  snoozeTimersRef: React.MutableRefObject<number[]>;
  triggerTaskAlert: (
    emoji: string,
    category: TaskSoundCategory,
    opts?: {
      privacyEmoji?: string;
      displayTitle?: string;
      description?: string;
      sourceLabel?: string;
      medicationId?: string;
      medicationDoseTime24?: string;
      taskId?: string;
      taskListId?: string;
      blockId?: string;
    }
  ) => void;
  onAfterSnooze?: () => boolean;
  showToast: (msg: string) => void;
}) {
  const {
    lifeProfile,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    emitCrossDeviceSync,
    snoozeTimersRef,
    triggerTaskAlert,
    onAfterSnooze,
    showToast,
  } = p;

  const handleSnoozeAlert = useCallback(
    (alertItem: PersistentAlertItem, minutes?: number, options?: { localOnly?: boolean }) => {
      const configuredDefault =
        lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
          ? lifeProfile.defaultSnoozeMinutes
          : 5;
      const safeMin = Math.max(1, Math.min(60, Math.round(minutes ?? configuredDefault)));
      stopContinuousAlert();
      stopNativeAlerts();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(0); } catch { /* ignore */ }
      }
      const promotedNext = onAfterSnooze?.() ?? false;
      if (!promotedNext) {
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
      }
      if (!options?.localOnly) emitCrossDeviceSync('alarm_dismiss', 'snooze', undefined, { alertId: alertItem.id });
      const timerId = window.setTimeout(() => {
        snoozeTargetMap.delete(timerId);
        snoozeTimersRef.current = snoozeTimersRef.current.filter((id) => id !== timerId);
        triggerTaskAlert(alertItem.emoji || alertItem.title, alertItem.category, {
          privacyEmoji: alertItem.emoji,
          displayTitle: alertItem.title,
          description: alertItem.description,
          sourceLabel: options?.localOnly
            ? `${alertItem.sourceLabel} (إعادة تنبيه بعد ${safeMin} د)`
            : `${alertItem.sourceLabel} (مؤجّل ${safeMin} د)`,
          medicationId: alertItem.medicationId,
          medicationDoseTime24: alertItem.medicationDoseTime24,
          taskId: alertItem.taskId,
          taskListId: alertItem.taskListId,
          blockId: alertItem.blockId,
        });
      }, safeMin * 60_000);
      snoozeTargetMap.set(timerId, { blockId: alertItem.blockId, taskId: alertItem.taskId });
      snoozeTimersRef.current.push(timerId);
      if (!options?.localOnly) {
        triggerHapticWaveform('water_cup');
        showToast(`⏰ تم تأجيل «${alertItem.title}» لمدة ${safeMin} دقيقة وإيقافه على أجهزتك`);
      } else {
        showToast(`⏰ لم يتم الرد خلال دقيقة — سيتم إعادة التنبيه لـ «${alertItem.title}» بعد ${safeMin} دقائق`);
      }
    },
    [
      emitCrossDeviceSync,
      lifeProfile.defaultSnoozeMinutes,
      setActiveAudioAlert,
      setAlarmRinging,
      setPersistentAlert,
      showToast,
      snoozeTimersRef,
      triggerTaskAlert,
    ]
  );

  useEffect(() => {
    return () => {
      snoozeTimersRef.current.forEach((id) => {
        snoozeTargetMap.delete(id);
        window.clearTimeout(id);
      });
      snoozeTimersRef.current = [];
    };
  }, [snoozeTimersRef]);

  return { handleSnoozeAlert };
}
