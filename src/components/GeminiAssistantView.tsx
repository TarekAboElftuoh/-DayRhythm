import React, { useEffect, useRef, useState } from 'react';
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
  PersistedChatMessage,
  TaskActionProposal,
  TaskExecutionResult,
} from '../types/dayrhythm';
import { formatIsoTo12h, formatTime24To12h, getCairoTodayIso } from '../engines/prayerEngine';
import { ARABIC_WEEKDAYS, MEMORY_CATEGORY_LABELS } from '../engines/lifeRhythmEngine';

type AssistantMode = 'chat' | 'maps' | 'search';

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
}

const SUGGESTED_PROMPTS: Record<AssistantMode, string[]> = {
  chat: [
    'اقرأ تقويمي هذا الأسبوع واسألني لو فيه أي حاجة مش واضحة أو فيها تضارب',
    'أضف نشاط إبداعي «برمجة مشروع جانبي» 3 مرات أسبوعياً (45 د) في وقت فاضي بالتقويم',
    'أريد إضافة مكمل غذائي جديد — ما أفضل توقيت علمي له حسب جدولي ووجباتي؟',
  ],
  maps: [
    'أقرب المساجد المفتوحة لصلاة الجماعة بالقرب من موقعي الحالي',
    'أقرب أماكن استراحة ووجبات صحية خفيفة في طريقي',
    'أقرب صيدلية أو مركز مياه معدنية بالقرب من موقعي',
  ],
  search: [
    'حالة الطقس اليوم في الدقهلية وتأثيرها على احتياج شرب المياه',
    'مواقيت الصلاة اليوم في شربين الدقهلية وفق الهيئة المصرية للمساحة',
    'فوائد زيت بذور اليقطين وأفضل وقت علمي لتناوله',
  ],
};

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
}) => {
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [sidebarTab, setSidebarTab] = useState<'events' | 'tasks'>('events');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const recognitionRef = useRef<{
    stop: () => void;
    abort: () => void;
  } | null>(null);
  const voiceBaseInputRef = useRef('');

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: activeLocation.lat,
    lng: activeLocation.lng,
  });
  const [gpsStatus, setGpsStatus] = useState<string>(activeLocation.nameAr);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

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
      setVoiceNote('الإملاء الصوتي غير مدعوم في هذا المتصفح (يدعمه Chrome على أندرويد والكمبيوتر).');
      window.setTimeout(() => setVoiceNote(''), 4500);
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
        setVoiceNote(language === 'ar' ? '🎙️ أتسمّع الآن... تكلّم بأمرك' : '🎙️ Listening...');
      };

      rec.onresult = (ev) => {
        let transcript = '';
        for (let i = 0; i < ev.results.length; i++) {
          transcript += ev.results[i]?.[0]?.transcript ?? '';
        }
        const combined = [voiceBaseInputRef.current, transcript.trim()]
          .filter(Boolean)
          .join(' ');
        setInput(combined);
      };

      rec.onerror = (ev) => {
        setIsListeningVoice(false);
        if (ev.error === 'not-allowed') {
          setVoiceNote('يرجى السماح بصلاحية الميكروفون للمتصفح لاستخدام الإدخال الصوتي.');
        } else if (ev.error !== 'no-speech') {
          setVoiceNote('تعذر التقاط الصوت — جرّب مرة أخرى.');
        } else {
          setVoiceNote('');
        }
        window.setTimeout(() => setVoiceNote(''), 4000);
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
      window.setTimeout(() => setVoiceNote(''), 3500);
    }
  };

  useEffect(() => {
    setUserCoords({ lat: activeLocation.lat, lng: activeLocation.lng });
    setGpsStatus(activeLocation.nameAr);
  }, [activeLocation]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
        setVoiceNote('🎙️ اضغط على زر الميكروفون أدناه لبدء التحدث فوراً');
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartVoice, onConsumeAutoStartVoice]);

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
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
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
        summaryParts.push('الدستور الشخصي (Firestore)');
      }

      if (memoryActions.length > 0) {
        onExecuteMemoryActions(memoryActions);
        summaryParts.push(`ذاكرة Gemini الدائمة (${memoryActions.length})`);
      }

      if (actions.length > 0) {
        const calRes = await onExecuteCalendarActions(actions);
        calRes.results.forEach((r) => {
          if (r.htmlLink) links.push({ title: r.title, htmlLink: r.htmlLink });
          if (r.id) {
            for (const mAct of medicationActions) {
              if (r.title.includes(mAct.name)) {
                linkedCalendarIds[mAct.name] = r.id;
              }
            }
            for (const cAct of creativeActions) {
              if (r.title.includes(cAct.name)) {
                linkedCalendarIds[cAct.name] = r.id;
              }
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
        summaryParts.push(`العلاجات والمكملات (${medRes.length})`);
      }

      if (creativeActions.length > 0) {
        const crRes = await onExecuteCreativeActions(creativeActions, linkedCalendarIds);
        summaryParts.push(`الأنشطة الإبداعية (${crRes.length})`);
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

  const sendMessage = async (overrideText?: string) => {
    const query = (overrideText ?? input).trim();
    if (!query || loading) return;

    const userMsg: PersistedChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      mode,
      text: query,
      createdAtIso: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    onChangeMessages(nextMessages);
    if (!overrideText) setInput('');
    setLoading(true);

    try {
      if (mode === 'chat') {
        const chatHistory = nextMessages
          .filter((m) => m.mode === 'chat' && !m.error && m.id !== 'welcome-1')
          .slice(0, -1)
          .map((m) => ({ role: m.role, text: m.text }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: query,
            history: chatHistory,
            contextSummary,
            calendarEvents: calendarEvents.map((e) => ({
              id: e.id,
              calendarId: e.calendarId,
              calendarTitle: e.calendarTitle,
              summary: e.summary,
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
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر الرد من المساعد.');

        onChangeMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            mode: 'chat',
            text: data.text || 'تم إعداد الاقتراح.',
            createdAtIso: new Date().toISOString(),
            sources: Array.isArray(data.sources) && data.sources.length > 0 ? data.sources : undefined,
            pendingProposal: data.pendingProposal
              ? { ...data.pendingProposal, status: 'pending' as const }
              : undefined,
          },
        ]);
      } else if (mode === 'maps') {
        const res = await fetch('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            lat: userCoords.lat,
            lng: userCoords.lng,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر جلب نتائج الخرائط.');

        onChangeMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            mode: 'maps',
            text: data.text || 'تم العثور على النتائج التالية:',
            createdAtIso: new Date().toISOString(),
            places: Array.isArray(data.places) ? data.places : [],
          },
        ]);
      } else {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر إجراء البحث المباشر.');

        onChangeMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            mode: 'search',
            text: data.text || 'نتائج البحث:',
            createdAtIso: new Date().toISOString(),
            sources: Array.isArray(data.sources) ? data.sources : [],
          },
        ]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع.';
      onChangeMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'model',
          mode,
          text: errMsg,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const pendingTasks = googleTasks.filter((t) => t.status !== 'completed');

  return (
    <div className="mx-auto max-w-[1380px] px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
      {/* Header + Mode Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 pb-3.5 sm:pb-4 border-b border-white/10">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-white">
            شات Gemini · التقويم · المهام · العلاجات
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            أوامرك تُجهَّز كتعديلات حقيقية على Google Calendar و Google Tasks وأزرار العلاجات بعد تأكيدك
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onOpenLifeProfile}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-xs text-[#7FFFD4] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer"
          >
            الدستور والذاكرة ({memoryCount})
          </button>

          <button
            type="button"
            onClick={onResetChat}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-white/10 text-xs text-zinc-300 hover:border-white/25 flex items-center gap-1.5 cursor-pointer"
            title="بدء محادثة جديدة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>محادثة جديدة</span>
          </button>

          <div className="w-full sm:w-auto grid grid-cols-3 sm:flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10">
            {(
              [
                { id: 'chat', label: 'شات التعديل المباشر', shortLabel: 'شات', Icon: MessageSquare },
                { id: 'maps', label: 'خرائط المساجد والسفر', shortLabel: 'خرائط', Icon: MapPin },
                { id: 'search', label: 'بحث الويب المباشر', shortLabel: 'بحث', Icon: Search },
              ] as const
            ).map(({ id, label, shortLabel, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`min-h-[36px] px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                  mode === id
                    ? 'bg-[#7FFFD4] text-black font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split: Chat Thread + Live Google Calendar & Google Tasks Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Chat Column (8 cols) */}
        <div className="lg:col-span-8 space-y-3 min-w-0">
          {mode === 'maps' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080B10] px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <MapPin className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                <span className="truncate">نقطة البحث الحالية: {gpsStatus}</span>
              </div>
              <button
                type="button"
                onClick={requestBrowserGps}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#7FFFD4]/40 text-[#7FFFD4] hover:bg-[#7FFFD4]/10 cursor-pointer whitespace-nowrap"
              >
                تحديث عبر GPS المتصفح
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#07090D] flex flex-col h-[58dvh] min-h-[360px] sm:h-[560px]">
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#7FFFD4]/15 border border-[#7FFFD4]/30 text-white'
                        : m.error
                          ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                          : 'bg-[#0E131A] border border-white/10 text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] text-zinc-500 mb-1">
                      <span>
                        {m.role === 'user'
                          ? 'أنت'
                          : m.mode === 'maps'
                            ? 'خرائط جوجل · Gemini'
                            : m.mode === 'search'
                              ? 'بحث جوجل · Gemini'
                              : 'مساعد التخطيط · Gemini'}
                      </span>
                      {m.createdAtIso && (
                        <span className="font-mono-tabular">
                          {formatIsoTo12h(m.createdAtIso, language, { includeDate: false })}
                        </span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap">{m.text}</div>

                    {/* Google Calendar Execution Links */}
                    {m.executionLinks && m.executionLinks.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                        {m.executionLinks.map((lnk, i) => (
                          <a
                            key={i}
                            href={lnk.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#4ADE80]/40 bg-[#4ADE80]/10 px-2.5 py-1 text-[11px] text-[#4ADE80] hover:bg-[#4ADE80]/20"
                          >
                            <span>فتح «{lnk.title}» في Google Calendar</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Explicit User Confirmation Dialog Card for Calendar + Tasks Mutations */}
                    {m.pendingProposal && (
                      <div className="mt-3 rounded-xl border border-[#7FFFD4]/40 bg-black/80 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
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
                          <span className="text-[10px] text-zinc-400">
                            {m.pendingProposal.status === 'confirmed'
                              ? 'تم التنفيذ ✓'
                              : m.pendingProposal.status === 'cancelled'
                                ? 'تم الإلغاء'
                                : 'بانتظار موافقتك'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-300">
                          {m.pendingProposal.summaryAr}
                        </div>

                        {m.pendingProposal.profileUpdates && (
                          <div className="rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.07] px-2.5 py-2 text-[11px] space-y-1">
                            <div className="font-semibold text-[#7FFFD4]">
                              🧭 تحديث الدستور الشخصي الدائم (Firestore):
                            </div>
                            <div className="text-zinc-200 flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-[10px]">
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
                              {m.pendingProposal.profileUpdates.suhoorLeadMinutes !== undefined && (
                                <span>السحور: قبل الفجر بـ {m.pendingProposal.profileUpdates.suhoorLeadMinutes} د</span>
                              )}
                              {m.pendingProposal.profileUpdates.sleepTargetMinutes !== undefined && (
                                <span>هدف النوم: {m.pendingProposal.profileUpdates.sleepTargetMinutes} د</span>
                              )}
                              {m.pendingProposal.profileUpdates.sleepDebtMinutes !== undefined && (
                                <span>
                                  رصيد النوم الناقص:{' '}
                                  {m.pendingProposal.profileUpdates.sleepDebtMinutes === 0
                                    ? 'متوازن (0 د)'
                                    : `${m.pendingProposal.profileUpdates.sleepDebtMinutes} د`}
                                </span>
                              )}
                              {m.pendingProposal.profileUpdates.adhanLeadMinutes !== undefined && (
                                <span>قبل الأذان: {m.pendingProposal.profileUpdates.adhanLeadMinutes} د</span>
                              )}
                              {m.pendingProposal.profileUpdates.prayerSilenceMinutes !== undefined && (
                                <span>كتم الصلاة: {m.pendingProposal.profileUpdates.prayerSilenceMinutes} د</span>
                              )}
                              {m.pendingProposal.profileUpdates.fajrSilenceMinutes !== undefined && (
                                <span>كتم الفجر: {m.pendingProposal.profileUpdates.fajrSilenceMinutes} د</span>
                              )}
                              {m.pendingProposal.profileUpdates.oneTimeSilenceMinutes !== undefined &&
                                m.pendingProposal.profileUpdates.oneTimeSilenceMinutes > 0 && (
                                  <span>
                                    كتم مؤقت لمرة واحدة: {m.pendingProposal.profileUpdates.oneTimeSilenceMinutes} د
                                  </span>
                                )}
                              {m.pendingProposal.profileUpdates.lowEnergyDateKey !== undefined && (
                                <span>
                                  {m.pendingProposal.profileUpdates.lowEnergyDateKey
                                    ? 'تفعيل وضع اليوم الهادئ'
                                    : 'إلغاء وضع اليوم الهادئ'}
                                </span>
                              )}
                              {m.pendingProposal.profileUpdates.soundRepeats && (
                                <span>تحديث تكرار رنين التنبيهات</span>
                              )}
                            </div>
                          </div>
                        )}

                        {needsAuth && m.pendingProposal.status === 'pending' && m.pendingProposal.actions.length > 0 && (
                          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                            ملاحظة: لتعديل Google Calendar الفعلي، سجّل الدخول بحساب Google أولاً.
                          </div>
                        )}

                        {m.pendingProposal.actions.length > 0 && (
                          <ul className="space-y-1.5 text-[11px]">
                            {m.pendingProposal.actions.map((act, idx) => (
                              <li
                                key={`cal-${idx}`}
                                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2"
                              >
                                <span className="text-white font-medium">📅 {act.title}</span>
                                <span className="font-mono-tabular text-[#7FFFD4] shrink-0">
                                  {act.operation === 'delete'
                                    ? 'حذف من التقويم'
                                    : act.operation === 'update' || act.operation === 'shift'
                                      ? `تعديل ${act.dateIso ?? ''} · ${formatTime24To12h(act.startTime24, language)}`.trim()
                                      : `${
                                          act.recurrenceRule === 'DAILY'
                                            ? 'يومياً · '
                                            : act.recurrenceRule === 'WEEKLY'
                                              ? act.byDays && act.byDays.length > 0
                                                ? `أسبوعياً (${act.byDays.join(',')}) · `
                                                : 'أسبوعياً · '
                                              : ''
                                        }${formatTime24To12h(act.startTime24 ?? '09:00', language)} (${act.durationMinutes ?? 30}د)`.trim()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {m.pendingProposal.medicationActions &&
                          m.pendingProposal.medicationActions.length > 0 && (
                            <ul className="space-y-1.5 text-[11px]">
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
                                    className="rounded-lg border border-[#4ADE80]/30 bg-[#4ADE80]/[0.06] px-2.5 py-1.5 flex items-center justify-between gap-2"
                                  >
                                    <span className="text-white font-medium">
                                      💊 {mAct.name}
                                      {daysLabel ? (
                                        <span className="text-[10px] text-zinc-400 mr-1.5">
                                          ({daysLabel})
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="font-mono-tabular text-[#4ADE80] shrink-0">
                                      {mAct.operation === 'remove'
                                        ? 'حذف من قائمة العلاجات'
                                        : mAct.operation === 'mark_taken'
                                          ? 'تسجيل تناول اليوم ✓'
                                          : [
                                              doseTimes.length > 0
                                                ? doseTimes
                                                    .map((t24) => formatTime24To12h(t24, language))
                                                    .join(' | ')
                                                : 'بدون ميعاد ثابت',
                                              mAct.courseEndDate ? `حتى ${mAct.courseEndDate}` : '',
                                              typeof mAct.remainingDoses === 'number' && mAct.remainingDoses >= 0
                                                ? `متبقي ${mAct.remainingDoses}`
                                                : '',
                                            ]
                                              .filter(Boolean)
                                              .join(' · ')}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                        {m.pendingProposal.creativeActions &&
                          m.pendingProposal.creativeActions.length > 0 && (
                            <ul className="space-y-1.5 text-[11px]">
                              {m.pendingProposal.creativeActions.map((cAct, idx) => {
                                const cadLabel =
                                  cAct.cadence === 'daily'
                                    ? 'يومياً'
                                    : cAct.cadence === 'monthly'
                                      ? 'شهرياً'
                                      : 'أسبوعياً';
                                const goalNum = cAct.goalCount ?? cAct.weeklyGoalSessions ?? 3;
                                return (
                                  <li
                                    key={`cr-${idx}`}
                                    className="rounded-lg border border-cyan-400/35 bg-cyan-400/[0.07] px-2.5 py-1.5 flex items-center justify-between gap-2"
                                  >
                                    <span className="text-white font-medium">
                                      {cAct.emoji ?? '🎨'} {cAct.name}
                                    </span>
                                    <span className="font-mono-tabular text-cyan-300 shrink-0">
                                      {cAct.operation === 'remove'
                                        ? 'حذف نشاط إبداعي'
                                        : cAct.operation === 'log_session' || cAct.operation === 'log_today'
                                          ? 'تسجيل جلسة اليوم ✓'
                                          : `${goalNum}× ${cadLabel} · ${cAct.sessionMinutes ?? 30} د${
                                              cAct.expiresOnDate ? ` · حتى ${cAct.expiresOnDate}` : ''
                                            }`}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                        {m.pendingProposal.taskActions &&
                          m.pendingProposal.taskActions.length > 0 && (
                            <ul className="space-y-1.5 text-[11px]">
                              {m.pendingProposal.taskActions.map((tAct, idx) => (
                                <li
                                  key={`task-${idx}`}
                                  className="rounded-lg border border-indigo-400/25 bg-indigo-400/[0.06] px-2.5 py-1.5 flex items-center justify-between gap-2"
                                >
                                  <span className="text-white font-medium">☑️ {tAct.title}</span>
                                  <span className="font-mono-tabular text-indigo-300 shrink-0">
                                    {tAct.operation === 'delete'
                                      ? 'حذف مهمة'
                                      : tAct.operation === 'complete'
                                        ? 'تحديد كمكتملة'
                                        : tAct.operation === 'reopen'
                                          ? 'إعادة فتح المهمة'
                                          : tAct.operation === 'update'
                                            ? `تعديل مهمة ${tAct.dueDateIso ?? ''}`.trim()
                                            : `إضافة مهمة ${tAct.dueDateIso ?? ''}`.trim()}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                        {m.pendingProposal.memoryActions &&
                          m.pendingProposal.memoryActions.length > 0 && (
                            <ul className="space-y-1.5 text-[11px]">
                              {m.pendingProposal.memoryActions.map((memAct, idx) => (
                                <li
                                  key={`mem-${idx}`}
                                  className="rounded-lg border border-purple-400/35 bg-purple-400/[0.08] px-2.5 py-2 space-y-0.5"
                                >
                                  <div className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="font-bold text-purple-300">
                                      🧠 {memAct.operation === 'remove' ? 'حذف من ذاكرة Gemini الدائمة' : 'حفظ في ذاكرة Gemini الدائمة (Firestore)'}
                                    </span>
                                    <span className="text-zinc-400">
                                      {MEMORY_CATEGORY_LABELS[memAct.category] ?? 'قواعد عامة'}
                                    </span>
                                  </div>
                                  <div className="text-zinc-100 leading-relaxed">{memAct.ruleText}</div>
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
                              className="flex-1 py-2 px-3 rounded-lg bg-[#7FFFD4] text-black font-bold flex items-center justify-center gap-1.5 hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
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
                              className="py-2 px-3 rounded-lg border border-white/15 text-zinc-300 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
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
                              <div className="flex items-center justify-between gap-2 text-white font-semibold">
                                <span className="truncate">{p.title}</span>
                                <ExternalLink className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
                              </div>
                              {p.snippets && p.snippets[0] && (
                                <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2">
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
                        <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-end">
                  <div className="rounded-2xl border border-white/10 bg-[#0E131A] px-4 py-3 text-xs text-zinc-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7FFFD4]" />
                    <span>جارٍ تحليل الطلب وتجهيز التعديلات...</span>
                  </div>
                </div>
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Suggested Prompts */}
            <div className="px-4 py-2 border-t border-white/10 flex items-center gap-2 overflow-x-auto">
              {SUGGESTED_PROMPTS[mode].map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] text-zinc-300 hover:border-[#7FFFD4]/50 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Voice Status Banner (if active or permission note) */}
            {voiceNote && (
              <div className="px-4 py-1.5 border-t border-white/10 bg-[#7FFFD4]/[0.06] text-[11px] text-[#7FFFD4] flex items-center justify-between">
                <span>{voiceNote}</span>
                {isListeningVoice && (
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    className="text-rose-300 hover:underline font-semibold cursor-pointer"
                  >
                    إيقاف
                  </button>
                )}
              </div>
            )}

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isListeningVoice) {
                  recognitionRef.current?.stop();
                  setIsListeningVoice(false);
                }
                sendMessage();
              }}
              className="p-3 border-t border-white/10 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={loading}
                aria-label={isListeningVoice ? 'إيقاف التسجيل الصوتي' : 'تحدث بالصوت'}
                title={
                  isListeningVoice
                    ? 'اضغط لإيقاف الاستماع'
                    : 'إدخال صوتي بضغطة واحدة (عربي / إنجليزي)'
                }
                className={`min-h-[40px] min-w-[40px] px-2.5 rounded-xl border flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                  isListeningVoice
                    ? 'border-rose-400 bg-rose-500/20 text-rose-300 animate-pulse'
                    : 'border-white/15 bg-black/70 text-zinc-300 hover:border-[#7FFFD4]/60 hover:text-[#7FFFD4]'
                }`}
              >
                {isListeningVoice ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isListeningVoice
                    ? 'تكلّم الآن وسيُكتب كلامك تلقائياً...'
                    : mode === 'maps'
                      ? 'ابحث عن أقرب مسجد، مطعم صحي، أو استراحة طريق...'
                      : mode === 'search'
                        ? 'اسأل عن الطقس اليوم، مواقيت، أو معلومة صحية مباشرة...'
                        : 'اكتب أو تكلّم بأمرك لـ Gemini (مثال: أضف موعد غداً 4:30 م)...'
                }
                className="flex-1 rounded-xl border border-white/10 bg-black/70 px-4 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="min-h-[40px] px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (4 cols): Live Google Calendar & Google Tasks Sidebar */}
        <aside className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#080B10] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#7FFFD4]" />
              <h2 className="text-sm font-bold text-white">بيانات جوجل المباشرة</h2>
            </div>
            {!needsAuth && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onRefreshWorkspace()}
                  className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
                  title="تحديث التقويم والمهام"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      loadingEvents || loadingTasks ? 'animate-spin' : ''
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onGoogleSignOut()}
                  className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-rose-400 cursor-pointer"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {needsAuth ? (
            <div className="space-y-3 text-xs text-zinc-400">
              <p className="leading-relaxed">
                سجّل الدخول بحساب Google ليقرأ الشات واللوحة أحداثك الفعلية من جميع تقويماتك وقائمة Google Tasks ويعدّلها مباشرة بعد تأكيدك.
              </p>

              {/* Official Sign in with Google button style */}
              <button
                type="button"
                onClick={handleSignInClick}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white px-4 py-2.5 text-sm font-medium text-[#1F1F1F] hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[11px] text-[#4ADE80]">
                متصل: {authUser?.email ?? 'حساب Google'}
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setSidebarTab('events')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                    sidebarTab === 'events'
                      ? 'bg-[#7FFFD4] text-black font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>التقويم ({calendarEvents.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('tasks')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                    sidebarTab === 'tasks'
                      ? 'bg-[#7FFFD4] text-black font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>المهام ({pendingTasks.length})</span>
                </button>
              </div>

              {sidebarTab === 'events' ? (
                calendarEvents.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/50 p-4 text-xs text-zinc-500 text-center">
                    لا توجد أحداث مسجلة في الأيام السبعة القادمة.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {calendarEvents.map((ev) => (
                      <div
                        key={`${ev.calendarId ?? 'primary'}-${ev.id}`}
                        className="rounded-xl border border-white/10 bg-black/50 p-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-white">{ev.summary}</div>
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
                        <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1">
                          {formatIsoTo12h(ev.start, language)}
                          {ev.end && !ev.isAllDay
                            ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false })}`
                            : ''}
                        </div>
                        {ev.calendarTitle && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {ev.calendarTitle}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : googleTasks.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/50 p-4 text-xs text-zinc-500 text-center">
                  لا توجد مهام في Google Tasks حالياً.
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {googleTasks.map((tk) => (
                    <div
                      key={`${tk.taskListId}-${tk.id}`}
                      className={`rounded-xl border border-white/10 bg-black/50 p-3 text-xs ${
                        tk.status === 'completed' ? 'opacity-55' : ''
                      }`}
                    >
                      <div className="font-semibold text-white">
                        {tk.status === 'completed' ? '✅ ' : '⬜ '}
                        {tk.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-1 flex items-center justify-between">
                        <span>{tk.taskListTitle}</span>
                        {tk.due && (
                          <span className="font-mono-tabular text-[#7FFFD4]">
                            {tk.due.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
