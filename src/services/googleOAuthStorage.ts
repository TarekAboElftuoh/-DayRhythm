import { GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

export const CORE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.appdata',
];

export function buildGoogleProvider(scopes: readonly string[], loginHint?: string | null): GoogleAuthProvider {
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

export function isTopLevelMobileOrWebView(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.self !== window.top) return false;
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

export function formatAuthErrorAr(err: unknown): string {
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
    return 'هذا الرابط غير مضاف بعد في نطاقات Google المصرح بها — حدّث التطبيق لآخر إصدار من Releases أو افتحه من الرابط المصرح به.';
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

const OAUTH_TOKEN_STORAGE_KEY = 'dayrhythm_google_oauth_cache_v1';

interface StoredOAuthToken {
  uid: string;
  token: string;
  expiresAtMs: number;
}

export function readStoredOAuthRecord(expectedUid?: string | null): StoredOAuthToken | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OAUTH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOAuthToken>;
    if (typeof parsed.token !== 'string' || !parsed.token || typeof parsed.expiresAtMs !== 'number') {
      return null;
    }
    if (expectedUid && parsed.uid && parsed.uid !== expectedUid) return null;
    return {
      uid: typeof parsed.uid === 'string' ? parsed.uid : '',
      token: parsed.token,
      expiresAtMs: parsed.expiresAtMs,
    };
  } catch {
    return null;
  }
}

export function readStoredAccessToken(expectedUid?: string | null): string | null {
  const rec = readStoredOAuthRecord(expectedUid);
  if (!rec || rec.expiresAtMs <= Date.now() + 10_000) return null;
  return rec.token;
}

let cachedAccessToken: string | null = readStoredAccessToken();
let cachedExpiresAtMs: number = readStoredOAuthRecord()?.expiresAtMs ?? 0;

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export function persistAccessToken(uid: string, token: string, expiresInSec = 3600): void {
  if (typeof window === 'undefined' || !token) return;
  const expiresAtMs = Date.now() + Math.max(60, expiresInSec - 60) * 1000;
  cachedExpiresAtMs = expiresAtMs;
  try {
    const payload: StoredOAuthToken = { uid, token, expiresAtMs };
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

export function getCalendarAccessToken(): string | null {
  if (cachedAccessToken && cachedExpiresAtMs > Date.now() + 10_000) {
    return cachedAccessToken;
  }
  const restored = readStoredAccessToken(auth.currentUser?.uid);
  cachedAccessToken = restored;
  return cachedAccessToken;
}
