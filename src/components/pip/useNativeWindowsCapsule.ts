import { useEffect, useRef } from 'react';
import type { PhoneBatteryTelemetry } from '../../types/dayrhythm';
import { resolveDigitalClock, type CapsulePrefs, type CapsuleTrackInfo, type WebView2Bridge } from './types';

interface UseNativeWindowsCapsuleArgs {
  isNativeWindowsExe: boolean;
  webviewBridge?: WebView2Bridge;
  nextEmoji: string;
  nextTitle: string;
  statusLabel: string;
  sourceKind: 'calendar' | 'task' | 'water' | 'medication' | 'none';
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  targetEpochMs: number;
  durationSeconds: number;
  calendarTrack?: CapsuleTrackInfo | null;
  taskTrack?: CapsuleTrackInfo | null;
  showPhoneChargingBadge: boolean;
  phoneBattery?: PhoneBatteryTelemetry | null;
  prefs: CapsulePrefs;
  upcomingQueue: CapsuleTrackInfo[];
}

export function useNativeWindowsCapsule({
  isNativeWindowsExe,
  webviewBridge,
  nextEmoji,
  nextTitle,
  statusLabel,
  sourceKind,
  countdownText,
  isNow,
  isUrgent,
  targetEpochMs,
  durationSeconds,
  calendarTrack,
  taskTrack,
  showPhoneChargingBadge,
  phoneBattery,
  prefs,
  upcomingQueue,
}: UseNativeWindowsCapsuleArgs): void {
  const lastPostedCapsuleJsonRef = useRef<string>('');

  useEffect(() => {
    if (!isNativeWindowsExe || !webviewBridge?.postMessage) return;
    try {
      const primary = calendarTrack ?? {
        emoji: nextEmoji,
        title: nextTitle,
        statusLabel,
        countdownText,
        isNow,
        isUrgent,
        targetEpochMs,
        durationSeconds,
      };
      const nowMs = Date.now();
      const payloadJson = JSON.stringify({
        type: 'capsule-state',
        emoji: primary.emoji,
        title: primary.title,
        statusLabel: primary.statusLabel,
        sourceKind: calendarTrack ? 'calendar' : sourceKind,
        countdownText: resolveDigitalClock(primary.targetEpochMs, primary.countdownText, nowMs),
        isNow: primary.isNow,
        isUrgent: primary.isUrgent,
        targetEpochMs: primary.targetEpochMs,
        durationSeconds: primary.durationSeconds,
        hasSecondaryTimer: Boolean(calendarTrack && taskTrack),
        secondaryEmoji: taskTrack?.emoji ?? '💧',
        secondaryTitle: taskTrack?.title ?? '',
        secondaryCountdownText: taskTrack
          ? resolveDigitalClock(taskTrack.targetEpochMs, taskTrack.countdownText, nowMs)
          : '',
        secondaryTargetEpochMs: taskTrack?.targetEpochMs ?? 0,
        secondaryIsNow: taskTrack?.isNow ?? false,
        secondaryIsUrgent: taskTrack?.isUrgent ?? false,
        phoneBatteryPct: showPhoneChargingBadge && phoneBattery ? phoneBattery.levelPct : -1,
        phoneCharging: showPhoneChargingBadge,
        phoneChargeLimitPct: phoneBattery?.chargeLimitPct ?? 90,
        phoneChargeEtaMin:
          showPhoneChargingBadge && typeof phoneBattery?.chargeTimeRemainingMin === 'number'
            ? phoneBattery.chargeTimeRemainingMin
            : -1,
        upcomingQueue: upcomingQueue.slice(0, 4).map((item) => ({
          ...item,
          countdownText: resolveDigitalClock(item.targetEpochMs, item.countdownText, nowMs),
        })),
        orientation: prefs.orientation,
        size: prefs.size,
      });
      if (lastPostedCapsuleJsonRef.current === payloadJson) return;
      lastPostedCapsuleJsonRef.current = payloadJson;
      webviewBridge.postMessage(payloadJson);
    } catch {
      // ignore WebView2 postMessage issues
    }
  }, [
    isNativeWindowsExe,
    webviewBridge,
    nextEmoji,
    nextTitle,
    statusLabel,
    sourceKind,
    countdownText,
    isNow,
    isUrgent,
    targetEpochMs,
    durationSeconds,
    calendarTrack,
    taskTrack,
    showPhoneChargingBadge,
    phoneBattery,
    prefs.orientation,
    prefs.size,
    upcomingQueue,
  ]);
}
