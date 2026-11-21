import { GroundingPlace, PersistedChatMessage, ScheduleBlock } from '../types/dayrhythm';

const DEFAULT_CLOUD_API_URLS = [
  'https://ais-pre-nldzeytdlkfysmfvrz4pkn-146281240493.europe-west2.run.app',
  'https://ais-dev-nldzeytdlkfysmfvrz4pkn-146281240493.europe-west2.run.app',
];

const CUSTOM_API_URL_KEY = 'dayrhythm_cloud_api_url_v1';

export function isStandaloneVirtualHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');
}

export function isNonApiShareUrl(rawUrl: string): boolean {
  const lower = rawUrl.trim().toLowerCase();
  return (
    lower.includes('share.gemini.google') ||
    lower.includes('aistudio.google.com') ||
    lower.includes('gemini.google.com')
  );
}

export function getSavedCloudApiUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = (localStorage.getItem(CUSTOM_API_URL_KEY) || '').trim();
    if (val && isNonApiShareUrl(val)) {
      localStorage.removeItem(CUSTOM_API_URL_KEY);
      return '';
    }
    return val;
  } catch {
    return '';
  }
}

export function setSavedCloudApiUrl(rawUrl: string): { saved: string; error?: string } {
  const cleaned = rawUrl.trim().replace(/\/+$/, '');
  if (!cleaned) {
    clearSavedCloudApiUrl();
    return { saved: '' };
  }
  if (isNonApiShareUrl(cleaned)) {
    clearSavedCloudApiUrl();
    return {
      saved: '',
      error:
        'هذا رابط مشاركة (Share) وليس رابط الخادم السحابي — اضغط «Deploy to Cloud Run» في AI Studio لنسخ رابط ينتهي بـ .run.app، أو افتح التطبيق من المتصفح ليعمل شات Gemini فوراً.',
    };
  }
  if (!/^https?:\/\//i.test(cleaned)) {
    return {
      saved: '',
      error: 'يرجى إدخال رابط خادم يبدأ بـ https:// (مثل https://your-app.run.app).',
    };
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CUSTOM_API_URL_KEY, cleaned);
    } catch {
      // ignore storage errors
    }
  }
  return { saved: cleaned };
}

export function clearSavedCloudApiUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CUSTOM_API_URL_KEY);
  } catch {
    // ignore storage errors
  }
}

let lastHealthyApiBase: string | null = null;

function getApiBaseCandidates(): string[] {
  if (!isStandaloneVirtualHost()) {
    return [''];
  }

  const candidates: string[] = [];
  if (lastHealthyApiBase !== null) {
    candidates.push(lastHealthyApiBase);
  }
  const custom = getSavedCloudApiUrl();
  if (custom && /^https?:\/\//i.test(custom) && !isNonApiShareUrl(custom)) {
    const cleanCustom = custom.replace(/\/+$/, '');
    if (!candidates.includes(cleanCustom)) candidates.push(cleanCustom);
  }

  const envUrl = (import.meta.env?.VITE_CLOUD_API_URL as string | undefined)?.trim();
  if (envUrl && /^https?:\/\//i.test(envUrl) && !isNonApiShareUrl(envUrl)) {
    const cleanEnv = envUrl.replace(/\/+$/, '');
    if (!candidates.includes(cleanEnv)) candidates.push(cleanEnv);
  }

  for (const fallback of DEFAULT_CLOUD_API_URLS) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }

  return candidates;
}

export interface ApiJsonResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  fromFallback?: boolean;
}

export interface GeminiConnectionStatus {
  ok: boolean;
  connected: boolean;
  status: 'checking' | 'online' | 'degraded' | 'offline';
  model: string;
  latencyMs: number;
  checkedAtIso?: string;
  error?: string;
}

/**
 * Safely calls backend /api/* routes across both Web (same-origin Express)
 * and standalone Android APK / Windows EXE (failover to live Cloud Express backend).
 * Never throws `Unexpected token '<', "<!doctype "... is not valid JSON`.
 */
