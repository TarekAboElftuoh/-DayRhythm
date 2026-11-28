import { useMemo } from 'react';
import type {
  GoogleCalendarEventItem,
  LifeProfile,
  ScheduleBlock,
  SunlightSettings,
  TravelState,
} from '../types/dayrhythm';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import type { PrayerTimeEntry } from './buildExactAlarms';
import { parseIsoToTimeZoneInfo } from '../engines/prayerEngine';
import { cleanCalendarText } from '../services/apiClient';
import { extractEmojiPair } from '../utils/appHelpers';

export interface UseBaseLiveBlocksParams {
  reflowedBlocksOverride: ScheduleBlock[] | null;
  includePrayerAnchors: boolean;
  prayers: PrayerTimeEntry[];
  isFridayMode: boolean;
  todayCairoIso: string;
  needsAuth: boolean;
  calendarEvents: GoogleCalendarEventItem[];
  completedOverrides: Record<string, boolean>;
  useOfflineDemo: boolean;
  offlineBlocks: ScheduleBlock[];
  lifeProfile: LifeProfile;
  activeTimeZone: string;
  sunlightSettings: SunlightSettings;
  sunlightSessions: ComputedSunlightSession[];
  travelState: TravelState;
}

export function useBaseLiveBlocks(p: UseBaseLiveBlocksParams): ScheduleBlock[] {
  return useMemo(() => {
    if (p.reflowedBlocksOverride) {
      return p.reflowedBlocksOverride.map((b) => ({
        ...b,
        completed: p.completedOverrides[b.id] ?? b.completed,
      }));
    }

    let todaysGoogleBlocks: ScheduleBlock[] = [];
    if (!p.needsAuth) {
      todaysGoogleBlocks = p.calendarEvents
        .map((ev): ScheduleBlock | null => {
          const startInfo = parseIsoToTimeZoneInfo(ev.start, p.activeTimeZone);
          if (startInfo.dateIso !== p.todayCairoIso) return null;
          const endInfo = ev.end ? parseIsoToTimeZoneInfo(ev.end, p.activeTimeZone) : null;
          let durationMin = 0;
          if (!startInfo.isAllDay && endInfo && endInfo.dateIso === startInfo.dateIso) {
            const diff = endInfo.minutesSinceMidnight - startInfo.minutesSinceMidnight;
            durationMin = diff <= 1 ? 0 : diff;
          } else if (!startInfo.isAllDay && ev.start && ev.end) {
            const diff = Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000);
            durationMin = diff <= 1 || diff >= 1440 ? 0 : diff;
          }
          const blockId = `gcal_${ev.calendarId ?? 'primary'}_${ev.id}`;
          const emojiPair = extractEmojiPair(ev.summary, '📅');
          const combinedDescription = [cleanCalendarText(ev.description), ev.location ? `📍 ${ev.location}` : '']
            .filter(Boolean)
            .join('\n');
          return {
            id: blockId,
            emojiPair,
            categoryAr: ev.summary,
            categoryEn: ev.summary,
            startMin: startInfo.minutesSinceMidnight,
            durationMin,
            minDurationMin: Math.min(15, durationMin),
            isAnchor: emojiPair.includes('🕌'),
            travelGroup: emojiPair.includes('🕌') ? 'ANCHOR' : 'B_WORK',
            canShiftEvening: !emojiPair.includes('🕌'),
            completed: p.completedOverrides[blockId] ?? false,
            deleted: false,
            googleEventId: ev.id,
            googleCalendarId: ev.calendarId ?? 'primary',
            calendarTitle: ev.calendarTitle,
            calendarColor: ev.calendarColor,
            googleHtmlLink: ev.htmlLink,
            dateIso: startInfo.dateIso,
            startIso: ev.start,
            endIso: ev.end,
            isAllDay: startInfo.isAllDay || ev.isAllDay,
            description: combinedDescription,
            source: 'google_calendar',
            reflowStatus:
              p.travelState.active && !emojiPair.includes('🕌') && p.travelState.deferredCategories?.includes('calendar')
                ? 'postponed_travel'
                : undefined,
          };
        })
        .filter((x): x is ScheduleBlock => x !== null);
    }

    const prayerAnchors: ScheduleBlock[] = p.includePrayerAnchors
      ? p.prayers
          .filter((pr) => pr.isObligatory)
          .filter(
            (pr) =>
              !todaysGoogleBlocks.some(
                (gb) =>
                  Math.abs(gb.startMin - pr.alarmMinutes) <= 10 ||
                  Math.abs(gb.startMin - pr.adhanMinutes) <= 10 ||
                  (gb.emojiPair.includes('🕌') && Math.abs(gb.startMin - pr.alarmMinutes) <= 25)
              )
          )
          .map((pr) => ({
            id: `prayer_${pr.id}`,
            emojiPair: pr.emojiPair,
            categoryAr:
              p.lifeProfile.adhanLeadMinutes > 0
                ? `أذان -${p.lifeProfile.adhanLeadMinutes} د · ${pr.nameAr}`
                : `أذان ${pr.nameAr}`,
            categoryEn:
              p.lifeProfile.adhanLeadMinutes > 0
                ? `-${p.lifeProfile.adhanLeadMinutes}m Adhan · ${pr.nameEn}`
                : `Adhan · ${pr.nameEn}`,
            startMin: pr.alarmMinutes,
            durationMin: 20,
            minDurationMin: 20,
            isAnchor: true,
            isFridayRitual: p.isFridayMode && pr.id === 'dhuhr',
            travelGroup: 'ANCHOR' as const,
            canShiftEvening: false,
            completed: p.completedOverrides[`prayer_${pr.id}`] ?? false,
            deleted: false,
            dateIso: p.todayCairoIso,
            source: 'prayer' as const,
          }))
      : [];

    const sunlightDeferredByTravel = p.travelState.active && (p.travelState.deferredCategories?.includes('sunlight') ?? false);
    const sunlightBlocks: ScheduleBlock[] =
      p.sunlightSettings.enabled && !sunlightDeferredByTravel
        ? p.sunlightSessions
            .filter((s) => s.enabled)
            .map((s) => ({
              id: `sunlight_${s.id}`,
              emojiPair: s.emoji,
              categoryAr: s.labelAr,
              categoryEn: s.id,
              startMin: s.startMinutes,
              durationMin: s.durationMinutes,
              minDurationMin: s.durationMinutes,
              isAnchor: true,
              travelGroup: 'ANCHOR' as const,
              canShiftEvening: false,
              completed: false,
              deleted: false,
              dateIso: p.todayCairoIso,
              description: s.isCloudBlocked ? s.cloudNoteAr ?? '☁️ غيوم كثيفة — لا توجد أشعة الآن' : s.descAr,
              source: 'offline' as const,
            }))
        : [];

    if (!p.needsAuth) {
      return [...todaysGoogleBlocks, ...prayerAnchors, ...sunlightBlocks].sort((a, b) => a.startMin - b.startMin);
    }

    if (p.useOfflineDemo) {
      return [
        ...p.offlineBlocks.map((b) => ({ ...b, completed: p.completedOverrides[b.id] ?? b.completed, source: b.source ?? 'offline' })),
        ...sunlightBlocks,
      ].sort((a, b) => a.startMin - b.startMin);
    }

    return sunlightBlocks;
  }, [
    p.reflowedBlocksOverride, p.includePrayerAnchors, p.prayers, p.isFridayMode, p.todayCairoIso,
    p.needsAuth, p.calendarEvents, p.completedOverrides, p.useOfflineDemo, p.offlineBlocks,
    p.lifeProfile.adhanLeadMinutes, p.activeTimeZone, p.sunlightSettings.enabled, p.sunlightSessions,
    p.travelState.active, p.travelState.deferredCategories,
  ]);
}
