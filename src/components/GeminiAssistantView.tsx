import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  MapPin,
  Search,
  MessageSquare,
  ExternalLink,
  Loader2,
  Calendar,
  Check,
  X,
  RefreshCw,
  LogOut,
  CheckSquare,
  RotateCcw,
  Mic,
  MicOff,
  Square,
  BookOpen,
  Plus,
  Trash2,
  SlidersHorizontal,
  WifiOff,
  PanelLeftOpen,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  AppLanguage,
  CalendarActionProposal,
  CalendarExecutionResult,
  CreativeActivityActionProposal,
  CreativeActivityPlacement,
  CreativeExecutionResult,
  GeoLocation,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationItem,
  MemoryActionProposal,
  MemoryCategory,
  MemoryItem,
  PersistedChatMessage,
  TaskActionProposal,
  TaskExecutionResult,
} from '../types/dayrhythm';
import { formatIsoTo12h, formatTime24To12h, getCairoTodayIso } from '../engines/prayerEngine';
import { ARABIC_WEEKDAYS, MEMORY_CATEGORY_LABELS } from '../engines/lifeRhythmEngine';
import {
  GeminiConnectionStatus,
  apiFetchJson,
  apiFetchStream,
  checkGeminiStatus,
  cleanCalendarText,
  getSavedCloudApiUrl,
  isStandaloneVirtualHost,
  setSavedCloudApiUrl,
} from '../services/apiClient';

type AssistantMode = 'chat' | 'maps' | 'search';
type SidebarTab = 'memories' | 'events' | 'tasks';

interface GeminiAssistantViewProps {
  language: AppLanguage;
  activeLocation: GeoLocation;
  contextSummary: string;
  needsAuth: boolean;
  authUser: User | null;
  isLoggingIn: boolean;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  medications: MedicationItem[];
  creativePlacements: CreativeActivityPlacement[];
  loadingEvents: boolean;
  loadingTasks: boolean;
  messages: PersistedChatMessage[];
  onChangeMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  onResetChat: () => void;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onExecuteCalendarActions: (
    actions: CalendarActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }>;
  onExecuteTaskActions: (
    taskActions: TaskActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }>;
  onExecuteMedicationActions: (
    medicationActions: MedicationActionProposal[],
    linkedCalendarIds?: Record<string, string>
  ) => Promise<MedicationExecutionResult[]>;
  onExecuteCreativeActions: (
    creativeActions: CreativeActivityActionProposal[],
    linkedCalendarIds?: Record<string, string>
  ) => Promise<CreativeExecutionResult[]>;
  onApplyProfileUpdates: (patch: Partial<LifeProfile>) => void;
  onExecuteMemoryActions: (memoryActions: MemoryActionProposal[]) => void;
  onOpenLifeProfile: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
  autoStartVoice?: boolean;
  onConsumeAutoStartVoice?: () => void;
  memoryCount: number;
  memories: MemoryItem[];
  lifeProfile: LifeProfile;
  firestoreSynced: boolean;
  onAddMemory: (input: {
    category: MemoryCategory;
    ruleText: string;
    source?: MemoryItem['source'];
  }) => void;
  onDeleteMemory: (id: string) => void;
}

const SUGGESTED_PROMPTS: Record<AssistantMode, string[]> = {
  chat: [
    'اقرأ تقويمي المتبقي اليوم وفق دستوري وذاكرتي ونبهني لأي تضارب',
    'أضف جلسة تركيز جديدة في أقرب وقت فاضي اليوم بما يناسب أولوياتي',
    'احفظ في ذاكرتي الدائمة قاعدة جديدة وأكدها معي',
  ],
  maps: [
    'أقرب المساجد المفتوحة لصلاة الجماعة بالقرب من موقعي الحالي',
    'أقرب أماكن استراحة ووجبات صحية خفيفة في طريقي',
    'أقرب صيدلية بالقرب من موقعي الآن',
  ],
  search: [
    'حالة الطقس اليوم في الدقهلية وتأثيرها على احتياج شرب المياه',
    'مواقيت الصلاة اليوم في شربين الدقهلية وفق الهيئة المصرية للمساحة',
    'فوائد زيت بذور اليقطين وأفضل وقت علمي لتناوله',
  ],
};

const MEMORY_CATEGORIES: MemoryCategory[] = [
  'priority',
  'sleep',
  'fasting',
  'hydration',
  'work_devops',
  'travel',
  'general',
];

function buildNormalizedHistory(
  msgs: PersistedChatMessage[]
): Array<{ role: 'user' | 'model'; text: string }> {
  const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const m of msgs) {
    if (m.mode !== 'chat' || m.error || m.id === 'welcome-1') continue;
    const text = (m.text || '').trim();
    if (!text) continue;
    if (merged.length === 0 && m.role !== 'user') continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) {
      prev.text = `${prev.text}\n\n${text}`.slice(0, 3500);
    } else {
      merged.push({ role: m.role, text: text.slice(0, 3500) });
    }
  }
  const recent = merged.slice(-18);
  while (recent.length > 0 && recent[0].role !== 'user') recent.shift();
  while (recent.length > 0 && recent[recent.length - 1].role === 'user') recent.pop();
  return recent;
}

