import { useEffect, useMemo, useState } from 'react';
import type {
  AppLanguage,
  DailyRhythmPlan,
  DynamicHabit,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  LifeProfile,
  PrayerTimeItem,
  ScheduleBlock,
} from '../../types/dayrhythm';
import { getDateIsoInTimeZone, getNowMinutesInTimeZone } from '../../engines/prayerEngine';
import { buildDayTimelineModel } from '../../engines/lifeRhythmEngine';
import { cleanCalendarText } from '../../services/apiClient';

export function useTimelineModel({
  blocks,
  prayers,
  dailyRhythmPlan,
  lifeProfile,
  habits,
  googleTasks,
  calendarEvents,
  todayCairoIso,
  todayWeekday,
  activeTimeZone,
  language,
  timelineFilter,
  autoPlacedBlockStarts,
  unplacedLocalBlockIds,
}: {
  blocks: ScheduleBlock[];
  prayers: PrayerTimeItem[];
  dailyRhythmPlan: DailyRhythmPlan;
  lifeProfile: LifeProfile;
  habits: DynamicHabit[];
  googleTasks: GoogleTaskItem[];
  calendarEvents: GoogleCalendarEventItem[];
  todayCairoIso: string;
  todayWeekday?: number;
  activeTimeZone: string;
  language: AppLanguage;
  timelineFilter: 'today' | 'tomorrow' | 'special' | 'done';
  autoPlacedBlockStarts: Record<string, number>;
  unplacedLocalBlockIds: Record<string, boolean>;
}) {
  const activeBlocks = useMemo(() => blocks.filter((b) => !b.deleted), [blocks]);
  const deletedBlocks = useMemo(() => blocks.filter((b) => b.deleted), [blocks]);

  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const syncNow = () => setLiveNowMs(Date.now());
    let intervalId: number | null = null;
    const startTicker = () => { if (intervalId === null) intervalId = window.setInterval(syncNow, 15_000); };
    const stopTicker = () => { if (intervalId !== null) { window.clearInterval(intervalId); intervalId = null; } };
    const onVisibility = () => { if (document.visibilityState === 'hidden') stopTicker(); else { syncNow(); startTicker(); } };
    const onFocus = () => { syncNow(); if (document.visibilityState !== 'hidden') startTicker(); };
    if (document.visibilityState !== 'hidden') startTicker();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopTicker(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  const liveClockParts = useMemo(() => {
    const nowDate = new Date(liveNowMs);
    const nowMin = getNowMinutesInTimeZone(activeTimeZone, nowDate);
    let secOfMin = nowDate.getSeconds();
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: activeTimeZone, second: '2-digit' }).formatToParts(nowDate);
      const sVal = Number(parts.find((p) => p.type === 'second')?.value);
      if (Number.isFinite(sVal)) secOfMin = sVal;
    } catch { /* keep local seconds */ }
    return { nowMinutes: nowMin, nowSecOfDay: nowMin * 60 + secOfMin };
  }, [liveNowMs, activeTimeZone]);

  const nowMinutes = liveClockParts.nowMinutes;

  const isBlockFinishedOrPassed = (b: ScheduleBlock): boolean => {
    if (b.completed) return true;
    if (b.isAllDay) return false;
    return b.startMin + Math.max(1, b.durationMin) <= nowMinutes;
  };

  const remainingTodayBlocks = useMemo(
    () => activeBlocks.filter((b) => !isBlockFinishedOrPassed(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBlocks, nowMinutes]
  );

  const formatDurationLabel = (totalMin: number): string => {
    const safe = Math.max(0, Math.round(totalMin));
    if (safe === 0) return language === 'ar' ? 'بدون مدة' : '0m';
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    if (language !== 'ar') return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
    return h === 0 ? `${m} د` : m === 0 ? `${h} س` : `${h} س ${m} د`;
  };

  const getEventCairoDateIso = (isoStr: string): string => {
    if (!isoStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
    const d = new Date(isoStr);
    return Number.isNaN(d.getTime()) ? isoStr.slice(0, 10) : getDateIsoInTimeZone(activeTimeZone, d);
  };

  const formatCairoDayHeading = (dateIso: string): string => {
    const d = new Date(`${dateIso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return dateIso;
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', {
      timeZone: activeTimeZone, weekday: 'long', day: 'numeric', month: 'short',
    }).format(d);
  };

  const resolveCalendarEventText = (ev: GoogleCalendarEventItem): { title: string; detail: string } => {
    const rawSummary = (ev.summary || '').trim();
    const cleanedDesc = cleanCalendarText(ev.description);
    const descLines = cleanedDesc.split('\n').map((line) => line.trim()).filter(Boolean);
    const strippedSummary = rawSummary.replace(/\p{Extended_Pictographic}/gu, '').replace(/[\uFE0F\u200D\u20E3·\-–—|•]+/g, ' ').trim();
    if (strippedSummary.length > 0) {
      return { title: rawSummary, detail: descLines.length > 0 && descLines[0] !== rawSummary ? descLines.join(' · ') : '' };
    }
    if (descLines.length > 0) {
      return { title: `${rawSummary ? `${rawSummary} ` : ''}${descLines[0]}`.trim(), detail: descLines.slice(1).join(' · ') };
    }
    return { title: rawSummary || 'موعد', detail: '' };
  };

  const tomorrowCairoIso = useMemo(() => {
    const base = new Date(`${todayCairoIso}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString().slice(0, 10);
  }, [todayCairoIso]);

  const tomorrowEvents = useMemo(
    () => calendarEvents.filter((ev) => getEventCairoDateIso(ev.start) === tomorrowCairoIso).sort((a, b) => a.start.localeCompare(b.start)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calendarEvents, tomorrowCairoIso]
  );

  const nonRoutineUpcomingEvents = useMemo(() => {
    const routineKeywords =
      /(نوم|استيقاظ|الصلوات|صلاة|صلاه|الفجر|الظهر|العصر|المغرب|العشاء|الوتر|وتر|الضحى|قيام|تراويح|الجمعة|سنن|أذكار|اذكار|قرآن|قران|ورد|شرب|ماء|ماية|مياه|ترطيب|فطار|إفطار|افطار|غداء|عشاء|سحور|وجبة|تنظيف|ترتيب|الأوضة|الاوضة|اوضة|أوضة|الغرفة|الغرفه|غرفة|غرفه|مذاكرة|مراجعة|جيم|تمرين|رياضة|مشي|روتين|قيلولة|استحمام|دش|مكمل|فيتامين|بذور اليقطين|دواء|علاج|قهوة|شاي)/i;
    const signatureDays = new Map<string, Set<string>>();
    const normalizeSig = (ev: GoogleCalendarEventItem): string => {
      const resolved = resolveCalendarEventText(ev).title.toLowerCase();
      return resolved.replace(/\d{1,2}:\d{2}\s*(ص|م|am|pm)?/gi, '').replace(/\s+/g, ' ').trim() || (ev.summary || '').trim().toLowerCase();
    };
    for (const ev of calendarEvents) {
      const dayIso = getEventCairoDateIso(ev.start);
      if (!dayIso) continue;
      const sig = normalizeSig(ev);
      if (!signatureDays.has(sig)) signatureDays.set(sig, new Set());
      signatureDays.get(sig)!.add(dayIso);
    }
    const nowMs = Date.now();
    return calendarEvents
      .filter((ev) => {
        const dayIso = getEventCairoDateIso(ev.start);
        if (!dayIso || dayIso < todayCairoIso) return false;
        if (!ev.isAllDay && ev.end) {
          const endMs = new Date(ev.end).getTime();
          if (!Number.isNaN(endMs) && endMs <= nowMs) return false;
        }
        if (ev.isRecurring || ev.recurringEventId) return false;
        const sig = normalizeSig(ev);
        if ((signatureDays.get(sig)?.size ?? 1) >= 2) return false;
        if (routineKeywords.test(sig)) return false;
        return true;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvents, todayCairoIso]);

  const finishedTodayBlocks = useMemo(
    () => activeBlocks.filter((b) => isBlockFinishedOrPassed(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBlocks, nowMinutes]
  );

  const filteredBlocks = useMemo(
    () => (timelineFilter === 'done' ? finishedTodayBlocks : remainingTodayBlocks),
    [finishedTodayBlocks, remainingTodayBlocks, timelineFilter]
  );

  const effectiveBlocksForTimeline = useMemo(
    () =>
      blocks.map((b) => {
        if (unplacedLocalBlockIds[b.id]) return { ...b, startMin: dailyRhythmPlan.bedtimeMin };
        return typeof autoPlacedBlockStarts[b.id] === 'number' ? { ...b, startMin: autoPlacedBlockStarts[b.id] } : b;
      }),
    [blocks, autoPlacedBlockStarts, unplacedLocalBlockIds, dailyRhythmPlan.bedtimeMin]
  );

  const dayTimelineModel = useMemo(
    () =>
      buildDayTimelineModel({
        prayers, plan: dailyRhythmPlan, profile: lifeProfile, habits,
        blocks: effectiveBlocksForTimeline, googleTasks, calendarEvents,
        todayIso: todayCairoIso, weekday: todayWeekday, timeZone: activeTimeZone,
      }),
    [prayers, dailyRhythmPlan, lifeProfile, habits, effectiveBlocksForTimeline, googleTasks, calendarEvents, todayCairoIso, todayWeekday, activeTimeZone]
  );

  return {
    activeBlocks, deletedBlocks, liveNowMs, liveClockParts, nowMinutes, remainingTodayBlocks,
    finishedTodayBlocks, filteredBlocks, tomorrowCairoIso, tomorrowEvents,
    nonRoutineUpcomingEvents, dayTimelineModel, formatDurationLabel,
    getEventCairoDateIso, formatCairoDayHeading, resolveCalendarEventText,
  };
}
