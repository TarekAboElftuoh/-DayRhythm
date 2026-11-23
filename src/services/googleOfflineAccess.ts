/**
 * Permanent Google link ("offline access").
 *
 * Firebase's Google sign-in only returns a 1-hour access token and no refresh token, so Calendar,
 * Tasks and Gmail sync stopped every hour. This module runs Google's OAuth "authorization code +
 * PKCE" flow once per device, keeps the refresh token on the device, and silently renews the access
 * token before it expires — no server needed (Google's token endpoint allows browser requests).
 *
 * Setup (once):
 *  - Use the OAuth "Web client" that Firebase created (Firebase console → Authentication →
 *    Sign-in method → Google → Web SDK configuration) and add these Authorized redirect URIs in
 *    Google Cloud console → APIs & Services → Credentials:
 *      https://gen-lang-client-0625331922.web.app/oauth2callback.html   (APK, EXE, PWA)
 *      http://localhost:4173/oauth2callback.html                         (local testing)
 *  - OAuth consent screen → Publishing status must be "In production"
 *    (in "Testing", Google expires refresh tokens after 7 days).
 *  - Provide the client id/secret at build time (GitHub secrets GOOGLE_OAUTH_CLIENT_ID /
 *    GOOGLE_OAUTH_CLIENT_SECRET → VITE_GOOGLE_OAUTH_CLIENT_ID / VITE_GOOGLE_OAUTH_CLIENT_SECRET).
 */

const REFRESH_STORAGE_KEY = 'dayrhythm_google_refresh_v1';
const PKCE_STORAGE_KEY = 'dayrhythm_google_pkce_v1';
const CALLBACK_PATH = '/oauth2callback.html';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const OFFLINE_ACCESS_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

interface StoredRefresh {
  uid: string;
  refreshToken: string;
  linkedAtMs: number;
}

export interface FreshAccessToken {
  accessToken: string;
  expiresInSec: number;
}

function env(name: string): string {
  return String((import.meta.env as Record<string, unknown>)?.[name] ?? '').trim();
}

function clientId(): string {
  return env('VITE_GOOGLE_OAUTH_CLIENT_ID');
}

function clientSecret(): string {
  return env('VITE_GOOGLE_OAUTH_CLIENT_SECRET');
}

function redirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

/** True when this build was given an OAuth client, so the permanent link can be offered. */
export function isPermanentLinkAvailable(): boolean {
  return Boolean(clientId() && clientSecret());
}

function readRefresh(): StoredRefresh | null {
  try {
    const raw = localStorage.getItem(REFRESH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRefresh>;
    if (typeof parsed.refreshToken !== 'string' || !parsed.refreshToken) return null;
    return {
      uid: typeof parsed.uid === 'string' ? parsed.uid : '',
      refreshToken: parsed.refreshToken,
      linkedAtMs: typeof parsed.linkedAtMs === 'number' ? parsed.linkedAtMs : 0,
    };
  } catch {
    return null;
  }
}

/** True when this device holds a refresh token (for the given Firebase user, if provided). */
export function hasPermanentLink(uid?: string | null): boolean {
  const rec = readRefresh();
  if (!rec) return false;
  return !uid || !rec.uid || rec.uid === uid;
}

export function clearPermanentLink(): void {
  try {
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 48): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64Url(new Uint8Array(digest));
}

/**
 * Leaves the app for Google's consent page (full-page redirect: popups are blocked in the
 * Android/Windows WebViews). Google sends the user back to /oauth2callback.html.
 */
export async function startPermanentLink(options: { uid: string; loginHint?: string | null }): Promise<void> {
  if (!isPermanentLinkAvailable()) {
    throw new Error('الربط الدائم غير مُفعّل في هذه النسخة — أضف بيانات OAuth في إعدادات البناء.');
  }
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = await sha256Base64Url(verifier);
  localStorage.setItem(
    PKCE_STORAGE_KEY,
    JSON.stringify({ verifier, state, uid: options.uid, returnTo: window.location.pathname || '/' })
  );
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: OFFLINE_ACCESS_SCOPES.join(' '),
    access_type: 'offline',
    // "consent" guarantees Google returns a refresh token even if the user approved before.
    prompt: 'consent',
    include_granted_scopes: 'true',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  if (options.loginHint) params.set('login_hint', options.loginHint);
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function postToken(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(data.error || res.status);
    const err = new Error(String(data.error_description || code));
    (err as Error & { code?: string }).code = code;
    throw err;
  }
  return data;
}

export interface PermanentLinkCallbackResult {
  ok: boolean;
  uid?: string;
  token?: FreshAccessToken;
  error?: string;
}

/**
 * Call once at start-up (before rendering). If Google just redirected back with ?code=…,
 * exchange it for tokens, store the refresh token, and clean the URL.
 */
export async function completePermanentLinkIfReturning(): Promise<PermanentLinkCallbackResult | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth2') !== '1') return null;

  let pending: { verifier: string; state: string; uid: string; returnTo?: string } | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY) || 'null');
  } catch {
    pending = null;
  }
  localStorage.removeItem(PKCE_STORAGE_KEY);
  const returnTo = pending?.returnTo && pending.returnTo.startsWith('/') ? pending.returnTo : '/';
  window.history.replaceState({}, '', returnTo === CALLBACK_PATH ? '/' : returnTo);

  const code = params.get('code');
  if (params.get('error')) {
    return { ok: false, error: 'تم إلغاء الربط الدائم من صفحة Google.' };
  }
  if (!code || !pending || params.get('state') !== pending.state) {
    return { ok: false, error: 'انتهت جلسة الربط الدائم — اضغط «ربط دائم» مرة أخرى.' };
  }
  try {
    const data = await postToken({
      grant_type: 'authorization_code',
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      code_verifier: pending.verifier,
      redirect_uri: redirectUri(),
    });
    const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : '';
    const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
    if (!refreshToken || !accessToken) {
      return { ok: false, error: 'Google لم يُرجع صلاحية دائمة — أعد المحاولة ووافق على كل الصلاحيات.' };
    }
    localStorage.setItem(
      REFRESH_STORAGE_KEY,
      JSON.stringify({ uid: pending.uid, refreshToken, linkedAtMs: Date.now() } satisfies StoredRefresh)
    );
    return {
      ok: true,
      uid: pending.uid,
      token: { accessToken, expiresInSec: Number(data.expires_in) || 3600 },
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'تعذر إكمال الربط الدائم.' };
  }
}

let inFlight: Promise<FreshAccessToken | null> | null = null;

/**
 * Gets a new access token from the stored refresh token, without any UI.
 * Returns null when there is no permanent link or it was revoked (then the link is cleared).
 */
export function refreshAccessTokenSilently(): Promise<FreshAccessToken | null> {
  if (inFlight) return inFlight;
  const rec = readRefresh();
  if (!rec || !isPermanentLinkAvailable()) return Promise.resolve(null);
  inFlight = postToken({
    grant_type: 'refresh_token',
    refresh_token: rec.refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
  })
    .then((data) => {
      const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
      if (!accessToken) return null;
      return { accessToken, expiresInSec: Number(data.expires_in) || 3600 };
    })
    .catch((err: unknown) => {
      // invalid_grant = user revoked access / password change: the link is gone for good.
      if ((err as { code?: string })?.code === 'invalid_grant') clearPermanentLink();
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
