import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  DEFAULT_MEDICATIONS,
  sanitizeMedicationId,
  sanitizeMedicationItem,
} from '../firebase';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { computeMedicationDaysLeft } from '../engines/lifeRhythmEngine';
import {
  broadcastAlertDismiss,
  dismissActiveAlarmInCloud,
} from '../services/cloudStateService';
import type {
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationFastingPolicy,
  MedicationItem,
} from '../types/dayrhythm';

import { loadDeletedMedicationIds, loadMedicationsUpdatedAt, loadSavedMedications, MEDS_DELETED_IDS_STORAGE_KEY, MEDS_STORAGE_KEY, MEDS_UPDATED_AT_STORAGE_KEY } from './medications/storage';
import { useMedicationDoseActions } from './medications/doseActions';
import { useMedicationProposalExecutor } from './medications/proposalHandler';
export { MEDS_STORAGE_KEY, MEDS_UPDATED_AT_STORAGE_KEY, MEDS_DELETED_IDS_STORAGE_KEY, loadDeletedMedicationIds, loadMedicationsUpdatedAt, loadSavedMedications };

export interface UseMedicationActionsOptions {
  medications: MedicationItem[];
  setMedications: Dispatch<SetStateAction<MedicationItem[]>>;
  activeTimeZone: string;
  showToast: (msg: string) => void;
  pushToTasksVaultImmediately: (patch: {
    medications: MedicationItem[];
    medicationsUpdatedAt?: number;
    deletedMedicationIds?: string[];
  }) => Promise<unknown> | void;
  pushFullCloudBackupImmediately: () => Promise<unknown> | void;
  getEffectiveUid: () => string;
  clientIdRef: MutableRefObject<string>;
  onMedicationConfirmedAlertCleanup: (medicationId: string, doseTime24?: string, fromRemote?: boolean) => void;
  onDeleteLinkedCalendarEvent?: (calendarEventId: string) => Promise<void> | void;
  triggerHapticWaveform: (pattern: 'water_cup' | 'shake_undo') => void;
}

/**
 * Encapsulates medication state mutations, stock tracking, 7-day adherence strip,
 * proactive low-stock alerts, and cloud/local persistence.
 */
