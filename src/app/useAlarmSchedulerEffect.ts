import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import { syncScheduledAlarmsToCloud } from '../services/cloudStateService';
import { buildExactAlarms, type BuildExactAlarmsInput } from './buildExactAlarms';

export interface UseAlarmSchedulerEffectParams extends BuildExactAlarmsInput {
  firebaseUser: User | null;
  needsAuth: boolean;
  settingsAlarmEpoch: number;
  clientIdRef: React.MutableRefObject<string>;
  lastScheduledAlarmsJsonRef: React.MutableRefObject<string>;
  lastSyncedCloudAlarmsJsonRef: React.MutableRefObject<string>;
}

export function useAlarmSchedulerEffect(p: UseAlarmSchedulerEffectParams): void {
  useEffect(() => {
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: { scheduleExactAlarms?: (alarmsJson: string) => void };
      }
    ).DayRhythmNative;

    const timerId = window.setTimeout(() => {
      const slicedAlarms = buildExactAlarms(p);
      const alarmsJson = JSON.stringify(slicedAlarms);
      const nativeBatchPayload = JSON.stringify({
        isFastingToday: Boolean(p.dailyRhythmPlan.isFastingToday),
        activeTargetCups: p.targetCups,
        alarms: slicedAlarms,
      });

      if (androidBridge?.scheduleExactAlarms && nativeBatchPayload !== p.lastScheduledAlarmsJsonRef.current) {
        p.lastScheduledAlarmsJsonRef.current = nativeBatchPayload;
        try {
          androidBridge.scheduleExactAlarms(nativeBatchPayload);
        } catch { /* ignore */ }
      }

      if (p.firebaseUser?.uid && !p.firebaseUser.isAnonymous && alarmsJson !== p.lastSyncedCloudAlarmsJsonRef.current) {
        p.lastSyncedCloudAlarmsJsonRef.current = alarmsJson;
        void syncScheduledAlarmsToCloud(p.firebaseUser.uid, alarmsJson, p.clientIdRef.current);
      }
    }, 50);

    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.activeTimeZone, p.dailyRhythmPlan.bedtimeMin, p.dailyRhythmPlan.wakeMin, p.dailyRhythmPlan.cupSizeMl,
    p.dailyRhythmPlan.hydrationSlots, p.dailyRhythmPlan.isFastingToday, p.targetCups, p.quietMode,
    p.quietUntilTs, p.adhanOverrideSilent, p.sanctuaryOverrideUntilMs, p.lowEnergyActive,
    p.firebaseUser?.isAnonymous, p.firebaseUser?.uid, p.googleTasks, p.hydrationToday,
    p.includePrayerAnchors, p.lifeProfile.adhanLeadMinutes, p.lifeProfile.defaultSnoozeMinutes,
    p.liveBlocks, p.medications, p.needsAuth, p.prayers, p.sunlightSessions, p.sunlightSettings.enabled,
    p.todayCairoIso, p.travelState, p.waterRemindersEnabled, p.settingsAlarmEpoch,
  ]);
}
