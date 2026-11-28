import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { sanitizeMedicationId, sanitizeMedicationItem } from '../../firebase';
import { getDateIsoInTimeZone } from '../../engines/prayerEngine';
import type { MedicationActionProposal, MedicationExecutionResult, MedicationItem } from '../../types/dayrhythm';

export function useMedicationProposalExecutor(params: {
  activeTimeZone: string;
  setMedications: Dispatch<SetStateAction<MedicationItem[]>>;
  persistAndSyncMedications: (next: MedicationItem[], newlyDeletedIds?: string[]) => void;
  onDeleteLinkedCalendarEvent?: (calendarEventId: string) => Promise<void> | void;
  showToast: (msg: string) => void;
}) {
  const { activeTimeZone, setMedications, persistAndSyncMedications, onDeleteLinkedCalendarEvent, showToast } = params;

  const handleExecuteMedicationActions = useCallback(
    async (
      medActions: MedicationActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<MedicationExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const results: MedicationExecutionResult[] = [];
      const removedIds: string[] = [];
      const calendarIdsToDelete: string[] = [];

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
              removedIds.push(target.id);
              if (target.calendarEventId) {
                calendarIdsToDelete.push(target.calendarEventId);
              }
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
                  .slice(-14),
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
                fastingPolicy: act.fastingPolicy ?? target.fastingPolicy,
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
                fastingPolicy: act.fastingPolicy ?? existing.fastingPolicy,
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
                fastingPolicy: act.fastingPolicy ?? 'auto-nearest',
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
        persistAndSyncMedications(next, removedIds.length > 0 ? removedIds : undefined);
        return next;
      });

      for (const calId of calendarIdsToDelete) {
        void onDeleteLinkedCalendarEvent?.(calId);
      }

      return results;
    },
    [activeTimeZone, onDeleteLinkedCalendarEvent, persistAndSyncMedications, setMedications, showToast]
  );


  return handleExecuteMedicationActions;
}
