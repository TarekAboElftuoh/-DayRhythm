import React from 'react';
import { CheckCircle2, Calendar, Mail, Palette } from 'lucide-react';
import { formatMinutes12h, formatTime24To12h } from '../../engines/prayerEngine';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const ConfirmActionModals: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, onToggleComplete, todayCairoIso, confirmHeroCompleteId, setConfirmHeroCompleteId, syncLoading, confirmDeleteGoogleEv, setConfirmDeleteGoogleEv, pendingTaskConfirmation, setPendingTaskConfirmation, pendingGmailEventConfirm, setPendingGmailEventConfirm, pendingCreativeCalendarConfirm, setPendingCreativeCalendarConfirm, handleConfirmDeleteGoogleEvent, handleConfirmTaskMutation, handleConfirmAddGmailEvent, handleConfirmScheduleCreative, nextAlarmBlock, nextAlarmDisplay,
  } = d;
  return (
    <>
      {/* Explicit Confirmation Modal: Complete Current Hero Task */}
      {confirmHeroCompleteId && nextAlarmBlock && confirmHeroCompleteId === nextAlarmBlock.id && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد إنجاز المهمة الحالية"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmHeroCompleteId(null);
          }}
        >
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#7FFFD4]/40 bg-[var(--bg-card)] p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 space-y-4 shadow-2xl">
            <h3 className="text-sm md:text-base font-bold text-[#7FFFD4] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>تأكيد إنجاز المهمة الحالية؟</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 text-xs md:text-sm space-y-1">
              <div className="font-bold text-white flex items-center gap-2">
                <span>{nextAlarmBlock.emojiPair}</span>
                <span>{nextAlarmDisplay.title}</span>
              </div>
              <div className="font-mono-tabular text-[11px] md:text-xs text-zinc-400">
                {nextAlarmBlock.isAllDay
                  ? 'طوال اليوم'
                  : nextAlarmBlock.durationMin === 0
                    ? formatMinutes12h(nextAlarmBlock.startMin, language)
                    : `${formatMinutes12h(nextAlarmBlock.startMin, language)} – ${formatMinutes12h(nextAlarmBlock.startMin + nextAlarmBlock.durationMin, language)}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = confirmHeroCompleteId;
                  setConfirmHeroCompleteId(null);
                  onToggleComplete(id);
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs md:text-sm font-bold hover:bg-[#66eec2] cursor-pointer transition-colors"
              >
                نعم، تم الإنجاز ✓
              </button>
              <button
                type="button"
                onClick={() => setConfirmHeroCompleteId(null)}
                className="min-h-[44px] py-2.5 px-4 rounded-xl border border-white/15 text-xs md:text-sm text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Delete Event from Google Calendar */}
      {confirmDeleteGoogleEv && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-rose-500/40 bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-rose-300">
              تأكيد حذف الحدث من Google Calendar
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              هل أنت متأكد من حذف «{confirmDeleteGoogleEv.summary}» نهائياً من Google Calendar؟
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={handleConfirmDeleteGoogleEvent}
                className="flex-1 py-2 px-4 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 cursor-pointer disabled:opacity-50"
              >
                {syncLoading ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteGoogleEv(null)}
                className="py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Mutate Google Task */}
      {pendingTaskConfirmation && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#7FFFD4]">
              تأكيد تعديل مهمة في Google Tasks
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/60 p-3 text-xs space-y-1">
              <div className="font-bold text-white">{pendingTaskConfirmation.title}</div>
              <div className="text-zinc-400">
                الإجراء:{' '}
                {pendingTaskConfirmation.operation === 'create'
                  ? 'إضافة مهمة جديدة'
                  : pendingTaskConfirmation.operation === 'complete'
                    ? 'تحديد المهمة كمكتملة ✓'
                    : pendingTaskConfirmation.operation === 'reopen'
                      ? 'إعادة فتح المهمة'
                      : 'حذف المهمة نهائياً'}
                {pendingTaskConfirmation.dueDateIso
                  ? ` · الاستحقاق: ${pendingTaskConfirmation.dueDateIso}`
                  : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={handleConfirmTaskMutation}
                className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 ${
                  pendingTaskConfirmation.operation === 'delete'
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                }`}
              >
                {syncLoading ? 'جارٍ التنفيذ...' : 'تأكيد وتنفيذ في Google Tasks'}
              </button>
              <button
                type="button"
                onClick={() => setPendingTaskConfirmation(null)}
                className="py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Add Gmail-Extracted Event to Google Calendar */}
      {pendingGmailEventConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#7FFFD4] flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span>تأكيد إضافة موعد من Gmail إلى Google Calendar</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 text-xs space-y-1.5">
              <div className="font-bold text-white">
                {pendingGmailEventConfirm.suggestedAction.title}
              </div>
              <div className="font-mono-tabular text-[#7FFFD4]">
                {pendingGmailEventConfirm.dateIso} ·{' '}
                {formatTime24To12h(pendingGmailEventConfirm.startTime24, language)} (
                {pendingGmailEventConfirm.durationMinutes ?? 45} دقيقة)
              </div>
              <div className="text-zinc-400 leading-relaxed">
                {pendingGmailEventConfirm.summaryAr}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={handleConfirmAddGmailEvent}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
              >
                {syncLoading ? 'جارٍ الإضافة...' : 'تأكيد الإضافة إلى التقويم'}
              </button>
              <button
                type="button"
                onClick={() => setPendingGmailEventConfirm(null)}
                className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Schedule Creative Activity in Free Slot on Google Calendar */}
      {pendingCreativeCalendarConfirm && pendingCreativeCalendarConfirm.suggestedSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#7FFFD4] flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <span>تأكيد تثبيت النشاط الإبداعي في Google Calendar</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 text-xs space-y-1.5">
              <div className="font-bold text-white">
                {pendingCreativeCalendarConfirm.activity.emoji}{' '}
                {pendingCreativeCalendarConfirm.activity.name}
              </div>
              <div className="font-mono-tabular text-[#7FFFD4]">
                اليوم ({todayCairoIso}) ·{' '}
                {formatMinutes12h(pendingCreativeCalendarConfirm.suggestedSlot.startMin, language)} –{' '}
                {formatMinutes12h(pendingCreativeCalendarConfirm.suggestedSlot.endMin, language)} (
                {pendingCreativeCalendarConfirm.activity.sessionMinutes} دقيقة)
              </div>
              <div className="text-zinc-400 leading-relaxed">
                تم اختيار هذه الفترة تلقائياً من أوقاتك الفاضية بعيداً عن الصلوات والنوم وأحداث التقويم المسجلة.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={() => void handleConfirmScheduleCreative()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
              >
                {syncLoading ? 'جارٍ التثبيت...' : 'تأكيد التثبيت في التقويم'}
              </button>
              <button
                type="button"
                onClick={() => setPendingCreativeCalendarConfirm(null)}
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
