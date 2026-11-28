import type React from 'react';
import type { GeoLocation, LifeProfile, MemoryItem, PersistedChatMessage } from '../../types/dayrhythm';
import { getDateIsoInTimeZone } from '../../engines/prayerEngine';
import {
  apiFetchJson,
  apiFetchStream,
  buildClientGeminiCacheKey,
  getCachedGeminiResponse,
  setCachedGeminiResponse,
  type GeminiConnectionStatus,
} from '../../services/apiClient';

export interface SendGroundedTurnArgs {
  mode: 'maps' | 'search';
  query: string;
  normalizedQueryKey: string;
  bypassCache: boolean;
  streamId: string;
  startedAt: number;
  signal: AbortSignal;
  coords: { lat: number; lng: number };
  activeLocation: GeoLocation;
  lifeProfile: LifeProfile;
  contextSummary: string;
  serializedMemories: Array<{ id: string; category: MemoryItem['category']; ruleText: string; source: MemoryItem['source'] }>;
  memoriesCount: number;
  onChangeMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  setStreamStatus: (s: string) => void;
  setStreamingMsgId: (id: string | null) => void;
  setGeminiStatus: React.Dispatch<React.SetStateAction<GeminiConnectionStatus>>;
}

export async function sendGroundedTurn(args: SendGroundedTurnArgs): Promise<void> {
  const {
    mode, query, normalizedQueryKey, bypassCache, streamId, startedAt, signal, coords,
    activeLocation, lifeProfile, contextSummary, serializedMemories, memoriesCount,
    onChangeMessages, setStreamStatus, setStreamingMsgId, setGeminiStatus,
  } = args;

  const activeTz = activeLocation.timeZone || lifeProfile.currentTimeZone || 'Africa/Cairo';
  const isMaps = mode === 'maps';
  const clientCacheKey = buildClientGeminiCacheKey(
    isMaps
      ? ['maps', normalizedQueryKey, coords.lat.toFixed(3), coords.lng.toFixed(3), serializedMemories.slice(0, 10).map((m) => m.ruleText)]
      : ['search', getDateIsoInTimeZone(activeTz), normalizedQueryKey, coords.lat.toFixed(2), coords.lng.toFixed(2), serializedMemories.slice(0, 10).map((m) => m.ruleText)]
  );

  if (!bypassCache) {
    const hit = getCachedGeminiResponse(clientCacheKey);
    if (hit) {
      onChangeMessages((prev) => [
        ...prev,
        {
          id: streamId, role: 'model', mode, text: hit.text, createdAtIso: new Date().toISOString(),
          ...(isMaps ? { places: hit.places ?? [] } : { sources: hit.sources ?? [] }),
          latencyMs: 1, memoriesAppliedCount: hit.memoriesAppliedCount ?? memoriesCount,
          cached: true, retryPrompt: query,
        },
      ]);
      return;
    }
  }

  const requestBody = {
    query, bypassCache, lat: coords.lat, lng: coords.lng,
    memories: serializedMemories, constitutionBrief: contextSummary.slice(0, 600),
  };

  let streamInserted = false;
  let streamedSuccessfully = false;

  const finalize = (payload: {
    text?: string;
    places?: Array<{ title: string; uri: string; snippets?: string[] }>;
    sources?: Array<{ title: string; uri: string }>;
    latencyMs?: number;
    memoriesAppliedCount?: number;
    model?: string;
    cached?: boolean;
  }) => {
    const latencyMs = payload.latencyMs ?? Math.max(1, Date.now() - startedAt);
    setGeminiStatus((prev) => ({
      ...prev, ok: true, connected: true, status: 'online', latencyMs, checkedAtIso: new Date().toISOString(),
    }));
    const finalText = payload.text || (isMaps ? 'تم العثور على النتائج التالية:' : 'نتائج البحث:');
    const finalPlaces = isMaps && Array.isArray(payload.places) ? payload.places : undefined;
    const finalSources = !isMaps && Array.isArray(payload.sources) ? payload.sources : undefined;
    setCachedGeminiResponse(
      clientCacheKey,
      {
        text: finalText, places: finalPlaces, sources: finalSources,
        memoriesAppliedCount: payload.memoriesAppliedCount ?? memoriesCount, model: payload.model,
      },
      (isMaps ? 20 : 10) * 60_000
    );
    const finalMsg: PersistedChatMessage = {
      id: streamId, role: 'model', mode, text: finalText, createdAtIso: new Date().toISOString(),
      places: finalPlaces, sources: finalSources, latencyMs,
      memoriesAppliedCount: payload.memoriesAppliedCount ?? memoriesCount,
      cached: Boolean(payload.cached), retryPrompt: payload.cached ? query : undefined,
    };
    if (!streamInserted) {
      streamInserted = true;
      onChangeMessages((prev) => [...prev, finalMsg]);
    } else {
      onChangeMessages((prev) => prev.map((m) => (m.id === streamId ? finalMsg : m)));
    }
  };

  try {
    streamedSuccessfully = await apiFetchStream(isMaps ? '/api/maps/stream' : '/api/search/stream', requestBody, {
      signal,
      onStatus: setStreamStatus,
      onDelta: (deltaText) => {
        if (!streamInserted) {
          streamInserted = true;
          setStreamingMsgId(streamId);
          onChangeMessages((prev) => [...prev, { id: streamId, role: 'model', mode, text: deltaText, createdAtIso: new Date().toISOString() }]);
        } else {
          onChangeMessages((prev) => prev.map((m) => (m.id === streamId ? { ...m, text: m.text + deltaText } : m)));
        }
      },
      onDone: finalize,
    });
  } catch (streamErr: unknown) {
    if ((streamErr instanceof DOMException && streamErr.name === 'AbortError') || streamInserted) throw streamErr;
  }

  if (!streamedSuccessfully) {
    const { ok, data } = await apiFetchJson<{
      text?: string; error?: string;
      places?: Array<{ title: string; uri: string; snippets?: string[] }>;
      sources?: Array<{ title: string; uri: string }>;
      latencyMs?: number; memoriesAppliedCount?: number; cached?: boolean;
    }>(isMaps ? '/api/maps' : '/api/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal,
    });
    if (!ok) throw new Error(data.error || (isMaps ? 'تعذر جلب نتائج الخرائط.' : 'تعذر إجراء البحث المباشر.'));
    finalize(data);
  }
}
