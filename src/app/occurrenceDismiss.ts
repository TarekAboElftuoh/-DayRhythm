import { auth } from '../firebase';
import { dismissActiveAlarmInCloud } from '../services/cloudStateService';
import { drainRingingOccurrences, markOccurrencesDismissed } from '../engines/alarmOccurrence';
import { ACTIVE_UID_STORAGE_KEY } from '../utils/appHelpers';

/**
 * Dismiss ("تم") path shared by PC + mobile: take the occurrenceKeys of what is ringing right now
 * and persist them immediately, so this device (after a refresh) and the other device can never
 * ring that occurrence again.
 */
export function collectDismissedOccurrenceKeys(): string[] {
  const occurrenceKeys = drainRingingOccurrences();
  if (occurrenceKeys.length > 0) markOccurrencesDismissed(occurrenceKeys);
  return occurrenceKeys;
}

export function resolveActiveUid(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  try {
    const authUid = auth.currentUser?.uid;
    if (authUid) return authUid;
  } catch {
    // auth not initialised yet
  }
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(ACTIVE_UID_STORAGE_KEY) || '';
  } catch {
    // storage blocked
  }
  return '';
}

export function pushDismissedOccurrencesToCloud(params: {
  uid: string;
  alertId: string;
  clientId: string;
  occurrenceKeys: string[];
}): void {
  if (!params.uid || params.occurrenceKeys.length === 0) return;
  void dismissActiveAlarmInCloud(params.uid, params.alertId, params.clientId, params.occurrenceKeys);
}
