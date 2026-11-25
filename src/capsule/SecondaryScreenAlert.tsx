import React, { useEffect, useState } from 'react';

/**
 * Full-screen alert shown on the secondary monitor by SecondaryScreenAlertForm.cs.
 * Same design language as the app (AMOLED black, aqua accent, Cairo + JetBrains Mono), but big
 * and pulsing so it can't be missed from across the room. Actions are posted back to the host.
 */

interface AlertPayload {
  emoji: string;
  title: string;
  description: string;
  sourceLabel: string;
  time12h: string;
  isHydration: boolean;
  isMedication: boolean;
  medicationId: string;
  isContinuous: boolean;
  snoozeMinutes: number;
}

const EMPTY: AlertPayload = {
  emoji: '🔔',
  title: '',
  description: '',
  sourceLabel: 'إيقاع اليوم',
  time12h: '',
  isHydration: false,
  isMedication: false,
  medicationId: '',
  isContinuous: false,
  snoozeMinutes: 5,
};

type Bridge = {
  postMessage: (m: string) => void;
  addEventListener: (t: 'message', cb: (e: { data: unknown }) => void) => void;
  removeEventListener: (t: 'message', cb: (e: { data: unknown }) => void) => void;
};

const bridge = () => (window as Window & { chrome?: { webview?: Bridge } }).chrome?.webview;
const post = (msg: Record<string, unknown>) => {
  try {
    bridge()?.postMessage(JSON.stringify(msg));
  } catch {
    // preview outside WebView2
  }
};

export const SecondaryScreenAlert: React.FC = () => {
  const [alert, setAlert] = useState<AlertPayload>(() =>
    new URLSearchParams(window.location.search).get('demo') === '1'
      ? { ...EMPTY, emoji: '🕌', title: 'صلاة العصر', sourceLabel: 'مواقيت الصلاة · قبل الأذان بـ 3 د', time12h: '02:30 م' }
      : EMPTY
  );
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const onMsg = (e: { data: unknown }) => {
      const d = e.data as { type?: string; alert?: Partial<AlertPayload> } | null;
      if (d?.type === 'alert-state' && d.alert) setAlert((prev) => ({ ...prev, ...d.alert }));
    };
    b.addEventListener('message', onMsg);
    // The host's own post can land before this listener exists; ask for the data now that it does.
    post({ type: 'alert-ready' });
    return () => b.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const elapsedText = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const isMed = alert.isMedication && Boolean(alert.medicationId);
  const primaryLabel = alert.isHydration ? 'شربت كوب ماء' : isMed ? 'أخذت الجرعة' : 'تم';
  const accent = isMed ? '#FB7185' : '#7FFFD4';

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/90 p-10">
      <style>{`
        @keyframes dr-ring { 0% { transform: scale(0.92); opacity: .65 } 100% { transform: scale(1.35); opacity: 0 } }
        @keyframes dr-breathe { 0%,100% { box-shadow: 0 0 0 1px ${accent}55, 0 0 60px ${accent}22 } 50% { box-shadow: 0 0 0 2px ${accent}aa, 0 0 120px ${accent}44 } }
      `}</style>
      <div
        className="relative w-full max-w-3xl rounded-[40px] border bg-[#0B0E14] px-12 py-14 text-center"
        style={{ borderColor: `${accent}66`, animation: 'dr-breathe 1.6s ease-in-out infinite' }}
      >
        <div className="relative mx-auto mb-8 h-40 w-40">
          <span className="absolute inset-0 rounded-full" style={{ background: `${accent}22`, animation: 'dr-ring 1.4s ease-out infinite' }} />
          <span className="absolute inset-0 rounded-full" style={{ background: `${accent}18`, animation: 'dr-ring 1.4s ease-out .7s infinite' }} />
          <span className="relative flex h-full w-full items-center justify-center rounded-full border bg-black text-7xl" style={{ borderColor: `${accent}55` }}>
            {alert.emoji}
          </span>
        </div>

        <div
          className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-base font-bold"
          style={{ borderColor: `${accent}44`, background: `${accent}16`, color: accent }}
        >
          <span>{alert.sourceLabel}</span>
          {alert.time12h && <span>· {alert.time12h}</span>}
        </div>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-white">{alert.title || 'تنبيه إيقاع اليوم'}</h1>
        {alert.description && (
          <p className="mx-auto mt-5 max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-4 text-xl leading-relaxed text-zinc-200 whitespace-pre-line">
            {alert.description}
          </p>
        )}
        <div className="mt-4 flex items-center justify-center gap-3 text-base text-zinc-400">
          <span>
            بدأ من <span className="font-digits text-zinc-200">{elapsedText}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-zinc-400">إيقافه هنا يُغلق تنبيه الهاتف فوراً</span>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => post({ type: 'alert-primary' })}
            className="min-w-[220px] rounded-2xl px-10 py-5 text-2xl font-bold text-black cursor-pointer transition-transform active:scale-[0.98]"
            style={{ background: accent }}
          >
            {primaryLabel}
          </button>
          {[5, 10, 15].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => post({ type: 'alert-snooze', minutes: m })}
              className="rounded-2xl border border-white/15 bg-white/[0.04] px-7 py-5 text-xl font-semibold text-zinc-100 cursor-pointer hover:border-white/30"
            >
              تأجيل {m} د
            </button>
          ))}
        </div>
        {(alert.isHydration || isMed) && (
          <button
            type="button"
            onClick={() => post({ type: 'alert-dismiss' })}
            className="mt-6 text-base text-zinc-500 hover:text-zinc-300 cursor-pointer"
          >
            إيقاف التنبيه فقط
          </button>
        )}
      </div>
    </div>
  );
};
