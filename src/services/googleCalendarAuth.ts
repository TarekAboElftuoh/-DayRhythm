import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from '../firebase';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const provider = new GoogleAuthProvider();
for (const scope of CALENDAR_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// Strictly in-memory token cache (never localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function observeFirebaseUser(
  onUserChange: (user: User | null) => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    onUserChange(user);
  });
}

export function initCalendarAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleCalendar(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('لم يتم الحصول على رمز الوصول لتقويم جوجل.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getCalendarAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleCalendar(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}
