import { useCallback, useEffect, useRef } from 'react';
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
import { DEFAULT_SOUND_REPEATS, stopContinuousAlert, TASK_SOUND_META } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { formatNow12hInTimeZone } from '../engines/prayerEngine';
import { auth } from '../firebase';
import { cleanCalendarText } from '../services/apiClient';
import { saveDismissedKeyToCloud } from '../services/cloudStateService';
import { addDismissedKeys, isOccurrenceDismissed, markFiredInSession } from './alarmOccurrenceGuard';
import { handleSanctuaryAlert } from './handleSanctuaryAlert';
import { presentAudioAlert } from './presentAudioAlert';
import { ACTIVE_UID_STORAGE_KEY, extractEmojiPair } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import { cancelSnoozeTimersForTarget, useAlertSnoozeHandler } from './useAlertSnoozeHandler';

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

interface QueuedAlertEntry {
  item: PersistentAlertItem;
  repeatCount: SoundRepeatSetting;
  isRemoteSignal?: boolean;
  bypassSanctuary?: boolean;
}

export function useAudioAlerts(p: UseAudioAlertsParams) {
  const {
    activeAudioAlert, persistentAlert, alarmRinging, activeSanctuary, activeTimeZone, lifeProfile,
    firebaseUser, authUser, clientIdRef, acknowledgedBlockIdsRef, snoozeTimersRef, setActiveAudioAlert,
    setPersistentAlert, setAlarmRinging, setCompletedOverrides, setSilentNotifications, emitCrossDeviceSync, showToast,
  } = p;
  const activeOccurrenceKeyRef = useRef<string | undefined>(undefined);
  const persistentAlertRef = useRef<PersistentAlertItem | null>(persistentAlert);
  persistentAlertRef.current = persistentAlert;
  const alertQueueRef = useRef<QueuedAlertEntry[]>([]);

  const getEffectiveUid = useCallback(
    () => firebaseUser?.uid || authUser?.uid || auth.currentUser?.uid || localStorage.getItem(ACTIVE_UID_STORAGE_KEY) || '',
    [authUser?.uid, firebaseUser?.uid]
  );

  const promoteNextQueuedAlert = useCallback((): boolean => {
    const next = alertQueueRef.current.shift();
    if (!next) return false;
    const itemWithQueue: PersistentAlertItem = {
      ...next.item,
      createdAtMs: Date.now(),
      queuedCount: alertQueueRef.current.length,
    };
    persistentAlertRef.current = itemWithQueue;
    activeOccurrenceKeyRef.current = itemWithQueue.occurrenceKey;
    presentAudioAlert({
      item: itemWithQueue,
      repeatCount: next.repeatCount,
      isRemoteSignal: next.isRemoteSignal,
      bypassSanctuary: next.bypassSanctuary,
      lifeProfile,
      firebaseUser,
      authUser,
      effectiveUid: getEffectiveUid(),
      clientIdRef,
      setActiveAudioAlert,
      setPersistentAlert,
      emitCrossDeviceSync,
      showToast,
    });
    return true;
  }, [authUser, clientIdRef, emitCrossDeviceSync, firebaseUser, getEffectiveUid, lifeProfile, setActiveAudioAlert, setPersistentAlert, showToast]);

  const handleAcknowledgeAudioAlert = useCallback(() => {
    stopContinuousAlert();
    stopNativeAlerts();
    const hadAlert = Boolean(activeAudioAlert || persistentAlert || alarmRinging);
    const title = activeAudioAlert?.title || persistentAlert?.title || 'التنبيه';
    const alertId = activeAudioAlert?.id || persistentAlert?.id || 'all';
    const dismissedBlockId = persistentAlert?.blockId;
    const occurrenceKey = persistentAlert?.occurrenceKey || activeOccurrenceKeyRef.current;
    activeOccurrenceKeyRef.current = undefined;

    if (occurrenceKey) {
      addDismissedKeys([occurrenceKey]);
      const effectiveUid = getEffectiveUid();
      if (effectiveUid) void saveDismissedKeyToCloud(effectiveUid, occurrenceKey);
    }

    if (dismissedBlockId || persistentAlert?.taskId) {
      cancelSnoozeTimersForTarget({ blockId: dismissedBlockId, taskId: persistentAlert?.taskId }, snoozeTimersRef);
    }
    if (dismissedBlockId) {
      acknowledgedBlockIdsRef.current.add(dismissedBlockId);
      setCompletedOverrides((prev) => ({ ...prev, [dismissedBlockId]: true }));
    }

    persistentAlertRef.current = null;
    emitCrossDeviceSync('alarm_dismiss', 'dismiss', undefined, { blockId: dismissedBlockId, alertId, occurrenceKey });

    if (!promoteNextQueuedAlert()) {
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
    }
    triggerHapticWaveform('shake_undo');
    if (hadAlert) showToast(`✓ تم إيقاف وتأكيد تنبيه «${title}» على أجهزتك`);
  }, [
    acknowledgedBlockIdsRef, activeAudioAlert, alarmRinging, emitCrossDeviceSync, getEffectiveUid,
    persistentAlert, promoteNextQueuedAlert, setActiveAudioAlert, setAlarmRinging, setCompletedOverrides,
    setPersistentAlert, showToast, snoozeTimersRef,
  ]);

  useEffect(() => {
    if (!activeAudioAlert || activeAudioAlert.isContinuous || activeAudioAlert.category === 'water') return;
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
        occurrenceKey?: string;
      }
    ): boolean => {
      if (options?.occurrenceKey && isOccurrenceDismissed(options.occurrenceKey)) return false;

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

      const androidNative = (window as Window & { DayRhythmNative?: unknown }).DayRhythmNative;
      const isAndroidNative = Boolean(androidNative);

      if (
        !options?.bypassSanctuary &&
        handleSanctuaryAlert({
          activeSanctuary, lifeProfile, category, visibleTitle, visibleDescription, visibleSource,
          isAndroidNative, activeTimeZone, setSilentNotifications, showToast,
        })
      ) {
        if (options?.occurrenceKey) markFiredInSession(options.occurrenceKey);
        return true;
      }

      const alertId = `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const nowTime12 = formatNow12hInTimeZone(activeTimeZone, 'ar');
      const item: PersistentAlertItem = {
        id: alertId, emoji: privacyBadge, title: visibleTitle, description: visibleDescription,
        sourceLabel: visibleSource, time12h: nowTime12, category, createdAtMs: Date.now(), durationMs,
        isContinuous: repeatCount === 'continuous', repeatCount, isHydration: category === 'water',
        medicationId: options?.medicationId, medicationDoseTime24: options?.medicationDoseTime24,
        taskId: options?.taskId, taskListId: options?.taskListId, blockId: options?.blockId, occurrenceKey: options?.occurrenceKey,
      };

      const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview;
      const isNativeWin = Boolean(wv?.postMessage);
      const canShowWebCard = !isNativeWin && !(isAndroidNative && document.visibilityState === 'visible');

      if (canShowWebCard && persistentAlertRef.current) {
        const occ = options?.occurrenceKey;
        const alreadyQueued = occ
          ? persistentAlertRef.current.occurrenceKey === occ || alertQueueRef.current.some((q) => q.item.occurrenceKey === occ)
          : false;
        if (!alreadyQueued) {
          alertQueueRef.current.push({
            item,
            repeatCount,
            isRemoteSignal: options?.isRemoteSignal,
            bypassSanctuary: options?.bypassSanctuary,
          });
          setPersistentAlert((prev) => (prev ? { ...prev, queuedCount: alertQueueRef.current.length } : prev));
        }
        if (occ) markFiredInSession(occ);
        return true;
      }

      if (options?.occurrenceKey) {
        markFiredInSession(options.occurrenceKey);
        activeOccurrenceKeyRef.current = options.occurrenceKey;
      } else {
        activeOccurrenceKeyRef.current = undefined;
      }

      if (canShowWebCard) persistentAlertRef.current = item;
      presentAudioAlert({
        item, repeatCount, isRemoteSignal: options?.isRemoteSignal, bypassSanctuary: options?.bypassSanctuary,
        lifeProfile, firebaseUser, authUser, effectiveUid: getEffectiveUid(), clientIdRef,
        setActiveAudioAlert, setPersistentAlert, emitCrossDeviceSync, showToast,
      });
      return true;
    },
    [
      activeSanctuary, activeTimeZone, authUser, clientIdRef, emitCrossDeviceSync, firebaseUser,
      getEffectiveUid, lifeProfile, setActiveAudioAlert, setPersistentAlert, setSilentNotifications, showToast,
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
    onAfterSnooze: () => {
      persistentAlertRef.current = null;
      return promoteNextQueuedAlert();
    },
    showToast,
  });

  return { handleAcknowledgeAudioAlert, triggerTaskAlert, handleSnoozeAlert };
}
