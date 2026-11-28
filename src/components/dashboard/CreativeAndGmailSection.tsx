import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, RefreshCw, Mail, Palette, ChevronDown, ChevronUp } from 'lucide-react';
import { formatIsoTo12h, formatMinutes12h, formatTime24To12h } from '../../engines/prayerEngine';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const CreativeAndGmailSection: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, calendarConnected, isLoggingIn, onGoogleSignIn, gmailDigest, gmailScannedCount, loadingGmail, gmailNeedsReauth, gmailError, gmailLastSyncedIso, gmailNextRetryInSec, onFetchGmailDigest, activeTimeZone, onOpenAssistantWithPrompt, creativePlacements, onToggleCreativeToday, onDeleteCreativeActivity, cardSurface, showGmailDrawer, setShowGmailDrawer, showAllCreative, setShowAllCreative, setPendingGmailEventConfirm, setPendingCreativeCalendarConfirm, addedGmailIds,
  } = d;
  return (
    <>
          {/* 3. Creative Activities & Hobbies (Shown only when non-empty) */}
          {creativePlacements.length > 0 && (
            <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.07]">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#7FFFD4]" />
                  <span>الأنشطة والهوايات</span>
                  <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                    · {creativePlacements.length}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    onOpenAssistantWithPrompt(
                      'عاوز أضيف أو أعدّل نشاط إبداعي / هواية جديدة في أوقاتي الفاضية — حدد معايا التكرار (يومي أو أسبوعي أو شهري) وهل هو مؤقت أم مستمر.'
                    )
                  }
                  className="text-xs text-[#7FFFD4] hover:underline font-medium cursor-pointer"
                >
                  تعديل بـ Gemini
                </button>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {(showAllCreative ? creativePlacements : creativePlacements.slice(0, 4)).map(
                  (placement) => {
                    const {
                      activity,
                      sessionsInPeriod,
                      goalInPeriod,
                      periodLabelAr,
                      doneToday,
                      suggestedSlot,
                    } = placement;
                    const pct = Math.min(
                      100,
                      Math.round((sessionsInPeriod / Math.max(1, goalInPeriod)) * 100)
                    );
                    return (
                      <div key={activity.id} className="py-3 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">{activity.emoji}</span>
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate">
                                {activity.name}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono-tabular">
                                {sessionsInPeriod}/{goalInPeriod} {periodLabelAr} · {activity.sessionMinutes} د
                                {activity.expiresOnDate ? ` · حتى ${activity.expiresOnDate}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onToggleCreativeToday(activity.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                                doneToday
                                  ? 'border border-[#4ADE80]/40 bg-[#4ADE80]/12 text-[#4ADE80]'
                                  : 'border border-white/10 text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4]'
                              }`}
                            >
                              {doneToday ? 'تم ✓' : 'تسجيل'}
                            </button>
                            {suggestedSlot && !doneToday && (
                              <button
                                type="button"
                                onClick={() => setPendingCreativeCalendarConfirm(placement)}
                                className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] text-[11px] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer"
                              >
                                تثبيت {formatMinutes12h(suggestedSlot.startMin, language)}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteCreativeActivity(activity.id)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 cursor-pointer"
                              title={`حذف ${activity.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              doneToday ? 'bg-[#4ADE80]' : 'bg-[#7FFFD4]/80'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              {creativePlacements.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllCreative((v) => !v)}
                  className="w-full pt-2 border-t border-white/[0.07] text-xs text-zinc-400 hover:text-[#7FFFD4] flex items-center justify-center gap-1 cursor-pointer"
                >
                  {showAllCreative ? (
                    <>
                      <span>أقل</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>عرض الكل ({creativePlacements.length})</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </section>
          )}

          {/* 4. Smart Gmail Digest (Quiet Collapsible Progressive-Disclosure Strip) */}
          <section className={`rounded-2xl border px-4 py-3 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={showGmailDrawer || Boolean(gmailError)}
                onClick={() => setShowGmailDrawer((v) => !v)}
                className="min-h-[44px] sm:min-h-[34px] flex items-center gap-2 text-right cursor-pointer min-w-0 flex-1"
              >
                <Mail className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                <span className="text-xs font-bold text-white">مواعيد Gmail</span>
                {gmailDigest.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#7FFFD4]/10 border border-[#7FFFD4]/20 text-[11px] text-[#7FFFD4] font-mono-tabular font-semibold">
                    {gmailDigest.length}
                  </span>
                )}
                {gmailLastSyncedIso && calendarConnected && !gmailNeedsReauth && (
                  <span className="hidden sm:inline text-[11px] text-zinc-500 font-mono-tabular">
                    · {formatIsoTo12h(gmailLastSyncedIso, language, { includeDate: false, timeZone: activeTimeZone })}
                  </span>
                )}
                {showGmailDrawer || Boolean(gmailError) ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
              </button>

              {calendarConnected && !gmailNeedsReauth ? (
                <button
                  type="button"
                  disabled={loadingGmail}
                  onClick={() => {
                    setShowGmailDrawer(true);
                    void onFetchGmailDigest();
                  }}
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] text-xs text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingGmail ? 'animate-spin' : ''}`} />
                  <span>{loadingGmail ? 'جارٍ الفحص...' : 'فحص'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isLoggingIn}
                  onClick={() => {
                    onGoogleSignIn().catch(() => {});
                  }}
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] bg-white/[0.04] text-xs font-medium text-zinc-200 hover:border-[#7FFFD4]/40 hover:text-[#7FFFD4] cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  {calendarConnected ? 'تفعيل Gmail' : 'تسجيل الدخول'}
                </button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {(showGmailDrawer || Boolean(gmailError)) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                    {gmailError && (
                      <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                        <span>{gmailError}</span>
                        {(gmailNextRetryInSec ?? 0) > 0 && (
                          <span className="font-mono-tabular text-[11px] text-amber-300">
                            {gmailNextRetryInSec} ث
                          </span>
                        )}
                      </div>
                    )}

                    {gmailDigest.length === 0 ? (
                      <div className="text-xs text-zinc-500">
                        {gmailScannedCount > 0
                          ? `تم فحص ${gmailScannedCount} رسالة — لا توجد مواعيد جديدة.`
                          : 'لا توجد مواعيد مستخرجة حالياً.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {gmailDigest.map((item) => {
                          const alreadyAdded = Boolean(addedGmailIds[item.id]);
                          return (
                            <div
                              key={item.id}
                              className="py-2.5 flex flex-wrap items-start justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="font-semibold text-white">{item.titleAr}</div>
                                <div className="text-[11px] text-zinc-400 leading-relaxed">
                                  {item.summaryAr}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 font-mono-tabular">
                                  {item.dateIso && <span>{item.dateIso}</span>}
                                  {item.startTime24 && (
                                    <span className="text-[#7FFFD4]">
                                      · {formatTime24To12h(item.startTime24, language)}
                                    </span>
                                  )}
                                  {item.sender && <span className="truncate max-w-[200px]">· {item.sender}</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => setPendingGmailEventConfirm(item)}
                                className={`min-h-[44px] sm:min-h-[34px] px-3.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                                  alreadyAdded
                                    ? 'border border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80] cursor-default'
                                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                                }`}
                              >
                                {alreadyAdded ? 'أُضيف ✓' : 'إضافة للتقويم'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
    </>
  );
};
