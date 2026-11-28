import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, MessageSquare, PanelLeftOpen, RefreshCw, RotateCcw, Search, WifiOff, Zap } from 'lucide-react';
import type { PersistedChatMessage } from '../types/dayrhythm';
import { sortChatMessagesChronologically } from '../services/apiClient';
import { getGeminiApiKey } from '../services/geminiClient';
import type { AssistantMode, GeminiAssistantViewProps, SidebarTab } from './gemini/types';
import { readChatOfflineQueue, writeChatOfflineQueue } from './gemini/chatHelpers';
import { useVoiceInput } from './gemini/useVoiceInput';
import { useProposalActions } from './gemini/useProposalActions';
import { useGeminiConnection } from './gemini/useGeminiConnection';
import { sendChatTurn } from './gemini/sendChatTurn';
import { sendGroundedTurn } from './gemini/sendGroundedTurn';
import { WorkspaceSidebar } from './gemini/WorkspaceSidebar';
import { GeminiKeyModal } from './gemini/GeminiKeyModal';
import { ChatMessageList } from './gemini/ChatMessageList';
import { ChatComposer } from './gemini/ChatComposer';
import { useGeminiChatController } from './gemini/useGeminiChatController';
import { useGeminiScrollAndAutoSend } from './gemini/useGeminiScrollAndAutoSend';

