import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getDateIsoInTimeZone } from '../../engines/prayerEngine';
import { computeMedicationDaysLeft } from '../../engines/lifeRhythmEngine';
import { broadcastAlertDismiss, dismissActiveAlarmInCloud } from '../../services/cloudStateService';
import type { MedicationItem } from '../../types/dayrhythm';

export function useMedicationDoseActions(params: {
  activeTimeZone: string;
  medications: MedicationItem[];
  setMedications: Dispatch<SetStateAction<MedicationItem[]>>;
  persistAndSyncMedications: (next: MedicationItem[], newlyDeletedIds?: string[]) => void;
  getEffectiveUid: () => string;
  clientIdRef: MutableRefObject<string>;
  onMedicationConfirmedAlertCleanup: (medicationId: string, doseTime24?: string, fromRemote?: boolean) => void;
  triggerHapticWaveform: (pattern: 'water_cup' | 'shake_undo') => void;
  showToast: (msg: string) => void;
}) {
  const {
    activeTimeZone, medications, setMedications, persistAndSyncMedications,
    getEffectiveUid, clientIdRef, onMedicationConfirmedAlertCleanup,
    triggerHapticWaveform, showToast,
  } = params;

  const handleToggleMedication = useCallback(
    (id: string, doseTime24?: string, options?: { fromRemote?: boolean }) => {
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
      const cutoff14Iso = getDateIsoInTimeZone(
        activeTimeZone,
        new Date(Date.now() - 13 * 86_400_000)
      );
      const existingDates = Array.isArray(target.takenDates) ? target.takenDates : [];
      const nextTakenDates = (
        isFullyTakenAfter
          ? Array.from(new Set([...existingDates, todayIso]))
          : existingDates.filter((d) => d !== todayIso)
      )
        .filter((d) => d >= cutoff14Iso)
        .sort()
        .slice(-14);
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

      onMedicationConfirmedAlertCleanup(id, doseTime24, Boolean(options?.fromRemote));
      if (!options?.fromRemote) {
        const effectiveUid = getEffectiveUid();
        if (effectiveUid) {
          void dismissActiveAlarmInCloud(effectiveUid, 'all', clientIdRef.current);
        }
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
      const cutoff14Iso = getDateIsoInTimeZone(
        activeTimeZone,
        new Date(Date.now() - 13 * 86_400_000)
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
            .filter((d) => d >= cutoff14Iso)
            .sort()
            .slice(-14);

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


  return { handleToggleMedication, handleToggleMedicationDate };
}