export async function apiFetchJson<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<ApiJsonResult<T>> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const bases = getApiBaseCandidates();
  let lastErrorMsg = '';
  let lastStatus = 0;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const url = `${base}${normalizedPath}`;
    try {
      const res = await fetch(url, init);
      const contentType = (res.headers.get('content-type') || '').toLowerCase();

      if (!contentType.includes('application/json')) {
        lastStatus = res.status;
        lastErrorMsg =
          res.status === 404
            ? 'رابط الخادم السحابي يعيد 404 (لم يُنشر بعد عبر Deploy to Cloud Run).'
            : res.status === 401 || res.status === 403 || res.status === 302
              ? 'رابط الخادم يتطلب وصولاً عاماً (Cloud Run Public).'
              : `استجابة غير صالحة من الخادم (${res.status}).`;
        continue;
      }

      const data = (await res.json()) as T;
      lastHealthyApiBase = base;
      return {
        ok: res.ok,
        status: res.status,
        data,
        fromFallback: i > 0,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      lastErrorMsg = err instanceof Error ? err.message : 'تعذر الاتصال بالخادم.';
    }
  }

  throw new Error(
    isStandaloneVirtualHost()
      ? 'شات Gemini في نسخة الكمبيوتر/الموبايل يحتاج رابط خادم منشور عبر «Deploy to Cloud Run» (رابط ينتهي بـ .run.app وليس رابط share.gemini.google) — الصقه بالأسفل مرة واحدة ليشتغل فوراً.'
      : lastErrorMsg || `تعذر الاتصال بالخادم (${lastStatus || 'network'}).`
  );
}

/**
 * Queries real live Gemini backend connectivity and latency via /api/gemini/status
 * with a strict 7-second timeout so connection probes never hang.
 */
export async function checkGeminiStatus(forceProbe = false): Promise<GeminiConnectionStatus> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 7_000) : null;
  try {
    const query = forceProbe ? '?probe=1' : '';
    const { ok, data } = await apiFetchJson<Partial<GeminiConnectionStatus>>(
      `/api/gemini/status${query}`,
      { method: 'GET', cache: 'no-store', signal: controller.signal }
    );
    const roundTrip = Math.max(1, Date.now() - startedAt);
    const isConnected = Boolean(ok && data.connected);
    const resolvedStatus: GeminiConnectionStatus['status'] =
      data.status === 'degraded' && isConnected
        ? 'degraded'
        : isConnected
          ? 'online'
          : data.status === 'degraded'
            ? 'degraded'
            : 'offline';
    return {
      ok: isConnected,
      connected: isConnected,
      status: resolvedStatus,
      model: data.model || 'gemini-3.1-flash-lite',
      latencyMs: typeof data.latencyMs === 'number' && data.latencyMs > 0 ? data.latencyMs : roundTrip,
      checkedAtIso: data.checkedAtIso || new Date().toISOString(),
      error: data.error,
    };
  } catch (err: unknown) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: 'gemini-3.1-flash-lite',
      latencyMs: Math.max(1, Date.now() - startedAt),
      checkedAtIso: new Date().toISOString(),
      error: isTimeout
        ? 'استغرق التحقق وقتاً طويلاً — ستتم إعادة المحاولة تلقائياً.'
        : err instanceof Error
          ? err.message
          : 'تعذر الوصول إلى خادم Gemini.',
    };
  } finally {
    if (timeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(timeoutId);
    }
  }
}

export interface GeminiStreamDonePayload {
  text: string;
  places?: GroundingPlace[];
  sources?: Array<{ title: string; uri: string }>;
  pendingProposal?: PersistedChatMessage['pendingProposal'];
  latencyMs?: number;
  memoriesAppliedCount?: number;
  model?: string;
  cached?: boolean;
}

export interface ClientCachedGeminiResponse {
  text: string;
  places?: GroundingPlace[];
  sources?: Array<{ title: string; uri: string }>;
  memoriesAppliedCount?: number;
  model?: string;
}

interface ClientCacheEntry {
  value: ClientCachedGeminiResponse;
  expiresAtMs: number;
}

const CLIENT_GEMINI_CACHE_MAX = 80;
const CLIENT_GEMINI_CACHE_STORAGE_KEY = 'dayrhythm_gemini_cache_v2';
const clientGeminiCache = new Map<string, ClientCacheEntry>();
let hasHydratedClientCache = false;

function hydrateClientGeminiCache(): void {
  if (hasHydratedClientCache || typeof window === 'undefined') return;
  hasHydratedClientCache = true;
  try {
    const raw = localStorage.getItem(CLIENT_GEMINI_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, ClientCacheEntry]>;
    if (!Array.isArray(parsed)) return;
    const now = Date.now();
    for (const [k, entry] of parsed) {
      if (typeof k === 'string' && entry && typeof entry.expiresAtMs === 'number' && entry.expiresAtMs > now) {
        clientGeminiCache.set(k, entry);
      }
    }
  } catch {
    // ignore corrupt cache storage
  }
}

function persistClientGeminiCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const entries = Array.from(clientGeminiCache.entries())
      .filter(([, v]) => v.expiresAtMs > now)
      .slice(-CLIENT_GEMINI_CACHE_MAX);
    localStorage.setItem(CLIENT_GEMINI_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildClientGeminiCacheKey(parts: unknown[]): string {
  return fnv1aHash(JSON.stringify(parts));
}

export function isContextDependentChatQuery(raw: string): boolean {
  const q = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (q.length <= 12) return true;
  return /(^|\s)(ده|دي|دول|كمل|كمّل|أكمل|اكمل|وضح|وضّح|اشرح|لماذا|ليه|غيره|غيّره|عدله|عدّله|احذفه|تمام|نعم|لا|أوك|اوك|ok|yes|no|more|continue|it|that|this|above)(\s|$)/i.test(
    q
  );
}

export function getCachedGeminiResponse(key: string): ClientCachedGeminiResponse | null {
  hydrateClientGeminiCache();
  const entry = clientGeminiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    clientGeminiCache.delete(key);
    persistClientGeminiCache();
    return null;
  }
  // Refresh LRU position
  clientGeminiCache.delete(key);
  clientGeminiCache.set(key, entry);
  return entry.value;
}

export function setCachedGeminiResponse(
  key: string,
  value: ClientCachedGeminiResponse,
  ttlMs: number
): void {
  hydrateClientGeminiCache();
  if (clientGeminiCache.has(key)) {
    clientGeminiCache.delete(key);
  } else if (clientGeminiCache.size >= CLIENT_GEMINI_CACHE_MAX) {
    const oldest = clientGeminiCache.keys().next().value;
    if (oldest !== undefined) clientGeminiCache.delete(oldest);
  }
  clientGeminiCache.set(key, {
    value,
    expiresAtMs: Date.now() + ttlMs,
  });
  persistClientGeminiCache();
}

