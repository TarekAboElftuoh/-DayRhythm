import { GroundingPlace, PersistedChatMessage, ScheduleBlock } from '../../types/dayrhythm';
import {
  ChatRequestPayload,
  ChatStreamHandlers,
  GeminiConnectionStatus,
  GeminiStreamDonePayload,
  apiStreamGeminiChatClient,
  apiStreamGeminiMapsClient,
  apiStreamGeminiSearchClient,
  checkGeminiStatus,
  getGeminiApiKey,
  isCustomGeminiApiKeySet,
  resetGeminiApiKey,
  setGeminiApiKey,
  DEFAULT_GEMINI_API_KEY,
} from '../geminiClient';

// Re-export client-side Gemini capabilities for universal usage
export {
  checkGeminiStatus,
  getGeminiApiKey,
  setGeminiApiKey,
  resetGeminiApiKey,
  isCustomGeminiApiKeySet,
  DEFAULT_GEMINI_API_KEY,
};
export type { GeminiConnectionStatus, GeminiStreamDonePayload };

export function isContextDependentChatQuery(raw: string): boolean {
  const q = (raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (q.length <= 12) return true;
  return /(^|\s)(ده|دي|دول|كمل|كمّل|أكمل|اكمل|وضح|وضّح|اشرح|لماذا|ليه|غيره|غيّره|عدله|عدّله|احذفه|تمام|نعم|لا|أوك|اوك|ok|yes|no|more|continue|it|that|this|above)(\s|$)/i.test(
    q
  );
}

export function isStandaloneVirtualHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');
}

/**
 * Thrown when a same-origin `/api/*` endpoint does not exist.
 *
 * The Android APK, the Windows EXE and the hosted PWA are all static bundles: the asset loaders
 * answer unknown paths with `index.html` (HTTP 200) or a 404 page. Treating that HTML as a
 * successful empty JSON reply made Gemini-confirmed calendar/task edits report "done" while
 * nothing was sent to Google. Callers catch this and use the direct Google REST APIs instead.
 */
export class BackendUnavailableError extends Error {
  constructor(path: string) {
    super(`لا يوجد خادم وسيط لـ ${path} — سيتم الاتصال بـ Google مباشرة.`);
    this.name = 'BackendUnavailableError';
  }
}

/** True only when a dev backend (server.ts) can actually answer `/api/*` requests. */
export function hasSameOriginBackend(): boolean {
  return !isStandaloneVirtualHost();
}

export function isNonApiShareUrl(rawUrl: string): boolean {
  const lower = rawUrl.trim().toLowerCase();
  return (
    lower.includes('share.gemini.google') ||
    lower.includes('aistudio.google.com') ||
    lower.includes('gemini.google.com')
  );
}

const CLOUD_API_URL_KEY = 'dayrhythm_cloud_api_url';
export const DEFAULT_SPIRC_BROKER_URL = 'https://dayrhythm-spirc-broker.tarek13us.workers.dev';

export function getSavedCloudApiUrl(): string {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(CLOUD_API_URL_KEY) : null;
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore storage errors
  }
  return DEFAULT_SPIRC_BROKER_URL;
}

export function setSavedCloudApiUrl(rawUrl: string): { saved: string; error?: string } {
  const clean = (rawUrl || '').trim().replace(/\/+$/, '');
  try {
    if (typeof localStorage !== 'undefined') {
      if (clean) localStorage.setItem(CLOUD_API_URL_KEY, clean);
      else localStorage.removeItem(CLOUD_API_URL_KEY);
    }
  } catch {
    // ignore storage errors
  }
  return { saved: clean || DEFAULT_SPIRC_BROKER_URL };
}

export function clearSavedCloudApiUrl(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLOUD_API_URL_KEY);
  } catch {
    // ignore
  }
}

export function syncSavedCloudApiUrlFromRemote(remoteUrl?: string): void {
  if (!remoteUrl || !remoteUrl.trim()) return;
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(CLOUD_API_URL_KEY)) {
      localStorage.setItem(CLOUD_API_URL_KEY, remoteUrl.trim().replace(/\/+$/, ''));
    }
  } catch {
    // ignore
  }
}