export function useMedicationActions({
  medications,
  setMedications,
  activeTimeZone,
  showToast,
  pushToTasksVaultImmediately,
  pushFullCloudBackupImmediately,
  getEffectiveUid,
  clientIdRef,
  onMedicationConfirmedAlertCleanup,
  onDeleteLinkedCalendarEvent,
  triggerHapticWaveform,
}: UseMedicationActionsOptions) {
  const lowStockProactiveNotifiedKeyRef = useRef<string>('');

  const persistAndSyncMedications = useCallback(
    (next: MedicationItem[], newlyDeletedIds?: string[]) => {
      const nowMs = Date.now();
      const mergedDeletedIds = Array.from(
        new Set([...loadDeletedMedicationIds(), ...(newlyDeletedIds ?? [])])
      ).slice(-100);
      try {
        localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(MEDS_UPDATED_AT_STORAGE_KEY, String(nowMs));
        localStorage.setItem(MEDS_DELETED_IDS_STORAGE_KEY, JSON.stringify(mergedDeletedIds));
      } catch {
        // ignore storage errors
      }
      void pushToTasksVaultImmediately({
        medications: next,
        medicationsUpdatedAt: nowMs,
        deletedMedicationIds: mergedDeletedIds,
      });
      void pushFullCloudBackupImmediately();
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  // Proactive 3-Day Low-Stock Medication Reminder (notifies once per day when any tracked medication is <= 3 days left)
  useEffect(() => {
    if (medications.length === 0) return;
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const lowMeds = medications.filter((m) => {
      if (typeof m.remainingDoses !== 'number' || m.remainingDoses < 0) return false;
      const dosesPerScheduledDay = Math.max(
        1,
        m.times24 && m.times24.length > 0 ? m.times24.length : 1
      );
      const daysPerWeek = m.daysOfWeek && m.daysOfWeek.length > 0 ? m.daysOfWeek.length : 7;
      const dailyRate = Math.max(0.14, (dosesPerScheduledDay * daysPerWeek) / 7);
      const alertLeadDays = Math.max(1, Math.min(14, m.refillAlertDays ?? 3));
      return m.remainingDoses / dailyRate <= alertLeadDays;
    });

    if (lowMeds.length === 0) return;
    const dedupKey = `${todayIso}:${lowMeds.map((m) => `${m.id}=${m.remainingDoses}`).join(',')}`;
    if (lowStockProactiveNotifiedKeyRef.current === dedupKey) return;
    lowStockProactiveNotifiedKeyRef.current = dedupKey;

    const namesSummary = lowMeds
      .slice(0, 2)
      .map((m) => `«${m.name}» (${m.remainingDoses} جرعة)`)
      .join(' و');
    const extraCount = lowMeds.length > 2 ? ` +${lowMeds.length - 2}` : '';

    showToast(
      `💊 تنبيه استباقي: مخزون ${namesSummary}${extraCount} قارب على الانتهاء (خلال 3 أيام) — استخدم «إضافة شراء جديد»`
    );
  }, [activeTimeZone, medications, showToast]);


  const { handleToggleMedication, handleToggleMedicationDate } = useMedicationDoseActions({
    activeTimeZone, medications, setMedications, persistAndSyncMedications,
    getEffectiveUid, clientIdRef, onMedicationConfirmedAlertCleanup,
    triggerHapticWaveform, showToast,
  });

  const handleRefillMedication = useCallback(
    (id: string, newDoses: number, refillAlertDays?: number) => {
      const target = medications.find((m) => m.id === id);
      if (!target) return;

      const clampedDoses = Math.max(0, Math.min(500, Math.round(newDoses)));
      const nextAlertDays =
        typeof refillAlertDays === 'number'
          ? Math.max(1, Math.min(14, Math.round(refillAlertDays)))
          : target.refillAlertDays ?? 3;
      const nextTotal = Math.max(clampedDoses, target.totalDoses ?? clampedDoses);
      const updated = sanitizeMedicationItem({
        ...target,
        remainingDoses: clampedDoses,
        totalDoses: nextTotal,
        refillAlertDays: nextAlertDays,
      });

      setMedications((prev) => {
        const next = prev.map((m) => (m.id === id ? updated : m));
        persistAndSyncMedications(next);
        return next;
      });
      showToast(`💊 تم تحديث مخزون «${target.name}» إلى ${clampedDoses} جرعة`);
    },
    [medications, persistAndSyncMedications, setMedications, showToast]
  );

  const handleAddMedication = useCallback(
    (input: {
      name: string;
      time24?: string;
      times24?: string[];
      daysOfWeek?: number[];
      fastingPolicy?: MedicationFastingPolicy;
      doseNote?: string;
      calendarEventId?: string;
      courseEndDate?: string;
      remainingDoses?: number;
      totalDoses?: number;
      refillAlertDays?: number;
    }) => {
      const cleanTimes =
        input.times24 && input.times24.length > 0
          ? input.times24
          : input.time24
            ? [input.time24]
            : [];
      const rem =
        typeof input.remainingDoses === 'number' && input.remainingDoses >= 0
          ? input.remainingDoses
          : -1;
      const tot =
        typeof input.totalDoses === 'number' && input.totalDoses >= 0
          ? input.totalDoses
          : rem;
      const med = sanitizeMedicationItem({
        id: sanitizeMedicationId(`med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        name: input.name,
        time24: cleanTimes[0] ?? '',
        times24: cleanTimes,
        daysOfWeek: input.daysOfWeek ?? [],
        fastingPolicy: input.fastingPolicy ?? 'auto-nearest',
        doseNote: input.doseNote ?? '',
        takenDateKey: '',
        takenDosesToday: [],
        takenDates: [],
        calendarEventId: input.calendarEventId ?? '',
        courseEndDate: input.courseEndDate ?? '',
        remainingDoses: rem,
        totalDoses: tot,
        refillAlertDays:
          typeof input.refillAlertDays === 'number'
            ? Math.max(1, Math.min(14, Math.round(input.refillAlertDays)))
            : 3,
      });

      setMedications((prev) => {
        const next = [...prev, med];
        persistAndSyncMedications(next);
        return next;
      });
      showToast(`💊 تمت إضافة «${med.name}» إلى قائمة العلاجات والمكملات`);
      return med;
    },
    [persistAndSyncMedications, setMedications, showToast]
  );

  const handleDeleteMedication = useCallback(
    (id: string) => {
      const existing = medications.find((m) => m.id === id);
      if (existing?.calendarEventId) {
        void onDeleteLinkedCalendarEvent?.(existing.calendarEventId);
      }
      setMedications((prev) => {
        const next = prev.filter((m) => m.id !== id);
        persistAndSyncMedications(next, [id]);
        return next;
      });
      showToast('تم حذف العلاج من القائمة اليومية');
    },
    [medications, onDeleteLinkedCalendarEvent, persistAndSyncMedications, setMedications, showToast]
  );


  const handleExecuteMedicationActions = useMedicationProposalExecutor({
    activeTimeZone, setMedications, persistAndSyncMedications,
    onDeleteLinkedCalendarEvent, showToast,
  });

  return {
    handleToggleMedication,
    handleToggleMedicationDate,
    handleRefillMedication,
    handleAddMedication,
    handleDeleteMedication,
    handleExecuteMedicationActions,
  };
}

