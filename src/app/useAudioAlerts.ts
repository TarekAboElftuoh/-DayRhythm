import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  ActiveSanctuaryState,
  DeletedWorkspaceSnapshot,
  LifeProfile,
  SilentNotificationItem,
  SoundRepeatSetting,
  TaskSoundCategory,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import {
  DEFAULT_SOUND_REPEATS,
  playTaskSignature,
  stopContinuousAlert,
  TASK_SOUND_META,
} from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { formatNow12hInTimeZone } from '../engines/prayerEngine';
import { auth } from '../firebase';
import { cleanCalendarText } from '../services/apiClient';
import { broadcastAlertTrigger, registerActiveAlarm } from '../services/cloudStateService';
import { handleSanctuaryAlert } from './handleSanctuaryAlert';
import { ACTIVE_UID_STORAGE_KEY, extractEmojiPair } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';

import { useAlertSnoozeHandler } from './useAlertSnoozeHandler';

export interface UseAudioAlertsParams {
  activeAudioAlert: { id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null;
  persistentAlert: PersistentAlertItem | null;
  alarmRinging: boolean;
  activeSanctuary: ActiveSanctuaryState;
  activeTimeZone: string;
  lifeProfile: LifeProfile;
  firebaseUser: User | null;
  authUser: User | null;
  clientIdRef: React.MutableRefObject<string>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  snoozeTimersRef: React.MutableRefObject<number[]>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSilentNotifications: React.Dispatch<React.SetStateAction<SilentNotificationItem[]>>;
  emitCrossDeviceSync: (
    scope: 'alarm_dismiss' | 'alarm_trigger' | 'all' | 'calendar' | 'clear_notifications' | 'schedule_blocks' | 'settings_patch' | 'tasks',
    action: string,
    undoSnapshotPayload?: DeletedWorkspaceSnapshot,
    extra?: Record<string, unknown>
  ) => void;
  showToast: (msg: string) => void;
}

export function useAudioAlerts({
  activeAudioAlert,
  persistentAlert,
  alarmRinging,
  activeSanctuary,
  activeTimeZone,
  lifeProfile,
  firebaseUser,
  authUser,
  clientIdRef,
  acknowledgedBlockIdsRef,
  snoozeTimersRef,
  setActiveAudioAlert,
  setPersistentAlert,
  setAlarmRinging,
  setCompletedOverrides,
  setSilentNotifications,
  emitCrossDeviceSync,
  showToast,
}: UseAudioAlertsParams) {
  const handleAcknowledgeAudioAlert = useCallback(() => {
    stopContinuousAlert();
    stopNativeAlerts();
    const hadAlert = Boolean(activeAudioAlert || persistentAlert || alarmRinging);
    const title = activeAudioAlert?.title || persistentAlert?.title || 'التنبيه';
    const alertId = activeAudioAlert?.id || persistentAlert?.id || 'all';
    const dismissedBlockId = persistentAlert?.blockId;

    if (dismissedBlockId) {
      acknowledgedBlockIdsRef.current.add(dismissedBlockId);
      setCompletedOverrides((prev) => ({ ...prev, [dismissedBlockId]: true }));
    }

    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    triggerHapticWaveform('shake_undo');
    emitCrossDeviceSync('alarm_dismiss', 'dismiss', undefined, { blockId: dismissedBlockId, alertId });

    if (hadAlert) showToast(`✓ تم إيقاف وتأكيد تنبيه «${title}» على أجهزتك`);
  }, [
    acknowledgedBlockIdsRef,
    activeAudioAlert,
    alarmRinging,
    emitCrossDeviceSync,
    persistentAlert,
    setActiveAudioAlert,
    setAlarmRinging,
    setCompletedOverrides,
    setPersistentAlert,
    showToast,
  ]);

  useEffect(() => {
    if (!activeAudioAlert || activeAudioAlert.isContinuous) return;
    const id = window.setTimeout(() => setActiveAudioAlert(null), 12_000);
    return () => window.clearTimeout(id);
  }, [activeAudioAlert, setActiveAudioAlert]);

  useEffect(() => {
    if (!activeAudioAlert || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      if (Math.sqrt(gx * gx + gy * gy + gz * gz) > 2.5) handleAcknowledgeAudioAlert();
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [activeAudioAlert, handleAcknowledgeAudioAlert]);

  const triggerTaskAlert = useCallback(
    (
      title: string,
      category: TaskSoundCategory,
      options?: {
        bypassSanctuary?: boolean;
        privacyEmoji?: string;
        displayTitle?: string;
        sourceLabel?: string;
        medicationId?: string;
        medicationDoseTime24?: string;
        taskId?: string;
        taskListId?: string;
        durationMs?: number;
        description?: string;
        isRemoteSignal?: boolean;
        blockId?: string;
      }
    ) => {
      const meta = TASK_SOUND_META[category];
      const privacyBadge = (options?.privacyEmoji || extractEmojiPair(title, meta.icon)).trim();
      const visibleTitle = (options?.displayTitle || title || meta.labelAr).trim();
      const visibleSource =
        options?.sourceLabel ||
        (category === 'water' ? 'ترطيب يومي' : category === 'medication' ? 'موعد العلاج' : 'تقويم ومهام اليوم');
      const durationMs = Math.min(options?.durationMs ?? 60_000, 60_000);
      const visibleDescription = cleanCalendarText(options?.description || '').slice(0, 220);
      const repeatCount: SoundRepeatSetting =
        (lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS)[category] ?? DEFAULT_SOUND_REPEATS[category] ?? 1;

      const androidNative = (
        window as Window & {
          DayRhythmNative?: {
            triggerNativeAlarm?: (title: string, body: string, kind: string, continuous: boolean, snoozeMinutes: number) => void;
          };
        }
      ).DayRhythmNative;
      const isAndroidNative = Boolean(androidNative);

      if (
        !options?.bypassSanctuary &&
        handleSanctuaryAlert({
          activeSanctuary,
          lifeProfile,
          category,
          visibleTitle,
          visibleDescription,
          visibleSource,
          isAndroidNative,
          activeTimeZone,
          setSilentNotifications,
          showToast,
        })
      ) {
        return;
      }

      const isContinuous = repeatCount === 'continuous';
      const alertId = `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const playRes = !isAndroidNative
        ? playTaskSignature(category, { bypassSanctuary: true, repeatCount, alertId })
        : { playedAudio: false, vibrated: false, isContinuous };
      const nowTime12 = formatNow12hInTimeZone(activeTimeZone, 'ar');
      const defaultSnooze = lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15 ? lifeProfile.defaultSnoozeMinutes : 5;
      const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview;
      const isNativeWin = Boolean(wv?.postMessage);

      setActiveAudioAlert({ id: alertId, title: privacyBadge, category, isContinuous: Boolean(playRes.isContinuous || isContinuous) });

      if (firebaseUser?.uid && !firebaseUser.isAnonymous) {
        void registerActiveAlarm(firebaseUser.uid, {
          id: alertId, title: visibleTitle, body: visibleDescription, category, originClientId: clientIdRef.current,
          medicationId: options?.medicationId, doseTime24: options?.medicationDoseTime24, taskId: options?.taskId, taskListId: options?.taskListId,
        });
      }

      if (!isNativeWin) {
        if (Boolean(androidNative) && document.visibilityState === 'visible') {
          showToast(`${privacyBadge} ${visibleTitle}${visibleDescription ? ` — ${visibleDescription}` : ''}`);
        } else {
          setPersistentAlert({
            id: alertId, emoji: privacyBadge, title: visibleTitle, description: visibleDescription, sourceLabel: visibleSource,
            time12h: nowTime12, category, createdAtMs: Date.now(), durationMs, isContinuous: Boolean(playRes.isContinuous || isContinuous),
            isHydration: category === 'water', medicationId: options?.medicationId, medicationDoseTime24: options?.medicationDoseTime24,
            taskId: options?.taskId, taskListId: options?.taskListId, blockId: options?.blockId,
          });
        }
      }

      try {
        androidNative?.triggerNativeAlarm?.(
          `${privacyBadge} ${visibleTitle}`,
          visibleDescription ? `${visibleDescription}\n${visibleSource} · ${nowTime12}` : `${visibleSource} · ${nowTime12}`,
          category, Boolean(playRes.isContinuous || isContinuous), defaultSnooze
        );
      } catch { /* ignore */ }

      try {
        wv?.postMessage?.(JSON.stringify({
          type: 'native-alert', id: alertId, emoji: privacyBadge, title: visibleTitle, description: visibleDescription,
          sourceLabel: visibleSource, time12h: nowTime12, category, isHydration: category === 'water',
          isMedication: category === 'medication', medicationId: options?.medicationId || '',
          medicationDoseTime24: options?.medicationDoseTime24 || '', isContinuous: playRes.isContinuous,
          cupSizeMl: lifeProfile.cupSizeMl, durationSeconds: Math.round(durationMs / 1000), snoozeMinutes: defaultSnooze,
        }));
      } catch { /* ignore */ }

      if (!options?.isRemoteSignal) {
        emitCrossDeviceSync('alarm_trigger', options?.bypassSanctuary ? 'test_ring' : 'trigger', undefined, {
          title: visibleTitle, body: visibleDescription, kind: category, privacyEmoji: privacyBadge,
          sourceLabel: visibleSource, snoozeMinutes: defaultSnooze, alertId, blockId: options?.blockId,
          bypassSanctuary: Boolean(options?.bypassSanctuary),
        });
        const effectiveUid = firebaseUser?.uid || authUser?.uid || auth.currentUser?.uid || localStorage.getItem(ACTIVE_UID_STORAGE_KEY) || '';
        if (effectiveUid) {
          void broadcastAlertTrigger(effectiveUid, clientIdRef.current, {
            alertId, title: visibleTitle, body: visibleDescription, kind: category,
            snoozeMinutes: defaultSnooze, blockId: options?.blockId, startedAtMs: Date.now(),
          });
        }
      }

      if (!isNativeWin) showToast(`${privacyBadge} · ${visibleTitle} · ${nowTime12}`);
    },
    [
      activeSanctuary, activeTimeZone, authUser?.uid, clientIdRef, emitCrossDeviceSync, firebaseUser,
      lifeProfile.cupSizeMl, lifeProfile.defaultSnoozeMinutes, lifeProfile.sanctuarySilenceMode, lifeProfile.soundRepeats,
      setActiveAudioAlert, setPersistentAlert, setSilentNotifications, showToast,
    ]
  );

  const { handleSnoozeAlert } = useAlertSnoozeHandler({
    lifeProfile,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    emitCrossDeviceSync,
    snoozeTimersRef,
    triggerTaskAlert,
    showToast,
  });

  return { handleAcknowledgeAudioAlert, triggerTaskAlert, handleSnoozeAlert };
}
