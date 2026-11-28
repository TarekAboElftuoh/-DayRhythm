import React, { useState } from 'react';
import { Check, Eye, EyeOff, Key, Loader2, X } from 'lucide-react';

export const GeminiKeyModal: React.FC<{
  open: boolean;
  apiKeyDraft: string;
  setApiKeyDraft: (val: string) => void;
  keySaveMessage: string | null;
  isProbingKey: boolean;
  onClose: () => void;
  onResetApiKey: () => void;
  onProbe: () => void;
  onSaveApiKey: () => void;
}> = ({
  open,
  apiKeyDraft,
  setApiKeyDraft,
  keySaveMessage,
  isProbingKey,
  onClose,
  onResetApiKey,
  onProbe,
  onSaveApiKey,
}) => {
  const [showApiKeyPlain, setShowApiKeyPlain] = useState(false);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-5 sm:p-6 text-zinc-100 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[#7FFFD4]" />
            <h3 className="text-base font-bold text-white">إعدادات مفتاح Google Gemini API</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer rounded-xl"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          يتصل الشات مباشرة بـ Google Gemini API من جانب العميل (Client-Side) بدون الحاجة لأي خادم وسيط.
          المفتاح الافتراضي مهيأ وجاهز للعمل فوراً، ويمكنك استبداله وحفظ مفتاحك الخاص في{' '}
          <code className="bg-[var(--bg-surface)] px-1.5 py-0.5 rounded text-[#7FFFD4]">localStorage</code> على هذا الجهاز.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs text-zinc-400 flex items-center justify-between">
            <span>مفتاح Gemini API:</span>
            <button
              type="button"
              onClick={() => setShowApiKeyPlain((v) => !v)}
              className="text-[11px] text-[#7FFFD4] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showApiKeyPlain ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showApiKeyPlain ? 'إخفاء' : 'إظهار'}</span>
            </button>
          </label>
          <input
            type={showApiKeyPlain ? 'text' : 'password'}
            dir="ltr"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            placeholder="AQ... أو AIza..."
            className="w-full min-h-[44px] rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#7FFFD4] focus:outline-none font-mono"
          />
        </div>

        {keySaveMessage && (
          <div
            className={`p-2.5 rounded-xl text-xs leading-relaxed ${
              keySaveMessage.startsWith('✓') || keySaveMessage.includes('بنجاح')
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-200'
            }`}
          >
            {keySaveMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onResetApiKey}
            disabled={isProbingKey}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-zinc-300 hover:text-white text-xs cursor-pointer font-medium disabled:opacity-50"
          >
            استعادة المفتاح الافتراضي
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onProbe}
              disabled={isProbingKey}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-[#7FFFD4]/30 text-[#7FFFD4] hover:bg-[#7FFFD4]/10 text-xs cursor-pointer font-medium disabled:opacity-50"
            >
              فحص الاتصال
            </button>
            <button
              type="button"
              onClick={onSaveApiKey}
              disabled={isProbingKey}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#7FFFD4] text-black font-bold text-xs hover:bg-[#66eec2] cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isProbingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>حفظ في المتصفح</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
