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

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const CORE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
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

const OAUTH_TOKEN_STORAGE_KEY = 'dayrhythm_google_oauth_cache_v1';

interface StoredOAuthToken {
  uid: string;
  token: string;
  expiresAtMs: number;
}

function readStoredAccessToken(expectedUid?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OAUTH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOAuthToken>;
    if (
      typeof parsed.token !== 'string' ||
      !parsed.token ||
      typeof parsed.expiresAtMs !== 'number' ||
      parsed.expiresAtMs <= Date.now() + 30_000
    ) {
      return null;
    }
    if (expectedUid && parsed.uid && parsed.uid !== expectedUid) {
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function persistAccessToken(uid: string, token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    // Google OAuth access tokens typically live 60 minutes; cache for 52 minutes
    const payload: StoredOAuthToken = {
      uid,
      token,
      expiresAtMs: Date.now() + 52 * 60_000,
    };
    window.localStorage.setItem(OAUTH_TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function clearStoredAccessToken(): void {
  cachedAccessToken = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OAUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

let cachedAccessToken: string | null = readStoredAccessToken();

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

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && !user.isAnonymous) {
      // Keep Firebase Auth session permanently fresh in the background (works 100% offline too)
      void user.getIdToken(false).catch(() => {});

      const restoredToken = cachedAccessToken || readStoredAccessToken(user.uid) || '';
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

export function getCalendarAccessToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;
  const restored = readStoredAccessToken(auth.currentUser?.uid);
  if (restored) cachedAccessToken = restored;
  return cachedAccessToken;
}

export async function signOutGoogleCalendar(): Promise<void> {
  clearStoredAccessToken();
  await auth.signOut();
}
