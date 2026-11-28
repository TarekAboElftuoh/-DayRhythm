import { DEFAULT_MEDICATIONS, sanitizeMedicationItem } from '../../firebase';
import type { MedicationItem } from '../../types/dayrhythm';

export const MEDS_STORAGE_KEY = 'dayrhythm_medications_v1';
export const MEDS_UPDATED_AT_STORAGE_KEY = 'dayrhythm_medications_updated_at_v1';
export const MEDS_DELETED_IDS_STORAGE_KEY = 'dayrhythm_deleted_medication_ids_v1';

export function loadDeletedMedicationIds(): string[] {
  try {
    const raw = localStorage.getItem(MEDS_DELETED_IDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .slice(-100);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function loadMedicationsUpdatedAt(): number {
  try {
    const raw = Number(localStorage.getItem(MEDS_UPDATED_AT_STORAGE_KEY) || 0);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  } catch {
    return 0;
  }
}

export function loadSavedMedications(): MedicationItem[] {
  const deletedSet = new Set(loadDeletedMedicationIds());
  try {
    const raw = localStorage.getItem(MEDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((m) => sanitizeMedicationItem(m))
          .filter((m) => !deletedSet.has(m.id));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MEDICATIONS.filter((m) => !deletedSet.has(m.id));
}

