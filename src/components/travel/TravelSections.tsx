import React from 'react';
import { Clock, PauseCircle, Pill, PlayCircle } from 'lucide-react';
import type { MedicationItem, TravelDeferrableCategory, TravelDurationMode } from '../../types/dayrhythm';
import { CATEGORY_ITEMS, DURATION_CHIPS } from './constants';

export const TravelSections: React.FC<{
  durationMode: TravelDurationMode;
  setDurationMode: (m: TravelDurationMode) => void;
  customDate: string;
  setCustomDate: (d: string) => void;
  resolvedTodayIso: string;
  deferredCategories: TravelDeferrableCategory[];
  toggleCategory: (cat: TravelDeferrableCategory) => void;
  medications: MedicationItem[];
  deferredMedIds: string[];
  toggleMed: (medId: string) => void;
}> = ({
  durationMode, setDurationMode, customDate, setCustomDate, resolvedTodayIso,
  deferredCategories, toggleCategory, medications, deferredMedIds, toggleMed,
}) => {
  const activeCategories = CATEGORY_ITEMS.filter((c) => !deferredCategories.includes(c.id));
  const pausedCategories = CATEGORY_ITEMS.filter((c) => deferredCategories.includes(c.id));
  const activeMeds = medications.filter((m) => !deferredMedIds.includes(m.id));
  const pausedMeds = medications.filter((m) => deferredMedIds.includes(m.id));
  const totalDeferredCount = pausedCategories.length + pausedMeds.length;
  return (
    <>
      {/* Section 1: Duration Quick Chips */}
      <div className="mt-5">
        <div className="flex items-center gap-2 mb-2.5">
          <Clock className="w-4 h-4 text-[#7FFFD4]" />
          <h3 className="text-sm font-semibold text-zinc-100">مدة السفر</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {DURATION_CHIPS.map((chip) => {
            const selected = durationMode === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setDurationMode(chip.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  selected
                    ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                    : 'border-white/[0.06] bg-[var(--bg-surface)] text-zinc-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {durationMode === 'custom_date' && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3.5 py-2.5">
            <label htmlFor="travel-return-date" className="text-xs text-zinc-300 whitespace-nowrap">
              تاريخ العودة:
            </label>
            <input
              id="travel-return-date"
              type="date"
              min={resolvedTodayIso}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="flex-1 min-h-[44px] sm:min-h-[40px] rounded-xl border border-white/[0.08] bg-[var(--bg-card)] px-3 text-xs text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
            />
          </div>
        )}
      </div>

      {/* Section 2: Active in Travel ("مستمر في السفر") */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
            <PlayCircle className="w-4 h-4" />
            <span>مستمر في السفر</span>
          </h3>
          <span className="text-[11px] text-zinc-400">اضغط على أي عنصر لتأجيله</span>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-3 space-y-2">
          {/* Immutable Prayers badge */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
            <span className="text-emerald-200 font-medium">🕌 الصلوات الخمس</span>
            <span className="text-[11px] text-emerald-300">مستمرة دائماً</span>
          </div>

          {activeCategories.map(({ id, labelAr, descAr, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleCategory(id)}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-card)] hover:border-amber-400/40 hover:bg-amber-400/[0.05] text-right transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                <span>
                  <span className="block text-xs font-medium text-white">{labelAr}</span>
                  <span className="block text-[11px] text-zinc-400">{descAr}</span>
                </span>
              </span>
              <span className="text-[11px] text-amber-300 shrink-0">تأجيل مؤقت</span>
            </button>
          ))}

          {activeMeds.map((med) => (
            <button
              key={med.id}
              type="button"
              onClick={() => toggleMed(med.id)}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-card)] hover:border-amber-400/40 hover:bg-amber-400/[0.05] text-right transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Pill className="w-4 h-4 text-sky-300 shrink-0" />
                <span>
                  <span className="block text-xs font-medium text-white">{med.name}</span>
                  {med.doseNote && (
                    <span className="block text-[11px] text-zinc-400">{med.doseNote}</span>
                  )}
                </span>
              </span>
              <span className="text-[11px] text-amber-300 shrink-0">تأجيل مؤقت</span>
            </button>
          ))}

          {activeCategories.length === 0 && activeMeds.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-2">
              تم تأجيل جميع الفئات والأدوية القابلة للتأجيل
            </p>
          )}
        </div>
      </div>

      {/* Section 3: Deferred in Travel ("مؤجل في السفر") */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
            <PauseCircle className="w-4 h-4" />
            <span>مؤجل في السفر</span>
            {totalDeferredCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200 text-[11px] font-mono-tabular">
                {totalDeferredCount}
              </span>
            )}
          </h3>
          <span className="text-[11px] text-zinc-400">اضغط للاستعادة</span>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] p-3 space-y-2">
          {totalDeferredCount === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-2">
              لا توجد تنبيهات مؤجلة — كل شيء يعمل كالمعتاد
            </p>
          ) : (
            <>
              {pausedCategories.map(({ id, labelAr, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleCategory(id)}
                  className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-400/10 hover:bg-emerald-400/10 hover:border-emerald-400/40 text-right transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-amber-300 shrink-0" />
                    <span className="text-xs font-medium text-amber-100">{labelAr}</span>
                  </span>
                  <span className="text-[11px] text-emerald-300 shrink-0">استعادة</span>
                </button>
              ))}

              {pausedMeds.map((med) => (
                <button
                  key={med.id}
                  type="button"
                  onClick={() => toggleMed(med.id)}
                  className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-400/10 hover:bg-emerald-400/10 hover:border-emerald-400/40 text-right transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Pill className="w-4 h-4 text-amber-300 shrink-0" />
                    <span className="text-xs font-medium text-amber-100">{med.name}</span>
                  </span>
                  <span className="text-[11px] text-emerald-300 shrink-0">استعادة</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

    </>
  );
};
