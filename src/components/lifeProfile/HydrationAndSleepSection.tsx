import React, { useState } from 'react';
import { Droplets, Lock, Moon, Unlock } from 'lucide-react';
import type { DailyRhythmPlan, LifeProfile } from '../../types/dayrhythm';
import { ARABIC_WEEKDAYS, formatDurationAr } from '../../engines/lifeRhythmEngine';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type { NumericProfileKey } from './types';

export const HydrationAndSleepSection: React.FC<{
  draft: LifeProfile;
  rawInputs: Partial<Record<NumericProfileKey, string>>;
  setRawInputs: React.Dispatch<React.SetStateAction<Partial<Record<NumericProfileKey, string>>>>;
  previewPlan: DailyRhythmPlan;
  updateDraft: (updater: (prev: LifeProfile) => LifeProfile) => void;
  handleNumericChange: (key: NumericProfileKey, raw: string) => void;
  handleNumericBlur: (key: NumericProfileKey) => void;
  onSaveProfile: (next: LifeProfile) => void;
}> = ({
  draft,
  rawInputs,
  setRawInputs,
  previewPlan,
  updateDraft,
  handleNumericChange,
  handleNumericBlur,
  onSaveProfile,
}) => {
  const [unlockHeight, setUnlockHeight] = useState(false);

  const toggleFastingDay = (dayId: number) => {
    updateDraft((prev) => {
      const exists = prev.fastingDays.includes(dayId);
      return {
        ...prev,
        fastingDays: exists ? prev.fastingDays.filter((d) => d !== dayId) : [...prev.fastingDays, dayId],
      };
    });
  };

  const sleepMode = previewPlan.sleepMode ?? previewPlan.seasonalSleep?.mode ?? 'long_night';
  const modeLabel =
    sleepMode === 'short_night' ? 'ليل قصير' : sleepMode === 'medium_night' ? 'ليل متوسط + قيلولة' : 'ليل طويل';
  const napStart = previewPlan.qailulahStartMin ?? null;
  const napDuration = previewPlan.qailulahDurationMin ?? 0;
  const targetHours = Math.min(10, Math.max(5, Math.round((draft.sleepTargetMinutes / 60) * 2) / 2));

  const stepTargetHours = (deltaHours: number) => {
    const nextHours = Math.min(10, Math.max(5, Math.round((targetHours + deltaHours) * 2) / 2));
    const nextMinutes = Math.round(nextHours * 60);
    setRawInputs((prev) => {
      const copy = { ...prev };
      delete copy.sleepTargetMinutes;
      return copy;
    });
    const nextProfile: LifeProfile = { ...draft, sleepTargetMinutes: nextMinutes };
    updateDraft(() => nextProfile);
    onSaveProfile(nextProfile);
  };

  return (
    <>
      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Droplets className="w-4 h-4 text-[#7FFFD4]" />
            <span>القياسات ومعادلة الماء العلمية</span>
          </h3>
          <span className="font-mono-tabular text-xs text-[#7FFFD4]">
            العادي: {previewPlan.normalTargetCups} كوب ({previewPlan.normalTargetMl} مل) · الصيام: {previewPlan.fastingTargetCups} كوب ({previewPlan.fastingMinTargetMl} مل)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <label className="space-y-1">
            <span className="text-[#7FFFD4] font-semibold flex items-center justify-between">
              <span>الوزن (كجم)</span>
              <span className="text-[11px] text-zinc-400 font-normal">متغيّر · يدوي أو شات</span>
            </span>
            <input
              type="number" min={40} max={200} step={0.5}
              value={rawInputs.weightKg ?? String(draft.weightKg)}
              onChange={(e) => handleNumericChange('weightKg', e.target.value)}
              onBlur={() => handleNumericBlur('weightKg')}
              className="w-full rounded-lg border border-[#7FFFD4]/45 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
            />
          </label>

          <div className="space-y-1">
            <span className="text-zinc-400 flex items-center justify-between">
              <span>الطول (سم)</span>
              <button
                type="button" onClick={() => setUnlockHeight((v) => !v)}
                className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-0.5 cursor-pointer"
              >
                {unlockHeight ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                <span>{unlockHeight ? 'قفل' : 'تعديل'}</span>
              </button>
            </span>
            <input
              type="number" min={120} max={230} step={1} disabled={!unlockHeight}
              value={rawInputs.heightCm ?? String(draft.heightCm)}
              onChange={(e) => handleNumericChange('heightCm', e.target.value)}
              onBlur={() => handleNumericBlur('heightCm')}
              className={`w-full rounded-lg border px-3 py-2 font-mono-tabular focus:outline-none ${
                unlockHeight ? 'border-white/25 bg-black text-white focus:border-[#7FFFD4]' : 'border-white/10 bg-white/[0.03] text-zinc-400 cursor-not-allowed'
              }`}
            />
          </div>

          <label className="space-y-1">
            <span className="text-zinc-400 block">حجم الكوب (100–1000 مل)</span>
            <input
              type="number" min={100} max={1000} step={1}
              value={rawInputs.cupSizeMl ?? String(draft.cupSizeMl)}
              onChange={(e) => handleNumericChange('cupSizeMl', e.target.value)}
              onBlur={() => handleNumericBlur('cupSizeMl')}
              className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap gap-1.5">
            {[177, 200, 250, 330, 500].map((presetMl) => (
              <button
                key={presetMl} type="button"
                onClick={() => {
                  setRawInputs((prev) => { const next = { ...prev }; delete next.cupSizeMl; return next; });
                  updateDraft((p) => ({ ...p, cupSizeMl: presetMl }));
                }}
                className={`px-2.5 py-1 rounded-lg border font-mono-tabular cursor-pointer ${
                  draft.cupSizeMl === presetMl ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]' : 'border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {presetMl} مل
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">يمكنك تعديل الوزن أو حجم الكوب لأي رقم عبر شات Gemini</span>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Moon className="w-4 h-4 text-[#7FFFD4]" />
            <span>الصيام، السحور، وهدف النوم الليلي</span>
          </h3>
          <span className="font-mono-tabular text-[11px] text-zinc-400">
            الليلة: {formatMinutes12h(previewPlan.bedtimeMin)} ← {formatMinutes12h(previewPlan.wakeMin)} ({formatDurationAr(previewPlan.totalSleepMin)})
          </span>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-zinc-400 block">أيام الصيام الأسبوعية (يتكيّف الماء والسحور تلقائياً):</span>
          <div className="grid grid-cols-7 gap-1.5">
            {ARABIC_WEEKDAYS.map((day) => {
              const active = draft.fastingDays.includes(day.id);
              return (
                <button
                  key={day.id} type="button" onClick={() => toggleFastingDay(day.id)}
                  className={`py-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                    active ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]' : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                  }`}
                >
                  {day.shortAr}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1.5">
            <label className="text-zinc-400 block">السحور قبل أذان الفجر (دقيقة · مرن 10–120):</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={10} max={120} step={5}
                value={rawInputs.suhoorLeadMinutes ?? String(draft.suhoorLeadMinutes)}
                onChange={(e) => handleNumericChange('suhoorLeadMinutes', e.target.value)}
                onBlur={() => handleNumericBlur('suhoorLeadMinutes')}
                className="w-20 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
              {[40, 50, 60].map((mins) => (
                <button
                  key={mins} type="button"
                  onClick={() => {
                    setRawInputs((prev) => { const next = { ...prev }; delete next.suhoorLeadMinutes; return next; });
                    updateDraft((p) => ({ ...p, suhoorLeadMinutes: mins }));
                  }}
                  className={`flex-1 py-2 rounded-lg border font-mono-tabular cursor-pointer ${
                    draft.suhoorLeadMinutes === mins ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold' : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {mins} د
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 block">هدف النوم الليلي (دقائق · مرن 240–720):</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={240} max={720} step={15}
                value={rawInputs.sleepTargetMinutes ?? String(draft.sleepTargetMinutes)}
                onChange={(e) => handleNumericChange('sleepTargetMinutes', e.target.value)}
                onBlur={() => handleNumericBlur('sleepTargetMinutes')}
                className="w-20 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
              {[{ min: 420, label: '7 س' }, { min: 450, label: '7.5 س' }, { min: 480, label: '8 س' }].map((opt) => (
                <button
                  key={opt.min} type="button"
                  onClick={() => {
                    setRawInputs((prev) => { const next = { ...prev }; delete next.sleepTargetMinutes; return next; });
                    updateDraft((p) => ({ ...p, sleepTargetMinutes: opt.min }));
                  }}
                  className={`flex-1 py-2 rounded-lg border font-mono-tabular cursor-pointer ${
                    draft.sleepTargetMinutes === opt.min ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold' : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-zinc-400">
          التكيّف مع تغيّر الفصول والنوم الليلي يعمل تلقائياً في الخلفية؛ وعند الأرق أو النوم المتأخر أخبر Gemini في الشات ليرتّب يومك أو يفرّغ وقتاً لقيلولة استثنائية.
        </p>
      </section>

      <section dir="rtl" className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Moon className="w-4 h-4 text-[#7FFFD4]" />
            <span>إيقاع النوم التلقائي</span>
          </h3>
          <div className="flex items-center gap-1.5" aria-label="ساعات النوم المستهدفة">
            <button type="button" onClick={() => stepTargetHours(-0.5)} disabled={targetHours <= 5} className="w-7 h-7 rounded-lg border border-white/10 bg-black/40 text-zinc-200 hover:border-[#7FFFD4]/60 disabled:opacity-40 cursor-pointer font-mono-tabular text-sm">-</button>
            <span className="min-w-[3.5rem] text-center font-mono-tabular text-xs font-bold text-[#7FFFD4]">{targetHours} س</span>
            <button type="button" onClick={() => stepTargetHours(0.5)} disabled={targetHours >= 10} className="w-7 h-7 rounded-lg border border-white/10 bg-black/40 text-zinc-200 hover:border-[#7FFFD4]/60 disabled:opacity-40 cursor-pointer font-mono-tabular text-sm">+</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 font-mono-tabular text-zinc-200">
            <span>{formatMinutes12h(previewPlan.bedtimeMin)} ← {formatMinutes12h(previewPlan.wakeMin)}</span>
            <span className="text-zinc-400">({formatDurationAr(previewPlan.totalSleepMin)})</span>
          </div>
          <div className="flex items-center gap-2">
            {napDuration > 0 && napStart !== null && (
              <span className="font-mono-tabular text-[11px] text-amber-300">قيلولة {formatMinutes12h(napStart)} ({napDuration} د)</span>
            )}
            <span className="rounded-full border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7FFFD4]">{modeLabel}</span>
          </div>
        </div>
        <div className="space-y-1 text-[11px] text-zinc-400 leading-relaxed">
          <p>الاستيقاظ تلقائياً قبل الفجر بـ 15 د (و45 د في أيام الصيام للسحور).</p>
          <p>النوم بعد العشاء بـ 30 د، ومع قصر الليل تُضاف قيلولة تعويضية بعد الظهر تلقائياً.</p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2.5 text-xs cursor-pointer">
          <span className="text-zinc-200 font-semibold">منبه الاستيقاظ</span>
          <input
            type="checkbox"
            checked={draft.enableWakeAlarm !== false}
            onChange={(e) => updateDraft((p) => ({ ...p, enableWakeAlarm: e.target.checked }))}
            className="h-4 w-4 accent-[#7FFFD4] cursor-pointer"
          />
        </label>
      </section>
    </>
  );
};
