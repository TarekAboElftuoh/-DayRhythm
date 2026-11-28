import { GroundingPlace } from '../../types/dayrhythm';

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
