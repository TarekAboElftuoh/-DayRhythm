import type { LiveAlertsLeadMinutes } from './typesAndDefaults';
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

import { DEFAULT_DEVICE_SETTINGS, VALID_LEAD_MINUTES, VALID_QUIET_MODES, VALID_SLEEP_STRATEGIES, VALID_THEMES, type OnePlusDeviceSettings } from './typesAndDefaults';
import { clampFloat, clampInt, sanitizeSoundRepeats, sanitizeWeekdayList } from './fieldSanitizers';

export function sanitizeLifeProfile(
  raw: Partial<LifeProfile> | undefined
): LifeProfile {
  const rawStart = String(raw?.workStart24 ?? DEFAULT_LIFE_PROFILE.workStart24).trim();
  const workStart24 = /^[0-2][0-9]:[0-5][0-9]$/.test(rawStart) ? rawStart : '';
  const rawEnd = String(raw?.workEnd24 ?? DEFAULT_LIFE_PROFILE.workEnd24).trim();
  const workEnd24 = /^[0-2][0-9]:[0-5][0-9]$/.test(rawEnd) ? rawEnd : '';

  const strategyRaw = raw?.sleepStrategy;
  const sleepStrategy: SleepStrategy = VALID_SLEEP_STRATEGIES.includes(
    strategyRaw as SleepStrategy
  )
    ? (strategyRaw as SleepStrategy)
    : DEFAULT_LIFE_PROFILE.sleepStrategy;

  const cityName =
    String(raw?.currentCityName ?? DEFAULT_LIFE_PROFILE.currentCityName)
      .trim()
      .slice(0, 100) || DEFAULT_LIFE_PROFILE.currentCityName;
  const timeZone =
    String(raw?.currentTimeZone ?? DEFAULT_LIFE_PROFILE.currentTimeZone)
      .trim()
      .slice(0, 64) || DEFAULT_LIFE_PROFILE.currentTimeZone;

  const rawOneTimeDate = String(raw?.oneTimeSilenceDateKey ?? '').trim();
  const oneTimeSilenceDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawOneTimeDate)
    ? rawOneTimeDate
    : '';
  const rawLowEnergyDate = String(raw?.lowEnergyDateKey ?? '').trim();
  const lowEnergyDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawLowEnergyDate)
    ? rawLowEnergyDate
    : '';

  return {
    weightKg: clampFloat(raw?.weightKg, 30, 250, DEFAULT_LIFE_PROFILE.weightKg),
    heightCm: !raw?.heightCm
      ? DEFAULT_LIFE_PROFILE.heightCm
      : clampFloat(raw?.heightCm, 100, 240, DEFAULT_LIFE_PROFILE.heightCm),
    cupSizeMl: clampInt(raw?.cupSizeMl, 50, 2000, DEFAULT_LIFE_PROFILE.cupSizeMl),
    fastingDays: sanitizeWeekdayList(raw?.fastingDays, DEFAULT_LIFE_PROFILE.fastingDays),
    suhoorLeadMinutes: clampInt(
      raw?.suhoorLeadMinutes,
      10,
      180,
      DEFAULT_LIFE_PROFILE.suhoorLeadMinutes
    ),
    sleepTargetMinutes: clampInt(
      raw?.sleepTargetMinutes,
      180,
      720,
      DEFAULT_LIFE_PROFILE.sleepTargetMinutes
    ),
    sleepStrategy,
    sleepDebtMinutes: clampInt(
      raw?.sleepDebtMinutes,
      0,
      480,
      DEFAULT_LIFE_PROFILE.sleepDebtMinutes
    ),
    sleepDebtLogDateKey: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(
      String(raw?.sleepDebtLogDateKey ?? '').trim()
    )
      ? String(raw?.sleepDebtLogDateKey ?? '').trim()
      : '',
    adhanLeadMinutes: clampInt(
      raw?.adhanLeadMinutes,
      0,
      30,
      DEFAULT_LIFE_PROFILE.adhanLeadMinutes
    ),
    prayerSilenceMinutes: clampInt(
      raw?.prayerSilenceMinutes,
      5,
      90,
      DEFAULT_LIFE_PROFILE.prayerSilenceMinutes
    ),
    fajrSilenceMinutes: clampInt(
      raw?.fajrSilenceMinutes,
      5,
      90,
      DEFAULT_LIFE_PROFILE.fajrSilenceMinutes
    ),
    oneTimeSilenceMinutes: clampInt(raw?.oneTimeSilenceMinutes, 0, 120, 0),
    oneTimeSilenceDateKey,
    lowEnergyDateKey,
    defaultSnoozeMinutes:
      raw?.defaultSnoozeMinutes === 10 || raw?.defaultSnoozeMinutes === 15
        ? raw.defaultSnoozeMinutes
        : 5,
    enableWakeAlarm:
      typeof raw?.enableWakeAlarm === 'boolean'
        ? raw.enableWakeAlarm
        : DEFAULT_LIFE_PROFILE.enableWakeAlarm,
    soundRepeats: sanitizeSoundRepeats(raw?.soundRepeats),
    careerTrack: String(raw?.careerTrack ?? DEFAULT_LIFE_PROFILE.careerTrack)
      .trim()
      .slice(0, 120),
    workEnabled:
      typeof raw?.workEnabled === 'boolean'
        ? raw.workEnabled
        : DEFAULT_LIFE_PROFILE.workEnabled,
    workStart24,
    workEnd24,
    workDays: sanitizeWeekdayList(raw?.workDays, DEFAULT_LIFE_PROFILE.workDays),
    autoLocationSync:
      typeof raw?.autoLocationSync === 'boolean'
        ? raw.autoLocationSync
        : DEFAULT_LIFE_PROFILE.autoLocationSync,
    currentCityName: cityName,
    currentTimeZone: timeZone,
    currentLat: clampFloat(raw?.currentLat, -90, 90, DEFAULT_LIFE_PROFILE.currentLat),
    currentLng: clampFloat(raw?.currentLng, -180, 180, DEFAULT_LIFE_PROFILE.currentLng),
    priorityOrderAr: String(raw?.priorityOrderAr ?? DEFAULT_LIFE_PROFILE.priorityOrderAr)
      .trim()
      .slice(0, 260),
    personalNotes: String(raw?.personalNotes ?? DEFAULT_LIFE_PROFILE.personalNotes)
      .trim()
      .slice(0, 600),
  };
}

