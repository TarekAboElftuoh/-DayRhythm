import { PersistedChatMessage, ScheduleBlock } from '../types/dayrhythm';

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

function getApiBaseCandidates(): string[] {
  if (!isStandaloneVirtualHost()) {
    return [''];
  }

  const candidates: string[] = [];
  try {
    const custom = localStorage.getItem(CUSTOM_API_URL_KEY)?.trim();
    if (custom && /^https?:\/\//i.test(custom)) {
      candidates.push(custom.replace(/\/+$/, ''));
    }
  } catch {
    // ignore storage errors
  }

  const envUrl = (import.meta.env?.VITE_CLOUD_API_URL as string | undefined)?.trim();
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
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
            ? 'الخادم السحابي غير منشور بعد على هذا الرابط.'
            : `استجابة غير صالحة من الخادم (${res.status}).`;
        continue;
      }

      const data = (await res.json()) as T;
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
      ? 'تعذر الاتصال بخادم شات Gemini السحابي حالياً — تأكد من الإنترنت أو تأكد من نشر التطبيق (Share / Deploy) في AI Studio لتفعيل شات Gemini على الكمبيوتر والموبايل.'
      : lastErrorMsg || `تعذر الاتصال بالخادم (${lastStatus || 'network'}).`
  );
}

/**
 * Queries real live Gemini backend connectivity and latency via /api/gemini/status.
 */
export async function checkGeminiStatus(forceProbe = false): Promise<GeminiConnectionStatus> {
  const startedAt = Date.now();
  try {
    const query = forceProbe ? '?probe=1' : '';
    const { ok, data } = await apiFetchJson<Partial<GeminiConnectionStatus>>(
      `/api/gemini/status${query}`,
      { method: 'GET', cache: 'no-store' }
    );
    const roundTrip = Math.max(1, Date.now() - startedAt);
    return {
      ok: Boolean(ok && data.connected),
      connected: Boolean(ok && data.connected),
      status: ok && data.connected ? 'online' : data.status === 'degraded' ? 'degraded' : 'offline',
      model: data.model || 'gemini-4-hydrogen',
      latencyMs: typeof data.latencyMs === 'number' && data.latencyMs > 0 ? data.latencyMs : roundTrip,
      checkedAtIso: data.checkedAtIso || new Date().toISOString(),
      error: data.error,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: 'gemini-4-hydrogen',
      latencyMs: Math.max(1, Date.now() - startedAt),
      checkedAtIso: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'تعذر الوصول إلى خادم Gemini.',
    };
  }
}

export interface GeminiStreamDonePayload {
  text: string;
  sources?: Array<{ title: string; uri: string }>;
  pendingProposal?: PersistedChatMessage['pendingProposal'];
  latencyMs?: number;
  memoriesAppliedCount?: number;
  model?: string;
}

/**
 * Streams Server-Sent Events (SSE) chunks from /api/chat/stream with automatic
 * host failover and AbortSignal cancellation support.
 */
export async function apiFetchStream(
  path: string,
  body: Record<string, unknown>,
  handlers: {
    signal?: AbortSignal;
    onDelta: (deltaText: string) => void;
    onDone: (payload: GeminiStreamDonePayload) => void;
  }
): Promise<boolean> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const bases = getApiBaseCandidates();

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
          const dataLine = evt
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('');
          if (!dataLine) continue;

          const parsed = JSON.parse(dataLine) as {
            type?: string;
            text?: string;
            error?: string;
            sources?: Array<{ title: string; uri: string }>;
            pendingProposal?: PersistedChatMessage['pendingProposal'];
            latencyMs?: number;
            memoriesAppliedCount?: number;
            model?: string;
          };

          if (parsed.type === 'delta' && typeof parsed.text === 'string') {
            handlers.onDelta(parsed.text);
          } else if (parsed.type === 'error') {
            throw new Error(parsed.error || 'حدث خطأ أثناء بث الرد من Gemini.');
          } else if (parsed.type === 'done') {
            doneReceived = true;
            handlers.onDone({
              text: parsed.text || '',
              sources: parsed.sources,
              pendingProposal: parsed.pendingProposal,
              latencyMs: parsed.latencyMs,
              memoriesAppliedCount: parsed.memoriesAppliedCount,
              model: parsed.model,
            });
          }
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
