import React from 'react';
import { Trash2, Calendar, X } from 'lucide-react';
import { formatTime24To12h } from '../../engines/prayerEngine';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const DeleteMedModal: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, onDeleteMedication, onOpenAssistantWithPrompt, pendingDeleteMed, setPendingDeleteMed, deleteMedStep, setDeleteMedStep, deleteMedConfirmed, setDeleteMedConfirmed,
  } = d;
  return (
    <>
      {/* 2-Stage Safe Confirmation Modal: Prevent Accidental Medication Deletion */}
      {pendingDeleteMed && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف العلاج على مرحلتين"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-rose-500/40 bg-[#0A0C10] p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>
                    {deleteMedStep === 1
                      ? 'تأكيد حذف العلاج — المرحلة 1 من 2'
                      : 'التأكيد النهائي — المرحلة 2 من 2'}
                  </span>
                </h3>
                <p className="mt-1 text-[11px] text-zinc-400">
                  حماية ضد الحذف بالخطأ من قائمتك اليومية والسحابة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingDeleteMed(null);
                  setDeleteMedStep(1);
                  setDeleteMedConfirmed(false);
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 text-xs space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>💊</span>
                <span>{pendingDeleteMed.name}</span>
              </div>
              {(() => {
                const times =
                  pendingDeleteMed.times24 && pendingDeleteMed.times24.length > 0
                    ? pendingDeleteMed.times24
                    : pendingDeleteMed.time24
                      ? [pendingDeleteMed.time24]
                      : [];
                return times.length > 0 ? (
                  <div className="font-mono-tabular text-[11px] text-zinc-300">
                    المواعيد: {times.map((t24) => formatTime24To12h(t24, language)).join(' · ')}
                  </div>
                ) : null;
              })()}
              {typeof pendingDeleteMed.remainingDoses === 'number' &&
                pendingDeleteMed.remainingDoses >= 0 && (
                  <div className="font-mono-tabular text-[11px] text-zinc-400">
                    الجرعات المتبقية المسجلة: {pendingDeleteMed.remainingDoses}
                  </div>
                )}
            </div>

            {deleteMedStep === 1 ? (
              <div className="space-y-2.5">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  هل تريد حذف هذا العلاج نهائياً وإيقاف جميع تنبيهاته اليومية؟ يمكنك أيضاً ترك شات Gemini يراجع الحذف ويزيل حدثه من التقويم معك.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMedStep(2);
                      setDeleteMedConfirmed(false);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-bold hover:bg-rose-500/30 cursor-pointer transition-colors"
                  >
                    متابعة للحذف (المرحلة 1 من 2) ←
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const medName = pendingDeleteMed.name;
                      setPendingDeleteMed(null);
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                      onOpenAssistantWithPrompt(
                        `احذف علاج «${medName}» من قائمة العلاجات والمكملات نهائياً واحذف حدثه المرتبط في Google Calendar لو موجود`
                      );
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] text-xs font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer transition-colors"
                  >
                    اطلب من شات Gemini الحذف والمراجعة
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDeleteMed(null);
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                    }}
                    className="w-full py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
                  >
                    إلغاء — الاحتفاظ بالعلاج
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteMedConfirmed}
                    onChange={(e) => setDeleteMedConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-rose-500 cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-zinc-200 leading-relaxed">
                    نعم، أؤكد حذف <strong className="text-white">«{pendingDeleteMed.name}»</strong> نهائياً من قائمتي والسحابة ولن يتم التذكير به مجدداً.
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!deleteMedConfirmed}
                    onClick={() => {
                      const targetId = pendingDeleteMed.id;
                      setPendingDeleteMed(null);
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                      onDeleteMedication(targetId);
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    تأكيد الحذف النهائي
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                    }}
                    className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
                  >
                    رجوع
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
