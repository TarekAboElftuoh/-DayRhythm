import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
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
import type { AssistantMode } from './types';
import { readChatOfflineQueue, writeChatOfflineQueue } from './chatHelpers';
import { sendChatTurn } from './sendChatTurn';
import { sendGroundedTurn } from './sendGroundedTurn';
import type { useGeminiConnection } from './useGeminiConnection';
import { canAutoExecuteProposal, formatGeminiChatError } from './geminiChatErrorHelper';

export interface UseGeminiChatControllerParams {
  mode: AssistantMode;
  draftsByMode: Record<AssistantMode, string>;
  loadingByMode: Record<AssistantMode, boolean>;
  setInputForMode: (m: AssistantMode, v: string) => void;
  setLoadingByMode: Dispatch<SetStateAction<Record<AssistantMode, boolean>>>;
  setStreamingMsgIdByMode: Dispatch<SetStateAction<Record<AssistantMode, string | null>>>;
  setStreamStatusByMode: Dispatch<SetStateAction<Record<AssistantMode, string>>>;
  abortControllersRef: MutableRefObject<Record<AssistantMode, AbortController | null>>;
  userScrolledUpRef: MutableRefObject<boolean>;
  autoExecuteRef: MutableRefObject<boolean>;
  onGoogleSignIn: () => Promise<void>;
  onChangeMessages: Dispatch<SetStateAction<PersistedChatMessage[]>>;
  activeLocation: GeoLocation;
  userCoords: { lat: number; lng: number };
  setUserCoords: Dispatch<SetStateAction<{ lat: number; lng: number }>>;
  setGpsStatus: Dispatch<SetStateAction<string>>;
  memories: MemoryItem[];
  messages: PersistedChatMessage[];
  lifeProfile: LifeProfile;
  language: AppLanguage;
  contextSummary: string;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  medications: MedicationItem[];
  habits: DynamicHabit[];
  resolvedHabits: ResolvedHabitPlacement[];
  creativePlacements: CreativeActivityPlacement[];
  currentSettingsSnapshot?: SettingsSnapshotContext;
  setGeminiStatus: ReturnType<typeof useGeminiConnection>['setGeminiStatus'];
  handleConfirmProposal: (...args: any[]) => Promise<void>;
}