export function warmGeminiChatSocket(): void {
  // Zero-backend client architecture: pre-warming WS is not needed
}

export interface ApiJsonResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  fromFallback?: boolean;
}

/**
 * Executes JSON requests. If calling Gemini endpoints, routes directly to client-side Gemini API.
 */
export async function apiFetchJson<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<ApiJsonResult<T>> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath.startsWith('/api/gemini/status')) {
    const status = await checkGeminiStatus(true);
    return {
      ok: status.ok,
      status: status.ok ? 200 : 503,
      data: status as unknown as T,
    };
  }

  if (normalizedPath.startsWith('/api/chat')) {
    const body = init?.body ? (JSON.parse(String(init.body)) as ChatRequestPayload) : { message: '' };
    return new Promise((resolve, reject) => {
      let resultText = '';
      let donePayload: GeminiStreamDonePayload | undefined;
      apiStreamGeminiChatClient(body, {
        signal: init?.signal ?? undefined,
        onDelta: (text) => {
          resultText += text;
        },
        onDone: (payload) => {
          donePayload = payload;
          resolve({
            ok: true,
            status: 200,
            data: {
              text: payload.text || resultText,
              pendingProposal: payload.pendingProposal,
              sources: payload.sources,
              latencyMs: payload.latencyMs,
              memoriesAppliedCount: payload.memoriesAppliedCount,
              model: payload.model,
              cached: payload.cached,
            } as unknown as T,
          });
        },
      }).catch((err) => {
        if (donePayload) return;
        reject(err);
      });
    });
  }

  if (normalizedPath.startsWith('/api/maps') || normalizedPath.startsWith('/api/search')) {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as { query: string; lat?: number; lng?: number })
      : { query: '' };
    const run = normalizedPath.startsWith('/api/maps')
      ? apiStreamGeminiMapsClient
      : apiStreamGeminiSearchClient;
    return new Promise((resolve, reject) => {
      let resultText = '';
      run(body, {
        signal: init?.signal ?? undefined,
        onDelta: (text) => {
          resultText += text;
        },
        onDone: (payload) => {
          resolve({
            ok: true,
            status: 200,
            data: {
              text: payload.text || resultText,
              places: payload.places,
              sources: payload.sources,
              latencyMs: payload.latencyMs,
              memoriesAppliedCount: payload.memoriesAppliedCount,
              model: payload.model,
              cached: payload.cached,
            } as unknown as T,
          });
        },
      }).catch(reject);
    });
  }

  // Same-origin dev backend (server.ts). Static builds have none, so fail loudly instead of
  // pretending an HTML fallback page was a successful empty JSON response.
  if (!hasSameOriginBackend()) {
    throw new BackendUnavailableError(normalizedPath);
  }
  const res = await fetch(normalizedPath, init);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new BackendUnavailableError(normalizedPath);
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

/**
 * Direct client-side streaming handler for Gemini Chat.
 * Zero WebSocket or Cloud Run backend required.
 */
export async function apiStreamGeminiOverWs(
  body: Record<string, unknown>,
  handlers: ChatStreamHandlers
): Promise<boolean> {
  return apiStreamGeminiChatClient(body as unknown as ChatRequestPayload, handlers);
}

/**
 * Streams Gemini Chat, Maps, or Search directly from the client.
 */
export async function apiFetchStream(
  path: string,
  body: Record<string, unknown>,
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath.includes('/maps')) {
    return apiStreamGeminiMapsClient(
      body as unknown as { query: string; lat?: number; lng?: number; memories?: Array<{ ruleText: string; category?: string }>; constitutionBrief?: string },
      handlers
    );
  }

  if (normalizedPath.includes('/search')) {
    return apiStreamGeminiSearchClient(
      body as unknown as { query: string; lat?: number; lng?: number; memories?: Array<{ ruleText: string; category?: string }>; constitutionBrief?: string },
      handlers
    );
  }

  // Default to Gemini Chat
  return apiStreamGeminiChatClient(body as unknown as ChatRequestPayload, handlers);
}

