import React, { useState } from 'react';
import { Brain, Compass, MapPin, Plus, VolumeX } from 'lucide-react';
import { MemoryItemCard } from '../MemoryItemCard';
import { SunlightSettingsSection } from '../SunlightSettingsSection';
import type { LifeProfile, MemoryCategory, MemoryItem, SunlightSettings } from '../../types/dayrhythm';
import type { SanctuarySilenceMode } from '../../services/cloudStateService';
import { MEMORY_CATEGORY_LABELS } from '../../engines/lifeRhythmEngine';
import { getTimeZoneUtcOffsetHours } from '../../engines/prayerEngine';
import type { NumericProfileKey } from './types';

export const SanctuaryGpsMemorySection: React.FC<{
  draft: LifeProfile;
  rawInputs: Partial<Record<NumericProfileKey, string>>;
  updateDraft: (updater: (prev: LifeProfile) => LifeProfile) => void;
  handleNumericChange: (key: NumericProfileKey, raw: string) => void;
  handleNumericBlur: (key: NumericProfileKey) => void;
  sunlightSettings?: SunlightSettings;
  onUpdateSunlightSettings?: (next: SunlightSettings) => void;
  onDetectGpsLocation: () => Promise<void>;
  isDetectingGps: boolean;
  memories: MemoryItem[];
  onAddMemory: (input: { category: MemoryCategory; ruleText: string }) => void;
  onUpdateMemory?: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
}> = ({
  draft,
  rawInputs,
  updateDraft,
  handleNumericChange,
  handleNumericBlur,
  sunlightSettings,
  onUpdateSunlightSettings,
  onDetectGpsLocation,
  isDetectingGps,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
}) => {
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('priority');
  const [newMemoryText, setNewMemoryText] = useState('');

  const handleAddMemorySubmit = () => {
    const trimmed = newMemoryText.trim();
    if (!trimmed) return;
    onAddMemory({ category: newMemoryCategory, ruleText: trimmed });
    setNewMemoryText('');
  };

  return (
    <>
      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-[#7FFFD4]" />
            <span>الحماية التلقائية للصوت (الصلاة والنوم)</span>
          </h3>
          <span className="text-[11px] text-zinc-400">يُحفظ كل إشعار صامتاً لتطّلع عليه لاحقاً</span>
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
      </section>

      {sunlightSettings && onUpdateSunlightSettings && (
        <SunlightSettingsSection settings={sunlightSettings} onChange={onUpdateSunlightSettings} />
      )}

      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#7FFFD4]" />
            <span>الموقع التلقائي بالـ GPS والحساب الأوفلاين</span>
          </h3>
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

        <label className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs cursor-pointer">
          <span className="text-zinc-300">تتبّع التحرك تلقائياً عبر GPS (بدون إنترنت) لتحديث الصلاة والشروق والغروب فور تغيّر مكانك</span>
          <input
            type="checkbox" checked={draft.autoLocationSync}
            onChange={(e) => updateDraft((p) => ({ ...p, autoLocationSync: e.target.checked }))}
            className="w-4 h-4 accent-[#7FFFD4]"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#7FFFD4]" />
            <span>ذاكرة Gemini الدائمة ({memories.length} قواعد محفوظة)</span>
          </h3>
          <span className="text-[11px] text-zinc-400">يقرؤها Gemini في كل محادثة ويضيف إليها ما تعلّمه له</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newMemoryCategory}
            onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
            className="rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
          >
            {(Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
              <option key={cat} value={cat}>{MEMORY_CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <input
            type="text" maxLength={320} value={newMemoryText}
            onChange={(e) => setNewMemoryText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMemorySubmit(); } }}
            placeholder="اكتب أي قاعدة جديدة تريد أن يتذكرها Gemini دائماً..."
            className="flex-1 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
          />
          <button
            type="button" onClick={handleAddMemorySubmit} disabled={!newMemoryText.trim()}
            className="px-3 py-2 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/45 text-[#7FFFD4] font-semibold hover:bg-[#7FFFD4]/25 disabled:opacity-40 flex items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>حفظ</span>
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
          {memories.map((mem) => (
            <MemoryItemCard key={mem.id} memory={mem} onSave={onUpdateMemory} onDelete={onDeleteMemory} variant="modal" />
          ))}
        </div>
      </section>
    </>
  );
};
