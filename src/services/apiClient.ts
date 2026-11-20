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

const CLIENT_GEMINI_CACHE_MAX = 60;
const clientGeminiCache = new Map<string, ClientCacheEntry>();

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

export function getCachedGeminiResponse(key: string): ClientCachedGeminiResponse | null {
  const entry = clientGeminiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    clientGeminiCache.delete(key);
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
}

export function clearGeminiClientCache(): void {
  clientGeminiCache.clear();
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
