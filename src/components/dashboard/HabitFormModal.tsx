import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { DynamicHabitAnchor } from '../../types/dayrhythm';
import { ARABIC_WEEKDAYS, DYNAMIC_HABIT_ANCHOR_LABELS } from '../../engines/lifeRhythmEngine';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const HabitFormModal: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    onAddHabit, onUpdateHabit, onDeleteHabit, habitModalOpen, setHabitModalOpen, editingHabitId, habitTitle, setHabitTitle, habitStatus, setHabitStatus, habitAnchor, setHabitAnchor, habitDurationMin, setHabitDurationMin, habitDaysOfWeek, setHabitDaysOfWeek, habitSkipOnFasting, setHabitSkipOnFasting,
  } = d;
  return (
    <>
      {/* Add / Edit Dynamic Habit Modal / Bottom Sheet */}
      {habitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingHabitId ? 'تعديل العادة' : 'إضافة عادة ديناميكية'}
        >
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#7FFFD4] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{editingHabitId ? 'تعديل العادة' : 'إضافة عادة جديدة'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setHabitModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1.5">اسم العادة</label>
                <input
                  type="text"
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  placeholder="مثال: مشي صباحي أو قراءة 20 صفحة"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#7FFFD4]/50"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">الحالة</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border border-white/10 bg-black/50">
                  <button
                    type="button"
                    onClick={() => setHabitStatus('active')}
                    className={`py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      habitStatus === 'active'
                        ? 'bg-[#7FFFD4]/15 text-[#7FFFD4] border border-[#7FFFD4]/35'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    حالية (نشطة اليوم)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHabitStatus('planned')}
                    className={`py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      habitStatus === 'planned'
                        ? 'bg-[#7FFFD4]/15 text-[#7FFFD4] border border-[#7FFFD4]/35'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    مستقبلية (مؤجلة)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">المرتكز الزمني الديناميكي</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(DYNAMIC_HABIT_ANCHOR_LABELS) as DynamicHabitAnchor[]).map((key) => {
                    const meta = DYNAMIC_HABIT_ANCHOR_LABELS[key];
                    const selected = habitAnchor === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setHabitAnchor(key)}
                        className={`px-2 py-2 rounded-xl border text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                          selected
                            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                            : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25'
                        }`}
                      >
                        <span>{meta.emoji}</span>
                        <span className="truncate">{meta.labelAr}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">المدة (بالدقائق)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[5, 15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setHabitDurationMin(mins)}
                      className={`py-2 rounded-xl border font-mono-tabular text-xs font-semibold cursor-pointer transition-colors ${
                        habitDurationMin === mins
                          ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                          : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      {mins} د
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">أيام التكرار (فارغ = يومياً)</label>
                <div className="flex flex-wrap gap-1.5">
                  {ARABIC_WEEKDAYS.map((wd) => {
                    const active = habitDaysOfWeek.includes(wd.id);
                    return (
                      <button
                        key={wd.id}
                        type="button"
                        onClick={() =>
                          setHabitDaysOfWeek((prev) =>
                            prev.includes(wd.id) ? prev.filter((d) => d !== wd.id) : [...prev, wd.id]
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                          active
                            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4] font-semibold'
                            : 'border-white/10 bg-black/40 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {wd.shortAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={habitSkipOnFasting}
                  onChange={(e) => setHabitSkipOnFasting(e.target.checked)}
                  className="h-4 w-4 accent-[#7FFFD4] cursor-pointer"
                />
                <span className="text-zinc-200">تخطي تلقائياً في أيام الصيام</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!habitTitle.trim()}
                onClick={() => {
                  const cleanTitle = habitTitle.trim();
                  if (!cleanTitle) return;
                  const payload = {
                    title: cleanTitle,
                    status: habitStatus,
                    anchor: habitAnchor,
                    durationMin: habitDurationMin,
                    daysOfWeek: habitDaysOfWeek.length > 0 ? habitDaysOfWeek : undefined,
                    skipOnFasting: habitSkipOnFasting || undefined,
                  };
                  if (editingHabitId && onUpdateHabit) {
                    onUpdateHabit(editingHabitId, payload);
                  } else if (onAddHabit) {
                    onAddHabit(payload);
                  }
                  setHabitModalOpen(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 cursor-pointer"
              >
                {editingHabitId ? 'حفظ التعديل' : 'حفظ العادة'}
              </button>
              {editingHabitId && onDeleteHabit && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteHabit(editingHabitId);
                    setHabitModalOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-xl border border-rose-500/35 text-xs text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  حذف
                </button>
              )}
              <button
                type="button"
                onClick={() => setHabitModalOpen(false)}
                className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
