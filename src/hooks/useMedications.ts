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
  MedicationItem,
} from '../types/dayrhythm';

export const MEDS_STORAGE_KEY = 'dayrhythm_medications_v1';

export function loadSavedMedications(): MedicationItem[] {
  try {
    const raw = localStorage.getItem(MEDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => sanitizeMedicationItem(m));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MEDICATIONS;
}

export interface UseMedicationActionsOptions {
  medications: MedicationItem[];
  setMedications: Dispatch<SetStateAction<MedicationItem[]>>;
  activeTimeZone: string;
  showToast: (msg: string) => void;
  pushToTasksVaultImmediately: (patch: { medications: MedicationItem[] }) => Promise<unknown> | void;
  pushFullCloudBackupImmediately: () => Promise<unknown> | void;
  getEffectiveUid: () => string;
  clientIdRef: MutableRefObject<string>;
  onMedicationConfirmedAlertCleanup: (medicationId: string, doseTime24?: string) => void;
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
  triggerHapticWaveform,
}: UseMedicationActionsOptions) {
  const lowStockProactiveNotifiedKeyRef = useRef<string>('');

  const persistAndSyncMedications = useCallback(
    (next: MedicationItem[]) => {
      void pushToTasksVaultImmediately({ medications: next });
      void pushFullCloudBackupImmediately();
      try {
        localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
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

  const handleToggleMedication = useCallback(
    (id: string, doseTime24?: string) => {
      const target = medications.find((m) => m.id === id);
      if (!target) return;

      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const allTimes =
        target.times24 && target.times24.length > 0
          ? target.times24
          : target.time24
            ? [target.time24]
            : [];
      let updated: MedicationItem;
      let deltaDoses = 0;

      if (doseTime24 && allTimes.length > 1) {
        const currentTaken =
          target.takenDateKey === todayIso ? target.takenDosesToday ?? [] : [];
        const exists = currentTaken.includes(doseTime24);
        const nextTaken = exists
          ? currentTaken.filter((t) => t !== doseTime24)
          : [...currentTaken, doseTime24];
        deltaDoses = exists ? 1 : -1;
        updated = {
          ...target,
          takenDosesToday: nextTaken,
          takenDateKey: nextTaken.length > 0 ? todayIso : '',
        };
      } else {
        const isFullyTaken =
          target.takenDateKey === todayIso &&
          (allTimes.length <= 1 ||
            allTimes.every((t) => (target.takenDosesToday ?? []).includes(t)));
        const currentCount =
          target.takenDateKey === todayIso
            ? allTimes.length > 1
              ? (target.takenDosesToday ?? []).length
              : 1
            : 0;
        const totalToday = Math.max(1, allTimes.length);
        deltaDoses = isFullyTaken ? currentCount : -(totalToday - currentCount);
        updated = {
          ...target,
          takenDateKey: isFullyTaken ? '' : todayIso,
          takenDosesToday: isFullyTaken ? [] : allTimes,
        };
      }

      const isFullyTakenAfter =
        updated.takenDateKey === todayIso &&
        (allTimes.length <= 1 ||
          allTimes.every((t) => (updated.takenDosesToday ?? []).includes(t)));
      const cutoff31Iso = getDateIsoInTimeZone(
        activeTimeZone,
        new Date(Date.now() - 30 * 86_400_000)
      );
      const existingDates = Array.isArray(target.takenDates) ? target.takenDates : [];
      const nextTakenDates = (
        isFullyTakenAfter
          ? Array.from(new Set([...existingDates, todayIso]))
          : existingDates.filter((d) => d !== todayIso)
      )
        .filter((d) => d >= cutoff31Iso)
        .sort()
        .slice(-31);
      updated = { ...updated, takenDates: nextTakenDates };

      let lowStockMsg = '';
      if (typeof target.remainingDoses === 'number' && target.remainingDoses >= 0) {
        const maxCap =
          typeof target.totalDoses === 'number' && target.totalDoses > 0
            ? Math.max(target.totalDoses, target.remainingDoses)
            : 500;
        const nextRem = Math.max(0, Math.min(maxCap, target.remainingDoses + deltaDoses));
        updated = { ...updated, remainingDoses: nextRem };
        const alertLeadDays = Math.max(1, Math.min(14, target.refillAlertDays ?? 3));
        const daysLeft = computeMedicationDaysLeft(nextRem, allTimes.length, target.daysOfWeek);
        if (deltaDoses < 0 && daysLeft <= alertLeadDays) {
          const roundedDays = Math.ceil(daysLeft);
          lowStockMsg =
            nextRem === 0
              ? `⚠️ نفدت جرعات «${target.name}» — حان وقت شراء عبوة جديدة`
              : `💊 تنبيه مخزون: متبقٍ ${nextRem} جرعة من «${target.name}» (تكفي ~${roundedDays} ${roundedDays === 1 ? 'يوم' : 'أيام'}) — جهّز شراء جرعات جديدة`;
        }
      }

      onMedicationConfirmedAlertCleanup(id, doseTime24);
      const effectiveUid = getEffectiveUid();
      if (effectiveUid) {
        void broadcastAlertDismiss(effectiveUid, clientIdRef.current, id, 'medication_confirmed');
        void dismissActiveAlarmInCloud(effectiveUid, 'all', clientIdRef.current);
      }

      setMedications((prev) => {
        const next = prev.map((m) => (m.id === id ? updated : m));
        persistAndSyncMedications(next);
        return next;
      });

      if (lowStockMsg) {
        showToast(lowStockMsg);
      } else if (!doseTime24 && isFullyTakenAfter) {
        const remSuffix =
          typeof updated.remainingDoses === 'number' && updated.remainingDoses >= 0
            ? ` (متبقٍ ${updated.remainingDoses})`
            : '';
        showToast(`تم تسجيل «${target.name}» لليوم${remSuffix}`);
      }
      triggerHapticWaveform('water_cup');
    },
    [
      activeTimeZone,
      clientIdRef,
      getEffectiveUid,
      medications,
      onMedicationConfirmedAlertCleanup,
      persistAndSyncMedications,
      setMedications,
      showToast,
      triggerHapticWaveform,
    ]
  );

  const handleToggleMedicationDate = useCallback(
    (id: string, dateIso: string) => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const cutoff31Iso = getDateIsoInTimeZone(
        activeTimeZone,
        new Date(Date.now() - 30 * 86_400_000)
      );

      setMedications((prev) => {
        const next = prev.map((m) => {
          if (m.id !== id) return m;
          const allTimes =
            m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
          const existingDates = Array.isArray(m.takenDates) ? m.takenDates : [];
          const hasDate = existingDates.includes(dateIso) || (dateIso === todayIso && m.takenDateKey === todayIso);
          const nextDates = (
            hasDate
              ? existingDates.filter((d) => d !== dateIso)
              : Array.from(new Set([...existingDates, dateIso]))
          )
            .filter((d) => d >= cutoff31Iso)
            .sort()
            .slice(-31);

          const dosesPerDay = Math.max(1, allTimes.length);
          let nextRemaining = m.remainingDoses;
          if (typeof m.remainingDoses === 'number' && m.remainingDoses >= 0) {
            const maxCap =
              typeof m.totalDoses === 'number' && m.totalDoses > 0
                ? Math.max(m.totalDoses, m.remainingDoses)
                : 500;
            const delta = hasDate ? dosesPerDay : -dosesPerDay;
            nextRemaining = Math.max(0, Math.min(maxCap, m.remainingDoses + delta));
          }

          return {
            ...m,
            takenDates: nextDates,
            remainingDoses: nextRemaining,
            ...(dateIso === todayIso
              ? {
                  takenDateKey: hasDate ? '' : todayIso,
                  takenDosesToday: hasDate ? [] : allTimes,
                }
              : {}),
          };
        });
        persistAndSyncMedications(next);
        return next;
      });
      triggerHapticWaveform('water_cup');
    },
    [activeTimeZone, persistAndSyncMedications, setMedications, triggerHapticWaveform]
  );

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
      setMedications((prev) => {
        const next = prev.filter((m) => m.id !== id);
        persistAndSyncMedications(next);
        return next;
      });
      showToast('تم حذف العلاج من القائمة اليومية');
    },
    [persistAndSyncMedications, setMedications, showToast]
  );

  const handleExecuteMedicationActions = useCallback(
    async (
      medActions: MedicationActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<MedicationExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const results: MedicationExecutionResult[] = [];

      setMedications((prev) => {
        let next = [...prev];
        for (const act of medActions) {
          const op = act.operation;
          const actTimes =
            act.times24 && act.times24.length > 0
              ? act.times24
              : act.time24
                ? [act.time24]
                : undefined;

          if (op === 'remove') {
            const needle = act.name.trim().toLowerCase();
            const target =
              next.find(
                (m) =>
                  (act.medicationId && m.id === act.medicationId) ||
                  m.name.trim().toLowerCase() === needle
              ) ??
              (needle.length >= 2
                ? next.find(
                    (m) =>
                      m.name.trim().toLowerCase().includes(needle) ||
                      needle.includes(m.name.trim().toLowerCase())
                  )
                : undefined);
            if (target) {
              next = next.filter((m) => m.id !== target.id);
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
              showToast(`🗑️ تم حذف «${target.name}» من قائمة العلاجات والمكملات`);
            }
          } else if (op === 'mark_taken') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.includes(act.name.trim())
            );
            if (target) {
              const allTimes =
                target.times24 && target.times24.length > 0
                  ? target.times24
                  : target.time24
                    ? [target.time24]
                    : [];
              const alreadyTakenToday = target.takenDateKey === todayIso;
              const dosesCount = Math.max(1, allTimes.length);
              const nextRem =
                !alreadyTakenToday &&
                typeof target.remainingDoses === 'number' &&
                target.remainingDoses >= 0
                  ? Math.max(0, target.remainingDoses - dosesCount)
                  : target.remainingDoses;
              const updated: MedicationItem = {
                ...target,
                takenDateKey: todayIso,
                takenDosesToday: allTimes,
                takenDates: Array.from(new Set([...(target.takenDates ?? []), todayIso]))
                  .sort()
                  .slice(-31),
                remainingDoses: nextRem,
              };
              next = next.map((m) => (m.id === target.id ? updated : m));
              results.push({ name: target.name, operation: 'mark_taken', status: 'taken', id: target.id });
            }
          } else if (op === 'update') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.trim() === act.name.trim()
            );
            if (target) {
              const updated = sanitizeMedicationItem({
                ...target,
                name: act.name || target.name,
                time24: actTimes?.[0] ?? act.time24 ?? target.time24,
                times24: actTimes ?? target.times24,
                daysOfWeek: act.daysOfWeek ?? target.daysOfWeek,
                doseNote: act.doseNote ?? target.doseNote,
                courseEndDate: act.courseEndDate ?? target.courseEndDate,
                remainingDoses:
                  typeof act.remainingDoses === 'number'
                    ? act.remainingDoses
                    : target.remainingDoses,
                totalDoses:
                  typeof act.totalDoses === 'number'
                    ? act.totalDoses
                    : target.totalDoses,
                refillAlertDays:
                  typeof act.refillAlertDays === 'number'
                    ? act.refillAlertDays
                    : target.refillAlertDays,
              });
              next = next.map((m) => (m.id === target.id ? updated : m));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            }
          } else {
            const existing = next.find((m) => m.name.trim() === act.name.trim());
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const updated = sanitizeMedicationItem({
                ...existing,
                time24: actTimes?.[0] ?? act.time24 ?? existing.time24,
                times24: actTimes ?? existing.times24,
                daysOfWeek: act.daysOfWeek ?? existing.daysOfWeek,
                doseNote: act.doseNote ?? existing.doseNote,
                calendarEventId: calId || existing.calendarEventId,
                courseEndDate: act.courseEndDate ?? existing.courseEndDate,
                remainingDoses:
                  typeof act.remainingDoses === 'number'
                    ? act.remainingDoses
                    : existing.remainingDoses,
                totalDoses:
                  typeof act.totalDoses === 'number'
                    ? act.totalDoses
                    : existing.totalDoses,
                refillAlertDays:
                  typeof act.refillAlertDays === 'number'
                    ? act.refillAlertDays
                    : existing.refillAlertDays,
              });
              next = next.map((m) => (m.id === existing.id ? updated : m));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const rem =
                typeof act.remainingDoses === 'number' && act.remainingDoses >= 0
                  ? act.remainingDoses
                  : -1;
              const tot =
                typeof act.totalDoses === 'number' && act.totalDoses >= 0
                  ? act.totalDoses
                  : rem;
              const created = sanitizeMedicationItem({
                id: sanitizeMedicationId(
                  act.medicationId || `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                name: act.name,
                time24: actTimes?.[0] ?? act.time24 ?? '',
                times24: actTimes ?? [],
                daysOfWeek: act.daysOfWeek ?? [],
                doseNote: act.doseNote ?? '',
                takenDateKey: '',
                takenDosesToday: [],
                takenDates: [],
                calendarEventId: calId,
                courseEndDate: act.courseEndDate ?? '',
                remainingDoses: rem,
                totalDoses: tot,
                refillAlertDays:
                  typeof act.refillAlertDays === 'number' ? act.refillAlertDays : 3,
              });
              next = [...next, created];
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        persistAndSyncMedications(next);
        return next;
      });

      return results;
    },
    [activeTimeZone, persistAndSyncMedications, setMedications, showToast]
  );

  return {
    handleToggleMedication,
    handleToggleMedicationDate,
    handleRefillMedication,
    handleAddMedication,
    handleDeleteMedication,
    handleExecuteMedicationActions,
  };
}
