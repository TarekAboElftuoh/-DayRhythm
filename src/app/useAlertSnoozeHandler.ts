import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { LifeProfile, TaskSoundCategory } from '../types/dayrhythm';
import { stopContinuousAlert } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';

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
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      if (!options?.localOnly) emitCrossDeviceSync('alarm_dismiss', 'snooze', undefined, { alertId: alertItem.id });
      const timerId = window.setTimeout(() => {
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
      snoozeTimersRef.current.forEach((id) => window.clearTimeout(id));
      snoozeTimersRef.current = [];
    };
  }, [snoozeTimersRef]);

  return { handleSnoozeAlert };
}