export function useGeminiChatController(p: UseGeminiChatControllerParams) {
  const {
    mode,
    draftsByMode,
    loadingByMode,
    setInputForMode,
    setLoadingByMode,
    setStreamingMsgIdByMode,
    setStreamStatusByMode,
    abortControllersRef,
    userScrolledUpRef,
    autoExecuteRef,
    onGoogleSignIn,
    onChangeMessages,
    activeLocation,
    userCoords,
    setUserCoords,
    setGpsStatus,
    memories,
    messages,
    lifeProfile,
    language,
    contextSummary,
    calendarEvents,
    googleTasks,
    medications,
    habits,
    resolvedHabits,
    creativePlacements,
    currentSettingsSnapshot,
    setGeminiStatus,
    handleConfirmProposal,
  } = p;

  const stopGeneration = (targetMode: AssistantMode = mode) => {
    abortControllersRef.current[targetMode]?.abort();
    abortControllersRef.current[targetMode] = null;
    setLoadingByMode((prev) => ({ ...prev, [targetMode]: false }));
    setStreamingMsgIdByMode((prev) => ({ ...prev, [targetMode]: null }));
    setStreamStatusByMode((prev) => ({ ...prev, [targetMode]: '' }));
  };

  const handleSignInClick = async () => {
    try {
      await onGoogleSignIn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.';
      onChangeMessages((prev) => [...prev, { id: `auth-err-${Date.now()}`, role: 'model', mode: 'chat', text: msg, error: true }]);
    }
  };

  const requestBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus(`المتصفح لا يدعم GPS — استخدام ${activeLocation.nameAr}`);
      return;
    }
    setGpsStatus('جارٍ تحديد الموقع...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus(`GPS مباشر (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
      },
      () => {
        setUserCoords({ lat: activeLocation.lat, lng: activeLocation.lng });
        setGpsStatus(`${activeLocation.nameAr} (احتياطي)`);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 }
    );
  };

  const resolveFreshGpsCoords = async (): Promise<{ lat: number; lng: number }> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return userCoords;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 })
      );
      const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserCoords(fresh);
      setGpsStatus(`GPS مباشر (${fresh.lat.toFixed(4)}, ${fresh.lng.toFixed(4)})`);
      return fresh;
    } catch {
      return userCoords;
    }
  };

  const serializedMemories = useMemo(
    () => memories.map((m) => ({ id: m.id, category: m.category, ruleText: m.ruleText, source: m.source })),
    [memories]
  );

  const sendMessage = async (
    overrideText?: string,
    overrideMode?: AssistantMode,
    options?: { bypassCache?: boolean; queuedId?: string }
  ) => {
    const activeMode = overrideMode ?? mode;
    const query = (overrideText ?? draftsByMode[activeMode]).trim();
    if (!query || loadingByMode[activeMode]) return;
    const bypassCache = Boolean(options?.bypassCache);
    userScrolledUpRef.current = false;
    const userMsg: PersistedChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      mode: activeMode,
      text: query,
      createdAtIso: new Date().toISOString(),
    };

    if (!options?.queuedId && navigator.onLine === false) {
      onChangeMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `q-${userMsg.id}`,
          role: 'model',
          mode: activeMode,
          text: '⏳ مفيش إنترنت دلوقتي — رسالتك محفوظة وهتتبعت لوحدها أول ما النت يرجع.',
          createdAtIso: new Date().toISOString(),
        },
      ]);
      if (!overrideText) setInputForMode(activeMode, '');
      writeChatOfflineQueue([...readChatOfflineQueue(), { id: userMsg.id, text: query, mode: activeMode }]);
      return;
    }

    if (options?.queuedId) {
      const placeholderId = `q-${options.queuedId}`;
      onChangeMessages((prev) => prev.filter((m) => m.id !== placeholderId));
    } else {
      onChangeMessages((prev) => [...prev, userMsg]);
    }
    if (!overrideText) setInputForMode(activeMode, '');
    setLoadingByMode((prev) => ({ ...prev, [activeMode]: true }));
    setStreamStatusByMode((prev) => ({
      ...prev,
      [activeMode]:
        activeMode === 'maps'
          ? 'جارٍ البحث في الخرائط حول موقعك...'
          : activeMode === 'search'
            ? 'جارٍ البحث المباشر وتجميع المصادر...'
            : 'جارٍ التفكير وفق دستورك وذاكرتك...',
    }));

    const controller = new AbortController();
    abortControllersRef.current[activeMode] = controller;
    let hangTimedOut = false;
    const hangTimeoutId = window.setTimeout(() => {
      hangTimedOut = true;
      controller.abort();
    }, 45_000);
    const startedAt = Date.now();
    const normalizedQueryKey = query.replace(/\s+/g, ' ').toLowerCase();

    const maybeAutoExecuteProposal = (msgId: string, proposal?: PersistedChatMessage['pendingProposal']) => {
      if (!proposal || !canAutoExecuteProposal(proposal, autoExecuteRef.current)) return;
      window.setTimeout(() => {
        void handleConfirmProposal(
          msgId,
          proposal.actions,
          proposal.taskActions ?? [],
          proposal.medicationActions ?? [],
          proposal.creativeActions ?? [],
          proposal.profileUpdates,
          proposal.memoryActions ?? [],
          proposal.appSettings,
          proposal.settingsPatchProposal,
          proposal.habitActions ?? []
        );
      }, 0);
    };

    try {
      const streamId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (activeMode === 'chat') {
        await sendChatTurn({
          query, normalizedQueryKey, bypassCache, streamId, startedAt, signal: controller.signal,
          messages, activeLocation, lifeProfile, language, contextSummary, serializedMemories,
          memoriesCount: memories.length, calendarEvents, googleTasks, medications, habits, resolvedHabits,
          creativePlacements, currentSettingsSnapshot, onChangeMessages,
          setStreamStatus: (s) => setStreamStatusByMode((prev) => ({ ...prev, chat: s })),
          setStreamingMsgId: (id) => setStreamingMsgIdByMode((prev) => ({ ...prev, chat: id })),
          setGeminiStatus, maybeAutoExecuteProposal,
        });
      } else {
        const coords = activeMode === 'maps' ? await resolveFreshGpsCoords() : userCoords;
        await sendGroundedTurn({
          mode: activeMode, query, normalizedQueryKey, bypassCache, streamId, startedAt, signal: controller.signal,
          coords, activeLocation, lifeProfile, contextSummary, serializedMemories, memoriesCount: memories.length,
          onChangeMessages,
          setStreamStatus: (s) => setStreamStatusByMode((prev) => ({ ...prev, [activeMode]: s })),
          setStreamingMsgId: (id) => setStreamingMsgIdByMode((prev) => ({ ...prev, [activeMode]: id })),
          setGeminiStatus,
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError' && !hangTimedOut) return;
      const { errMsg, isTransientRate } = formatGeminiChatError(err, hangTimedOut);
      setGeminiStatus((prev) => ({
        ...prev,
        ok: false,
        connected: isTransientRate ? prev.connected : false,
        status: isTransientRate ? 'degraded' : 'offline',
        error: errMsg,
        checkedAtIso: new Date().toISOString(),
      }));
      onChangeMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'model',
          mode: activeMode,
          text: errMsg,
          createdAtIso: new Date().toISOString(),
          error: true,
          retryPrompt: query,
        },
      ]);
    } finally {
      window.clearTimeout(hangTimeoutId);
      abortControllersRef.current[activeMode] = null;
      setLoadingByMode((prev) => ({ ...prev, [activeMode]: false }));
      setStreamingMsgIdByMode((prev) => ({ ...prev, [activeMode]: null }));
      setStreamStatusByMode((prev) => ({ ...prev, [activeMode]: '' }));
    }
  };

  return { stopGeneration, handleSignInClick, requestBrowserGps, sendMessage };
}