export function clearGeminiClientCache(): void {
  clientGeminiCache.clear();
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(CLIENT_GEMINI_CACHE_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}

// Persistent Pre-Warmed WebSocket Channel for Zero-Handshake Gemini Chat Streaming
interface PendingWsChatStream {
  onStatus?: (statusText: string) => void;
  onDelta: (deltaText: string) => void;
  onDone: (payload: GeminiStreamDonePayload) => void;
  resolve: (ok: boolean) => void;
  reject: (err: Error) => void;
  receivedAnyDelta: boolean;
}

let chatWs: WebSocket | null = null;
let chatWsConnecting: Promise<WebSocket | null> | null = null;
let chatWsPingTimer: number | null = null;
const pendingWsChatStreams = new Map<string, PendingWsChatStream>();

function resolveChatWsUrl(): string | null {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return null;
  const bases = getApiBaseCandidates();
  const base = bases[0];
  if (!base) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/sync`;
  }
  return `${base.replace(/^http/i, 'ws')}/ws/sync`;
}

function teardownChatWs(reasonError?: Error): void {
  if (chatWsPingTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(chatWsPingTimer);
    chatWsPingTimer = null;
  }
  if (chatWs) {
    try {
      chatWs.onopen = null;
      chatWs.onmessage = null;
      chatWs.onerror = null;
      chatWs.onclose = null;
      if (chatWs.readyState === WebSocket.OPEN || chatWs.readyState === WebSocket.CONNECTING) {
        chatWs.close();
      }
    } catch {
      // ignore close errors
    }
    chatWs = null;
  }
  chatWsConnecting = null;

  for (const [, pending] of pendingWsChatStreams) {
    if (pending.receivedAnyDelta && reasonError) {
      pending.reject(reasonError);
    } else {
      pending.resolve(false);
    }
  }
  pendingWsChatStreams.clear();
}

function ensureWarmGeminiChatSocket(maxWaitMs = 550): Promise<WebSocket | null> {
  if (typeof window === 'undefined' || navigator.onLine === false) return Promise.resolve(null);
  if (chatWs && chatWs.readyState === WebSocket.OPEN) {
    return Promise.resolve(chatWs);
  }
  if (!chatWsConnecting) {
    const wsUrl = resolveChatWsUrl();
    if (!wsUrl) return Promise.resolve(null);
    chatWsConnecting = new Promise<WebSocket | null>((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);
        chatWs = ws;
        let settled = false;
        const finish = (sock: WebSocket | null) => {
          if (settled) return;
          settled = true;
          chatWsConnecting = null;
          resolve(sock);
        };
        const connectTimeout = window.setTimeout(() => {
          if (!settled) {
            finish(null);
          }
        }, 3500);

        ws.onopen = () => {
          window.clearTimeout(connectTimeout);
          if (chatWsPingTimer !== null) window.clearInterval(chatWsPingTimer);
          chatWsPingTimer = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send('{"type":"ping"}');
              } catch {
                // ignore
              }
            }
          }, 25_000);
          finish(ws);
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(String(evt.data)) as {
              type?: string;
              requestId?: string;
              text?: string;
              error?: string;
              places?: GroundingPlace[];
              sources?: Array<{ title: string; uri: string }>;
              pendingProposal?: PersistedChatMessage['pendingProposal'];
              latencyMs?: number;
              memoriesAppliedCount?: number;
              model?: string;
              cached?: boolean;
            };
            if (!msg.requestId) return;
            const pending = pendingWsChatStreams.get(msg.requestId);
            if (!pending) return;

            if (msg.type === 'gemini_chat_status' && typeof msg.text === 'string') {
              pending.onStatus?.(msg.text);
            } else if (msg.type === 'gemini_chat_delta' && typeof msg.text === 'string') {
              pending.receivedAnyDelta = true;
              pending.onDelta(msg.text);
            } else if (msg.type === 'gemini_chat_done') {
              pendingWsChatStreams.delete(msg.requestId);
              pending.onDone({
                text: msg.text || '',
                places: msg.places,
                sources: msg.sources,
                pendingProposal: msg.pendingProposal,
                latencyMs: msg.latencyMs,
                memoriesAppliedCount: msg.memoriesAppliedCount,
                model: msg.model,
                cached: Boolean(msg.cached),
              });
              pending.resolve(true);
            } else if (msg.type === 'gemini_chat_error') {
              pendingWsChatStreams.delete(msg.requestId);
              pending.reject(new Error(msg.error || 'حدث خطأ أثناء بث الرد من Gemini.'));
            }
          } catch {
            // ignore non-chat WS frames
          }
        };

        ws.onerror = () => {
          window.clearTimeout(connectTimeout);
          teardownChatWs();
          finish(null);
        };

        ws.onclose = () => {
          window.clearTimeout(connectTimeout);
          teardownChatWs(new Error('انقطع اتصال البث المباشر مع الخادم.'));
          finish(null);
        };
      } catch {
        chatWsConnecting = null;
        resolve(null);
      }
    });
  }

  return Promise.race([
    chatWsConnecting,
    new Promise<WebSocket | null>((resolve) => {
      window.setTimeout(() => resolve(chatWs && chatWs.readyState === WebSocket.OPEN ? chatWs : null), maxWaitMs);
    }),
  ]);
}

export function warmGeminiChatSocket(): void {
  void ensureWarmGeminiChatSocket(3500);
}

export async function apiStreamGeminiOverWs(
  body: Record<string, unknown>,
  handlers: {
    signal?: AbortSignal;
    onStatus?: (statusText: string) => void;
    onDelta: (deltaText: string) => void;
    onDone: (payload: GeminiStreamDonePayload) => void;
  }
): Promise<boolean> {
  if (handlers.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const ws = await ensureWarmGeminiChatSocket(550);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  const requestId = `gws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  return new Promise<boolean>((resolve, reject) => {
    const onAbort = () => {
      pendingWsChatStreams.delete(requestId);
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'gemini_chat_cancel', requestId }));
        }
      } catch {
        // ignore cancel send errors
      }
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (handlers.signal) {
      handlers.signal.addEventListener('abort', onAbort, { once: true });
    }

    const cleanupWrap = <T extends (...args: never[]) => void>(fn: T): T =>
      ((...args: Parameters<T>) => {
        if (handlers.signal) handlers.signal.removeEventListener('abort', onAbort);
        fn(...args);
      }) as T;

    pendingWsChatStreams.set(requestId, {
      onStatus: handlers.onStatus,
      onDelta: handlers.onDelta,
      onDone: handlers.onDone,
      resolve: cleanupWrap(resolve),
      reject: cleanupWrap(reject),
      receivedAnyDelta: false,
    });

    try {
      ws.send(JSON.stringify({ type: 'gemini_chat', requestId, payload: body }));
    } catch {
      pendingWsChatStreams.delete(requestId);
      if (handlers.signal) handlers.signal.removeEventListener('abort', onAbort);
      resolve(false);
    }
  });
}

