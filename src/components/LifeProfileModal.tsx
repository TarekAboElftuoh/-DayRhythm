import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Compass,
  Droplets,
  Moon,
  Sparkles,
  Check,
  MapPin,
  Lock,
  Unlock,
  Brain,
  Plus,
  VolumeX,
} from 'lucide-react';
import {
  GeoLocation,
  LifeProfile,
  MemoryCategory,
  MemoryItem,
  PrayerTimeItem,
} from '../types/dayrhythm';
import {
  ARABIC_WEEKDAYS,
  MEMORY_CATEGORY_LABELS,
  computeDailyRhythmPlan,
  formatDurationAr,
} from '../engines/lifeRhythmEngine';
import {
  PRESET_LOCATIONS,
  formatMinutes12h,
  getTimeZoneUtcOffsetHours,
  getWeekdayInTimeZone,
} from '../engines/prayerEngine';

interface LifeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: LifeProfile;
  prayers: PrayerTimeItem[];
  activeLocation: GeoLocation;
  memories: MemoryItem[];
  onAddMemory: (input: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
  onSaveProfile: (next: LifeProfile) => void;
  onDetectGpsLocation: () => Promise<void>;
  isDetectingGps: boolean;
}

export const LifeProfileModal: React.FC<LifeProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  prayers,
  memories,
  onAddMemory,
  onDeleteMemory,
  onSaveProfile,
  onDetectGpsLocation,
  isDetectingGps,
}) => {
  const [draft, setDraft] = useState<LifeProfile>(profile);
  const [unlockHeight, setUnlockHeight] = useState(false);
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('priority');
  const [newMemoryText, setNewMemoryText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraft(profile);
      setUnlockHeight(false);
    }
  }, [isOpen, profile]);

  const previewPlan = useMemo(() => {
    const todayW = getWeekdayInTimeZone(draft.currentTimeZone);
    return computeDailyRhythmPlan(draft, prayers, {
      todayWeekday: todayW,
      tomorrowWeekday: (todayW + 1) % 7,
      fastingOverride: 'auto',
    });
  }, [draft, prayers]);

  if (!isOpen) return null;

  const toggleFastingDay = (dayId: number) => {
    setDraft((prev) => {
      const exists = prev.fastingDays.includes(dayId);
      return {
        ...prev,
        fastingDays: exists
          ? prev.fastingDays.filter((d) => d !== dayId)
          : [...prev.fastingDays, dayId],
      };
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({ ...draft, sleepStrategy: 'night_only_strict' });
    onClose();
  };

  const handleAddMemorySubmit = () => {
    const trimmed = newMemoryText.trim();
    if (!trimmed) return;
    onAddMemory({ category: newMemoryCategory, ruleText: trimmed });
    setNewMemoryText('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="الدستور الشخصي وذاكرة Gemini الدائمة"
    >
      <form
        onSubmit={handleSave}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0A0D12] p-5 sm:p-6 text-zinc-100 shadow-2xl space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
              <span>الثوابت المرنة وذاكرة Gemini الدائمة</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              محفوظة سحابياً في Firestore وقابلة لتعديل أي رقم بحرية من هنا أو عبر شات Gemini في أي ظرف
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Scientific Hydration & Biometrics */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Droplets className="w-4 h-4 text-[#7FFFD4]" />
              <span>1. القياسات ومعادلة الماء العلمية</span>
            </h3>
            <span className="font-mono-tabular text-xs text-[#7FFFD4]">
              العادي: {previewPlan.normalTargetCups} كوب ({previewPlan.normalTargetMl} مل) · الصيام: {previewPlan.fastingTargetCups} كوب ({previewPlan.fastingMinTargetMl} مل)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-[#7FFFD4] font-semibold flex items-center justify-between">
                <span>الوزن (كجم)</span>
                <span className="text-[10px] text-zinc-400 font-normal">متغيّر · يدوي أو شات</span>
              </span>
              <input
                type="number"
                min={30}
                max={250}
                step={0.5}
                value={draft.weightKg}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, weightKg: Number(e.target.value) || 75 }))
                }
                className="w-full rounded-lg border border-[#7FFFD4]/45 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>

            <div className="space-y-1">
              <span className="text-zinc-400 flex items-center justify-between">
                <span>الطول (سم)</span>
                <button
                  type="button"
                  onClick={() => setUnlockHeight((v) => !v)}
                  className="text-[10px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-0.5 cursor-pointer"
                >
                  {unlockHeight ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>{unlockHeight ? 'قفل' : 'تعديل'}</span>
                </button>
              </span>
              <input
                type="number"
                min={100}
                max={240}
                step={1}
                disabled={!unlockHeight}
                value={draft.heightCm}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, heightCm: Number(e.target.value) || 175 }))
                }
                className={`w-full rounded-lg border px-3 py-2 font-mono-tabular focus:outline-none ${
                  unlockHeight
                    ? 'border-white/25 bg-black text-white focus:border-[#7FFFD4]'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 cursor-not-allowed'
                }`}
              />
            </div>

            <label className="space-y-1">
              <span className="text-zinc-400 block">حجم الكوب (أي رقم: 50–2000 مل)</span>
              <input
                type="number"
                min={50}
                max={2000}
                step={1}
                value={draft.cupSizeMl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, cupSizeMl: Number(e.target.value) || 177 }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap gap-1.5">
              {[177, 200, 250, 330, 500].map((presetMl) => (
                <button
                  key={presetMl}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, cupSizeMl: presetMl }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono-tabular cursor-pointer ${
                    draft.cupSizeMl === presetMl
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                      : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {presetMl} مل
                </button>
              ))}
            </div>
            <span className="text-[10px] text-zinc-500">
              يمكنك تعديل الوزن أو حجم الكوب لأي رقم عبر شات Gemini
            </span>
          </div>
        </section>

        {/* 2. Fasting Days, Flexible Suhoor Lead & Night Sleep Target */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Moon className="w-4 h-4 text-[#7FFFD4]" />
              <span>2. الصيام، السحور، وهدف النوم الليلي</span>
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
                    key={day.id}
                    type="button"
                    onClick={() => toggleFastingDay(day.id)}
                    className={`py-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                      active
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                        : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
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
              <label className="text-zinc-400 block">السحور قبل أذان الفجر (دقيقة · مرن 10–180):</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={10}
                  max={180}
                  step={5}
                  value={draft.suhoorLeadMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      suhoorLeadMinutes: Number(e.target.value) || 50,
                    }))
                  }
                  className="w-20 rounded-lg border border-white/15 bg-black px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                />
                {[40, 50, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, suhoorLeadMinutes: mins }))}
                    className={`flex-1 py-2 rounded-lg border font-mono-tabular cursor-pointer ${
                      draft.suhoorLeadMinutes === mins
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mins} د
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400 block">هدف النوم الليلي (دقائق · مرن 180–720):</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={180}
                  max={720}
                  step={15}
                  value={draft.sleepTargetMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      sleepTargetMinutes: Number(e.target.value) || 450,
                    }))
                  }
                  className="w-20 rounded-lg border border-white/15 bg-black px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                />
                {[
                  { min: 420, label: '7 س' },
                  { min: 450, label: '7.5 س' },
                  { min: 480, label: '8 س' },
                ].map((opt) => (
                  <button
                    key={opt.min}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, sleepTargetMinutes: opt.min }))}
                    className={`flex-1 py-2 rounded-lg border font-mono-tabular cursor-pointer ${
                      draft.sleepTargetMinutes === opt.min
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
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

        {/* 3. Automatic Audio Silence Sanctuaries (Prayer & Sleep) */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <VolumeX className="w-4 h-4 text-[#7FFFD4]" />
              <span>3. الحماية التلقائية للصوت (الصلاة والنوم)</span>
            </h3>
            <span className="text-[11px] text-zinc-400">
              يُحفظ كل إشعار صامتاً لتطّلع عليه لاحقاً
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-zinc-400 block">تنبيه قبل الأذان (د)</span>
              <input
                type="number"
                min={0}
                max={30}
                step={1}
                value={draft.adhanLeadMinutes}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, adhanLeadMinutes: Number(e.target.value) || 0 }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 block">كتم الصلاة من الأذان (د)</span>
              <input
                type="number"
                min={5}
                max={90}
                step={5}
                value={draft.prayerSilenceMinutes}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    prayerSilenceMinutes: Number(e.target.value) || 20,
                  }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 block">كتم الفجر من الأذان (د)</span>
              <input
                type="number"
                min={5}
                max={90}
                step={5}
                value={draft.fajrSilenceMinutes}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    fajrSilenceMinutes: Number(e.target.value) || 30,
                  }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
          </div>
          <p className="text-[11px] text-zinc-500">
            وقت صلاة الجمعة يُمدّد الكتم تلقائياً إلى 50 دقيقة، وفي وقت النوم يُكتم الصوت كلياً حتى الاستيقاظ مع حفظ التنبيهات الصامتة.
          </p>
        </section>

        {/* 4. Continuous Offline-Ready GPS Location */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#7FFFD4]" />
              <span>4. الموقع التلقائي بالـ GPS والحساب الأوفلاين</span>
            </h3>
            <button
              type="button"
              onClick={() => void onDetectGpsLocation()}
              disabled={isDetectingGps}
              className="px-3 py-1.5 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/40 text-[#7FFFD4] text-xs font-semibold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{isDetectingGps ? 'جارٍ الكشف...' : 'تحقّق من موقعي الآن'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
            <span>
              الموقع الحالي: <strong className="text-white">{draft.currentCityName}</strong>
            </span>
            <span className="font-mono-tabular text-[11px] text-zinc-400">
              {draft.currentTimeZone} (UTC{getTimeZoneUtcOffsetHours(draft.currentTimeZone) >= 0 ? '+' : ''}
              {getTimeZoneUtcOffsetHours(draft.currentTimeZone)}) · حساب فلكي أوفلاين 100%
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_LOCATIONS.map((loc) => {
              const selected = draft.currentCityName === loc.nameAr;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      currentCityName: loc.nameAr,
                      currentTimeZone: loc.timeZone ?? 'Africa/Cairo',
                      currentLat: loc.lat,
                      currentLng: loc.lng,
                    }))
                  }
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                    selected
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-semibold'
                      : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {loc.nameAr.split('·')[0].trim()}
                </button>
              );
            })}
          </div>

          <label className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs cursor-pointer">
            <span className="text-zinc-300">
              تتبّع التحرك تلقائياً عبر GPS (بدون إنترنت) لتحديث الصلاة والشروق والغروب فور تغيّر مكانك
            </span>
            <input
              type="checkbox"
              checked={draft.autoLocationSync}
              onChange={(e) => setDraft((p) => ({ ...p, autoLocationSync: e.target.checked }))}
              className="w-4 h-4 accent-[#7FFFD4]"
            />
          </label>
        </section>

        {/* 5. Permanent Gemini Memory Bank (Firestore /users/{uid}/memories) */}
        <section className="rounded-xl border border-[#7FFFD4]/25 bg-black/60 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#7FFFD4]" />
              <span>5. ذاكرة Gemini الدائمة ({memories.length} قواعد محفوظة)</span>
            </h3>
            <span className="text-[10px] text-zinc-400">
              يقرؤها Gemini في كل محادثة ويضيف إليها ما تعلّمه له
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
              className="rounded-lg border border-white/15 bg-black px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
            >
              {(Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {MEMORY_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
            <input
              type="text"
              maxLength={320}
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddMemorySubmit();
                }
              }}
              placeholder="اكتب أي قاعدة جديدة تريد أن يتذكرها Gemini دائماً..."
              className="flex-1 rounded-lg border border-white/15 bg-black px-3 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
            />
            <button
              type="button"
              onClick={handleAddMemorySubmit}
              disabled={!newMemoryText.trim()}
              className="px-3 py-2 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/45 text-[#7FFFD4] font-semibold hover:bg-[#7FFFD4]/25 disabled:opacity-40 flex items-center justify-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>حفظ</span>
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
            {memories.map((mem) => (
              <div
                key={mem.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex items-start justify-between gap-2.5"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="text-[#7FFFD4] font-semibold">
                      {MEMORY_CATEGORY_LABELS[mem.category]}
                    </span>
                    <span className="text-zinc-500">
                      {mem.source === 'gemini'
                        ? '· محفوظ من الشات'
                        : mem.source === 'system_seed'
                          ? '· قاعدة أساسية'
                          : '· يدوي'}
                    </span>
                  </div>
                  <p className="text-zinc-200 leading-relaxed">{mem.ruleText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteMemory(mem.id)}
                  className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                  title="حذف القاعدة"
                  aria-label="حذف القاعدة"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/15 text-xs text-zinc-300 hover:text-white cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>حفظ الثوابت ومزامنتها</span>
          </button>
        </div>
      </form>
    </div>
  );
};
