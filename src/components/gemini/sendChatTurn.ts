import type React from 'react';
import type {
  AppLanguage,
  CreativeActivityPlacement,
  DynamicHabit,
  GeoLocation,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
  ResolvedHabitPlacement,
  SettingsSnapshotContext,
} from '../../types/dayrhythm';
import { formatMinutes12h, getDateIsoInTimeZone } from '../../engines/prayerEngine';
import {
  apiFetchJson,
  apiFetchStream,
  apiStreamGeminiOverWs,
  buildClientGeminiCacheKey,
  getCachedGeminiResponse,
  isContextDependentChatQuery,
  setCachedGeminiResponse,
  type GeminiConnectionStatus,
} from '../../services/apiClient';
import { buildLongTermChatContext, buildNormalizedHistory } from './chatHelpers';

export interface SendChatTurnArgs {
  query: string;
  normalizedQueryKey: string;
  bypassCache: boolean;
  streamId: string;
  startedAt: number;
  signal: AbortSignal;
  messages: PersistedChatMessage[];
  activeLocation: GeoLocation;
  lifeProfile: LifeProfile;
  language: AppLanguage;
  contextSummary: string;
  serializedMemories: Array<{ id: string; category: MemoryItem['category']; ruleText: string; source: MemoryItem['source'] }>;
  memoriesCount: number;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  medications: MedicationItem[];
  habits: DynamicHabit[];
  resolvedHabits: ResolvedHabitPlacement[];
  creativePlacements: CreativeActivityPlacement[];
  currentSettingsSnapshot?: SettingsSnapshotContext;
  onChangeMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  setStreamStatus: (s: string) => void;
  setStreamingMsgId: (id: string | null) => void;
  setGeminiStatus: React.Dispatch<React.SetStateAction<GeminiConnectionStatus>>;
  maybeAutoExecuteProposal: (msgId: string, proposal?: PersistedChatMessage['pendingProposal']) => void;
}

