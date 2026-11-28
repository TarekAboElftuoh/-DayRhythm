import React from 'react';
import { Mic, MicOff, Send, Square } from 'lucide-react';
import { QUICK_ACTION_CHIPS, SUGGESTED_PROMPTS, type AssistantMode } from './types';

export const ChatComposer: React.FC<{
  mode: AssistantMode;
  loading: boolean;
  input: string;
  setInput: (val: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isListeningVoice: boolean;
  voiceNote: string;
  onToggleVoiceInput: () => void;
  onStopVoiceIfListening: () => void;
  onSendMessage: (overrideText?: string) => void;
  onStopGeneration: () => void;
}> = ({
  mode,
  loading,
  input,
  setInput,
  textareaRef,
  isListeningVoice,
  voiceNote,
  onToggleVoiceInput,
  onStopVoiceIfListening,
  onSendMessage,
  onStopGeneration,
}) => (
  <>
    {!loading && (
      <div className="px-3 sm:px-4 py-2 border-t border-white/[0.06] flex items-center gap-2 overflow-x-auto bg-[var(--bg-surface)] no-scrollbar">
        {mode === 'chat'
          ? QUICK_ACTION_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(chip.prompt)}
                className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-white/[0.06] bg-[var(--bg-card)] text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:bg-[#7FFFD4]/10 hover:text-[#7FFFD4] whitespace-nowrap shrink-0 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 select-none"
              >
                <span>{chip.emoji}</span>
                <span>{chip.label}</span>
              </button>
            ))
          : SUGGESTED_PROMPTS[mode].map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(prompt)}
                className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-white/[0.06] bg-[var(--bg-card)] text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-white whitespace-nowrap shrink-0 cursor-pointer transition-all active:scale-95 select-none"
              >
                {prompt}
              </button>
            ))}
      </div>
    )}

    {voiceNote && (
      <div className="px-4 py-1.5 border-t border-white/[0.06] bg-[#7FFFD4]/[0.06] text-xs text-[#7FFFD4] flex items-center justify-between gap-2 overflow-hidden">
        <span>{voiceNote}</span>
        {isListeningVoice && (
          <button type="button" onClick={onToggleVoiceInput} className="text-rose-300 hover:underline font-semibold cursor-pointer whitespace-nowrap">
            إيقاف
          </button>
        )}
      </div>
    )}

    <form
      onSubmit={(e) => {
        e.preventDefault();
        onStopVoiceIfListening();
        onSendMessage();
      }}
      className="p-3 sm:p-4 border-t border-white/[0.06] bg-[var(--bg-surface)] flex items-end gap-2.5"
    >
      <button
        type="button"
        onClick={onToggleVoiceInput}
        disabled={loading}
        aria-label={isListeningVoice ? 'إيقاف التسجيل الصوتي' : 'تحدث بالصوت'}
        title={isListeningVoice ? 'اضغط لإيقاف الاستماع' : 'إدخال صوتي'}
        className={`min-h-[44px] min-w-[44px] rounded-2xl border flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 ${
          isListeningVoice
            ? 'border-rose-400/60 bg-rose-500/15 text-rose-300'
            : 'border-white/[0.06] bg-[var(--bg-card)] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4]'
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
              onStopVoiceIfListening();
              onSendMessage();
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
                : typeof window !== 'undefined' && window.innerWidth < 640
                  ? 'اكتب لـ Gemini…'
                  : 'اكتب أمرك لـ Gemini (Enter للإرسال، Shift+Enter لسطر جديد)...'
        }
        className="flex-1 min-h-[44px] max-h-[140px] resize-none rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] px-4 py-2.5 text-sm sm:text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]/60 leading-relaxed"
      />

      {loading ? (
        <button
          type="button"
          onClick={onStopGeneration}
          aria-label="إيقاف التوليد"
          className="min-h-[44px] px-4 rounded-2xl border border-rose-400/50 bg-rose-500/15 text-rose-200 text-xs font-bold hover:bg-rose-500/25 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform whitespace-nowrap shrink-0"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span className="max-sm:hidden">إيقاف</span>
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="إرسال"
          className="min-h-[44px] px-4 max-sm:px-3.5 rounded-2xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform whitespace-nowrap shrink-0"
        >
          <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="max-sm:hidden">إرسال</span>
        </button>
      )}
    </form>
  </>
);