export function sanitizeDeviceSettings(
  raw: Partial<OnePlusDeviceSettings> | undefined
): OnePlusDeviceSettings {
  const leadRaw = raw?.liveAlertsLeadMinutes;
  const lead: LiveAlertsLeadMinutes = VALID_LEAD_MINUTES.includes(
    leadRaw as LiveAlertsLeadMinutes
  )
    ? (leadRaw as LiveAlertsLeadMinutes)
    : DEFAULT_DEVICE_SETTINGS.liveAlertsLeadMinutes;

  return {
    alertSliderLinked:
      typeof raw?.alertSliderLinked === 'boolean'
        ? raw.alertSliderLinked
        : DEFAULT_DEVICE_SETTINGS.alertSliderLinked,
    liveAlertsEnabled:
      typeof raw?.liveAlertsEnabled === 'boolean'
        ? raw.liveAlertsEnabled
        : DEFAULT_DEVICE_SETTINGS.liveAlertsEnabled,
    liveAlertsLeadMinutes: lead,
    liveAlertsAlwaysOn:
      typeof raw?.liveAlertsAlwaysOn === 'boolean'
        ? raw.liveAlertsAlwaysOn
        : DEFAULT_DEVICE_SETTINGS.liveAlertsAlwaysOn ?? false,
    liveAlertsShowCharging:
      typeof raw?.liveAlertsShowCharging === 'boolean'
        ? raw.liveAlertsShowCharging
        : DEFAULT_DEVICE_SETTINGS.liveAlertsShowCharging ?? true,
    persistentCountdownNotif:
      typeof raw?.persistentCountdownNotif === 'boolean'
        ? raw.persistentCountdownNotif
        : DEFAULT_DEVICE_SETTINGS.persistentCountdownNotif ?? true,
    aquaTouchMode:
      typeof raw?.aquaTouchMode === 'boolean'
        ? raw.aquaTouchMode
        : DEFAULT_DEVICE_SETTINGS.aquaTouchMode,
    ltpoNight1Hz:
      typeof raw?.ltpoNight1Hz === 'boolean'
        ? raw.ltpoNight1Hz
        : DEFAULT_DEVICE_SETTINGS.ltpoNight1Hz,
    pocketProtectionEnabled:
      typeof raw?.pocketProtectionEnabled === 'boolean'
        ? raw.pocketProtectionEnabled
        : DEFAULT_DEVICE_SETTINGS.pocketProtectionEnabled,
  };
}

