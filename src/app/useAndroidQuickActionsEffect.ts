import { useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type { TaskSoundCategory } from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { EmitCrossDeviceSync } from '../types/appTypes';
import { auth } from '../firebase';
import { dismissActiveAlarmInCloud, setCloudAlertSession } from '../services/cloudStateService';
import { stopContinuousAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { formatNow12hInTimeZone } from '../engines/prayerEngine';
import { ACTIVE_UID_STORAGE_KEY } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';

export interface UseAndroidQuickActionsEffectParams {
  activeTimeZone: string;
  firebaseUser: User | null;
  authUser: User | null;
  nextMedicationQuick: { id: string; name: string; doseTime24?: string; timeLabel?: string } | null;
  clientIdRef: React.MutableRefObject<string>;
  handleLogWaterCup: (opts?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void;
  handleToggleMedication: (medId: string, doseTime?: string, opts?: { fromRemote?: boolean }) => void;
  handleSnoozeAlert: (alertItem: PersistentAlertItem, minutes?: number, opts?: { localOnly?: boolean }) => void;
  handleAcknowledgeAudioAlert: () => void;
  triggerTaskAlert: (title: string, category: TaskSoundCategory, opts?: Record<string, unknown>) => void;
  emitCrossDeviceSync: EmitCrossDeviceSync;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (msg: string) => void;
}

export function useAndroidQuickActionsEffect(p: UseAndroidQuickActionsEffectParams): void {
  useEffect(() => {
    const processAndroidQuickActions = (rawJson?: string | null) => {
      if (!rawJson || rawJson === '[]') return;
      try {
        const items = JSON.parse(rawJson) as Array<{ kind?: string; medicationId?: string; doseTime24?: string }>;
        if (!Array.isArray(items) || items.length === 0) return;
        for (const item of items) {
          if (item.kind === 'water') p.handleLogWaterCup();
          else if (item.kind === 'medication' && item.medicationId) p.handleToggleMedication(item.medicationId, item.doseTime24 || undefined);
        }
        stopContinuousAlert();
        p.setActiveAudioAlert(null);
        p.setPersistentAlert(null);
        p.setAlarmRinging(false);
        const effectiveUid = p.firebaseUser?.uid || p.authUser?.uid || auth.currentUser?.uid || localStorage.getItem(ACTIVE_UID_STORAGE_KEY) || '';
        if (effectiveUid) {
          void setCloudAlertSession(effectiveUid, { status: 'dismissed', alertId: 'all', dismissedBy: p.clientIdRef.current, dismissedAtMs: Date.now() });
          void dismissActiveAlarmInCloud(effectiveUid, 'all', p.clientIdRef.current);
        }
        p.emitCrossDeviceSync('alarm_dismiss', 'native_action');
        p.showToast(`✓ تمت مزامنة ${items.length} إجراء وإيقاف التنبيه على أجهزتك`);
      } catch { /* ignore */ }
    };

    const flushAndroidPendingActions = () => {
      const androidBridge = (window as Window & { DayRhythmNative?: { consumePendingNativeActions?: () => string } }).DayRhythmNative;
      if (androidBridge?.consumePendingNativeActions) {
        try { processAndroidQuickActions(androidBridge.consumePendingNativeActions()); } catch { /* ignore */ }
      }
    };
    flushAndroidPendingActions();

    const onWaterConfirmed = () => p.handleLogWaterCup();
    const onMedicationConfirmed = (ev: Event) => {
      const detail = (ev as CustomEvent<{ medicationId?: string; doseTime24?: string }>).detail;
      if (detail?.medicationId) {
        p.handleToggleMedication(detail.medicationId, detail.doseTime24 || undefined);
        return;
      }
      stopContinuousAlert();
      stopNativeAlerts();
      p.setActiveAudioAlert(null);
      p.setPersistentAlert(null);
      p.setAlarmRinging(false);
      p.emitCrossDeviceSync('alarm_dismiss', 'med_confirmed', undefined, { alertId: 'medication' });
    };
    const onQuickMedConfirm = () => {
      if (p.nextMedicationQuick) p.handleToggleMedication(p.nextMedicationQuick.id, p.nextMedicationQuick.doseTime24);
      else p.showToast('✓ لا توجد جرعات علاج متبقية اليوم');
    };
    const onAlertSnoozed = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        id?: string; emoji?: string; title?: string; sourceLabel?: string; category?: TaskSoundCategory;
        isHydration?: boolean; medicationId?: string; medicationDoseTime24?: string; minutes?: number; localOnly?: boolean;
      }>).detail;
      const alertItem: PersistentAlertItem = {
        id: detail?.id || `snooze_${Date.now()}`,
        emoji: detail?.emoji || '🔔',
        title: detail?.title || 'تذكير مؤجّل',
        sourceLabel: detail?.sourceLabel || 'إيقاع اليوم',
        time12h: formatNow12hInTimeZone(p.activeTimeZone, 'ar'),
        category: detail?.category || 'general',
        createdAtMs: Date.now(),
        durationMs: 60_000,
        isHydration: Boolean(detail?.isHydration),
        medicationId: detail?.medicationId || undefined,
        medicationDoseTime24: detail?.medicationDoseTime24 || undefined,
      };
      p.handleSnoozeAlert(alertItem, detail?.minutes || 5, { localOnly: Boolean(detail?.localOnly) });
    };
    const onNativeQuickActions = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail === 'string') processAndroidQuickActions(detail);
      else flushAndroidPendingActions();
    };
    const onAlertDismissed = (ev: Event) => {
      const detail = (ev as CustomEvent<{ remote?: boolean; snooze?: boolean }>).detail;
      if (detail?.remote) {
        stopContinuousAlert();
        stopSmartChargeCompleteAlert();
        p.setSmartChargeAudioActive(false);
        p.setActiveAudioAlert(null);
        p.setPersistentAlert(null);
        p.setAlarmRinging(false);
        return;
      }
      p.handleAcknowledgeAudioAlert();
    };
    const onCloudAlertTrigger = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        title?: string; body?: string; kind?: TaskSoundCategory; emoji?: string;
        privacyEmoji?: string; sourceLabel?: string; blockId?: string; occurrenceKey?: string; bypassSanctuary?: boolean; action?: string;
      }>).detail;
      p.setAlarmRinging(true);
      const badge = detail?.privacyEmoji || detail?.emoji || '🔔';
      p.triggerTaskAlert(badge, detail?.kind || 'general', {
        privacyEmoji: badge,
        displayTitle: detail?.title || 'تنبيه متزامن',
        description: detail?.body,
        sourceLabel: detail?.sourceLabel || 'مزامنة فورية بين أجهزتك',
        blockId: detail?.blockId,
        occurrenceKey: detail?.occurrenceKey,
        isRemoteSignal: true,
        bypassSanctuary: Boolean(detail?.bypassSanctuary || detail?.action === 'test_ring'),
      });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') flushAndroidPendingActions(); };

    window.addEventListener('dayrhythm:water-confirmed', onWaterConfirmed);
    window.addEventListener('dayrhythm:medication-confirmed', onMedicationConfirmed);
    window.addEventListener('dayrhythm:quick-med-confirm', onQuickMedConfirm);
    window.addEventListener('dayrhythm:alert-snoozed', onAlertSnoozed);
    window.addEventListener('dayrhythm:native-quick-actions', onNativeQuickActions);
    window.addEventListener('dayrhythm:alert-dismissed', onAlertDismissed);
    window.addEventListener('dayrhythm:cloud-alert-trigger', onCloudAlertTrigger);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('dayrhythm:water-confirmed', onWaterConfirmed);
      window.removeEventListener('dayrhythm:medication-confirmed', onMedicationConfirmed);
      window.removeEventListener('dayrhythm:quick-med-confirm', onQuickMedConfirm);
      window.removeEventListener('dayrhythm:alert-snoozed', onAlertSnoozed);
      window.removeEventListener('dayrhythm:native-quick-actions', onNativeQuickActions);
      window.removeEventListener('dayrhythm:alert-dismissed', onAlertDismissed);
      window.removeEventListener('dayrhythm:cloud-alert-trigger', onCloudAlertTrigger);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.activeTimeZone, p.emitCrossDeviceSync, p.handleAcknowledgeAudioAlert, p.handleLogWaterCup, p.handleSnoozeAlert, p.handleToggleMedication, p.nextMedicationQuick, p.showToast]);
}
