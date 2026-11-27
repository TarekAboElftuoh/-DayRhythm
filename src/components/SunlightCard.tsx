import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BellOff, Cloud, Clock } from 'lucide-react';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import type { SunlightSessionId } from '../types/dayrhythm';
import { getNowMinutesInTimeZone } from '../engines/prayerEngine';

interface SunlightCardProps {
  sessions: ComputedSunlightSession[];
  enabled: boolean;
  activeTimeZone: string;
  cardSurface: string;
  onSnooze: (id: SunlightSessionId) => void;
  onSessionEnd?: (id: SunlightSessionId) => void;
}

function getNowSecondsInTimeZone(timeZone: string): number {
  const mins = getNowMinutesInTimeZone(timeZone);
  const secs = new Date().getSeconds();
  return mins * 60 + secs;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export const SunlightCard: React.FC<SunlightCardProps> = ({
  sessions,
  enabled,
  activeTimeZone,
  cardSurface,
  onSnooze,
  onSessionEnd,
}) => {
  const [nowSec, setNowSec] = useState<number>(() =>
    getNowSecondsInTimeZone(activeTimeZone)
  );
  const endedSessionKeyRef = useRef<string>('');

  useEffect(() => {
    setNowSec(getNowSecondsInTimeZone(activeTimeZone));
    const timer = window.setInterval(() => {
      setNowSec(getNowSecondsInTimeZone(activeTimeZone));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeTimeZone]);

  const currentSession = useMemo(() => {
    if (!enabled) return null;
    const enabledSessions = sessions.filter((s) => s.enabled);
    if (enabledSessions.length === 0) return null;
    return (
      enabledSessions.find((s) => nowSec < s.endMinutes * 60) ?? null
    );
  }, [enabled, sessions, nowSec]);

  const isActive = Boolean(
    currentSession &&
      nowSec >= currentSession.startMinutes * 60 &&
      nowSec < currentSession.endMinutes * 60
  );

  const remainingSec = useMemo(() => {
    if (!currentSession) return 0;
    const targetSec = isActive
      ? currentSession.endMinutes * 60
      : currentSession.startMinutes * 60;
    return Math.max(0, targetSec - nowSec);
  }, [currentSession, isActive, nowSec]);

  useEffect(() => {
    if (!currentSession || !isActive || currentSession.isCloudBlocked) return;
    if (remainingSec === 0) {
      const key = `${currentSession.id}:${currentSession.endMinutes}`;
      if (endedSessionKeyRef.current !== key) {
        endedSessionKeyRef.current = key;
        onSessionEnd?.(currentSession.id);
      }
    }
  }, [currentSession, isActive, remainingSec, onSessionEnd]);

  if (!enabled || !currentSession) {
    return null;
  }

  return (
    <section
      dir="rtl"
      aria-label="الأشعة المفيدة"
      className={`rounded-2xl border p-4 sm:p-5 space-y-3 transition-colors ${cardSurface}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-xl leading-none select-none mt-0.5" aria-hidden="true">
            {currentSession.emoji}
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white truncate">
                {currentSession.labelAr}
              </h2>
              {isActive && !currentSession.isCloudBlocked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  الآن
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {currentSession.descAr}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-left">
          <div
            className={`font-mono-tabular text-lg font-bold tracking-tight flex items-center gap-1.5 ${
              currentSession.isCloudBlocked
                ? 'text-zinc-500'
                : isActive
                  ? 'text-emerald-300'
                  : 'text-[#7FFFD4]'
            }`}
            aria-label={isActive ? 'الوقت المتبقي للجلسة' : 'الوقت المتبقي لبداية الجلسة'}
          >
            <Clock className="w-3.5 h-3.5 opacity-75" aria-hidden="true" />
            <span>{formatCountdown(remainingSec)}</span>
          </div>
          <div className="text-[10px] text-zinc-500 font-mono-tabular text-left">
            {isActive ? 'متبقي للانتهاء' : 'يبدأ خلال'}
          </div>
        </div>
      </div>

      {currentSession.isCloudBlocked ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-400">
          <Cloud className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
          <span>☁️ غيوم كثيفة — لا توجد أشعة الآن</span>
        </div>
      ) : (
        currentSession.canSnooze && (
          <div className="flex items-center justify-end pt-0.5">
            <button
              type="button"
              onClick={() => onSnooze(currentSession.id)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 text-xs font-medium text-zinc-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <BellOff className="w-3.5 h-3.5 text-amber-300/80" aria-hidden="true" />
              <span>تأجيل 5 د</span>
            </button>
          </div>
        )
      )}
    </section>
  );
};
