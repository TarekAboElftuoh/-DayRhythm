import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  persistentLocalCache,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  CreativeActivityItem,
  CreativeCadence,
  DynamicHabit,
  DynamicHabitAnchor,
  DynamicHabitStatus,
  LifeProfile,
  MedicationFastingPolicy,
  MedicationItem,
  MemoryCategory,
  MemoryItem,
  PersistedChatMessage,
  PeriodicRitualStatus,
  PhoneBatteryTelemetry,
  PomodoroState,
  QuietModeType,
  SleepStrategy,
  SoundRepeatMap,
  SoundRepeatSetting,
  SurfaceTheme,
  TaskSoundCategory,
  TravelState,
  UiPrefs,
  WorkspaceSyncSignal,
} from '../types/dayrhythm';
import { DEFAULT_LIFE_PROFILE, DEFAULT_MEMORIES } from '../engines/lifeRhythmEngine';
import { DEFAULT_SOUND_REPEATS } from '../engines/audioEngine';

import { clampInt, sanitizeWeekdayList } from './fieldSanitizers';

export function sanitizeMedicationId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  if (clean.length >= 1) return clean;
  return `med_${Date.now().toString(36)}`;
}

function sanitizeTimesList(raw: unknown, fallbackSingle?: string): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const s = String(item ?? '').trim();
      if (/^[0-2][0-9]:[0-5][0-9]$/.test(s) && !out.includes(s)) {
        out.push(s);
      }
      if (out.length >= 6) break;
    }
  }
  if (out.length === 0 && fallbackSingle && /^[0-2][0-9]:[0-5][0-9]$/.test(fallbackSingle)) {
    out.push(fallbackSingle);
  }
  return out;
}

function sanitizeDoseKeysList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? '').trim().slice(0, 16);
    if (s.length >= 1 && !out.includes(s)) out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

const VALID_MED_FASTING_POLICIES: readonly MedicationFastingPolicy[] = [
  'auto-nearest',
  'before-fajr',
  'after-maghrib',
  'skip',
  'unchanged',
];

export function sanitizeMedicationFastingPolicy(raw: unknown): MedicationFastingPolicy {
  return VALID_MED_FASTING_POLICIES.includes(raw as MedicationFastingPolicy)
    ? (raw as MedicationFastingPolicy)
    : 'auto-nearest';
}

export function sanitizeMedicationItem(raw: Partial<MedicationItem>): MedicationItem {
  const id = sanitizeMedicationId(raw.id || `med_${Date.now().toString(36)}`);
  const name = String(raw.name ?? '').trim().slice(0, 80) || 'علاج / مكمل';
  const rawTime = String(raw.time24 ?? '').trim();
  const safeSingle = /^[0-2][0-9]:[0-5][0-9]$/.test(rawTime) ? rawTime : '';
  const times24 = sanitizeTimesList(raw.times24, safeSingle);
  const time24 = times24[0] ?? safeSingle;
  const daysOfWeek = sanitizeWeekdayList(raw.daysOfWeek, []);
  const fastingPolicy = sanitizeMedicationFastingPolicy(raw.fastingPolicy);
  const takenDosesToday = sanitizeDoseKeysList(raw.takenDosesToday);
  const doseNote = String(raw.doseNote ?? '').trim().slice(0, 120);
  const rawDateKey = String(raw.takenDateKey ?? '').trim();
  const takenDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawDateKey) ? rawDateKey : '';
  const calendarEventId = String(raw.calendarEventId ?? '').trim().slice(0, 128);
  const rawCourseEnd = String(raw.courseEndDate ?? '').trim();
  const courseEndDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawCourseEnd) ? rawCourseEnd : '';
  const remainingDoses =
    typeof raw.remainingDoses === 'number' && Number.isFinite(raw.remainingDoses)
      ? clampInt(raw.remainingDoses, -1, 500, -1)
      : -1;
  const totalDoses =
    typeof raw.totalDoses === 'number' && Number.isFinite(raw.totalDoses)
      ? clampInt(raw.totalDoses, -1, 500, -1)
      : -1;
  const refillAlertDays = clampInt(raw.refillAlertDays, 1, 14, 3);
  const takenDatesSet = new Set<string>();
  if (Array.isArray(raw.takenDates)) {
    for (const d of raw.takenDates) {
      const s = String(d ?? '').trim();
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) {
        takenDatesSet.add(s);
      }
    }
  }
  if (takenDateKey) {
    takenDatesSet.add(takenDateKey);
  }
  // Rolling 7-day window: keep only dates within the last 7 days so day 8 drops automatically
  const cutoffDate = new Date(Date.now() - 6 * 86_400_000);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);
  const takenDates = Array.from(takenDatesSet)
    .filter((d) => d >= cutoffIso)
    .sort()
    .slice(-7);
  return {
    id,
    name,
    time24,
    times24,
    daysOfWeek,
    fastingPolicy,
    takenDosesToday,
    doseNote,
    takenDateKey,
    calendarEventId,
    courseEndDate,
    remainingDoses,
    totalDoses,
    refillAlertDays,
    takenDates,
  };
}

