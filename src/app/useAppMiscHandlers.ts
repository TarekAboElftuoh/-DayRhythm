import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  ActiveTab,
  DualStreaks,
  HydrationDayLog,
  QuietModeType,
  TaskSoundCategory,
} from '../types/dayrhythm';
import type { AppSyncSettings } from '../firebase';
import { hasPermanentLink, startPermanentLink } from '../services/googleOfflineAccess';
import { playSoftChime, stopContinuousAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import {
  collectDismissedOccurrenceKeys,
  pushDismissedOccurrencesToCloud,
  resolveActiveUid,
} from './occurrenceDismiss';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';

export interface UseAppMiscHandlersParams {
  authUser: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null } | null;
  appSettingsRef: MutableRefObject<AppSyncSettings>;
  updateAppSettings: (patch: Partial<AppSyncSettings>) => void;
  showToast: (msg: string) => void;
  setNotificationPermission: Dispatch<SetStateAction<NotificationPermission | 'unsupported'>>;
  setWaterRemindersEnabled: Dispatch<SetStateAction<boolean>>;
  quietMode: QuietModeType;
  adhanOverrideSilent: boolean;
  setSmartChargeAudioActive: Dispatch<SetStateAction<boolean>>;
  setActiveAudioAlert: Dispatch<SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: Dispatch<SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: Dispatch<SetStateAction<boolean>>;
  emitCrossDeviceSync: (
    type: 'alarm_dismiss',
    action: string,
    undoSnapshot?: undefined,
    extra?: Record<string, unknown>
  ) => void;
  shortcutHandledRef: MutableRefObject<boolean>;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  setHydrationHistory: Dispatch<SetStateAction<HydrationDayLog[]>>;
  setStreaks: Dispatch<SetStateAction<DualStreaks>>;
  handleSetQuietMode: (mode: QuietModeType, durationMinutes: number) => void;
  setAutoStartVoice: Dispatch<SetStateAction<boolean>>;
  localWriteLockUntilRef: MutableRefObject<number>;
  pushToTasksVaultImmediately: (patch?: Record<string, unknown>) => Promise<void>;
  pushFullCloudBackupImmediately: () => Promise<boolean | void>;
}

