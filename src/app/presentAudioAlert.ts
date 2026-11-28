import type React from 'react';
import type { User } from 'firebase/auth';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { DeletedWorkspaceSnapshot, LifeProfile, SoundRepeatSetting, TaskSoundCategory } from '../types/dayrhythm';
import { playTaskSignature } from '../engines/audioEngine';
import { broadcastAlertTrigger, registerActiveAlarm } from '../services/cloudStateService';

export interface PresentAlertParams {
  item: PersistentAlertItem;
  repeatCount: SoundRepeatSetting;
  isRemoteSignal?: boolean;
  bypassSanctuary?: boolean;
  lifeProfile: LifeProfile;
  firebaseUser: User | null;
  authUser: User | null;
  effectiveUid: string;
  clientIdRef: React.MutableRefObject<string>;
  setActiveAudioAlert: React.Dispatch<
    React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>
  >;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  emitCrossDeviceSync: (
    scope: 'alarm_dismiss' | 'alarm_trigger' | 'all' | 'calendar' | 'clear_notifications' | 'schedule_blocks' | 'settings_patch' | 'tasks',
    action: string,
    undoSnapshotPayload?: DeletedWorkspaceSnapshot,
    extra?: Record<string, unknown>
  ) => void;
  showToast: (msg: string) => void;
}

export function presentAudioAlert(p: PresentAlertParams): void {
  const { item, repeatCount, lifeProfile, firebaseUser, clientIdRef } = p;
  const androidNative = (
    window as Window & {
      DayRhythmNative?: {
        triggerNativeAlarm?: (title: string, body: string, kind: string, continuous: boolean, snoozeMinutes: number) => void;
      };
    }
  ).DayRhythmNative;
  const isAndroidNative = Boolean(androidNative);
  const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview;
  const isNativeWin = Boolean(wv?.postMessage);
  const isContinuous = repeatCount === 'continuous';
  const ringPauseSeconds = lifeProfile.ringPauseSeconds ?? 2;
  const playRes = !isAndroidNative
    ? playTaskSignature(item.category, { bypassSanctuary: true, repeatCount, alertId: item.id, ringPauseSeconds })
    : { playedAudio: false, vibrated: false, isContinuous };
  const defaultSnooze =
    lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15 ? lifeProfile.defaultSnoozeMinutes : 5;

  p.setActiveAudioAlert({
    id: item.id,
    title: item.emoji,
    category: item.category,
    isContinuous: Boolean(playRes.isContinuous || isContinuous),
  });

  if (firebaseUser?.uid && !firebaseUser.isAnonymous) {
    void registerActiveAlarm(firebaseUser.uid, {
      id: item.id,
      title: item.title,
      body: item.description || '',
      category: item.category,
      originClientId: clientIdRef.current,
      medicationId: item.medicationId,
      doseTime24: item.medicationDoseTime24,
      taskId: item.taskId,
      taskListId: item.taskListId,
    });
  }

  if (!isNativeWin) {
    if (isAndroidNative && document.visibilityState === 'visible') {
      p.showToast(`${item.emoji} ${item.title}${item.description ? ` — ${item.description}` : ''}`);
    } else {
      p.setPersistentAlert({ ...item, isContinuous: Boolean(playRes.isContinuous || isContinuous) });
    }
  }

  try {
    androidNative?.triggerNativeAlarm?.(
      `${item.emoji} ${item.title}`,
      item.description ? `${item.description}\n${item.sourceLabel} · ${item.time12h}` : `${item.sourceLabel} · ${item.time12h}`,
      item.category,
      Boolean(playRes.isContinuous || isContinuous),
      defaultSnooze
    );
  } catch { /* ignore */ }

  try {
    wv?.postMessage?.(JSON.stringify({
      type: 'native-alert',
      id: item.id,
      emoji: item.emoji,
      title: item.title,
      description: item.description || '',
      sourceLabel: item.sourceLabel,
      time12h: item.time12h,
      category: item.category,
      isHydration: item.category === 'water',
      isMedication: item.category === 'medication',
      medicationId: item.medicationId || '',
      medicationDoseTime24: item.medicationDoseTime24 || '',
      isContinuous: Boolean(playRes.isContinuous || isContinuous),
      cupSizeMl: lifeProfile.cupSizeMl,
      durationSeconds: Math.round(item.durationMs / 1000),
      snoozeMinutes: defaultSnooze,
    }));
  } catch { /* ignore */ }

  if (!p.isRemoteSignal) {
    p.emitCrossDeviceSync('alarm_trigger', p.bypassSanctuary ? 'test_ring' : 'trigger', undefined, {
      title: item.title,
      body: item.description || '',
      kind: item.category,
      privacyEmoji: item.emoji,
      sourceLabel: item.sourceLabel,
      snoozeMinutes: defaultSnooze,
      alertId: item.id,
      blockId: item.blockId,
      occurrenceKey: item.occurrenceKey,
      bypassSanctuary: Boolean(p.bypassSanctuary),
    });
    if (p.effectiveUid) {
      void broadcastAlertTrigger(p.effectiveUid, clientIdRef.current, {
        alertId: item.id,
        title: item.title,
        body: item.description || '',
        kind: item.category,
        snoozeMinutes: defaultSnooze,
        blockId: item.blockId,
        startedAtMs: Date.now(),
      });
    }
  }

  if (!isNativeWin) p.showToast(`${item.emoji} · ${item.title} · ${item.time12h}`);
}
