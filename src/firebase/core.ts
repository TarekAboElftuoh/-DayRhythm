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


export const app =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const configuredDbId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-dayrhythm-1f2dd321-5d9e-4566-bb4c-87a3962fa6f7';

export { firebaseConfig };

/**
 * What the Android background service needs to send/receive the "alarm dismissed" signal on its
 * own (when the app's WebView isn't running): project ids + the signed-in user's Firebase
 * refresh token. It stays in the app's private storage on the phone.
 */
export function getNativeCloudAuthPayload(): string | null {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const refreshToken =
    user.refreshToken ||
    (user as unknown as { stsTokenManager?: { refreshToken?: string } }).stsTokenManager?.refreshToken ||
    '';
  const idToken =
    (user as unknown as { accessToken?: string }).accessToken ||
    (user as unknown as { stsTokenManager?: { accessToken?: string } }).stsTokenManager?.accessToken ||
    '';
  if (!refreshToken && !idToken) return null;
  return JSON.stringify({
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    databaseId: configuredDbId,
    uid: user.uid,
    refreshToken,
    idToken,
  });
}

function createResilientFirestore() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache(),
      },
      configuredDbId
    );
  } catch {
    return getFirestore(app, configuredDbId);
  }
}

export const db = createResilientFirestore();
export const auth = getAuth(app);

// Keep Firebase Auth session permanently across app restarts, reboots, and updates
void setPersistence(auth, indexedDBLocalPersistence).catch(() =>
  setPersistence(auth, browserLocalPersistence).catch(() => {})
);