export const GeminiAssistantView: React.FC<GeminiAssistantViewProps> = ({
  isActive, language, activeLocation, contextSummary, needsAuth, authUser, isLoggingIn,
  calendarEvents, googleTasks, medications, creativePlacements, habits = [], resolvedHabits = [],
  loadingEvents, loadingTasks, messages, onChangeMessages, onResetChat, onGoogleSignIn,
  onGoogleSignOut, onRefreshWorkspace, onExecuteCalendarActions, onExecuteTaskActions,
  onExecuteMedicationActions, onExecuteCreativeActions, onExecuteHabitActions,
  onApplyProfileUpdates, onApplyAppSettings, onApplySettingsPatch, currentSettingsSnapshot,
  onExecuteMemoryActions, onOpenLifeProfile, initialPrompt, onConsumeInitialPrompt,
  autoStartVoice, onConsumeAutoStartVoice, memoryCount, memories, lifeProfile,
  firestoreSynced, onAddMemory, onUpdateMemory, onDeleteMemory,
}) => {
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('memories');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [draftsByMode, setDraftsByMode] = useState<Record<AssistantMode, string>>({ chat: '', maps: '', search: '' });
  const [loadingByMode, setLoadingByMode] = useState<Record<AssistantMode, boolean>>({ chat: false, maps: false, search: false });
  const [streamingMsgIdByMode, setStreamingMsgIdByMode] = useState<Record<AssistantMode, string | null>>({ chat: null, maps: null, search: null });
  const [streamStatusByMode, setStreamStatusByMode] = useState<Record<AssistantMode, string>>({ chat: '', maps: '', search: '' });

  const [autoExecute, setAutoExecute] = useState<boolean>(() => {
    try { const s = localStorage.getItem('dayrhythm_chat_auto_execute'); return s === null ? true : s === '1'; } catch { return true; }
  });
  const autoExecuteRef = useRef(autoExecute);
  useEffect(() => {
    autoExecuteRef.current = autoExecute;
    try { localStorage.setItem('dayrhythm_chat_auto_execute', autoExecute ? '1' : '0'); } catch { /* ignore */ }
  }, [autoExecute]);

  const input = draftsByMode[mode];
  const loading = loadingByMode[mode];
  const setInputForMode = useCallback((m: AssistantMode, v: string) => setDraftsByMode((p) => ({ ...p, [m]: v })), []);
  const setInput = useCallback((v: string) => setDraftsByMode((p) => ({ ...p, [mode]: v })), [mode]);

  const conn = useGeminiConnection(isActive);
  const voice = useVoiceInput({ language, input, setInput });
  const { executingProposalId, handleConfirmProposal, handleCancelProposal } = useProposalActions({
    lifeProfile, currentSettingsSnapshot, onApplySettingsPatch, onApplyAppSettings,
    onApplyProfileUpdates, onExecuteMemoryActions, onExecuteCalendarActions, onExecuteTaskActions,
    onExecuteMedicationActions, onExecuteCreativeActions, onExecuteHabitActions, onChangeMessages,
  });

  const abortControllersRef = useRef<Record<AssistantMode, AbortController | null>>({ chat: null, maps: null, search: null });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const [userCoords, setUserCoords] = useState({ lat: activeLocation.lat, lng: activeLocation.lng });
  const [gpsStatus, setGpsStatus] = useState<string>(activeLocation.nameAr);

  const { focusComposerInput, scrollThreadToBottom } = useGeminiScrollAndAutoSend({
    isActive,
    mode,
    setMode,
    input,
    setInputForMode,
    messages,
    loading,
    streamingMsgIdByMode,
    activeLocation,
    setUserCoords,
    setGpsStatus,
    abortControllersRef,
    textareaRef,
    scrollContainerRef,
    userScrolledUpRef,
    recognitionRef: voice.recognitionRef,
    toggleVoiceInput: voice.toggleVoiceInput,
    setVoiceNote: voice.setVoiceNote,
    initialPrompt,
    onConsumeInitialPrompt,
    autoStartVoice,
    onConsumeAutoStartVoice,
  });

  const { stopGeneration, handleSignInClick, requestBrowserGps, sendMessage } = useGeminiChatController({
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
    setGeminiStatus: conn.setGeminiStatus,
    handleConfirmProposal,
  });

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const onVoice = (ev: Event) => {
      const detail = (ev as CustomEvent<{ text?: string; error?: string }>).detail || {};
      voice.setVoiceNote('');
      if (detail.text && detail.text.trim()) {
        const combined = [voice.voiceBaseInputRef.current, detail.text.trim()].filter(Boolean).join(' ');
        voice.voiceBaseInputRef.current = '';
        setMode('chat');
        void sendMessageRef.current(combined, 'chat');
      } else if (detail.error) {
        voice.setVoiceNote(detail.error);
        window.setTimeout(() => voice.setVoiceNote(''), 3500);
      }
    };
    window.addEventListener('dayrhythm:voice-result', onVoice);
    return () => window.removeEventListener('dayrhythm:voice-result', onVoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let flushing = false;
    const flush = async () => {
      if (flushing || navigator.onLine === false) return;
      const queue = readChatOfflineQueue();
      if (queue.length === 0) return;
      flushing = true;
      try {
        for (const item of queue) {
          writeChatOfflineQueue(readChatOfflineQueue().filter((q) => q.id !== item.id));
          await sendMessageRef.current(item.text, item.mode, { queuedId: item.id });
        }
      } finally { flushing = false; }
    };
    const startTimer = window.setTimeout(() => void flush(), 2500);
    window.addEventListener('online', flush);
    return () => { window.clearTimeout(startTimer); window.removeEventListener('online', flush); };
  }, []);

  const pendingTasks = useMemo(() => googleTasks.filter((t) => t.status !== 'completed'), [googleTasks]);
  const visibleMessages = useMemo(() => sortChatMessagesChronologically(messages.filter((m) => m.mode === mode)), [messages, mode]);
  const statusText = conn.geminiStatus.status === 'checking' ? 'جارٍ فحص اتصال Gemini...' : conn.geminiStatus.connected ? 'متصل بـ Gemini ✓' : 'تعذر الاتصال بـ Gemini';
  const statusDotClass = conn.geminiStatus.status === 'checking' ? 'bg-amber-400 animate-pulse' : conn.geminiStatus.connected ? 'bg-[#4ADE80]' : 'bg-rose-500';
  const statusTextColor = conn.geminiStatus.status === 'checking' ? 'text-amber-300' : conn.geminiStatus.connected ? 'text-[#4ADE80]' : 'text-rose-400';

  const sidebarProps = {
    sidebarTab, setSidebarTab, memories, calendarEvents, googleTasks, pendingTasks,
    lifeProfile, activeLocation, language, firestoreSynced, needsAuth, authUser,
    isLoggingIn, loadingEvents, loadingTasks, onOpenLifeProfile, onAddMemory,
    onUpdateMemory, onDeleteMemory, onSignInClick: () => void handleSignInClick(),
    onRefreshWorkspace, onGoogleSignOut,
  };

  return (
    <div className="mx-auto max-w-[1380px] px-3 sm:px-6 py-3 sm:py-5 space-y-4 max-lg:flex max-lg:flex-col max-lg:h-[calc(100dvh-57px-63px-env(safe-area-inset-bottom))] max-lg:space-y-0 max-lg:gap-2 max-lg:py-2 max-lg:px-2">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3.5 border-b border-white/[0.06] max-lg:gap-2 max-lg:pb-2 max-lg:shrink-0">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-base sm:text-lg font-bold text-white whitespace-nowrap">شات Gemini</h1>
            <button type="button" onClick={() => void conn.runGeminiProbe(true)} title={conn.geminiStatus.error ? `${conn.geminiStatus.error} — اضغط لإعادة الفحص` : 'اضغط لإعادة فحص اتصال Gemini المباشر'} className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 text-xs cursor-pointer hover:opacity-85 transition-opacity whitespace-nowrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} aria-hidden="true" />
              <span className={`font-mono-tabular font-medium ${statusTextColor}`}>{statusText}</span>
              <RefreshCw className={`w-3 h-3 text-zinc-500 ${conn.geminiStatus.status === 'checking' ? 'animate-spin text-amber-300' : ''}`} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400 max-lg:hidden">
            <span>مرتبط مباشرة بالدستور الشخصي</span><span aria-hidden="true">·</span>
            <span className="text-zinc-200 font-medium font-mono-tabular">{memoryCount} ذاكرة دائمة نشطة</span><span aria-hidden="true">·</span>
            <span>{firestoreSynced ? 'مزامنة سحابية فورية' : 'حفظ محلي نشط'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:flex-nowrap max-sm:gap-1.5">
          <div className="flex-1 sm:flex-none grid grid-cols-3 sm:flex items-center p-1 rounded-2xl bg-[var(--bg-surface)] border border-white/[0.06] min-w-0">
            {([{ id: 'chat', label: 'شات', Icon: MessageSquare }, { id: 'maps', label: 'خرائط', Icon: MapPin }, { id: 'search', label: 'بحث', Icon: Search }] as const).map(({ id, label, Icon }) => {
              const active = mode === id;
              return (
                <button key={id} type="button" onClick={() => setMode(id)} className={`relative min-h-[44px] sm:min-h-[36px] px-3 max-sm:px-1 py-1.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap min-w-0 select-none ${active ? 'text-[#7FFFD4] font-bold' : 'text-zinc-400 hover:text-white'}`}>
                  {active && <motion.span layoutId="gemini-mode-pill" transition={{ type: 'spring', stiffness: 460, damping: 35 }} className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25" />}
                  <Icon className="relative z-10 w-3.5 h-3.5 shrink-0 max-sm:hidden" /><span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
          {mode === 'chat' && (
            <button type="button" onClick={() => setAutoExecute((v) => !v)} aria-label={autoExecute ? 'التنفيذ الفوري مفعّل' : 'التأكيد اليدوي مفعّل'} className={`min-h-[44px] sm:min-h-[40px] px-3 max-sm:px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${autoExecute ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4]' : 'border-white/[0.06] bg-[var(--bg-surface)] text-zinc-400 hover:text-white'}`}>
              <Zap className="w-3.5 h-3.5" /><span className="max-sm:hidden">{autoExecute ? 'تنفيذ فوري' : 'تأكيد يدوي'}</span>
            </button>
          )}
          <button type="button" onClick={() => setMobilePanelOpen((v) => !v)} aria-label="الذاكرة والتقويم" aria-expanded={mobilePanelOpen} className={`lg:hidden min-h-[44px] sm:min-h-[40px] px-3 max-sm:px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${mobilePanelOpen ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4]' : 'border-white/[0.06] bg-[var(--bg-surface)] text-zinc-200 hover:border-[#7FFFD4]/40'}`}>
            <PanelLeftOpen className="w-3.5 h-3.5 text-[#7FFFD4]" /><span className="max-sm:hidden">الذاكرة والتقويم</span>
          </button>
          <button type="button" onClick={() => { stopGeneration(mode); onResetChat(mode); }} aria-label="محادثة جديدة" className="min-h-[44px] sm:min-h-[40px] px-3 max-sm:px-2.5 py-1.5 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /><span className="max-sm:hidden">{mode === 'chat' ? 'محادثة جديدة' : mode === 'maps' ? 'مسح الخرائط' : 'مسح البحث'}</span>
          </button>
        </div>
      </header>

      {conn.geminiStatus.status === 'offline' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 space-y-2.5 text-xs text-rose-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="leading-relaxed">{conn.geminiStatus.error || 'تعذر الاتصال بواجهة Google Gemini API حالياً.'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => void conn.runGeminiProbe(true)} className="px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 font-semibold cursor-pointer whitespace-nowrap">إعادة الفحص الآن</button>
              <button type="button" onClick={() => { conn.setApiKeyDraft(getGeminiApiKey()); conn.setKeySaveMessage(null); conn.setShowApiKeyModal(true); }} className="px-3 py-1.5 rounded-lg border border-[#7FFFD4]/50 bg-[#7FFFD4]/20 text-[#7FFFD4] hover:bg-[#7FFFD4]/30 font-semibold cursor-pointer whitespace-nowrap">تغيير مفتاح API</button>
            </div>
          </div>
        </div>
      )}

      <GeminiKeyModal open={conn.showApiKeyModal} apiKeyDraft={conn.apiKeyDraft} setApiKeyDraft={conn.setApiKeyDraft} keySaveMessage={conn.keySaveMessage} isProbingKey={conn.isProbingKey} onClose={() => conn.setShowApiKeyModal(false)} onResetApiKey={() => void conn.handleResetApiKey()} onProbe={() => void conn.runGeminiProbe(true)} onSaveApiKey={() => void conn.handleSaveApiKey()} />

      <AnimatePresence initial={false}>
        {mobilePanelOpen && (
          <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="lg:hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4">
            <WorkspaceSidebar {...sidebarProps} />
          </motion.section>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-lg:flex-1 max-lg:min-h-0 max-lg:flex max-lg:flex-col">
        <section className="lg:col-span-8 flex flex-col rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] h-[calc(100dvh-235px)] min-h-[430px] lg:h-[calc(100dvh-185px)] max-h-[780px] overflow-hidden min-w-0 max-lg:h-auto max-lg:max-h-none max-lg:min-h-0 max-lg:flex-1">
          {mode === 'maps' && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[var(--bg-card)] px-4 py-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
                <span className="truncate font-mono-tabular">نقطة البحث: {gpsStatus}</span>
              </div>
              <button type="button" onClick={requestBrowserGps} className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-xl border border-[#7FFFD4]/35 text-[#7FFFD4] hover:bg-[#7FFFD4]/10 cursor-pointer whitespace-nowrap shrink-0 transition-colors">تحديث GPS</button>
            </div>
          )}

          <ChatMessageList
            mode={mode} visibleMessages={visibleMessages} loading={loading} streamingMsgId={streamingMsgIdByMode[mode]}
            streamStatusText={streamStatusByMode[mode]} scrollContainerRef={scrollContainerRef} threadEndRef={threadEndRef}
            onScroll={() => { const el = scrollContainerRef.current; if (el) userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 120; }}
            language={language} activeLocation={activeLocation} lifeProfile={lifeProfile} currentSettingsSnapshot={currentSettingsSnapshot}
            memoriesCount={memories.length} needsAuth={needsAuth} userCoords={userCoords} executingProposalId={executingProposalId}
            onRetryMessage={(p, m) => void sendMessage(p, m, { bypassCache: true })}
            onConfirmProposal={handleConfirmProposal} onCancelProposal={handleCancelProposal}
          />

          <ChatComposer
            mode={mode} loading={loading} input={input} setInput={setInput} textareaRef={textareaRef}
            isListeningVoice={voice.isListeningVoice} voiceNote={voice.voiceNote} onToggleVoiceInput={voice.toggleVoiceInput}
            onStopVoiceIfListening={() => { if (voice.isListeningVoice) { voice.recognitionRef.current?.stop(); voice.setIsListeningVoice(false); } }}
            onSendMessage={(text) => void sendMessage(text)} onStopGeneration={() => stopGeneration(mode)}
          />
        </section>

        <aside className="hidden lg:block lg:col-span-4 rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 overflow-y-auto lg:h-[calc(100dvh-185px)] max-h-[780px]">
          <WorkspaceSidebar {...sidebarProps} />
        </aside>
      </div>
    </div>
  );
};
