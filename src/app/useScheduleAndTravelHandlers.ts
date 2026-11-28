import { useCallback, useEffect } from 'react';
import type React from 'react';
import type {
  CalendarTombstone,
  CreativeActivityItem,
  DayMode,
  MemoryCategory,
  MemoryItem,
  PeriodicRitualStatus,
  ScheduleBlock,
  SharedChangelogEntry,
  TaskSoundCategory,
  TravelState,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { EmitCrossDeviceSync, TasksVaultPayload } from '../types/appTypes';
import type { UserSettingsPayload } from '../services/cloudStateService';
import { stopContinuousAlert } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { cleanCalendarText } from '../services/apiClient';
import {
  CREATIVE_STORAGE_KEY,
  normalizeSkipPatternKey,
  SKIP_PATTERN_STORAGE_KEY,
} from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';

export interface UseScheduleAndTravelHandlersParams {
  activeTimeZone: string;
  todayCairoIso: string;
  effectiveDayMode: DayMode;
  travelState: TravelState;
  profileLocation: TravelState['location'];
  isFridayMode: boolean;
  includeBiweeklyPcCleanup: boolean;
  liveBlocks: ScheduleBlock[];
  undoSnapshot: ScheduleBlock[] | null;
  tombstones: CalendarTombstone[];
  memories: MemoryItem[];
  TRAVEL_STATE_STORAGE_KEY: string;
  isFridayModeRef: React.MutableRefObject<boolean>;
  includeBiweeklyPcCleanupRef: React.MutableRefObject<boolean>;
  adhanOverrideSilentRef: React.MutableRefObject<boolean>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  travelStateRef: React.MutableRefObject<TravelState>;
  setIsFridayMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIncludeBiweeklyPcCleanup: React.Dispatch<React.SetStateAction<boolean>>;
  setAdhanOverrideSilent: React.Dispatch<React.SetStateAction<boolean>>;
  setTravelState: React.Dispatch<React.SetStateAction<TravelState>>;
  setUndoSnapshot: React.Dispatch<React.SetStateAction<ScheduleBlock[] | null>>;
  setReflowedBlocksOverride: React.Dispatch<React.SetStateAction<ScheduleBlock[] | null>>;
  setUseOfflineDemo: React.Dispatch<React.SetStateAction<boolean>>;
  setOfflineBlocks: React.Dispatch<React.SetStateAction<ScheduleBlock[]>>;
  setPeriodicRituals: React.Dispatch<React.SetStateAction<PeriodicRitualStatus[]>>;
  setCreativeActivities: React.Dispatch<React.SetStateAction<CreativeActivityItem[]>>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setLastDeletedBlock: React.Dispatch<React.SetStateAction<ScheduleBlock | null>>;
  setShakeUndoSecondsLeft: React.Dispatch<React.SetStateAction<number>>;
  setTombstones: React.Dispatch<React.SetStateAction<CalendarTombstone[]>>;
  rebuildOfflineSchedule: (mode: DayMode, travel: TravelState, friday: boolean, biweeklyPc: boolean) => void;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
  pushToTasksVaultRef: React.MutableRefObject<(patch?: Partial<TasksVaultPayload>) => Promise<void>>;
  saveCloudUserSettingsImmediately: (patch?: Partial<UserSettingsPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: () => Promise<boolean>;
  emitCrossDeviceSync: EmitCrossDeviceSync;
  handleAddMemory: (input: { category: MemoryCategory; ruleText: string; source?: MemoryItem['source'] }) => void;
  appendChangelog: (device: SharedChangelogEntry['device'], noteAr: string, noteEn: string) => void;
  showToast: (msg: string) => void;
}

export function useScheduleAndTravelHandlers(p: UseScheduleAndTravelHandlersParams) {
  const handleToggleFridayMode = (v: boolean) => {
    p.isFridayModeRef.current = v;
    p.setIsFridayMode(v);
    p.setUndoSnapshot(null);
    p.setReflowedBlocksOverride(null);
    p.rebuildOfflineSchedule(p.effectiveDayMode, p.travelState, v, p.includeBiweeklyPcCleanup);
    void p.pushToTasksVaultImmediately({ isFridayMode: v });
  };

  const handleToggleBiweeklyPcCleanup = (v: boolean) => {
    p.includeBiweeklyPcCleanupRef.current = v;
    p.setIncludeBiweeklyPcCleanup(v);
    p.setUndoSnapshot(null);
    p.setReflowedBlocksOverride(null);
    p.rebuildOfflineSchedule(p.effectiveDayMode, p.travelState, p.isFridayMode, v);
    void p.pushToTasksVaultImmediately({ includeBiweeklyPcCleanup: v });
  };

  const handleToggleAdhanOverrideSilent = useCallback(() => {
    p.setAdhanOverrideSilent((prev) => {
      const next = !prev;
      p.adhanOverrideSilentRef.current = next;
      void p.pushToTasksVaultRef.current({ adhanOverrideSilent: next });
      return next;
    });
  }, [p.adhanOverrideSilentRef, p.pushToTasksVaultRef, p.setAdhanOverrideSilent]);

  const handleApplyTravel = (nextTravel: TravelState) => {
    const stamped: TravelState = { ...nextTravel, updatedAt: Date.now() };
    p.localWriteLockUntilRef.current = Date.now() + 5000;
    p.travelStateRef.current = stamped;
    p.setTravelState(stamped);
    try { localStorage.setItem(p.TRAVEL_STATE_STORAGE_KEY, JSON.stringify(stamped)); } catch { /* ignore */ }
    p.setReflowedBlocksOverride(null);
    p.rebuildOfflineSchedule(p.effectiveDayMode, stamped, p.isFridayMode, p.includeBiweeklyPcCleanup);
    p.appendChangelog('Web/PC', `تفعيل وضع السفر (${stamped.location.nameAr})`, `Activated Travel Mode`);
    p.showToast('تم تفعيل وضع السفر وتحديث التنبيهات.');
    void p.saveCloudUserSettingsImmediately({ travelState: stamped });
  };

  const handleDisableTravel = () => {
    const resetTravel: TravelState = {
      ...p.travelState,
      active: false,
      location: p.profileLocation,
      distanceKm: 0,
      returnDate: undefined,
      deferredCategories: [],
      deferredMedIds: [],
      updatedAt: Date.now(),
    };
    p.localWriteLockUntilRef.current = Date.now() + 5000;
    p.travelStateRef.current = resetTravel;
    p.setTravelState(resetTravel);
    try { localStorage.setItem(p.TRAVEL_STATE_STORAGE_KEY, JSON.stringify(resetTravel)); } catch { /* ignore */ }
    p.setReflowedBlocksOverride(null);
    p.rebuildOfflineSchedule(p.effectiveDayMode, resetTravel, p.isFridayMode, p.includeBiweeklyPcCleanup);
    p.showToast('تم إنهاء وضع السفر واستعادة جميع التنبيهات ✓');
    void p.saveCloudUserSettingsImmediately({ travelState: resetTravel });
  };

  useEffect(() => {
    if (!p.travelState.active || !p.travelState.returnDate) return;
    if (p.todayCairoIso >= p.travelState.returnDate) {
      const expiredTravel: TravelState = {
        ...p.travelState,
        active: false,
        location: p.profileLocation,
        distanceKm: 0,
        returnDate: undefined,
        deferredCategories: [],
        deferredMedIds: [],
        updatedAt: Date.now(),
      };
      p.localWriteLockUntilRef.current = Date.now() + 5000;
      p.travelStateRef.current = expiredTravel;
      p.setTravelState(expiredTravel);
      try { localStorage.setItem(p.TRAVEL_STATE_STORAGE_KEY, JSON.stringify(expiredTravel)); } catch { /* ignore */ }
      void p.saveCloudUserSettingsImmediately({ travelState: expiredTravel });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.todayCairoIso, p.travelState, p.profileLocation, p.saveCloudUserSettingsImmediately]);

  const handleImportIcsBlocks = useCallback(
    (newBlocks: ScheduleBlock[]) => {
      p.setUseOfflineDemo(true);
      p.setOfflineBlocks((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        return [...prev, ...newBlocks.filter((nb) => !existingIds.has(nb.id))].sort((a, b) => a.startMin - b.startMin);
      });
      p.appendChangelog('Web/PC', `استيراد ${newBlocks.length} أحداث عبر خلاصة .ics (RRULE)`, `Imported ${newBlocks.length} ICS RRULE events`);
      p.showToast(`تم استيراد ${newBlocks.length} أحداث من خلاصة .ics ✓`);
    },
    [p.appendChangelog, p.setOfflineBlocks, p.setUseOfflineDemo, p.showToast]
  );

  const handleCompletePeriodicRitual = useCallback(
    (id: PeriodicRitualStatus['id']) => {
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      p.setPeriodicRituals((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, daysSinceLast: 0, lastCompletedIso: todayIso } : r));
        void p.pushToTasksVaultImmediately({ periodicRituals: next });
        return next;
      });
      p.appendChangelog('Web/PC', `تسجيل إتمام المهمة الدورية (${id})`, `Completed periodic ritual ${id}`);
      p.showToast('تم تسجيل إنجاز المهمة الدورية وتصفير العداد ✓');
    },
    [p.activeTimeZone, p.appendChangelog, p.pushToTasksVaultImmediately, p.setPeriodicRituals, p.showToast]
  );

  const handleToggleCreativeToday = useCallback(
    (activityId: string) => {
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      p.setCreativeActivities((prev) => {
        const next = prev.map((act) => {
          if (act.id !== activityId) return act;
          const exists = act.loggedDates.includes(todayIso);
          const nextDates = exists ? act.loggedDates.filter((d) => d !== todayIso) : [...act.loggedDates, todayIso].slice(-30);
          p.showToast(exists ? `تم إلغاء تسجيل جلسة «${act.name}» اليوم` : `${act.emoji} أحسنت! تم تسجيل جلسة «${act.name}» اليوم ✓`);
          return { ...act, loggedDates: nextDates };
        });
        void p.pushToTasksVaultImmediately({ creativeActivities: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      triggerHapticWaveform('water_cup');
    },
    [p.activeTimeZone, p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setCreativeActivities, p.showToast]
  );

  const handleToggleComplete = useCallback(
    (id: string) => {
      if (id.startsWith('creative_')) {
        handleToggleCreativeToday(id.slice('creative_'.length));
        return;
      }
      stopContinuousAlert();
      stopNativeAlerts();
      p.setActiveAudioAlert(null);
      p.setPersistentAlert(null);
      p.setAlarmRinging(false);
      p.emitCrossDeviceSync('alarm_dismiss', 'block_completed', undefined, { blockId: id, alertId: id });
      p.setCompletedOverrides((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        void p.pushToTasksVaultImmediately({ completedOverrides: next });
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleToggleCreativeToday, p.pushToTasksVaultImmediately]
  );

  const handleDeleteBlock = (id: string) => {
    const target = p.liveBlocks.find((b) => b.id === id) ?? null;
    p.setOfflineBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, deleted: true } : b)));
    if (target) {
      p.setLastDeletedBlock(target);
      p.setShakeUndoSecondsLeft(8);
      p.setTombstones((prev) => [
        { id: `tomb-${Date.now()}`, blockId: target.id, emojiPair: target.emojiPair, categoryAr: target.categoryAr, deletedAtIso: getDateIsoInTimeZone(p.activeTimeZone), ageDays: 0 },
        ...prev,
      ]);
    }
  };

  const handleRestoreBlock = (id: string) => p.setOfflineBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, deleted: false } : b)));
  const handleRestoreAllDeleted = () => p.setOfflineBlocks((prev) => prev.map((b) => ({ ...b, deleted: false })));
  const handleSweepOldTombstones = () => {
    const expired = p.tombstones.filter((t) => t.ageDays > 14).length;
    p.setTombstones((prev) => prev.filter((t) => t.ageDays <= 14));
    if (expired > 0) p.appendChangelog('Web/PC', `تنظيف ${expired} سجل Tombstones > 14 يوماً`, `Purged ${expired} tombstones > 14d`);
    return expired;
  };

  const handleCommitReflow = (reflowed: ScheduleBlock[]) => {
    if (!p.undoSnapshot) p.setUndoSnapshot(p.liveBlocks);
    p.setReflowedBlocksOverride(reflowed);
    p.appendChangelog('Web/PC', 'تطبيق زحزحة وتدارك اليوم الخالية من التصادم', 'Applied Collision-Free Reflow');
    try {
      const skipped = reflowed.filter((b) => b.reflowStatus === 'skipped');
      if (skipped.length > 0) {
        const counts: Record<string, number> = JSON.parse(localStorage.getItem(SKIP_PATTERN_STORAGE_KEY) || '{}');
        const flaggedTitles: string[] = [];
        skipped.forEach((b) => {
          const titleAr = cleanCalendarText(b.categoryAr) || b.emojiPair;
          const key = normalizeSkipPatternKey(titleAr);
          if (!key) return;
          counts[key] = (counts[key] ?? 0) + 1;
          if (counts[key] === 3 && !p.memories.some((m) => m.ruleText.includes(titleAr))) flaggedTitles.push(titleAr);
        });
        localStorage.setItem(SKIP_PATTERN_STORAGE_KEY, JSON.stringify(counts));
        flaggedTitles.forEach((titleAr) => {
          p.handleAddMemory({
            category: 'priority',
            ruleText: `لاحظ النظام أن المستخدم تخطّى «${titleAr}» ٣ أيام على الأقل عبر "تدارك اليوم" — هذا نمط متكرر، فاقترح بنفسك تعديل ميعاده أو تبسيطه أو حذفه بدل الاستمرار في جدولته كما هو دون تغيير.`,
            source: 'system_seed',
          });
        });
      }
    } catch { /* ignore */ }
  };

  const handleUndoReflow = () => {
    if (p.undoSnapshot) {
      p.setReflowedBlocksOverride(null);
      p.setUndoSnapshot(null);
    }
  };

  return {
    handleToggleFridayMode, handleToggleBiweeklyPcCleanup, handleToggleAdhanOverrideSilent,
    handleApplyTravel, handleDisableTravel, handleImportIcsBlocks, handleCompletePeriodicRitual,
    handleToggleCreativeToday, handleToggleComplete, handleDeleteBlock, handleRestoreBlock,
    handleRestoreAllDeleted, handleSweepOldTombstones, handleCommitReflow, handleUndoReflow,
  };
}
