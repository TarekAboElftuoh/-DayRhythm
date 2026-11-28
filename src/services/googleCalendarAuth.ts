import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from '../firebase';
import { clearPermanentLink, hasPermanentLink, refreshAccessTokenSilently } from './googleOfflineAccess';
import {
  CALENDAR_SCOPES,
  CORE_CALENDAR_SCOPES,
  buildGoogleProvider,
  isTopLevelMobileOrWebView,
  formatAuthErrorAr,
  readStoredAccessToken,
  getCachedAccessToken,
  setCachedAccessToken,
  persistAccessToken,
  clearStoredAccessToken,
  markCalendarTokenExpired,
  getCalendarTokenExpiresAtMs,
  getCalendarTokenRemainingMs,
  isCalendarTokenExpiringSoon,
  getCalendarAccessToken,
} from './googleOAuthStorage';

export {
  CALENDAR_SCOPES,
  clearStoredAccessToken,
  markCalendarTokenExpired,
  getCalendarTokenExpiresAtMs,
  getCalendarTokenRemainingMs,
  isCalendarTokenExpiringSoon,
  getCalendarAccessToken,
};

auth.useDeviceLanguage();

let isSigningIn = false;
let redirectChecked = false;
let inFlightTokenRefresh: Promise<{ user: User; accessToken: string } | null> | null = null;

export function observeFirebaseUser(
  onUserChange: (user: User | null) => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    onUserChange(user);
  });
}

export function initCalendarAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onSignedOut?: () => void
) {
  if (!redirectChecked) {
    redirectChecked = true;
    void getRedirectResult(auth, browserPopupRedirectResolver)
      .then((redirectResult) => {
        if (!redirectResult) return;
        const credential = GoogleAuthProvider.credentialFromResult(redirectResult);
        const token = credential?.accessToken ?? '';
        if (token) {
          setCachedAccessToken(token);
          persistAccessToken(redirectResult.user.uid, token);
        }
        if (!redirectResult.user.isAnonymous) {
          onAuthSuccess?.(redirectResult.user, token);
        }
      })
      .catch(() => {
        // Ignore stale redirect errors on normal page load
      });
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && !user.isAnonymous) {
      // Keep Firebase Auth session permanently fresh in the background (works 100% offline too)
      void user.getIdToken(false).catch(() => {});

      let restoredToken = getCachedAccessToken() || readStoredAccessToken(user.uid) || '';
      if (!restoredToken) {
        try {
          restoredToken = (await refreshGoogleCalendarTokenSilently()) || '';
        } catch {
          // ignore
        }
      }
      setCachedAccessToken(restoredToken || null);
      // CRITICAL: Never sign the user out just because the 60-min Google Calendar OAuth token expired or device is offline!
      onAuthSuccess?.(user, restoredToken);
    } else if (!isSigningIn) {
      clearStoredAccessToken();
      onSignedOut?.();
    }
  });
}

export async function signInWithGoogleCalendar(options?: {
  forceAccountChooser?: boolean;
}): Promise<{
  user: User;
  accessToken: string;
} | null> {
  if (isSigningIn) return null;

  try {
    isSigningIn = true;
    await setPersistence(auth, indexedDBLocalPersistence).catch(() =>
      setPersistence(auth, browserLocalPersistence).catch(() => {})
    );

    const existingEmail = options?.forceAccountChooser
      ? null
      : (auth.currentUser?.email ?? null);
    const fullProvider = buildGoogleProvider(CALENDAR_SCOPES, existingEmail);

    try {
      const result = await signInWithPopup(auth, fullProvider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken ?? '';
      if (token) {
        setCachedAccessToken(token);
        persistAccessToken(result.user.uid, token);
      }
      return { user: result.user, accessToken: token };
    } catch (primaryErr: unknown) {
      const code =
        typeof primaryErr === 'object' && primaryErr !== null && 'code' in primaryErr
          ? String((primaryErr as { code?: string }).code ?? '')
          : '';

      if (
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/internal-error' ||
          code === 'auth/web-storage-unsupported') &&
        isTopLevelMobileOrWebView()
      ) {
        await signInWithRedirect(auth, fullProvider, browserPopupRedirectResolver);
        return null;
      }

      if (code === 'auth/invalid-credential' || code === 'auth/internal-error') {
        const coreProvider = buildGoogleProvider(CORE_CALENDAR_SCOPES, existingEmail);
        const retryResult = await signInWithPopup(auth, coreProvider, browserPopupRedirectResolver);
        const retryCred = GoogleAuthProvider.credentialFromResult(retryResult);
        const token = retryCred?.accessToken ?? '';
        if (token) {
          setCachedAccessToken(token);
          persistAccessToken(retryResult.user.uid, token);
        }
        return { user: retryResult.user, accessToken: token };
      }

      throw new Error(formatAuthErrorAr(primaryErr));
    }
  } finally {
    isSigningIn = false;
  }
}

/**
 * Deduped 1-tap Workspace OAuth token renewal using the active user's email as login_hint
 * (skips the Google account chooser while preserving the Firebase Auth & Firestore session).
 */
export async function refreshGoogleCalendarToken(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  if (inFlightTokenRefresh) {
    return inFlightTokenRefresh;
  }
  inFlightTokenRefresh = (async () => {
    // Permanent link: renew silently, no popup.
    const silent = await refreshGoogleCalendarTokenSilently();
    if (silent && auth.currentUser) return { user: auth.currentUser, accessToken: silent };
    return signInWithGoogleCalendar({ forceAccountChooser: false });
  })().finally(() => {
    inFlightTokenRefresh = null;
  });
  return inFlightTokenRefresh;
}

/** Stores an access token obtained outside Firebase (permanent-link exchange or silent refresh). */
export function applyFreshAccessToken(uid: string, token: string, expiresInSec = 3600): void {
  setCachedAccessToken(token);
  persistAccessToken(uid, token, expiresInSec);
}

/**
 * Renews the Google access token from the device's refresh token with no UI.
 * Returns the new token, or null when there is no permanent link (or it was revoked).
 */
export async function refreshGoogleCalendarTokenSilently(): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || !hasPermanentLink(uid)) return null;
  const fresh = await refreshAccessTokenSilently();
  if (!fresh) return null;
  applyFreshAccessToken(uid, fresh.accessToken, fresh.expiresInSec);
  return fresh.accessToken;
}

export async function getOrRefreshCalendarAccessToken(): Promise<string | null> {
  const existing = getCalendarAccessToken();
  if (existing) return existing;
  try {
    return await refreshGoogleCalendarTokenSilently();
  } catch {
    return null;
  }
}

export async function signOutGoogleCalendar(): Promise<void> {
  clearStoredAccessToken();
  clearPermanentLink();
  await auth.signOut();
}
