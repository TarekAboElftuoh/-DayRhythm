import React from 'react';
import { Compass, MapPin, VolumeX } from 'lucide-react';
import type { LifeProfile } from '../../types/dayrhythm';
import type { SanctuarySilenceMode } from '../../services/cloudStateService';
import { getTimeZoneUtcOffsetHours } from '../../engines/prayerEngine';
import type { NumericProfileKey } from './types';

export const PrayerSettingsSection: React.FC<{
  draft: LifeProfile;
  rawInputs: Partial<Record<NumericProfileKey, string>>;
  updateDraft: (updater: (prev: LifeProfile) => LifeProfile) => void;
  handleNumericChange: (key: NumericProfileKey, raw: string) => void;
  handleNumericBlur: (key: NumericProfileKey) => void;
  isMobile: boolean;
  includePrayerAnchors: boolean;
  onToggleIncludePrayerAnchors?: () => void;
  isFridayMode: boolean;
  onToggleFridayMode?: (v: boolean) => void;
  includeBiweeklyPcCleanup: boolean;
  onToggleBiweeklyPcCleanup?: (v: boolean) => void;
  onDetectGpsLocation: () => Promise<void>;
  isDetectingGps: boolean;
}> = ({
  draft,
  rawInputs,
  updateDraft,
  handleNumericChange,
  handleNumericBlur,
  isMobile,
  includePrayerAnchors,
  onToggleIncludePrayerAnchors,
  isFridayMode,
  onToggleFridayMode,
  includeBiweeklyPcCleanup,
  onToggleBiweeklyPcCleanup,
  onDetectGpsLocation,
  isDetectingGps,
}) => (
  <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <VolumeX className="w-4 h-4 text-[#7FFFD4]" />
        <span>إعدادات الصلاة</span>
      </h3>
      <span className="text-[11px] text-zinc-400">المراسي، الكتم، الجمعة، وحساب المواقيت</span>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {onToggleIncludePrayerAnchors && (
        <button
          type="button"
          onClick={onToggleIncludePrayerAnchors}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
            includePrayerAnchors ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]' : 'border-white/10 text-zinc-400 hover:text-white'
          }`}
        >
          🕌 مراسي الصلاة (-3 د)
        </button>
      )}
      {onToggleFridayMode && (
        <button
          type="button"
          onClick={() => onToggleFridayMode(!isFridayMode)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
            isFridayMode ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]' : 'border-white/10 text-zinc-400 hover:text-white'
          }`}
        >
          🕌 طقوس الجمعة
        </button>
      )}
      {!isMobile && isFridayMode && onToggleBiweeklyPcCleanup && (
        <button
          type="button"
          onClick={() => onToggleBiweeklyPcCleanup(!includeBiweeklyPcCleanup)}
          className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
            includeBiweeklyPcCleanup ? 'border-indigo-400/50 bg-indigo-400/15 text-indigo-200' : 'border-white/10 text-zinc-400'
          }`}
          title="تذكير دوري بصيانة ونظافة جهاز الكمبيوتر"
        >
          💻 صيانة الكمبيوتر (كل جمعتين)
        </button>
      )}
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
      <label className="space-y-1">
        <span className="text-zinc-400 block">تنبيه قبل الأذان (د)</span>
        <input
          type="number" min={0} max={30} step={1}
          value={rawInputs.adhanLeadMinutes ?? String(draft.adhanLeadMinutes)}
          onChange={(e) => handleNumericChange('adhanLeadMinutes', e.target.value)}
          onBlur={() => handleNumericBlur('adhanLeadMinutes')}
          className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
        />
      </label>
      <label className="space-y-1">
        <span className="text-zinc-400 block">كتم الصلاة من الأذان (د)</span>
        <input
          type="number" min={0} max={60} step={5}
          value={rawInputs.prayerSilenceMinutes ?? String(draft.prayerSilenceMinutes)}
          onChange={(e) => handleNumericChange('prayerSilenceMinutes', e.target.value)}
          onBlur={() => handleNumericBlur('prayerSilenceMinutes')}
          className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
        />
      </label>
      <label className="space-y-1">
        <span className="text-zinc-400 block">كتم الفجر من الأذان (د)</span>
        <input
          type="number" min={0} max={90} step={5}
          value={rawInputs.fajrSilenceMinutes ?? String(draft.fajrSilenceMinutes)}
          onChange={(e) => handleNumericChange('fajrSilenceMinutes', e.target.value)}
          onBlur={() => handleNumericBlur('fajrSilenceMinutes')}
          className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
        />
      </label>
    </div>

    <div className="space-y-2 pt-1">
      <span className="text-xs text-zinc-400 block">سلوك التنبيهات أثناء صمت الصلاة والنوم:</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {(
          [
            { id: 'silent_inbox' as SanctuarySilenceMode, title: 'كتم الصوت + حفظ في الصامت', desc: 'حفظ التنبيه في صندوق الصامت فقط بدون إزعاج' },
            { id: 'silent_notif' as SanctuarySilenceMode, title: 'إشعار صامت بدون صوت', desc: 'إظهار إشعار مرئي صامت دون رنين أو اهتزاز' },
            { id: 'vibrate_notif' as SanctuarySilenceMode, title: 'اهتزاز + إشعار بدون صوت', desc: 'اهتزاز خفيف وإشعار مرئي مع كتم الصوت تماماً' },
            { id: 'hide_all' as SanctuarySilenceMode, title: 'إخفاء تام', desc: 'إخفاء جميع التنبيهات كلياً طوال فترة الصمت' },
          ] as const
        ).map((opt) => {
          const active = (draft.sanctuarySilenceMode ?? 'silent_inbox') === opt.id;
          return (
            <button
              key={opt.id} type="button" aria-pressed={active}
              onClick={() => updateDraft((p) => ({ ...p, sanctuarySilenceMode: opt.id }))}
              className={`rounded-xl border p-2.5 text-right transition-colors cursor-pointer ${
                active ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]' : 'border-white/[0.08] bg-[var(--bg-card)] text-zinc-300 hover:border-white/20'
              }`}
            >
              <div className="font-semibold">{opt.title}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{opt.desc}</div>
            </button>
          );
        })}
      </div>
    </div>

    <p className="text-[11px] text-zinc-500">
      وقت صلاة الجمعة يُمدّد الكتم تلقائياً إلى 50 دقيقة، وفي وقت النوم يُكتم الصوت كلياً حتى الاستيقاظ مع حفظ التنبيهات الصامتة.
    </p>

    <div className="pt-3 border-t border-white/10 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-[#7FFFD4]" />
          <span>حساب المواقيت أوفلاين والموقع (GPS)</span>
        </span>
        <button
          type="button" onClick={() => void onDetectGpsLocation()} disabled={isDetectingGps}
          className="px-3 py-1.5 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/40 text-[#7FFFD4] text-xs font-semibold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>{isDetectingGps ? 'جارٍ الكشف...' : 'تحديث الموقع الآن'}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
        <span>الموقع الحالي: <strong className="text-white">{draft.currentCityName}</strong></span>
        <span className="font-mono-tabular text-[11px] text-zinc-400">
          {draft.currentLat.toFixed(4)}, {draft.currentLng.toFixed(4)} · {draft.currentTimeZone} (UTC{getTimeZoneUtcOffsetHours(draft.currentTimeZone) >= 0 ? '+' : ''}{getTimeZoneUtcOffsetHours(draft.currentTimeZone)})
        </span>
      </div>

      <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
        <span className="text-zinc-300">تتبّع التحرك تلقائياً عبر GPS (بدون إنترنت) لتحديث الصلاة والشروق والغروب فور تغيّر مكانك</span>
        <input
          type="checkbox" checked={draft.autoLocationSync}
          onChange={(e) => updateDraft((p) => ({ ...p, autoLocationSync: e.target.checked }))}
          className="w-4 h-4 accent-[#7FFFD4]"
        />
      </label>
    </div>
  </section>
);
