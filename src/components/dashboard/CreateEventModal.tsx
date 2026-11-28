import React from 'react';
import { Calendar, X, AlertCircle } from 'lucide-react';
import { formatTime24To12h, getDateIsoInTimeZone } from '../../engines/prayerEngine';
import { CreateEventTimePicker } from './CreateEventTimePicker';
import type { DashboardController } from './useDashboardController';

export const CreateEventModal: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, prayers, activeTimeZone, onOpenAssistantWithPrompt, todayCairoIso, syncLoading, newEventModalOpen, setNewEventModalOpen, newEvTitle, setNewEvTitle, newEvDate, setNewEvDate, newEvHour12, setNewEvHour12, newEvMinute, setNewEvMinute, newEvPeriod, setNewEvPeriod, newEvDuration, newEvConfirmStep, setNewEvConfirmStep, newEventTime24, applyTime24To12hPicker, newEventConflict, handleConfirmCreateGoogleEvent, nowMinutes,
  } = d;
  return (
    <>
      {/* Quick Create Google Calendar Event Modal (Streamlined 1-Tap Presets + Smart Conflict Check) */}
      {newEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#7FFFD4]" />
                <span>إضافة موعد سريع</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNewEventModalOpen(false);
                  setNewEvConfirmStep(false);
                }}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const getOffsetDate = (daysAhead: number) =>
                getDateIsoInTimeZone(activeTimeZone, new Date(Date.now() + daysAhead * 86_400_000));
              const shiftEvMinutes = (deltaMin: number) => {
                let h24 = newEvHour12 % 12;
                if (newEvPeriod === 'PM') h24 += 12;
                const total = (((h24 * 60 + (Number(newEvMinute) || 0) + deltaMin) % 1440) + 1440) % 1440;
                const nh = Math.floor(total / 60);
                const nm = total % 60;
                applyTime24To12hPicker(
                  `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`,
                  setNewEvHour12,
                  setNewEvMinute,
                  setNewEvPeriod
                );
              };
              const setEvMinutesOfDay = (totalMin: number) => {
                const wrapped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
                applyTime24To12hPicker(
                  `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`,
                  setNewEvHour12,
                  setNewEvMinute,
                  setNewEvPeriod
                );
              };
              const upcomingPrayer = prayers.find(
                (p) => p.id !== 'sunrise' && p.adhanMinutes > nowMinutes + 5
              );

              if (!newEvConfirmStep) {
                return (
                  <div className="space-y-3.5 text-xs">
                    <div>
                      <input
                        type="text"
                        value={newEvTitle}
                        onChange={(e) => setNewEvTitle(e.target.value)}
                        placeholder="عنوان الموعد (مثال: 🩺 دكتور أو 💼 اجتماع)"
                        autoFocus
                        className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/70 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                      />
                    </div>

                    {/* 1-Tap Date Presets + Optional Date Picker */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {[
                            { label: 'اليوم', iso: todayCairoIso },
                            { label: 'غداً', iso: getOffsetDate(1) },
                            { label: 'بعد غد', iso: getOffsetDate(2) },
                          ].map((dPreset) => (
                            <button
                              key={dPreset.label}
                              type="button"
                              onClick={() => setNewEvDate(dPreset.iso)}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                                newEvDate === dPreset.iso
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                              }`}
                            >
                              {dPreset.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="date"
                          value={newEvDate}
                          onChange={(e) => setNewEvDate(e.target.value)}
                          className="w-32 rounded-lg border border-white/12 bg-black/65 px-2 py-1.5 text-[11px] text-zinc-200 font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                        />
                      </div>
                    </div>

<CreateEventTimePicker d={d} setEvMinutesOfDay={setEvMinutesOfDay} shiftEvMinutes={shiftEvMinutes} upcomingPrayer={upcomingPrayer} />
                    {/* Live Smart Conflict Detection */}
                    {newEventConflict.hasConflict && (
                      <div className="rounded-xl border border-amber-400/45 bg-amber-400/10 p-3 space-y-2 text-[11px] text-amber-100">
                        <div className="flex items-start gap-1.5 font-semibold text-amber-200">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                          <span>تعارض مع جدولك:</span>
                        </div>
                        <ul className="space-y-0.5 pr-4 list-disc text-[11px] text-amber-100/90">
                          {newEventConflict.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {newEventConflict.suggestedTime24 && newEventConflict.suggestedTime12Ar && (
                            <button
                              type="button"
                              onClick={() =>
                                applyTime24To12hPicker(
                                  newEventConflict.suggestedTime24!,
                                  setNewEvHour12,
                                  setNewEvMinute,
                                  setNewEvPeriod
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] cursor-pointer"
                            >
                              تطبيق {newEventConflict.suggestedTime12Ar}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const titleLabel = newEvTitle.trim() || 'حدث جديد';
                              const pickedLabel = formatTime24To12h(newEventTime24, 'ar');
                              const conflictList = newEventConflict.warnings.join('، ');
                              setNewEventModalOpen(false);
                              onOpenAssistantWithPrompt(
                                `عاوز أضيف حدث «${titleLabel}» يوم ${newEvDate} الساعة ${pickedLabel}${newEvDuration === 0 ? ' بدون مدة' : ` لمدة ${newEvDuration} دقيقة`}، بس النظام نبّهني إن فيه تعارض: ${conflictList}. اقترح عليّ أنسب وقت فاضي بدون تضارب مع الصلاة والنوم وأحداثي.`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg border border-white/15 bg-black/50 text-zinc-200 hover:text-white text-[11px] font-semibold cursor-pointer"
                          >
                            💬 رتّبه بـ Gemini
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!newEvTitle.trim() || syncLoading}
                        onClick={() => {
                          if (newEventConflict.hasConflict) {
                            setNewEvConfirmStep(true);
                          } else {
                            void handleConfirmCreateGoogleEvent();
                          }
                        }}
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] disabled:opacity-40 cursor-pointer"
                      >
                        {syncLoading
                          ? 'جارٍ الإضافة...'
                          : newEventConflict.hasConflict
                            ? 'تجاوز التعارض ومراجعة'
                            : `إضافة (${formatTime24To12h(newEventTime24, language)})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewEventModalOpen(false)}
                        className="min-h-[44px] py-2.5 px-4 rounded-xl border border-white/15 text-zinc-300 cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-4 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 space-y-1.5">
                    <div className="font-bold text-white">{newEvTitle}</div>
                    <div className="font-mono-tabular text-[#7FFFD4]">
                      {newEvDate} · {formatTime24To12h(newEventTime24, language)} ({newEvDuration === 0 ? 'بدون مدة' : `${newEvDuration} دقيقة`})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={syncLoading}
                      onClick={handleConfirmCreateGoogleEvent}
                      className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] disabled:opacity-50 cursor-pointer"
                    >
                      {syncLoading ? 'جارٍ الإضافة...' : 'تأكيد الإضافة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEvConfirmStep(false)}
                      className="min-h-[44px] py-2.5 px-4 rounded-xl border border-white/15 text-zinc-300 cursor-pointer"
                    >
                      تعديل
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
};