export function useAppMiscHandlers(p: UseAppMiscHandlersParams) {
  const {
    authUser,
    appSettingsRef,
    updateAppSettings,
    showToast,
    setNotificationPermission,
    setWaterRemindersEnabled,
    quietMode,
    adhanOverrideSilent,
    setSmartChargeAudioActive,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    emitCrossDeviceSync,
    shortcutHandledRef,
    setActiveTab,
    setHydrationHistory,
    setStreaks,
    handleSetQuietMode,
    setAutoStartVoice,
    localWriteLockUntilRef,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
  } = p;

  const [isStartingPermanentLink, setIsStartingPermanentLink] = useState(false);
  const [permanentLinkHintDismissed, setPermanentLinkHintDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dayrhythm_permanent_link_hint_dismissed_v1') === '1';
    } catch {
      return false;
    }
  });

  const handleStartPermanentLink = useCallback(async () => {
    if (!authUser) return;
    setIsStartingPermanentLink(true);
    try {
      await startPermanentLink({ uid: authUser.uid, loginHint: authUser.email });
    } catch (err: unknown) {
      setIsStartingPermanentLink(false);
      showToast(err instanceof Error ? err.message : 'تعذر بدء الربط الدائم.');
    }
  }, [authUser, showToast]);

  const handleToggleWaterReminders = useCallback(() => {
    const next = !appSettingsRef.current.waterRemindersEnabled;
    showToast(
      next
        ? '🔔 تم تفعيل تنبيهات كل كوب ماء تلقائياً حسب جدولك العلمي'
        : '🔕 تم إيقاف تنبيهات أكواب الماء مؤقتاً'
    );
    updateAppSettings({ waterRemindersEnabled: next });
  }, [appSettingsRef, showToast, updateAppSettings]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      showToast('المتصفح لا يدعم إشعارات النظام — ستعمل التنبيهات الصوتية داخل التطبيق');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setWaterRemindersEnabled(true);
        showToast('🔔 تم تفعيل إشعارات النظام لكل كوب ماء وجرعة علاج بنجاح ✓');
      } else {
        showToast('تم رفض إشعارات المتصفح — ستظل التنبيهات الصوتية تعمل داخل التطبيق');
      }
    } catch {
      showToast('تعذر طلب صلاحية الإشعارات — ستعمل التنبيهات الصوتية داخل التطبيق');
    }
  }, [setNotificationPermission, setWaterRemindersEnabled, showToast]);

  const handleTestAdhanChime = () => {
    if (quietMode === 'normal' || adhanOverrideSilent) {
      playSoftChime('alarm_pulse');
      triggerHapticWaveform('wake_fajr');
      showToast(
        quietMode !== 'normal'
          ? '🔊 نداء الصلاة يعمل بصوت نقي (تم تجاوز الصامت والاهتزاز)'
          : '🔊 نداء الصلاة نشط بصوت نقي'
      );
    } else {
      showToast('🔇 الهاتف صامت والتجاوز معطّل');
    }
  };

  const handleDismissTwoWay = useCallback(() => {
    stopContinuousAlert();
    stopSmartChargeCompleteAlert();
    stopNativeAlerts();
    setSmartChargeAudioActive(false);
    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    const occurrenceKeys = collectDismissedOccurrenceKeys();
    pushDismissedOccurrencesToCloud({
      uid: resolveActiveUid(authUser?.uid),
      alertId: 'all',
      clientId: 'local',
      occurrenceKeys,
    });
    emitCrossDeviceSync('alarm_dismiss', 'dismiss', undefined, { occurrenceKeys });
    showToast('🔕 تم الإيقاف المتزامن على الموبايل والكمبيوتر في نفس اللحظة ✓');
  }, [emitCrossDeviceSync, setActiveAudioAlert, setAlarmRinging, setPersistentAlert, setSmartChargeAudioActive, showToast]);

  useEffect(() => {
    if (shortcutHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;
    shortcutHandledRef.current = true;
    try {
      window.history.replaceState({}, '', window.location.pathname || '/');
    } catch {
      // ignore history errors
    }
    if (action === 'water') {
      setActiveTab('dashboard');
      setHydrationHistory((prev) => {
        const next = [...prev];
        const today = next[next.length - 1];
        if (!today) return prev;
        const nextIdx = today.slots.findIndex((filled) => !filled);
        if (nextIdx === -1) return prev;
        const nextSlots = [...today.slots];
        nextSlots[nextIdx] = true;
        const newCount = nextSlots.filter(Boolean).length;
        next[next.length - 1] = { ...today, slots: nextSlots, cupsLogged: newCount };
        if (newCount >= today.targetCups) {
          setStreaks((s) =>
            s.waterTargetDoneToday ? s : { ...s, waterTargetDoneToday: true, waterTargetDays: s.waterTargetDays + 1 }
          );
        }
        return next;
      });
      triggerHapticWaveform('water_cup');
      showToast('💧 اختصار سريع: تم تسجيل +1 كوب ماء بنجاح ✓');
    } else if (action === 'meeting') {
      setActiveTab('dashboard');
      handleSetQuietMode('vibrate_only', 30);
      triggerHapticWaveform('water_cup');
    } else if (action === 'voice') {
      setActiveTab('assistant');
      setAutoStartVoice(true);
      showToast('🎙️ اختصار سريع: فتح شات Gemini بالصوت');
    } else if (action === 'chat') {
      setActiveTab('assistant');
    }
  }, [handleSetQuietMode, setActiveTab, setAutoStartVoice, setHydrationHistory, setStreaks, shortcutHandledRef, showToast]);

  useEffect(() => {
    const onOpenAssistant = (ev: Event) => {
      const detail = (ev as CustomEvent<{ voice?: boolean }>).detail || {};
      setActiveTab('assistant');
      if (detail.voice) setAutoStartVoice(true);
    };
    window.addEventListener('dayrhythm:open-assistant', onOpenAssistant);
    return () => window.removeEventListener('dayrhythm:open-assistant', onOpenAssistant);
  }, [setActiveTab, setAutoStartVoice]);

  const handleToggleDailyCommitmentStreak = () => {
    localWriteLockUntilRef.current = Date.now() + 300;
    setStreaks((s) => {
      const nextDone = !s.dailyCommitmentDoneToday;
      const nextDays = nextDone ? s.dailyCommitmentDays + 1 : Math.max(0, s.dailyCommitmentDays - 1);
      const nextStreaks = { ...s, dailyCommitmentDoneToday: nextDone, dailyCommitmentDays: nextDays };
      void pushToTasksVaultImmediately({
        dailyCommitmentDays: nextDays,
        dailyCommitmentDoneToday: nextDone,
        waterTargetDays: s.waterTargetDays,
        waterTargetDoneToday: s.waterTargetDoneToday,
      });
      void pushFullCloudBackupImmediately();
      return nextStreaks;
    });
  };

  return {
    isStartingPermanentLink,
    permanentLinkHintDismissed,
    setPermanentLinkHintDismissed,
    handleStartPermanentLink,
    handleToggleWaterReminders,
    handleRequestNotificationPermission,
    handleTestAdhanChime,
    handleDismissTwoWay,
    handleToggleDailyCommitmentStreak,
  };
}
