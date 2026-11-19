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

function isStandaloneMobileContext(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isTopLevel = window.self === window.top;
  return isStandalone && isTopLevel;
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
    return 'المتصفح منع نافذة تسجيل الدخول المنبثقة — اسمح بالـ Popups أو افتح التطبيق في Chrome.';
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
// Keep OAuth access token strictly in memory (cleared on sign-out);
// never trigger background GIS popups outside an explicit user click.
let cachedAccessToken: string | null = null;
let redirectChecked = false;

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
  if (!redirectChecked) {
    redirectChecked = true;
    void getRedirectResult(auth, browserPopupRedirectResolver)
      .then((redirectResult) => {
        if (!redirectResult) return;
        const credential = GoogleAuthProvider.credentialFromResult(redirectResult);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          onAuthSuccess?.(redirectResult.user, cachedAccessToken);
        }
      })
      .catch(() => {
        // Ignore stale redirect errors on normal page load
      });
  }

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      // Keep Firebase Auth session permanently fresh in the background (no popups)
      void user.getIdToken(false).catch(() => {});

      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Firestore remains live via Firebase Auth; request user click only when Calendar OAuth token is needed
        cachedAccessToken = null;
        onAuthFailure?.();
      }
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
  if (isSigningIn) return null;

  try {
    isSigningIn = true;
    await setPersistence(auth, indexedDBLocalPersistence).catch(() =>
      setPersistence(auth, browserLocalPersistence).catch(() => {})
    );

    const existingEmail = auth.currentUser?.email ?? null;
    const fullProvider = buildGoogleProvider(CALENDAR_SCOPES, existingEmail);

    try {
      const result = await signInWithPopup(auth, fullProvider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken ?? '';
      if (token) {
        cachedAccessToken = token;
      }
      return { user: result.user, accessToken: token };
    } catch (primaryErr: unknown) {
      const code =
        typeof primaryErr === 'object' && primaryErr !== null && 'code' in primaryErr
          ? String((primaryErr as { code?: string }).code ?? '')
          : '';

      if (
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment') &&
        isStandaloneMobileContext()
      ) {
        await signInWithRedirect(auth, fullProvider, browserPopupRedirectResolver);
        return null;
      }

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/internal-error'
      ) {
        const coreProvider = buildGoogleProvider(CORE_CALENDAR_SCOPES, existingEmail);
        const retryResult = await signInWithPopup(auth, coreProvider, browserPopupRedirectResolver);
        const retryCred = GoogleAuthProvider.credentialFromResult(retryResult);
        const token = retryCred?.accessToken ?? '';
        if (token) {
          cachedAccessToken = token;
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
  return cachedAccessToken;
}

export async function signOutGoogleCalendar(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}
