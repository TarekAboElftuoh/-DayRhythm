import React from 'react';
import { Trash2, Calendar, ExternalLink } from 'lucide-react';
import { formatIsoTo12h } from '../../engines/prayerEngine';
import type { DashboardController } from './useDashboardController';

export const TomorrowSpecialTimeline: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, calendarConnected, calendarUserEmail, activeTimeZone, onOpenAssistantWithPrompt, todayCairoIso, timelineFilter, setConfirmDeleteGoogleEv, tomorrowCairoIso, tomorrowEvents, nonRoutineUpcomingEvents, getEventCairoDateIso, formatCairoDayHeading, resolveCalendarEventText,
  } = d;
  return (
    <>
{timelineFilter === 'tomorrow' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
                  <div className="text-xs font-semibold text-zinc-200">
                    {formatCairoDayHeading(tomorrowCairoIso)}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAssistantWithPrompt(
                        `راجع مواعيد الغد (${tomorrowCairoIso}) من تقويمي وساعدني في التجهيز المسبق وترتيب الأولويات بهدوء.`
                      )
                    }
                    className="text-xs text-[#7FFFD4] font-semibold hover:underline cursor-pointer whitespace-nowrap"
                  >
                    جهّز الغد مع Gemini ←
                  </button>
                </div>

                {!calendarConnected ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    سجّل الدخول بحساب Google لعرض مواعيد الغد.
                  </div>
                ) : tomorrowEvents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    لا توجد مواعيد مسجلة للغد.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {tomorrowEvents.map((ev) => {
                      const { title, detail } = resolveCalendarEventText(ev);
                      return (
                        <div
                          key={`tmr-${ev.calendarId ?? 'primary'}-${ev.id}`}
                          className="py-3 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ev.calendarColor || '#7FFFD4' }}
                              />
                              <span className="font-semibold text-white break-words">{title}</span>
                              {ev.calendarTitle && ev.calendarTitle !== calendarUserEmail && (
                                <span className="text-[11px] text-zinc-500">· {ev.calendarTitle}</span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                                {detail}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1 whitespace-nowrap">
                              {ev.isAllDay
                                ? 'طوال اليوم'
                                : `${formatIsoTo12h(ev.start, language, { includeDate: false, timeZone: activeTimeZone })}${
                                    ev.end
                                      ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false, timeZone: activeTimeZone })}`
                                      : ''
                                  }`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ev.htmlLink && (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-[#4ADE80] hover:bg-white/10"
                                title="فتح في Google Calendar"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGoogleEv(ev)}
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
) : (
              /* Non-Routine / Special Upcoming Events (14 days) */
              <div className="mt-4">
                {!calendarConnected ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    سجّل الدخول بحساب Google لعرض المواعيد المميزة.
                  </div>
                ) : nonRoutineUpcomingEvents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    لا توجد مواعيد استثنائية خلال الأسبوعين القادمين.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {nonRoutineUpcomingEvents.map((ev) => {
                      const { title, detail } = resolveCalendarEventText(ev);
                      const evDateIso = getEventCairoDateIso(ev.start);
                      const dayLabel =
                        evDateIso === todayCairoIso
                          ? 'اليوم'
                          : evDateIso === tomorrowCairoIso
                            ? 'غداً'
                            : formatCairoDayHeading(evDateIso);
                      return (
                        <div
                          key={`sp-${ev.calendarId ?? 'primary'}-${ev.id}`}
                          className="py-3 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ev.calendarColor || '#7FFFD4' }}
                              />
                              <span className="font-semibold text-white break-words">{title}</span>
                              <span className="text-[11px] font-medium text-amber-300">
                                · {dayLabel}
                              </span>
                              {ev.calendarTitle && ev.calendarTitle !== calendarUserEmail && (
                                <span className="text-[11px] text-zinc-500">· {ev.calendarTitle}</span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                                {detail}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1 whitespace-nowrap">
                              {ev.isAllDay
                                ? `${dayLabel} · طوال اليوم`
                                : `${formatIsoTo12h(ev.start, language, { timeZone: activeTimeZone })}${
                                    ev.end
                                      ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false, timeZone: activeTimeZone })}`
                                      : ''
                                  }`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ev.htmlLink && (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-[#4ADE80] hover:bg-white/10"
                                title="فتح في Google Calendar"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGoogleEv(ev)}
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
)}
    </>
  );
};
