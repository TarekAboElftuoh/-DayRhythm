import { useCallback, useRef } from 'react';
import type React from 'react';
import type { DeletedWorkspaceSnapshot, TaskSoundCategory } from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import { stopContinuousAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';

export interface UseIncomingRemoteSyncParams {
  clientIdRef: React.MutableRefObject<string>;
  seenSyncOpIdsRef: React.MutableRefObject<Set<string>>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  setCompletedOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showToast: (msg: string) => void;
  triggerTaskAlert: (
    emoji: string,
    category: TaskSoundCategory,
    opts?: {
      privacyEmoji?: string;
      displayTitle?: string;
      sourceLabel?: string;
      description?: string;
      blockId?: string;
      isRemoteSignal?: boolean;
      bypassSanctuary?: boolean;
    }
  ) => void;
  setLastDeletedWorkspaceItem: React.Dispatch<React.SetStateAction<DeletedWorkspaceSnapshot | null>>;
  fetchCalendarEvents: () => Promise<void>;
  fetchGoogleTasks: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

export function useIncomingRemoteSync(p: UseIncomingRemoteSyncParams) {
  const handleIncomingRemoteSync = useCallback(
    (payload: {
      opId?: string;
      clientId?: string;
      scope?: string;
      action?: string;
      undoSnapshot?: DeletedWorkspaceSnapshot;
      extra?: Record<string, unknown>;
    }) => {
      if (!payload || payload.clientId === p.clientIdRef.current) return;
      if (payload.opId) {
        if (p.seenSyncOpIdsRef.current.has(payload.opId)) return;
        p.seenSyncOpIdsRef.current.add(payload.opId);
        if (p.seenSyncOpIdsRef.current.size > 150) {
          const oldest = p.seenSyncOpIdsRef.current.values().next().value;
          if (oldest) p.seenSyncOpIdsRef.current.delete(oldest);
        }
      }

      if (payload.scope === 'alarm_dismiss') {
        stopContinuousAlert();
        stopSmartChargeCompleteAlert();
        stopNativeAlerts();
        p.setSmartChargeAudioActive(false);
        p.setActiveAudioAlert(null);
        p.setPersistentAlert(null);
        p.setAlarmRinging(false);
        const extraDismiss = payload.extra as { blockId?: string } | undefined;
        if (extraDismiss?.blockId) {
          p.acknowledgedBlockIdsRef.current.add(extraDismiss.blockId);
          p.setCompletedOverrides((prev) => ({ ...prev, [extraDismiss.blockId!]: true }));
        }
        p.showToast('🔕 تم إيقاف التنبيه تلقائياً من جهازك الآخر ✓');
        return;
      }

      if (payload.scope === 'alarm_trigger') {
        p.setAlarmRinging(true);
        const extra = payload.extra as {
          title?: string; body?: string; kind?: TaskSoundCategory; privacyEmoji?: string;
          sourceLabel?: string; blockId?: string; bypassSanctuary?: boolean;
        } | undefined;
        const emoji = extra?.privacyEmoji || '🔔';
        p.triggerTaskAlert(emoji, (extra?.kind || 'general') as TaskSoundCategory, {
          privacyEmoji: emoji,
          displayTitle: extra?.title || 'تنبيه متزامن (الموبايل ↔ الكمبيوتر)',
          sourceLabel: extra?.sourceLabel || 'مزامنة سحابية فورية',
          description: extra?.body,
          blockId: extra?.blockId,
          isRemoteSignal: true,
          bypassSanctuary: Boolean(extra?.bypassSanctuary),
        });
        return;
      }

      if (payload.action === 'undo_restore') p.setLastDeletedWorkspaceItem(null);
      else if (payload.undoSnapshot) p.setLastDeletedWorkspaceItem(payload.undoSnapshot);

      if (payload.scope === 'calendar') {
        p.acknowledgedBlockIdsRef.current.clear();
        void p.fetchCalendarEvents();
      } else if (payload.scope === 'tasks') {
        void p.fetchGoogleTasks();
      } else {
        void p.refreshWorkspace();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.fetchCalendarEvents, p.fetchGoogleTasks, p.refreshWorkspace, p.showToast, p.triggerTaskAlert]
  );

  const handleIncomingRemoteSyncRef = useRef(handleIncomingRemoteSync);
  handleIncomingRemoteSyncRef.current = handleIncomingRemoteSync;

  return { handleIncomingRemoteSync, handleIncomingRemoteSyncRef };
}
