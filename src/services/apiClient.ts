import { GroundingPlace, PersistedChatMessage, ScheduleBlock } from '../types/dayrhythm';
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
} from './geminiClient';

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

const CLOUD_API_STORAGE_KEY = 'dayrhythm_cloud_api_url';
let memoryCloudApiUrl = '';

export function getSavedCloudApiUrl(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(CLOUD_API_STORAGE_KEY) || memoryCloudApiUrl;
    } catch {
      return memoryCloudApiUrl;
    }
  }
  return memoryCloudApiUrl;
}

export function setSavedCloudApiUrl(rawUrl: string): { saved: string; error?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    memoryCloudApiUrl = '';
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(CLOUD_API_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return { saved: '' };
  }
  try {
    const parsed = new URL(trimmed);
    const sanitized = `${parsed.protocol}//${parsed.host}`;
    memoryCloudApiUrl = sanitized;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(CLOUD_API_STORAGE_KEY, sanitized);
      } catch {
        // ignore
      }
    }
    return { saved: sanitized };
  } catch {
    return { saved: '', error: 'عنوان URL غير صالح' };
  }
}

export function clearSavedCloudApiUrl(): void {
  memoryCloudApiUrl = '';
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(CLOUD_API_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function syncSavedCloudApiUrlFromRemote(remoteUrl?: string): void {
  if (!remoteUrl || typeof window === 'undefined') return;
  try {
    const current = window.localStorage.getItem(CLOUD_API_STORAGE_KEY);
    if (!current && remoteUrl.startsWith('http')) {
      const parsed = new URL(remoteUrl);
      const sanitized = `${parsed.protocol}//${parsed.host}`;
      window.localStorage.setItem(CLOUD_API_STORAGE_KEY, sanitized);
      memoryCloudApiUrl = sanitized;
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
    const validEntries: Array<[string, ClientCacheEntry]> = [];
    for (const [k, entry] of clientGeminiCache.entries()) {
      if (entry.expiresAtMs > now) {
        validEntries.push([k, entry]);
      }
    }
    localStorage.setItem(CLIENT_GEMINI_CACHE_STORAGE_KEY, JSON.stringify(validEntries.slice(-CLIENT_GEMINI_CACHE_MAX)));
  } catch {
    // ignore storage write errors
  }
}

export function clearGeminiClientCache(): void {
  clientGeminiCache.clear();
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(CLIENT_GEMINI_CACHE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function buildClientGeminiCacheKey(parts: unknown[]): string {
  try {
    const str = JSON.stringify(parts);
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `gc_${Math.abs(hash).toString(36)}`;
  } catch {
    return `gc_${Date.now()}`;
  }
}

export function getCachedGeminiResponse(key: string): ClientCachedGeminiResponse | null {
  hydrateClientGeminiCache();
  const entry = clientGeminiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    clientGeminiCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedGeminiResponse(
  key: string,
  value: ClientCachedGeminiResponse,
  ttlMs = 15 * 60_000
): void {
  hydrateClientGeminiCache();
  if (clientGeminiCache.size >= CLIENT_GEMINI_CACHE_MAX) {
    const oldestKey = clientGeminiCache.keys().next().value;
    if (oldestKey !== undefined) clientGeminiCache.delete(oldestKey);
  }
  clientGeminiCache.set(key, {
    value,
    expiresAtMs: Date.now() + ttlMs,
  });
  persistClientGeminiCache();
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
            appSettings:
              obj.pendingProposal.appSettings && typeof obj.pendingProposal.appSettings === 'object'
                ? obj.pendingProposal.appSettings
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

  return cleaned.length > 0 ? sortChatMessagesChronologically(cleaned.slice(-60)) : [welcomeMessage];
}

/**
 * Safely extracts an epoch millisecond timestamp from a persisted chat message.
 * Inspects `createdAtIso`, embedded timestamp in message IDs (`u-174000...`, `m-174000...`),
 * and ensures deterministic chronological ordering.
 */
export function getChatMessageTimestampMs(msg: PersistedChatMessage): number {
  if (msg.id === 'welcome-1') return 0;
  if (typeof msg.createdAtIso === 'string' && msg.createdAtIso) {
    const parsed = Date.parse(msg.createdAtIso);
    if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
      return parsed;
    }
  }
  const match = msg.id.match(/\b(?:u|m|msg|chat)-(\d{12,14})\b/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Deterministically sorts chat messages in ascending chronological order:
 * 1. welcome-1 is always pinned to the top.
 * 2. Older messages precede newer messages based on timestamp.
 * 3. Tie-breaker: user messages ALWAYS precede model replies when timestamps match.
 * 4. Secondary tie-breaker: deterministic ID comparison.
 */
export function sortChatMessagesChronologically(
  msgs: PersistedChatMessage[]
): PersistedChatMessage[] {
  if (!Array.isArray(msgs) || msgs.length <= 1) return msgs || [];

  const welcome = msgs.find((m) => m.id === 'welcome-1');
  const others = msgs.filter((m) => m.id !== 'welcome-1');

  others.sort((a, b) => {
    const tsA = getChatMessageTimestampMs(a);
    const tsB = getChatMessageTimestampMs(b);
    if (tsA !== tsB) {
      return tsA - tsB;
    }
    // If identical timestamp: user query always comes before model response
    if (a.role === 'user' && b.role === 'model') return -1;
    if (a.role === 'model' && b.role === 'user') return 1;
    return a.id.localeCompare(b.id);
  });

  return welcome ? [welcome, ...others] : others;
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

function stripEmojisOnly(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D\u20E3]/g, '')
    .replace(/[·\-–—|•]+/g, ' ')
    .trim();
}

const EMOJI_CLUSTER = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?/gu;

function normalizeEmoji(e: string): string {
  return e.replace(/️/g, '');
}

/**
 * The row already shows the event's emoji pair as icons; titles taken from the description often
 * start (or end) with the same emoji, which showed it twice (e.g. "🕌 🌤️  🕌 العصر"). Strip those.
 */
function stripPairEmojisFromTitle(title: string, emojiOnly: string): string {
  const pair = new Set((emojiOnly.match(EMOJI_CLUSTER) ?? []).map(normalizeEmoji));
  if (pair.size === 0) return title;
  const original = title.trim();
  // Split into tokens; within the run of emojis at the start and at the end of the title,
  // drop the ones already shown as icons and keep any other emoji.
  const tokens = original.split(/\s+/).filter(Boolean);
  const isEmojiOnlyToken = (tok: string) =>
    tok.replace(EMOJI_CLUSTER, '').replace(/[️‍·\-–—|]/g, '').length === 0;
  const keepToken = (tok: string) => {
    const clusters = tok.match(EMOJI_CLUSTER) ?? [];
    const kept = clusters.filter((c) => !pair.has(normalizeEmoji(c)));
    return kept.join('');
  };
  let i = 0;
  const lead: string[] = [];
  while (i < tokens.length && isEmojiOnlyToken(tokens[i])) {
    const k = keepToken(tokens[i]);
    if (k) lead.push(k);
    i += 1;
  }
  let j = tokens.length - 1;
  const trail: string[] = [];
  while (j >= i && isEmojiOnlyToken(tokens[j])) {
    const k = keepToken(tokens[j]);
    if (k) trail.unshift(k);
    j -= 1;
  }
  const middle = tokens.slice(i, j + 1);
  const result = [...lead, ...middle, ...trail].join(' ').trim();
  // Never strip a title down to nothing readable.
  return stripEmojisOnly(result).length > 0 ? result : original;
}

export interface BlockDisplayInfo {
  title: string;
  detail: string;
  emojiOnly: string;
}

export function resolveBlockDisplayInfo(block: ScheduleBlock | null | undefined): BlockDisplayInfo {
  const info = resolveBlockDisplayInfoRaw(block);
  return { ...info, title: stripPairEmojisFromTitle(info.title, info.emojiOnly) };
}

function resolveBlockDisplayInfoRaw(block: ScheduleBlock | null | undefined): BlockDisplayInfo {
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
