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

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

const CORE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.appdata',
];

auth.useDeviceLanguage();

function buildGoogleProvider(scopes: readonly string[], loginHint?: string | null): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of scopes) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {};
  if (loginHint) {
    params.login_hint = loginHint;
  } else {
    params.prompt = 'select_account';
  }
  provider.setCustomParameters(params);
  return provider;
}

function isTopLevelMobileOrWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const isTopLevel = window.self === window.top;
  if (!isTopLevel) return false;
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isVirtualAppHost =
    window.location.hostname.toLowerCase().endsWith('.web.app') ||
    window.location.hostname.toLowerCase().endsWith('.firebaseapp.com');
  return isMobileUa || isStandalone || isVirtualAppHost;
}

function formatAuthErrorAr(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code ?? '')
      : '';
  const rawMsg = err instanceof Error ? err.message : String(err ?? '');

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام الربط — اضغط مرة أخرى للمحاولة.';
  }
  if (code === 'auth/popup-blocked') {
    return 'المتصفح منع نافذة تسجيل الدخول المنبثقة — اسمح بالـ Popups أو أعد الضغط للمتابعة.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'هذا الرابط غير مضاف بعد في نطاقات Firebase المصرح بها — حدّث التطبيق لآخر إصدار من Releases أو افتحه من الرابط المصرح به.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بخوادم Google — تحقق من الإنترنت وحاول مرة أخرى.';
  }
  if (
    code === 'auth/invalid-action-code' ||
    code === 'auth/missing-initial-state' ||
    rawMsg.toLowerCase().includes('requested action is invalid')
  ) {
    return 'انتهت صلاحية جلسة المتصفح أثناء التحويل — أعد المحاولة مرة أخرى.';
  }
  return rawMsg || 'تعذر تسجيل الدخول بحساب Google.';
}

let isSigningIn = false;
let redirectChecked = false;
let inFlightTokenRefresh: Promise<{ user: User; accessToken: string } | null> | null = null;

const OAUTH_TOKEN_STORAGE_KEY = 'dayrhythm_google_oauth_cache_v1';

interface StoredOAuthToken {
  uid: string;
  token: string;
  expiresAtMs: number;
}

function readStoredOAuthRecord(expectedUid?: string | null): StoredOAuthToken | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OAUTH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOAuthToken>;
    if (
      typeof parsed.token !== 'string' ||
      !parsed.token ||
      typeof parsed.expiresAtMs !== 'number'
    ) {
      return null;
    }
    if (expectedUid && parsed.uid && parsed.uid !== expectedUid) {
      return null;
    }
    return {
      uid: typeof parsed.uid === 'string' ? parsed.uid : '',
      token: parsed.token,
      expiresAtMs: parsed.expiresAtMs,
    };
  } catch {
    return null;
  }
}

function readStoredAccessToken(expectedUid?: string | null): string | null {
  const rec = readStoredOAuthRecord(expectedUid);
  if (!rec || rec.expiresAtMs <= Date.now() + 10_000) {
    return null;
  }
  return rec.token;
}

let cachedAccessToken: string | null = readStoredAccessToken();
let cachedExpiresAtMs: number = readStoredOAuthRecord()?.expiresAtMs ?? 0;

function persistAccessToken(uid: string, token: string, expiresInSec = 3600): void {
  if (typeof window === 'undefined' || !token) return;
  // Google OAuth access tokens live ~60 minutes; keep a 1-minute safety margin.
  const expiresAtMs = Date.now() + Math.max(60, expiresInSec - 60) * 1000;
  cachedExpiresAtMs = expiresAtMs;
  try {
    const payload: StoredOAuthToken = {
      uid,
      token,
      expiresAtMs,
    };
    window.localStorage.setItem(OAUTH_TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function clearStoredAccessToken(): void {
  cachedAccessToken = null;
  cachedExpiresAtMs = 0;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OAUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

/**
 * Marks the current Google Workspace OAuth access token as expired (e.g. after HTTP 401)
 * WITHOUT signing the user out of Firebase Auth or wiping offline/Firestore state.
 */
export function markCalendarTokenExpired(): void {
  clearStoredAccessToken();
}

export function getCalendarTokenExpiresAtMs(): number {
  if (cachedExpiresAtMs > 0) return cachedExpiresAtMs;
  const rec = readStoredOAuthRecord(auth.currentUser?.uid);
  if (rec) {
    cachedExpiresAtMs = rec.expiresAtMs;
    return rec.expiresAtMs;
  }
  return 0;
}

export function getCalendarTokenRemainingMs(): number {
  const exp = getCalendarTokenExpiresAtMs();
  if (!exp) return 0;
  return Math.max(0, exp - Date.now());
}

export function isCalendarTokenExpiringSoon(marginMs = 5 * 60_000): boolean {
  const token = getCalendarAccessToken();
  if (!token) return true;
  return getCalendarTokenRemainingMs() <= marginMs;
}

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
          cachedAccessToken = token;
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

      let restoredToken = cachedAccessToken || readStoredAccessToken(user.uid) || '';
      if (!restoredToken) {
        try {
          restoredToken = (await refreshGoogleCalendarTokenSilently()) || '';
        } catch {
          // ignore
        }
      }
      cachedAccessToken = restoredToken || null;
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
        cachedAccessToken = token;
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
          cachedAccessToken = token;
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
  cachedAccessToken = token;
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

export function getCalendarAccessToken(): string | null {
  if (cachedAccessToken && cachedExpiresAtMs > Date.now() + 10_000) {
    return cachedAccessToken;
  }
  const restored = readStoredAccessToken(auth.currentUser?.uid);
  cachedAccessToken = restored;
  return cachedAccessToken;
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