/**
 * Streams Server-Sent Events (SSE) chunks from /api/chat/stream, /api/maps/stream,
 * and /api/search/stream with automatic host failover and AbortSignal cancellation.
 */
export async function apiFetchStream(
  path: string,
  body: Record<string, unknown>,
  handlers: {
    signal?: AbortSignal;
    onStatus?: (statusText: string) => void;
    onDelta: (deltaText: string) => void;
    onDone: (payload: GeminiStreamDonePayload) => void;
  }
): Promise<boolean> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const bases = getApiBaseCandidates();

  const processEventBlock = (evt: string): boolean => {
    const dataLine = evt
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!dataLine) return false;

    const parsed = JSON.parse(dataLine) as {
      type?: string;
      text?: string;
      error?: string;
      places?: GroundingPlace[];
      sources?: Array<{ title: string; uri: string }>;
      pendingProposal?: PersistedChatMessage['pendingProposal'];
      latencyMs?: number;
      memoriesAppliedCount?: number;
      model?: string;
      cached?: boolean;
    };

    if (parsed.type === 'status' && typeof parsed.text === 'string') {
      handlers.onStatus?.(parsed.text);
      return false;
    }
    if (parsed.type === 'delta' && typeof parsed.text === 'string') {
      handlers.onDelta(parsed.text);
      return false;
    }
    if (parsed.type === 'error') {
      throw new Error(parsed.error || 'حدث خطأ أثناء بث الرد من Gemini.');
    }
    if (parsed.type === 'done') {
      handlers.onDone({
        text: parsed.text || '',
        places: parsed.places,
        sources: parsed.sources,
        pendingProposal: parsed.pendingProposal,
        latencyMs: parsed.latencyMs,
        memoriesAppliedCount: parsed.memoriesAppliedCount,
        model: parsed.model,
        cached: Boolean(parsed.cached),
      });
      return true;
    }
    return false;
  };

  for (let i = 0; i < bases.length; i += 1) {
    const url = `${bases[i]}${normalizedPath}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: handlers.signal,
      });

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !contentType.includes('text/event-stream') || !res.body) {
        if (contentType.includes('application/json')) {
          const errJson = (await res.json()) as { error?: string };
          throw new Error(errJson.error || `تعذر بدء البث (${res.status}).`);
        }
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          if (processEventBlock(evt)) {
            doneReceived = true;
          }
        }
      }

      // Flush any trailing SSE event when stream closes without double newline
      buffer += decoder.decode();
      if (buffer.trim()) {
        if (processEventBlock(buffer)) {
          doneReceived = true;
        }
      }

      if (doneReceived) return true;
      return false;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (i === bases.length - 1) {
        throw err;
      }
    }
  }

  return false;
}

/**
 * Defensively sanitizes persisted chat history loaded from localStorage so
 * corrupted entries, missing fields, or duplicate IDs never break chat rendering.
 */
export function sanitizePersistedChats(
  raw: unknown,
  welcomeMessage: PersistedChatMessage
): PersistedChatMessage[] {
  if (!Array.isArray(raw)) return [welcomeMessage];
  const seenIds = new Set<string>();
  const validModes = new Set(['chat', 'maps', 'search']);
  const cleaned: PersistedChatMessage[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<PersistedChatMessage>;
    const role = obj.role === 'user' || obj.role === 'model' ? obj.role : null;
    const text = typeof obj.text === 'string' ? obj.text.trim() : '';
    if (!role || !text) continue;

    let id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `msg-${i}-${Date.now()}`;
    if (seenIds.has(id)) {
      id = `${id}-${i}`;
    }
    seenIds.add(id);

    const mode =
      typeof obj.mode === 'string' && validModes.has(obj.mode)
        ? (obj.mode as PersistedChatMessage['mode'])
        : 'chat';

    const pendingProposal =
      obj.pendingProposal && typeof obj.pendingProposal === 'object'
        ? {
            summaryAr:
              typeof obj.pendingProposal.summaryAr === 'string'
                ? obj.pendingProposal.summaryAr
                : 'تعديل مقترح',
            actions: Array.isArray(obj.pendingProposal.actions) ? obj.pendingProposal.actions : [],
            taskActions: Array.isArray(obj.pendingProposal.taskActions)
              ? obj.pendingProposal.taskActions
              : undefined,
            medicationActions: Array.isArray(obj.pendingProposal.medicationActions)
              ? obj.pendingProposal.medicationActions
              : undefined,
            creativeActions: Array.isArray(obj.pendingProposal.creativeActions)
              ? obj.pendingProposal.creativeActions
              : undefined,
            profileUpdates:
              obj.pendingProposal.profileUpdates &&
              typeof obj.pendingProposal.profileUpdates === 'object'
                ? obj.pendingProposal.profileUpdates
                : undefined,
            memoryActions: Array.isArray(obj.pendingProposal.memoryActions)
              ? obj.pendingProposal.memoryActions
              : undefined,
            status:
              obj.pendingProposal.status === 'confirmed' ||
              obj.pendingProposal.status === 'cancelled'
                ? obj.pendingProposal.status
                : ('pending' as const),
          }
        : undefined;

    cleaned.push({
      id,
      role,
      mode,
      text,
      createdAtIso: typeof obj.createdAtIso === 'string' ? obj.createdAtIso : undefined,
      places: Array.isArray(obj.places) ? obj.places : undefined,
      sources: Array.isArray(obj.sources) ? obj.sources : undefined,
      pendingProposal,
      executionLinks: Array.isArray(obj.executionLinks) ? obj.executionLinks : undefined,
      latencyMs: typeof obj.latencyMs === 'number' ? obj.latencyMs : undefined,
      memoriesAppliedCount:
        typeof obj.memoriesAppliedCount === 'number' ? obj.memoriesAppliedCount : undefined,
      cached: Boolean(obj.cached),
      error: Boolean(obj.error),
    });
  }

  return cleaned.length > 0 ? cleaned.slice(-60) : [welcomeMessage];
}

/**
 * Strips HTML markup that Google Calendar sometimes embeds in event descriptions.
 */
export function cleanCalendarText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Strips leading/trailing emojis & variation selectors to test whether real readable text remains.
 */
function stripEmojisOnly(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D\u20E3]/g, '')
    .replace(/[·\-–—|•]+/g, ' ')
    .trim();
}

export interface BlockDisplayInfo {
  title: string;
  detail: string;
  emojiOnly: string;
}

/**
 * Resolves full readable Title + Detail for IN-APP display (pulling from BOTH Google Calendar
 * `summary` AND `description` so emoji-only event titles show the user's real written details),
 * while providing `emojiOnly` strictly for privacy-safe notifications/popups.
 */
export function resolveBlockDisplayInfo(block: ScheduleBlock | null | undefined): BlockDisplayInfo {
  if (!block) {
    return { title: '', detail: '', emojiOnly: '📅' };
  }

  const emojiOnly = (block.emojiPair || '📅').trim();
  const rawSummary = (block.categoryAr || '').trim();
  const summaryWithoutPrefix = rawSummary.startsWith(emojiOnly)
    ? rawSummary.slice(emojiOnly.length).trim()
    : rawSummary;

  const summaryHasReadableText = stripEmojisOnly(summaryWithoutPrefix).length > 0;
  const cleanedDesc = cleanCalendarText(block.description);
  const descLines = cleanedDesc
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (summaryHasReadableText) {
    const detailText =
      descLines.length > 0 && descLines[0] !== summaryWithoutPrefix
        ? descLines.join(' · ')
        : '';
    return {
      title: summaryWithoutPrefix,
      detail: detailText,
      emojiOnly,
    };
  }

  // Event summary is emoji-only (user's privacy convention in Google Calendar!) -> pull real title from description
  if (descLines.length > 0) {
    return {
      title: descLines[0],
      detail: descLines.slice(1).join(' · '),
      emojiOnly,
    };
  }

  if (block.calendarTitle && !block.calendarTitle.includes('@')) {
    return {
      title: block.calendarTitle,
      detail: '',
      emojiOnly,
    };
  }

  return {
    title: block.isAnchor ? 'موعد صلاة' : emojiOnly,
    detail: '',
    emojiOnly,
  };
}
