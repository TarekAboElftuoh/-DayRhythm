import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Key } from 'lucide-react';
import {
  checkGeminiStatus,
  getGeminiApiKey,
  resetGeminiApiKey,
  setGeminiApiKey,
} from '../../services/geminiClient';

export const GeminiApiKeySection: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
  const [apiKeyInput, setApiKeyInput] = useState(() => getGeminiApiKey());
  const [showApiKeyPlain, setShowApiKeyPlain] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<string | null>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(getGeminiApiKey());
      setKeyFeedback(null);
      setTestResult(null);
    }
  }, [isOpen]);

  const handleSaveGeminiKey = async () => {
    setIsTestingKey(true);
    setKeyFeedback(null);
    try {
      const res = setGeminiApiKey(apiKeyInput);
      setApiKeyInput(res.saved);
      window.dispatchEvent(new CustomEvent('dayrhythm:gemini-key-updated'));
      const status = await checkGeminiStatus(true);
      if (status.status === 'online') {
        setKeyFeedback(`✓ تم حفظ المفتاح بنجاح! الاتصال بـ Google Gemini جاهز (${status.latencyMs}ms)`);
        setTestResult({ ok: true, text: `🟢 متصل ومستعد (${status.latencyMs}ms)` });
      } else {
        setKeyFeedback(status.error || 'تم حفظ المفتاح، لكن تعذر الاتصال بـ Google حالياً.');
        setTestResult({ ok: false, text: `🔴 ${status.error || 'غير متصل'}` });
      }
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleResetGeminiKey = async () => {
    const def = resetGeminiApiKey();
    setApiKeyInput(def);
    window.dispatchEvent(new CustomEvent('dayrhythm:gemini-key-updated'));
    setIsTestingKey(true);
    try {
      const status = await checkGeminiStatus(true);
      setKeyFeedback('تمت استعادة المفتاح الافتراضي الأصلي بنجاح ✓');
      setTestResult({
        ok: status.status === 'online',
        text: status.status === 'online' ? `🟢 متصل بالافتراضي (${status.latencyMs}ms)` : `🔴 ${status.error || 'غير متصل'}`,
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleTestGeminiKey = async () => {
    setIsTestingKey(true);
    setKeyFeedback(null);
    try {
      const status = await checkGeminiStatus(true);
      setTestResult({
        ok: status.status === 'online',
        text: status.status === 'online' ? `🟢 متصل بنجاح (${status.latencyMs}ms)` : `🔴 ${status.error || 'غير متصل'}`,
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Key className="w-4 h-4 text-[#7FFFD4]" />
          <span>مفتاح Google Gemini API (محادثة العميل المباشرة)</span>
        </h3>
        {testResult && (
          <span className={`font-mono-tabular text-xs font-semibold ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {testResult.text}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed">
        يتصل شات Gemini وخرائط الأماكن مباشرة بواجهة Google Gemini API الرسمية من جانب العميل بدون الحاجة لأي خادم وسيط. المفتاح الافتراضي يعمل فوراً، ويمكنك تخصيص مفتاحك وحفظه محلياً في <code className="bg-black px-1.5 py-0.5 rounded text-[#7FFFD4]">localStorage</code> على هذا الجهاز.
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-300">
          <span className="font-medium">مفتاح API الخاص بك:</span>
          <button
            type="button"
            onClick={() => setShowApiKeyPlain((v) => !v)}
            className="text-[11px] text-[#7FFFD4] hover:underline flex items-center gap-1 cursor-pointer"
          >
            {showApiKeyPlain ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{showApiKeyPlain ? 'إخفاء' : 'إظهار'}</span>
          </button>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <input
            type={showApiKeyPlain ? 'text' : 'password'}
            dir="ltr"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AQ... أو AIza..."
            className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#7FFFD4]"
          />
          <button
            type="button"
            onClick={() => void handleSaveGeminiKey()}
            disabled={isTestingKey}
            className="px-4 py-2 rounded-lg bg-[#7FFFD4] text-black font-bold text-xs hover:bg-[#66eec2] cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {isTestingKey ? 'جارٍ الحفظ...' : 'حفظ المفتاح'}
          </button>
        </div>
      </div>

      {keyFeedback && (
        <div
          className={`p-2.5 rounded-lg text-xs leading-relaxed ${
            keyFeedback.startsWith('✓') || keyFeedback.includes('بنجاح')
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-200'
          }`}
        >
          {keyFeedback}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10 text-xs">
        <button
          type="button"
          onClick={() => void handleResetGeminiKey()}
          disabled={isTestingKey}
          className="text-zinc-400 hover:text-white cursor-pointer underline text-[11px]"
        >
          استعادة المفتاح الافتراضي الجاهز
        </button>
        <button
          type="button"
          onClick={() => void handleTestGeminiKey()}
          disabled={isTestingKey}
          className="px-3 py-1 rounded-lg border border-[#7FFFD4]/30 text-[#7FFFD4] hover:bg-[#7FFFD4]/10 cursor-pointer text-xs"
        >
          {isTestingKey ? 'جارٍ الفحص...' : 'فحص الاتصال بـ Google'}
        </button>
      </div>
    </section>
  );
};