export async function sendChatTurn(args: SendChatTurnArgs): Promise<void> {
  const {
    query, normalizedQueryKey, bypassCache, streamId, startedAt, signal,
    messages, activeLocation, lifeProfile, language, contextSummary,
    serializedMemories, memoriesCount, calendarEvents, googleTasks, medications,
    habits, resolvedHabits, creativePlacements, currentSettingsSnapshot,
    onChangeMessages, setStreamStatus, setStreamingMsgId, setGeminiStatus, maybeAutoExecuteProposal,
  } = args;

  const chatHistory = buildNormalizedHistory(messages);
  const timeBucket10m = Math.floor(Date.now() / (10 * 60_000));
  const contextDependent = isContextDependentChatQuery(query);
  const activeTz = activeLocation.timeZone || lifeProfile.currentTimeZone || 'Africa/Cairo';
  const todayLocalIso = getDateIsoInTimeZone(activeTz);

  const clientCacheKey = buildClientGeminiCacheKey([
    'chat_v2',
    todayLocalIso,
    timeBucket10m,
    normalizedQueryKey,
    contextDependent ? chatHistory.slice(-4) : '',
    contextSummary.slice(0, 800),
    serializedMemories.map((m) => `${m.id}:${m.category}:${m.ruleText}`),
    calendarEvents.slice(0, 30).map((e) => `${e.id}:${e.start}:${e.summary}`),
    googleTasks.slice(0, 20).map((t) => `${t.id}:${t.status}:${t.title}`),
    medications.map((m) => `${m.id}:${m.takenDateKey}:${m.remainingDoses ?? -1}`),
    habits.map((h) => `${h.id}:${h.status}:${h.anchor}:${h.completedDates.includes(todayLocalIso)}`),
  ]);

  if (!bypassCache) {
    const hit = getCachedGeminiResponse(clientCacheKey);
    if (hit) {
      onChangeMessages((prev) => [
        ...prev,
        {
          id: streamId, role: 'model', mode: 'chat', text: hit.text,
          createdAtIso: new Date().toISOString(), sources: hit.sources, latencyMs: 1,
          memoriesAppliedCount: hit.memoriesAppliedCount ?? memoriesCount, cached: true, retryPrompt: query,
        },
      ]);
      return;
    }
  }

  const requestBody = {
    message: query,
    bypassCache,
    history: chatHistory,
    contextSummary,
    longTermChatContext: buildLongTermChatContext(messages, query),
    memories: serializedMemories,
    calendarEvents: calendarEvents
      .filter((e) => {
        const endMs = new Date(e.end || e.start).getTime();
        return Number.isNaN(endMs) || endMs >= Date.now();
      })
      .slice(0, 35)
      .map((e) => ({
        id: e.id, calendarId: e.calendarId, calendarTitle: e.calendarTitle,
        summary: e.summary, description: e.description, location: e.location, start: e.start, end: e.end,
      })),
    tasks: googleTasks.slice(0, 30).map((t) => ({
      id: t.id, taskListId: t.taskListId, taskListTitle: t.taskListTitle, title: t.title, status: t.status, due: t.due,
    })),
    medications: medications.map((m) => ({
      id: m.id, name: m.name, time24: m.time24, times24: m.times24, daysOfWeek: m.daysOfWeek,
      fastingPolicy: m.fastingPolicy, doseNote: m.doseNote, takenToday: m.takenDateKey === todayLocalIso,
      takenDosesToday: m.takenDateKey === todayLocalIso ? m.takenDosesToday ?? [] : [],
      courseEndDate: m.courseEndDate, remainingDoses: m.remainingDoses, totalDoses: m.totalDoses,
      refillAlertDays: m.refillAlertDays ?? 3, takenDates: m.takenDates ?? [],
    })),
    settingsSnapshot: currentSettingsSnapshot ?? {
      lifeProfile,
      medications: medications.map((m) => ({ id: m.id, name: m.name, fastingPolicy: m.fastingPolicy })),
    },
    creativeActivities: creativePlacements.map((p) => ({
      id: p.activity.id, name: p.activity.name, emoji: p.activity.emoji, cadence: p.cadence,
      goalCount: p.goalInPeriod, sessionsInPeriod: p.sessionsInPeriod,
      weeklyGoalSessions: p.activity.weeklyGoalSessions, sessionsThisWeek: p.sessionsThisWeek,
      sessionMinutes: p.activity.sessionMinutes, completedToday: p.doneToday,
      scheduledTime24: p.activity.scheduledTime24 || p.suggestedSlot?.time24, expiresOnDate: p.activity.expiresOnDate,
    })),
    habits: [
      ...resolvedHabits.map((r) => ({
        id: r.habit.id, title: r.habit.title, status: r.habit.status, anchor: r.habit.anchor,
        durationMin: r.habit.durationMin, daysOfWeek: r.habit.daysOfWeek, skipOnFasting: r.habit.skipOnFasting,
        completedToday: r.completedToday,
        resolvedTimeLabel: r.slot ? `${formatMinutes12h(r.slot.startMin, language)} – ${formatMinutes12h(r.slot.endMin, language)}` : undefined,
        isFallbackSlot: r.isFallbackSlot, isFlexibleUnplaced: r.isFlexibleUnplaced, skippedReasonAr: r.skippedReasonAr,
      })),
      ...habits.filter((h) => h.status === 'planned').map((h) => ({
        id: h.id, title: h.title, status: h.status, anchor: h.anchor,
        durationMin: h.durationMin, daysOfWeek: h.daysOfWeek, skipOnFasting: h.skipOnFasting, completedToday: false,
      })),
    ],
  };

  let streamInserted = false;
  let streamedSuccessfully = false;

  const finalize = (payload: {
    text?: string;
    sources?: Array<{ title: string; uri: string }>;
    pendingProposal?: PersistedChatMessage['pendingProposal'];
    latencyMs?: number;
    memoriesAppliedCount?: number;
    model?: string;
    cached?: boolean;
  }) => {
    const latencyMs = payload.latencyMs ?? Math.max(1, Date.now() - startedAt);
    setGeminiStatus({
      ok: true, connected: true, status: 'online',
      model: payload.model || 'gemini-3.1-flash-lite', latencyMs, checkedAtIso: new Date().toISOString(),
    });
    const preparedProposal = payload.pendingProposal ? { ...payload.pendingProposal, status: 'pending' as const } : undefined;
    const finalText = payload.text || 'تم إعداد التعديل.';
    const finalSources = Array.isArray(payload.sources) && payload.sources.length > 0 ? payload.sources : undefined;
    if (!preparedProposal && finalText.trim()) {
      setCachedGeminiResponse(
        clientCacheKey,
        { text: finalText, sources: finalSources, memoriesAppliedCount: payload.memoriesAppliedCount ?? memoriesCount, model: payload.model },
        15 * 60_000
      );
    }
    const finalMsg: PersistedChatMessage = {
      id: streamId, role: 'model', mode: 'chat', text: finalText, createdAtIso: new Date().toISOString(),
      sources: finalSources, pendingProposal: preparedProposal, latencyMs,
      memoriesAppliedCount: payload.memoriesAppliedCount ?? memoriesCount,
      cached: Boolean(payload.cached), retryPrompt: payload.cached ? query : undefined,
    };
    if (!streamInserted) {
      streamInserted = true;
      onChangeMessages((prev) => [...prev, finalMsg]);
    } else {
      onChangeMessages((prev) => prev.map((m) => (m.id === streamId ? finalMsg : m)));
    }
    maybeAutoExecuteProposal(streamId, preparedProposal);
  };

  const chatStreamHandlers = {
    signal,
    onStatus: setStreamStatus,
    onDelta: (deltaText: string) => {
      if (!streamInserted) {
        streamInserted = true;
        setStreamingMsgId(streamId);
        onChangeMessages((prev) => [...prev, { id: streamId, role: 'model', mode: 'chat', text: deltaText, createdAtIso: new Date().toISOString() }]);
      } else {
        onChangeMessages((prev) => prev.map((m) => (m.id === streamId ? { ...m, text: m.text + deltaText } : m)));
      }
    },
    onDone: finalize,
  };

  try {
    streamedSuccessfully = await apiStreamGeminiOverWs(requestBody, chatStreamHandlers);
  } catch (wsErr: unknown) {
    if ((wsErr instanceof DOMException && wsErr.name === 'AbortError') || streamInserted) throw wsErr;
  }

  if (!streamedSuccessfully) {
    try {
      streamedSuccessfully = await apiFetchStream('/api/chat/stream', requestBody, chatStreamHandlers);
    } catch (streamErr: unknown) {
      if ((streamErr instanceof DOMException && streamErr.name === 'AbortError') || streamInserted) throw streamErr;
    }
  }

  if (!streamedSuccessfully) {
    const { ok, data } = await apiFetchJson<{
      text?: string; error?: string; sources?: Array<{ title: string; uri: string }>;
      pendingProposal?: PersistedChatMessage['pendingProposal']; latencyMs?: number;
      memoriesAppliedCount?: number; model?: string; cached?: boolean;
    }>('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal,
    });
    if (!ok) throw new Error(data.error || 'تعذر الرد من المساعد.');
    finalize(data);
  }
}