export const GeminiAssistantView: React.FC<GeminiAssistantViewProps> = ({
  language,
  activeLocation,
  contextSummary,
  needsAuth,
  authUser,
  isLoggingIn,
  calendarEvents,
  googleTasks,
  medications,
  creativePlacements,
  loadingEvents,
  loadingTasks,
  messages,
  onChangeMessages,
  onResetChat,
  onGoogleSignIn,
  onGoogleSignOut,
  onRefreshWorkspace,
  onExecuteCalendarActions,
  onExecuteTaskActions,
  onExecuteMedicationActions,
  onExecuteCreativeActions,
  onApplyProfileUpdates,
  onExecuteMemoryActions,
  onOpenLifeProfile,
  initialPrompt,
  onConsumeInitialPrompt,
  autoStartVoice,
  onConsumeAutoStartVoice,
  memoryCount,
  memories,
  lifeProfile,
  firestoreSynced,
  onAddMemory,
  onDeleteMemory,
}) => {
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('memories');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);

  // Real live Gemini connectivity state
  const [geminiStatus, setGeminiStatus] = useState<GeminiConnectionStatus>({
    ok: false,
    connected: false,
    status: 'checking',
    model: 'gemini-4-hydrogen',
    latencyMs: 0,
  });

  // Inline Quick Memory form inside the chat sidebar
  const [newMemoryCat, setNewMemoryCat] = useState<MemoryCategory>('general');
  const [newMemoryRule, setNewMemoryRule] = useState('');
  const [memorySearch, setMemorySearch] = useState('');
  const [cloudUrlDraft, setCloudUrlDraft] = useState(() => getSavedCloudApiUrl());
  const isStandaloneApp = isStandaloneVirtualHost();

  // Voice dictation state
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const voiceBaseInputRef = useRef('');

  // AbortController for instant Stop Generation
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: activeLocation.lat,
    lng: activeLocation.lng,
  });
  const [gpsStatus, setGpsStatus] = useState<string>(activeLocation.nameAr);

  const runGeminiProbe = useCallback(async (forceProbe = false) => {
    setGeminiStatus((prev) => ({ ...prev, status: 'checking' }));
    const res = await checkGeminiStatus(forceProbe);
    setGeminiStatus(res);
  }, []);

  // Verify real Gemini connection on mount + periodically every 2 minutes when online
  useEffect(() => {
    void runGeminiProbe(false);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void runGeminiProbe(false);
      }
    }, 120_000);
    const onOnline = () => void runGeminiProbe(true);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', onOnline);
    };
  }, [runGeminiProbe]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setUserCoords({ lat: activeLocation.lat, lng: activeLocation.lng });
    setGpsStatus(activeLocation.nameAr);
  }, [activeLocation]);

  // Smooth auto-scroll only when the user hasn't scrolled up to read earlier messages
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      threadEndRef.current?.scrollIntoView({ behavior: streamingMsgId ? 'auto' : 'smooth' });
    }
  }, [messages, loading, streamingMsgId]);

  // Auto-resize textarea smoothly without layout thrashing
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '44px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const handleThreadScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 120;
  };

  const toggleVoiceInput = () => {
    if (isListeningVoice) {
      recognitionRef.current?.stop();
      setIsListeningVoice(false);
      return;
    }

    type SpeechRecognitionCtor = new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      maxAlternatives: number;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((ev: { error?: string }) => void) | null;
      onresult: ((ev: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
      }) => void) | null;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };

    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNote('الإملاء الصوتي غير مدعوم في هذا المتصفح.');
      window.setTimeout(() => setVoiceNote(''), 4000);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = language === 'ar' ? 'ar-EG' : 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      voiceBaseInputRef.current = input.trim();

      rec.onstart = () => {
        setIsListeningVoice(true);
        setVoiceNote(language === 'ar' ? 'أتسمّع الآن... تكلّم بأمرك' : 'Listening...');
      };

      rec.onresult = (ev) => {
        let transcript = '';
        for (let i = 0; i < ev.results.length; i++) {
          transcript += ev.results[i]?.[0]?.transcript ?? '';
        }
        const combined = [voiceBaseInputRef.current, transcript.trim()].filter(Boolean).join(' ');
        setInput(combined);
      };

      rec.onerror = (ev) => {
        setIsListeningVoice(false);
        if (ev.error === 'not-allowed') {
          setVoiceNote('يرجى السماح بصلاحية الميكروفون لاستخدام الإدخال الصوتي.');
        } else if (ev.error !== 'no-speech') {
          setVoiceNote('تعذر التقاط الصوت — جرّب مرة أخرى.');
        } else {
          setVoiceNote('');
        }
        window.setTimeout(() => setVoiceNote(''), 3500);
      };

      rec.onend = () => {
        setIsListeningVoice(false);
        setVoiceNote('');
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListeningVoice(false);
      setVoiceNote('تعذر تشغيل الميكروفون.');
      window.setTimeout(() => setVoiceNote(''), 3000);
    }
  };

  useEffect(() => {
    if (!initialPrompt) return;
    setMode('chat');
    setInput(initialPrompt);
    onConsumeInitialPrompt?.();
  }, [initialPrompt, onConsumeInitialPrompt]);

  useEffect(() => {
    if (!autoStartVoice) return;
    setMode('chat');
    onConsumeAutoStartVoice?.();
    const timer = window.setTimeout(() => {
      try {
        toggleVoiceInput();
      } catch {
        setVoiceNote('اضغط على زر الميكروفون أدناه لبدء التحدث.');
      }
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartVoice, onConsumeAutoStartVoice]);

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setStreamingMsgId(null);
  };

  const handleSignInClick = async () => {
    try {
      await onGoogleSignIn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.';
      onChangeMessages((prev) => [
        ...prev,
        { id: `auth-err-${Date.now()}`, role: 'model', mode: 'chat', text: msg, error: true },
      ]);
    }
  };

  const requestBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('المتصفح لا يدعم GPS — استخدام الضهرية');
      return;
    }
    setGpsStatus('جارٍ تحديد الموقع...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus(
          `GPS مباشر (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
        );
      },
      () => {
        setUserCoords({ lat: activeLocation.lat, lng: activeLocation.lng });
        setGpsStatus(`${activeLocation.nameAr} (احتياطي)`);
      },
      { timeout: 6000 }
    );
  };

  const handleConfirmProposal = async (
    msgId: string,
    actions: CalendarActionProposal[],
    taskActions: TaskActionProposal[] = [],
    medicationActions: MedicationActionProposal[] = [],
    creativeActions: CreativeActivityActionProposal[] = [],
    profileUpdates?: Partial<LifeProfile>,
    memoryActions: MemoryActionProposal[] = []
  ) => {
    setExecutingProposalId(msgId);
    try {
      const links: Array<{ title: string; htmlLink: string }> = [];
      const summaryParts: string[] = [];
      const linkedCalendarIds: Record<string, string> = {};

      if (profileUpdates && Object.keys(profileUpdates).length > 0) {
        onApplyProfileUpdates(profileUpdates);
        summaryParts.push('الدستور الشخصي');
      }

      if (memoryActions.length > 0) {
        onExecuteMemoryActions(memoryActions);
        summaryParts.push(`الذاكرة الدائمة (${memoryActions.length})`);
      }

      if (actions.length > 0) {
        const calRes = await onExecuteCalendarActions(actions);
        calRes.results.forEach((r) => {
          if (r.htmlLink) links.push({ title: r.title, htmlLink: r.htmlLink });
          if (r.id) {
            for (const mAct of medicationActions) {
              if (r.title.includes(mAct.name)) linkedCalendarIds[mAct.name] = r.id;
            }
            for (const cAct of creativeActions) {
              if (r.title.includes(cAct.name)) linkedCalendarIds[cAct.name] = r.id;
            }
          }
        });
        summaryParts.push(
          calRes.googleSynced
            ? `Google Calendar (${calRes.results.length})`
            : `الجدول المحلي (${actions.length})`
        );
      }

      if (taskActions.length > 0) {
        const taskRes = await onExecuteTaskActions(taskActions);
        summaryParts.push(`Google Tasks (${taskRes.results.length})`);
      }

      if (medicationActions.length > 0) {
        const medRes = await onExecuteMedicationActions(medicationActions, linkedCalendarIds);
        summaryParts.push(`العلاجات (${medRes.length})`);
      }

      if (creativeActions.length > 0) {
        const crRes = await onExecuteCreativeActions(creativeActions, linkedCalendarIds);
        summaryParts.push(`الأنشطة (${crRes.length})`);
      }

      const confirmText = `تم التنفيذ والمزامنة بنجاح: ${summaryParts.join(' + ')} ✓`;

      onChangeMessages((prev) =>
        prev
          .map((m): PersistedChatMessage =>
            m.id === msgId && m.pendingProposal
              ? {
                  ...m,
                  pendingProposal: { ...m.pendingProposal, status: 'confirmed' as const },
                }
              : m
          )
          .concat({
            id: `exec-ok-${Date.now()}`,
            role: 'model',
            mode: 'chat',
            text: confirmText,
            createdAtIso: new Date().toISOString(),
            executionLinks: links.length > 0 ? links : undefined,
          })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تنفيذ التعديل.';
      onChangeMessages((prev) => [
        ...prev,
        { id: `exec-err-${Date.now()}`, role: 'model', mode: 'chat', text: msg, error: true },
      ]);
    } finally {
      setExecutingProposalId(null);
    }
  };

  const handleCancelProposal = (msgId: string) => {
    onChangeMessages((prev) =>
      prev.map((m): PersistedChatMessage =>
        m.id === msgId && m.pendingProposal
          ? {
              ...m,
              pendingProposal: { ...m.pendingProposal, status: 'cancelled' as const },
            }
          : m
      )
    );
  };

  const serializedMemories = useMemo(
    () =>
      memories.map((m) => ({
        id: m.id,
        category: m.category,
        ruleText: m.ruleText,
        source: m.source,
      })),
    [memories]
  );

  const sendMessage = async (overrideText?: string, overrideMode?: AssistantMode) => {
    const activeMode = overrideMode ?? mode;
    const query = (overrideText ?? input).trim();
    if (!query || loading) return;

    userScrolledUpRef.current = false;
    const userMsg: PersistedChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      mode: activeMode,
      text: query,
      createdAtIso: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    onChangeMessages(nextMessages);
    if (!overrideText) setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startedAt = Date.now();

    try {
      if (activeMode === 'chat') {
        const chatHistory = buildNormalizedHistory(messages);
        const requestBody = {
          message: query,
          history: chatHistory,
          contextSummary,
          memories: serializedMemories,
          calendarEvents: calendarEvents.map((e) => ({
            id: e.id,
            calendarId: e.calendarId,
            calendarTitle: e.calendarTitle,
            summary: e.summary,
            description: e.description,
            location: e.location,
            start: e.start,
            end: e.end,
          })),
          tasks: googleTasks.map((t) => ({
            id: t.id,
            taskListId: t.taskListId,
            taskListTitle: t.taskListTitle,
            title: t.title,
            status: t.status,
            due: t.due,
          })),
          medications: medications.map((m) => ({
            id: m.id,
            name: m.name,
            time24: m.time24,
            times24: m.times24,
            daysOfWeek: m.daysOfWeek,
            doseNote: m.doseNote,
            takenToday: m.takenDateKey === getCairoTodayIso(),
            takenDosesToday: m.takenDateKey === getCairoTodayIso() ? m.takenDosesToday ?? [] : [],
            courseEndDate: m.courseEndDate,
            remainingDoses: m.remainingDoses,
            totalDoses: m.totalDoses,
          })),
          creativeActivities: creativePlacements.map((p) => ({
            id: p.activity.id,
            name: p.activity.name,
            emoji: p.activity.emoji,
            cadence: p.cadence,
            goalCount: p.goalInPeriod,
            sessionsInPeriod: p.sessionsInPeriod,
            weeklyGoalSessions: p.activity.weeklyGoalSessions,
            sessionsThisWeek: p.sessionsThisWeek,
            sessionMinutes: p.activity.sessionMinutes,
            completedToday: p.doneToday,
            scheduledTime24: p.activity.scheduledTime24 || p.suggestedSlot?.time24,
            expiresOnDate: p.activity.expiresOnDate,
          })),
        };

        const streamId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        let streamInserted = false;
        let streamedSuccessfully = false;

        try {
          streamedSuccessfully = await apiFetchStream('/api/chat/stream', requestBody, {
            signal: controller.signal,
            onDelta: (deltaText) => {
              if (!streamInserted) {
                streamInserted = true;
                setStreamingMsgId(streamId);
                onChangeMessages((prev) => [
                  ...prev,
                  {
                    id: streamId,
                    role: 'model',
                    mode: 'chat',
                    text: deltaText,
                    createdAtIso: new Date().toISOString(),
                  },
                ]);
              } else {
                onChangeMessages((prev) =>
                  prev.map((m) => (m.id === streamId ? { ...m, text: m.text + deltaText } : m))
                );
              }
            },
            onDone: (payload) => {
              const latencyMs = payload.latencyMs ?? Math.max(1, Date.now() - startedAt);
              setGeminiStatus({
                ok: true,
                connected: true,
                status: 'online',
                model: payload.model || 'gemini-4-hydrogen',
                latencyMs,
                checkedAtIso: new Date().toISOString(),
              });
              const finalMsg: PersistedChatMessage = {
                id: streamId,
                role: 'model',
                mode: 'chat',
                text: payload.text || 'تم إعداد الاقتراح.',
                createdAtIso: new Date().toISOString(),
                sources:
                  Array.isArray(payload.sources) && payload.sources.length > 0
                    ? payload.sources
                    : undefined,
                pendingProposal: payload.pendingProposal
                  ? { ...payload.pendingProposal, status: 'pending' as const }
                  : undefined,
                latencyMs,
                memoriesAppliedCount: payload.memoriesAppliedCount ?? memories.length,
              };
              if (!streamInserted) {
                streamInserted = true;
                onChangeMessages((prev) => [...prev, finalMsg]);
              } else {
                onChangeMessages((prev) => prev.map((m) => (m.id === streamId ? finalMsg : m)));
              }
            },
          });
        } catch (streamErr: unknown) {
          if (streamErr instanceof DOMException && streamErr.name === 'AbortError') {
            throw streamErr;
          }
          if (streamInserted) {
            throw streamErr;
          }
          // Fall through cleanly to JSON /api/chat
        }

        if (!streamedSuccessfully) {
          const { ok, data } = await apiFetchJson<{
            text?: string;
            error?: string;
            sources?: Array<{ title: string; uri: string }>;
            pendingProposal?: PersistedChatMessage['pendingProposal'];
            latencyMs?: number;
            memoriesAppliedCount?: number;
            model?: string;
          }>('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          if (!ok) throw new Error(data.error || 'تعذر الرد من المساعد.');
          const latencyMs = data.latencyMs ?? Math.max(1, Date.now() - startedAt);
          setGeminiStatus({
            ok: true,
            connected: true,
            status: 'online',
            model: data.model || 'gemini-4-hydrogen',
            latencyMs,
            checkedAtIso: new Date().toISOString(),
          });
          onChangeMessages((prev) => [
            ...prev,
            {
              id: streamId,
              role: 'model',
              mode: 'chat',
              text: data.text || 'تم إعداد الاقتراح.',
              createdAtIso: new Date().toISOString(),
              sources:
                Array.isArray(data.sources) && data.sources.length > 0 ? data.sources : undefined,
              pendingProposal: data.pendingProposal
                ? { ...data.pendingProposal, status: 'pending' as const }
                : undefined,
              latencyMs,
              memoriesAppliedCount: data.memoriesAppliedCount ?? memories.length,
            },
          ]);
        }
      } else if (activeMode === 'maps') {
        const { ok, data } = await apiFetchJson<{
          text?: string;
          error?: string;
          places?: Array<{ title: string; uri: string }>;
          latencyMs?: number;
          memoriesAppliedCount?: number;
        }>('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            lat: userCoords.lat,
            lng: userCoords.lng,
            memories: serializedMemories,
            constitutionBrief: contextSummary.slice(0, 750),
          }),
          signal: controller.signal,
        });
        if (!ok) throw new Error(data.error || 'تعذر جلب نتائج الخرائط.');
        const latencyMs = data.latencyMs ?? Math.max(1, Date.now() - startedAt);
        setGeminiStatus((prev) => ({
          ...prev,
          ok: true,
          connected: true,
          status: 'online',
          latencyMs,
          checkedAtIso: new Date().toISOString(),
        }));
        onChangeMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            mode: 'maps',
            text: data.text || 'تم العثور على النتائج التالية:',
            createdAtIso: new Date().toISOString(),
            places: Array.isArray(data.places) ? data.places : [],
            latencyMs,
            memoriesAppliedCount: data.memoriesAppliedCount ?? memories.length,
          },
        ]);
      } else {
        const { ok, data } = await apiFetchJson<{
          text?: string;
          error?: string;
          sources?: Array<{ title: string; uri: string }>;
          latencyMs?: number;
          memoriesAppliedCount?: number;
        }>('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            memories: serializedMemories,
            constitutionBrief: contextSummary.slice(0, 750),
          }),
          signal: controller.signal,
        });
        if (!ok) throw new Error(data.error || 'تعذر إجراء البحث المباشر.');
        const latencyMs = data.latencyMs ?? Math.max(1, Date.now() - startedAt);
        setGeminiStatus((prev) => ({
          ...prev,
          ok: true,
          connected: true,
          status: 'online',
          latencyMs,
          checkedAtIso: new Date().toISOString(),
        }));
        onChangeMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            mode: 'search',
            text: data.text || 'نتائج البحث:',
            createdAtIso: new Date().toISOString(),
            sources: Array.isArray(data.sources) ? data.sources : [],
            latencyMs,
            memoriesAppliedCount: data.memoriesAppliedCount ?? memories.length,
          },
        ]);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User intentionally stopped generation
        return;
      }
      const errMsg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع.';
      setGeminiStatus((prev) => ({
        ...prev,
        ok: false,
        connected: false,
        status: 'offline',
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
      abortControllerRef.current = null;
      setLoading(false);
      setStreamingMsgId(null);
    }
  };

  const handleQuickAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newMemoryRule.trim();
    if (!cleaned) return;
    onAddMemory({ category: newMemoryCat, ruleText: cleaned, source: 'user' });
    setNewMemoryRule('');
  };

  const pendingTasks = useMemo(
    () => googleTasks.filter((t) => t.status !== 'completed'),
    [googleTasks]
  );

  const filteredMemories = useMemo(() => {
    const q = memorySearch.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.ruleText.toLowerCase().includes(q) ||
        (MEMORY_CATEGORY_LABELS[m.category] ?? '').toLowerCase().includes(q)
    );
  }, [memories, memorySearch]);

  const statusText =
    geminiStatus.status === 'checking'
      ? 'جارٍ فحص اتصال Gemini...'
      : geminiStatus.connected
        ? `متصل بـ Gemini · ${geminiStatus.latencyMs} مللي ثانية`
        : 'تعذر الاتصال بـ Gemini';

  const statusDotClass =
    geminiStatus.status === 'checking'
      ? 'bg-amber-400 animate-pulse'
      : geminiStatus.connected
        ? 'bg-[#4ADE80]'
        : 'bg-rose-500';

  const statusTextColor =
    geminiStatus.status === 'checking'
      ? 'text-amber-300'
      : geminiStatus.connected
        ? 'text-[#4ADE80]'
        : 'text-rose-400';

  const renderSidebarContent = () => (
    <div className="space-y-4">
      {/* Segmented Workspace Panel Selector */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
        <button
          type="button"
          onClick={() => setSidebarTab('memories')}
          className={`min-h-[36px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
            sidebarTab === 'memories'
              ? 'bg-[#7FFFD4] text-black font-bold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">الذاكرة ({memories.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('events')}
          className={`min-h-[36px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
            sidebarTab === 'events'
              ? 'bg-[#7FFFD4] text-black font-bold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">التقويم ({calendarEvents.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('tasks')}
          className={`min-h-[36px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
            sidebarTab === 'tasks'
              ? 'bg-[#7FFFD4] text-black font-bold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">المهام ({pendingTasks.length})</span>
        </button>
      </div>

      {/* TAB 1: Direct Memories & Personal Constitution Binding */}
      {sidebarTab === 'memories' && (
        <div className="space-y-4">
          {/* Active Personal Constitution Summary (clean hairline divider, zero nested cards) */}
          <div className="pb-3.5 border-b border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">الدستور الشخصي النشط</span>
              <button
                type="button"
                onClick={onOpenLifeProfile}
                className="text-[11px] text-[#7FFFD4] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>تعديل الدستور</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-400 font-mono-tabular">
              <span>الوزن {lifeProfile.weightKg} كجم</span>
              <span aria-hidden="true">·</span>
              <span>الكوب {lifeProfile.cupSizeMl} مل</span>
              <span aria-hidden="true">·</span>
              <span>النوم {Math.round(lifeProfile.sleepTargetMinutes / 60)} س</span>
              <span aria-hidden="true">·</span>
              <span>{firestoreSynced ? 'متزامن مع Firestore' : 'محفوظ محلياً'}</span>
            </div>
            {lifeProfile.priorityOrderAr && (
              <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-2">
                {lifeProfile.priorityOrderAr}
              </p>
            )}
          </div>

          {/* Quick Add Permanent Memory Rule */}
          <form onSubmit={handleQuickAddMemory} className="space-y-2 pb-3.5 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="quick-mem-input" className="text-xs font-semibold text-zinc-200">
                إضافة قاعدة دائمة للذاكرة
              </label>
              <select
                value={newMemoryCat}
                onChange={(e) => setNewMemoryCat(e.target.value as MemoryCategory)}
                aria-label="تصنيف القاعدة"
                className="rounded-lg border border-white/10 bg-black px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
              >
                {MEMORY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {MEMORY_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="quick-mem-input"
                type="text"
                value={newMemoryRule}
                onChange={(e) => setNewMemoryRule(e.target.value)}
                placeholder="مثال: لا تضع مهام ثقيلة بعد 9 مساءً..."
                maxLength={280}
                className="flex-1 min-w-0 min-h-[38px] rounded-lg border border-white/10 bg-black px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
              />
              <button
                type="submit"
                disabled={!newMemoryRule.trim()}
                aria-label="حفظ في الذاكرة"
                className="min-h-[38px] px-3 rounded-lg bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
            </div>
          </form>

          {/* Filter & Active Memories List */}
          <div className="space-y-2.5">
            {memories.length > 4 && (
              <input
                type="search"
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                placeholder="بحث في قواعد الذاكرة..."
                className="w-full min-h-[34px] rounded-lg border border-white/10 bg-black px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
              />
            )}

            {filteredMemories.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                {memories.length === 0
                  ? 'لا توجد قواعد محفوظة بعد — أضف أول قاعدة ليعتمدها Gemini في كل رد.'
                  : 'لا توجد قواعد مطابقة للبحث.'}
              </p>
            ) : (
              <ul className="divide-y divide-white/10 max-h-[320px] overflow-y-auto pl-1">
                {filteredMemories.map((mem) => (
                  <li key={mem.id} className="py-2.5 first:pt-0 flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-[10px] text-zinc-500">
                        {MEMORY_CATEGORY_LABELS[mem.category] ?? 'قواعد عامة'}
                      </div>
                      <p className="text-xs text-zinc-200 leading-relaxed break-words">
                        {mem.ruleText}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(mem.id)}
                      aria-label="حذف القاعدة"
                      title="حذف من الذاكرة"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/5 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* TAB 2 & 3: Google Calendar & Google Tasks Live Data */}
      {(sidebarTab === 'events' || sidebarTab === 'tasks') && (
        <div className="space-y-3">
          {needsAuth ? (
            <div className="space-y-3 text-xs text-zinc-400">
              <p className="leading-relaxed">
                سجّل الدخول بحساب Google ليقرأ الشات أحداثك الفعلية ومهامك ويعدّلها بعد تأكيدك.
              </p>
              <button
                type="button"
                onClick={handleSignInClick}
                disabled={isLoggingIn}
                className="w-full min-h-[42px] flex items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white px-4 py-2 text-sm font-medium text-[#1F1F1F] hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-[11px] pb-2 border-b border-white/10">
                <span className="text-[#4ADE80] truncate">{authUser?.email ?? 'حساب Google متصل'}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRefreshWorkspace()}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer"
                    title="تحديث التقويم والمهام"
                    aria-label="تحديث التقويم والمهام"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${loadingEvents || loadingTasks ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onGoogleSignOut()}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/5 cursor-pointer"
                    title="تسجيل الخروج"
                    aria-label="تسجيل الخروج"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {sidebarTab === 'events' ? (
                calendarEvents.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-6 text-center">
                    لا توجد أحداث مسجلة في الأيام السبعة القادمة.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/10 max-h-[420px] overflow-y-auto pl-1">
                    {calendarEvents.map((ev) => {
                      const descClean = cleanCalendarText(ev.description);
                      return (
                        <li
                          key={`${ev.calendarId ?? 'primary'}-${ev.id}`}
                          className="py-2.5 first:pt-0 text-xs space-y-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-white leading-snug">
                              {ev.summary}
                            </span>
                            {ev.htmlLink && (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#7FFFD4] hover:text-white shrink-0"
                                title="فتح في Google Calendar"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          {descClean && (
                            <p className="text-[11px] text-zinc-400 line-clamp-2">{descClean}</p>
                          )}
                          <div className="font-mono-tabular text-[11px] text-[#7FFFD4] whitespace-nowrap">
                            {formatIsoTo12h(ev.start, language)}
                            {ev.end && !ev.isAllDay
                              ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false })}`
                              : ''}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : googleTasks.length === 0 ? (
                <p className="text-xs text-zinc-500 py-6 text-center">
                  لا توجد مهام في Google Tasks حالياً.
                </p>
              ) : (
                <ul className="divide-y divide-white/10 max-h-[420px] overflow-y-auto pl-1">
                  {googleTasks.map((tk) => (
                    <li
                      key={`${tk.taskListId}-${tk.id}`}
                      className={`py-2.5 first:pt-0 text-xs ${
                        tk.status === 'completed' ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="font-medium text-white">
                        {tk.status === 'completed' ? '✓ ' : '○ '}
                        {tk.title}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between gap-2">
                        <span className="truncate">{tk.taskListTitle}</span>
                        {tk.due && (
                          <span className="font-mono-tabular text-[#7FFFD4] shrink-0">
                            {tk.due.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1380px] px-3 sm:px-6 py-3 sm:py-5 space-y-4">
      {/* Compact Header: Title + Real Live Gemini Status + Memories Link + Mode Switch */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3.5 border-b border-white/10">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-base sm:text-lg font-bold text-white whitespace-nowrap">
              شات Gemini
            </h1>

            {/* Real Live Gemini Connection Status Indicator (dot strictly for live connection telemetry + explicit text) */}
            <button
              type="button"
              onClick={() => void runGeminiProbe(true)}
              title={
                geminiStatus.error
                  ? `${geminiStatus.error} — اضغط لإعادة الفحص`
                  : 'اضغط لإعادة فحص اتصال Gemini المباشر'
              }
              className="inline-flex items-center gap-1.5 text-xs cursor-pointer hover:opacity-85 transition-opacity whitespace-nowrap"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} aria-hidden="true" />
              <span className={`font-mono-tabular font-medium ${statusTextColor}`}>
                {statusText}
              </span>
              <RefreshCw
                className={`w-3 h-3 text-zinc-500 ${
                  geminiStatus.status === 'checking' ? 'animate-spin text-amber-300' : ''
                }`}
              />
            </button>
          </div>

          {/* Unboxed Quiet Metadata: Direct Memories + Constitution Binding */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
            <span>مرتبط مباشرة بالدستور الشخصي</span>
            <span aria-hidden="true">·</span>
            <span className="text-zinc-200 font-medium font-mono-tabular">
              {memoryCount} ذاكرة دائمة نشطة
            </span>
            <span aria-hidden="true">·</span>
            <span>{firestoreSynced ? 'مزامنة سحابية فورية' : 'حفظ محلي نشط'}</span>
          </div>
        </div>

        {/* Controls: Segmented Mode Switch + Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 sm:flex-none grid grid-cols-3 sm:flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10">
            {(
              [
                { id: 'chat', label: 'شات', Icon: MessageSquare },
                { id: 'maps', label: 'خرائط', Icon: MapPin },
                { id: 'search', label: 'بحث', Icon: Search },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  mode === id
                    ? 'bg-[#7FFFD4] text-black font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setMobilePanelOpen((v) => !v)}
            className="lg:hidden min-h-[40px] px-3 py-1.5 rounded-xl border border-white/10 text-xs text-zinc-200 hover:border-[#7FFFD4]/50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <PanelLeftOpen className="w-3.5 h-3.5 text-[#7FFFD4]" />
            <span>الذاكرة والتقويم</span>
          </button>

          <button
            type="button"
            onClick={onResetChat}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-white/10 text-xs text-zinc-300 hover:border-white/25 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            title="بدء محادثة جديدة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>محادثة جديدة</span>
          </button>
        </div>
      </header>

      {/* Offline Warning Banner (only shown when real probe failed) */}
      {geminiStatus.status === 'offline' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 space-y-2.5 text-xs text-rose-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="leading-relaxed">
                {geminiStatus.error || 'تعذر الاتصال بخادم Gemini حالياً.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void runGeminiProbe(true)}
              className="px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              إعادة الاتصال الآن
            </button>
          </div>
          {isStandaloneApp && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const res = setSavedCloudApiUrl(cloudUrlDraft);
                if (res.error) {
                  setGeminiStatus((prev) => ({
                    ...prev,
                    ok: false,
                    connected: false,
                    status: 'offline',
                    error: res.error,
                  }));
                  return;
                }
                setCloudUrlDraft(res.saved);
                void runGeminiProbe(true);
              }}
              className="flex flex-wrap items-center gap-2 pt-2 border-t border-rose-500/20"
            >
              <input
                type="url"
                dir="ltr"
                value={cloudUrlDraft}
                onChange={(e) => setCloudUrlDraft(e.target.value)}
                placeholder="https://dayrhythm-xxxxx.run.app (رابط Cloud Run المنشور)"
                className="flex-1 min-w-[200px] rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#7FFFD4] focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] cursor-pointer whitespace-nowrap shrink-0"
              >
                ربط رابط الخادم المنشور
              </button>
            </form>
          )}
        </div>
      )}

      {/* Mobile Collapsible Memories / Calendar / Tasks Drawer */}
      {mobilePanelOpen && (
        <section className="lg:hidden rounded-2xl border border-white/10 bg-[#0B0E14] p-4">
          {renderSidebarContent()}
        </section>
      )}

      {/* Main Split Layout: Fast Streaming Chat (8 cols) + Live Memories & Google Data Sidebar (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Chat Column */}
        <section className="lg:col-span-8 flex flex-col rounded-2xl border border-white/10 bg-[#07090D] h-[calc(100dvh-235px)] min-h-[430px] lg:h-[calc(100dvh-185px)] max-h-[780px] overflow-hidden min-w-0">
          {mode === 'maps' && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0B0E14] px-4 py-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
                <span className="truncate">نقطة البحث: {gpsStatus}</span>
              </div>
              <button
                type="button"
                onClick={requestBrowserGps}
                className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/40 text-[#7FFFD4] hover:bg-[#7FFFD4]/10 cursor-pointer whitespace-nowrap shrink-0"
              >
                تحديث GPS
              </button>
            </div>
          )}

          {/* Message Thread */}
          <div
            ref={scrollContainerRef}
            onScroll={handleThreadScroll}
            className="flex-1 overflow-y-auto px-3.5 sm:px-5 py-4 space-y-4"
          >
            {messages.map((m) => {
              const isStreamingThis = streamingMsgId === m.id;
              return (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <article
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#7FFFD4]/12 border border-[#7FFFD4]/25 text-white'
                        : m.error
                          ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200'
                          : 'bg-[#0D1118] border border-white/10 text-zinc-100'
                    }`}
                  >
                    {/* Message Header: Unboxed quiet metadata */}
                    <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500 mb-1.5">
                      <span>
                        {m.role === 'user'
                          ? 'أنت'
                          : m.mode === 'maps'
                            ? 'خرائط جوجل · Gemini'
                            : m.mode === 'search'
                              ? 'بحث الويب · Gemini'
                              : 'Gemini · إيقاع اليوم'}
                      </span>
                      {m.createdAtIso && (
                        <span className="font-mono-tabular">
                          {formatIsoTo12h(m.createdAtIso, language, { includeDate: false })}
                        </span>
                      )}
                    </div>

                    {/* Message Body */}
                    <div className="whitespace-pre-wrap break-words">
                      {m.text}
                      {isStreamingThis && (
                        <span
                          className="inline-block w-1.5 h-3.5 align-middle mr-1 bg-[#7FFFD4] animate-pulse"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    {/* 1-Click Retry on Failed Message */}
                    {m.error && m.retryPrompt && (
                      <div className="mt-2.5 pt-2 border-t border-rose-500/20 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-rose-300/80">
                          يمكنك إعادة إرسال نفس الرسالة مباشرة
                        </span>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void sendMessage(m.retryPrompt, m.mode)}
                          className="px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100 font-semibold hover:bg-rose-500/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>إعادة المحاولة</span>
                        </button>
                      </div>
                    )}

                    {/* Subtle Grounding Footer for Model Replies */}
                    {m.role === 'model' && !m.error && !isStreamingThis && m.id !== 'welcome-1' && (m.latencyMs || m.memoriesAppliedCount !== undefined) && (
                      <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-500 font-mono-tabular">
                        <span>
                          معتمد على الدستور و {m.memoriesAppliedCount ?? memories.length} ذاكرة
                        </span>
                        {typeof m.latencyMs === 'number' && m.latencyMs > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{(m.latencyMs / 1000).toFixed(1)} ث</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Google Calendar Execution Links */}
                    {m.executionLinks && m.executionLinks.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                        {m.executionLinks.map((lnk, i) => (
                          <a
                            key={i}
                            href={lnk.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-[#4ADE80] hover:underline"
                          >
                            <span>فتح «{lnk.title}» في Google Calendar</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Explicit User Confirmation Block for Calendar / Tasks / Meds / Memories / Profile */}
                    {m.pendingProposal && (
                      <div className="mt-3 pt-3 border-t border-[#7FFFD4]/30 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-[#7FFFD4]">
                            تأكيد التعديلات (
                            {m.pendingProposal.actions.length +
                              (m.pendingProposal.taskActions?.length ?? 0) +
                              (m.pendingProposal.medicationActions?.length ?? 0) +
                              (m.pendingProposal.creativeActions?.length ?? 0) +
                              (m.pendingProposal.profileUpdates ? 1 : 0) +
                              (m.pendingProposal.memoryActions?.length ?? 0)}
                            )
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {m.pendingProposal.status === 'confirmed'
                              ? 'تم التنفيذ ✓'
                              : m.pendingProposal.status === 'cancelled'
                                ? 'تم الإلغاء'
                                : 'بانتظار موافقتك'}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300">{m.pendingProposal.summaryAr}</p>

                        {m.pendingProposal.profileUpdates && (
                          <div className="pt-2 border-t border-white/10 text-[11px] space-y-1">
                            <div className="font-semibold text-[#7FFFD4]">
                              تحديث الدستور الشخصي الدائم:
                            </div>
                            <div className="text-zinc-200 flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular">
                              {m.pendingProposal.profileUpdates.weightKg !== undefined && (
                                <span>الوزن: {m.pendingProposal.profileUpdates.weightKg} كجم</span>
                              )}
                              {m.pendingProposal.profileUpdates.heightCm !== undefined && (
                                <span>الطول: {m.pendingProposal.profileUpdates.heightCm} سم</span>
                              )}
                              {m.pendingProposal.profileUpdates.cupSizeMl !== undefined && (
                                <span>الكوب: {m.pendingProposal.profileUpdates.cupSizeMl} مل</span>
                              )}
                              {m.pendingProposal.profileUpdates.workEnabled !== undefined && (
                                <span>
                                  الشغل:{' '}
                                  {m.pendingProposal.profileUpdates.workEnabled
                                    ? `${formatTime24To12h(m.pendingProposal.profileUpdates.workStart24, language)} – ${formatTime24To12h(m.pendingProposal.profileUpdates.workEnd24, language)}`
                                    : 'تفرغ للكورسات'}
                                </span>
                              )}
                              {m.pendingProposal.profileUpdates.currentCityName && (
                                <span>الموقع: {m.pendingProposal.profileUpdates.currentCityName}</span>
                              )}
                              {m.pendingProposal.profileUpdates.sleepTargetMinutes !== undefined && (
                                <span>
                                  هدف النوم: {m.pendingProposal.profileUpdates.sleepTargetMinutes} د
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {needsAuth &&
                          m.pendingProposal.status === 'pending' &&
                          m.pendingProposal.actions.length > 0 && (
                            <p className="text-[11px] text-amber-300">
                              ملاحظة: لتعديل Google Calendar الفعلي، سجّل الدخول بحساب Google أولاً.
                            </p>
                          )}

                        {m.pendingProposal.actions.length > 0 && (
                          <ul className="divide-y divide-white/10 text-xs">
                            {m.pendingProposal.actions.map((act, idx) => (
                              <li
                                key={`cal-${idx}`}
                                className="py-1.5 flex items-center justify-between gap-2"
                              >
                                <span className="text-white font-medium">📅 {act.title}</span>
                                <span className="font-mono-tabular text-[#7FFFD4] shrink-0 text-[11px]">
                                  {act.operation === 'delete'
                                    ? 'حذف من التقويم'
                                    : act.operation === 'update' || act.operation === 'shift'
                                      ? `تعديل ${act.dateIso ?? ''} · ${formatTime24To12h(act.startTime24, language)}`.trim()
                                      : `${formatTime24To12h(act.startTime24 ?? '09:00', language)} (${act.durationMinutes ?? 30} د)`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {m.pendingProposal.medicationActions &&
                          m.pendingProposal.medicationActions.length > 0 && (
                            <ul className="divide-y divide-white/10 text-xs">
                              {m.pendingProposal.medicationActions.map((mAct, idx) => {
                                const doseTimes =
                                  mAct.times24 && mAct.times24.length > 0
                                    ? mAct.times24
                                    : mAct.time24
                                      ? [mAct.time24]
                                      : [];
                                const daysLabel =
                                  mAct.daysOfWeek && mAct.daysOfWeek.length > 0
                                    ? mAct.daysOfWeek
                                        .map((d) => ARABIC_WEEKDAYS.find((w) => w.id === d)?.shortAr ?? '')
                                        .filter(Boolean)
                                        .join('، ')
                                    : '';
                                return (
                                  <li
                                    key={`med-${idx}`}
                                    className="py-1.5 flex items-center justify-between gap-2"
                                  >
                                    <span className="text-white font-medium">
                                      💊 {mAct.name}
                                      {daysLabel ? (
                                        <span className="text-[11px] text-zinc-400 mr-1">
                                          ({daysLabel})
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="font-mono-tabular text-[#4ADE80] shrink-0 text-[11px]">
                                      {mAct.operation === 'remove'
                                        ? 'حذف'
                                        : mAct.operation === 'mark_taken'
                                          ? 'تم التناول ✓'
                                          : doseTimes.length > 0
                                            ? doseTimes
                                                .map((t24) => formatTime24To12h(t24, language))
                                                .join(' · ')
                                            : 'بدون ميعاد ثابت'}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                        {m.pendingProposal.creativeActions &&
                          m.pendingProposal.creativeActions.length > 0 && (
                            <ul className="divide-y divide-white/10 text-xs">
                              {m.pendingProposal.creativeActions.map((cAct, idx) => (
                                <li
                                  key={`cr-${idx}`}
                                  className="py-1.5 flex items-center justify-between gap-2"
                                >
                                  <span className="text-white font-medium">
                                    {cAct.emoji ?? '🎨'} {cAct.name}
                                  </span>
                                  <span className="font-mono-tabular text-cyan-300 shrink-0 text-[11px]">
                                    {cAct.operation === 'remove'
                                      ? 'حذف نشاط'
                                      : `${cAct.goalCount ?? cAct.weeklyGoalSessions ?? 3}× · ${cAct.sessionMinutes ?? 30} د`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                        {m.pendingProposal.taskActions &&
                          m.pendingProposal.taskActions.length > 0 && (
                            <ul className="divide-y divide-white/10 text-xs">
                              {m.pendingProposal.taskActions.map((tAct, idx) => (
                                <li
                                  key={`task-${idx}`}
                                  className="py-1.5 flex items-center justify-between gap-2"
                                >
                                  <span className="text-white font-medium">☑️ {tAct.title}</span>
                                  <span className="font-mono-tabular text-indigo-300 shrink-0 text-[11px]">
                                    {tAct.operation === 'delete'
                                      ? 'حذف مهمة'
                                      : tAct.operation === 'complete'
                                        ? 'تحديد كمكتملة'
                                        : tAct.operation === 'reopen'
                                          ? 'إعادة فتح'
                                          : tAct.operation === 'update'
                                            ? 'تعديل مهمة'
                                            : 'إضافة مهمة'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                        {m.pendingProposal.memoryActions &&
                          m.pendingProposal.memoryActions.length > 0 && (
                            <ul className="divide-y divide-white/10 text-xs">
                              {m.pendingProposal.memoryActions.map((memAct, idx) => (
                                <li key={`mem-${idx}`} className="py-1.5 space-y-0.5">
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="font-semibold text-purple-300">
                                      {memAct.operation === 'remove'
                                        ? 'حذف من الذاكرة الدائمة'
                                        : 'حفظ في الذاكرة الدائمة'}
                                    </span>
                                    <span className="text-zinc-500">
                                      {MEMORY_CATEGORY_LABELS[memAct.category] ?? 'قواعد عامة'}
                                    </span>
                                  </div>
                                  <div className="text-zinc-100">{memAct.ruleText}</div>
                                </li>
                              ))}
                            </ul>
                          )}

                        {m.pendingProposal.status === 'pending' && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={executingProposalId === m.id}
                              onClick={() =>
                                handleConfirmProposal(
                                  m.id,
                                  m.pendingProposal!.actions,
                                  m.pendingProposal!.taskActions ?? [],
                                  m.pendingProposal!.medicationActions ?? [],
                                  m.pendingProposal!.creativeActions ?? [],
                                  m.pendingProposal!.profileUpdates,
                                  m.pendingProposal!.memoryActions ?? []
                                )
                              }
                              className="flex-1 min-h-[40px] py-2 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
                            >
                              {executingProposalId === m.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>تأكيد وتنفيذ</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelProposal(m.id)}
                              className="min-h-[40px] py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>إلغاء</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Maps Grounding Links */}
                    {m.places && m.places.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
                        <div className="text-[11px] font-semibold text-[#7FFFD4]">
                          الأماكن على خرائط جوجل:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {m.places.map((p, idx) => (
                            <a
                              key={idx}
                              href={p.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl border border-white/10 bg-black/50 p-2.5 hover:border-[#7FFFD4] transition-colors block"
                            >
                              <div className="flex items-center justify-between gap-2 text-white font-semibold text-xs">
                                <span className="truncate">{p.title}</span>
                                <ExternalLink className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
                              </div>
                              {p.snippets && p.snippets[0] && (
                                <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                                  {p.snippets[0]}
                                </p>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Search Grounding Links */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
                        <div className="text-[11px] font-semibold text-[#7FFFD4]">
                          مصادر البحث الموثقة:
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {m.sources.map((s, idx) => (
                            <a
                              key={idx}
                              href={s.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-[#7FFFD4] underline underline-offset-4"
                            >
                              <span>{s.title}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                </div>
              );
            })}

            {/* Pending Indicator (only before first streamed chunk arrives) */}
            {loading && !streamingMsgId && (
              <div className="flex justify-end">
                <div className="rounded-2xl border border-white/10 bg-[#0D1118] px-4 py-3 text-xs text-zinc-300 flex items-center gap-2.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7FFFD4]" />
                  <span>جارٍ الرد وفق دستوري وذاكرتي...</span>
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Quick Prompt Suggestions (only when thread is fresh or idle) */}
          {!loading && (
            <div className="px-3.5 sm:px-4 py-2 border-t border-white/10 flex items-center gap-2 overflow-x-auto bg-[#090C12]">
              {SUGGESTED_PROMPTS[mode].map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[11px] text-zinc-300 hover:border-[#7FFFD4]/50 hover:text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Voice Status Notice */}
          {voiceNote && (
            <div className="px-4 py-1.5 border-t border-white/10 bg-[#7FFFD4]/[0.06] text-xs text-[#7FFFD4] flex items-center justify-between gap-2">
              <span>{voiceNote}</span>
              {isListeningVoice && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className="text-rose-300 hover:underline font-semibold cursor-pointer whitespace-nowrap"
                >
                  إيقاف
                </button>
              )}
            </div>
          )}

          {/* Fast Responsive Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isListeningVoice) {
                recognitionRef.current?.stop();
                setIsListeningVoice(false);
              }
              void sendMessage();
            }}
            className="p-3 border-t border-white/10 bg-[#07090D] flex items-end gap-2"
          >
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={loading}
              aria-label={isListeningVoice ? 'إيقاف التسجيل الصوتي' : 'تحدث بالصوت'}
              title={isListeningVoice ? 'اضغط لإيقاف الاستماع' : 'إدخال صوتي'}
              className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                isListeningVoice
                  ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                  : 'border-white/15 bg-black text-zinc-300 hover:border-[#7FFFD4]/60 hover:text-[#7FFFD4]'
              }`}
            >
              {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading && input.trim()) {
                    if (isListeningVoice) {
                      recognitionRef.current?.stop();
                      setIsListeningVoice(false);
                    }
                    void sendMessage();
                  }
                }
              }}
              placeholder={
                isListeningVoice
                  ? 'تكلّم الآن...'
                  : mode === 'maps'
                    ? 'ابحث عن أقرب مسجد أو مكان...'
                    : mode === 'search'
                      ? 'ابحث مباشرة على الويب...'
                      : 'اكتب أمرك لـ Gemini (Enter للإرسال، Shift+Enter لسطر جديد)...'
              }
              className="flex-1 min-h-[44px] max-h-[140px] resize-none rounded-xl border border-white/10 bg-black px-3.5 py-2.5 text-sm sm:text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4] leading-relaxed"
            />

            {loading ? (
              <button
                type="button"
                onClick={stopGeneration}
                aria-label="إيقاف التوليد"
                className="min-h-[44px] px-4 rounded-xl border border-rose-400/50 bg-rose-500/15 text-rose-200 text-xs font-bold hover:bg-rose-500/25 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>إيقاف</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="min-h-[44px] px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال</span>
              </button>
            )}
          </form>
        </section>

        {/* Desktop Sidebar (4 cols): Direct Memories + Constitution + Google Calendar & Tasks */}
        <aside className="hidden lg:block lg:col-span-4 rounded-2xl border border-white/10 bg-[#0B0E14] p-5 overflow-y-auto lg:h-[calc(100dvh-185px)] max-h-[780px]">
          {renderSidebarContent()}
        </aside>
      </div>
    </div>
  );
};
