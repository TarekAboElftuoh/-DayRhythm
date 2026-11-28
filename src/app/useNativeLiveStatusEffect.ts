import { useEffect } from 'react';
import type React from 'react';
import type {
  DailyRhythmPlan,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  ScheduleBlock,
} from '../types/dayrhythm';
import type { buildCapsuleTimerState } from './buildCapsuleTimerState';
import type { OnePlusDeviceSettings } from '../firebase';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import { formatMinutes12h } from '../engines/prayerEngine';
import { cleanCalendarText, resolveBlockDisplayInfo } from '../services/apiClient';
import { cleanCompactNote, formatCompactTimeRange, sanitizeEmojis } from './capsuleTextHelpers';

export interface UseNativeLiveStatusEffectParams {
  capsuleTimerState: ReturnType<typeof buildCapsuleTimerState>;
  deviceSettings: OnePlusDeviceSettings;
  hydrationToday: HydrationDayLog | undefined;
  targetCups: number;
  dailyRhythmPlan: DailyRhythmPlan;
  medications: MedicationItem[];
  nextActiveBlock: ScheduleBlock | null;
  activeTimeZone: string;
  capsuleNowMs: number;
  liveBlocks: ScheduleBlock[];
  sunlightSessions: ComputedSunlightSession[];
  lifeProfile: LifeProfile;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  lastPushedLiveStatusRef: React.MutableRefObject<string>;
}

const resolveScheduleEmojiPair = (rawEmoji: string, title: string): string => {
  const lower = title.toLowerCase();
  if (title.includes('الفجر') || lower.includes('fajr')) return '🕌 🌅';
  if (title.includes('الظهر') || lower.includes('dhuhr')) return '🕌 ☀️';
  if (title.includes('العصر') || lower.includes('asr')) return '🕌 🌤️';
  if (title.includes('المغرب') || lower.includes('maghrib')) return '🕌 🌇';
  if (title.includes('العشاء') || lower.includes('isha')) return '🕌 🌙';
  return sanitizeEmojis(rawEmoji || '📅', 2) || '📅';
};

export function useNativeLiveStatusEffect(p: UseNativeLiveStatusEffectParams): void {
  useEffect(() => {
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: {
          updateLiveStatus?: (payloadJson: string) => void;
          updateCapsule?: (emoji: string, title: string, countdown: string, sourceLabel: string) => void;
        };
      }
    ).DayRhythmNative;
    if (!androidBridge) return;

    const firstQueueItem = p.capsuleTimerState.upcomingQueue?.[0];
    const secondQueueItem = p.capsuleTimerState.upcomingQueue?.[1];
    const clockLabel = formatCompactTimeRange(firstQueueItem?.clockLabel || '', firstQueueItem?.durationSeconds);
    const nextUpSummary = secondQueueItem
      ? sanitizeEmojis(`${secondQueueItem.emoji} ${secondQueueItem.title} (${secondQueueItem.clockLabel || secondQueueItem.countdownText})`, 2)
      : '';

    const capsuleEmoji = sanitizeEmojis(p.capsuleTimerState.emoji, 1) || '📅';
    const cleanTitle = sanitizeEmojis(p.capsuleTimerState.title, 2);
    const cleanStatusLabel = sanitizeEmojis(p.capsuleTimerState.statusLabel, 2);

    let description = '';
    if (p.capsuleTimerState.sourceKind === 'water' && p.hydrationToday) {
      const nextCupNum = Math.min(p.targetCups, p.hydrationToday.cupsLogged + 1);
      description = `الكوب ${nextCupNum} من ${p.targetCups} · ${p.dailyRhythmPlan.cupSizeMl} مل`;
    } else if (p.capsuleTimerState.sourceKind === 'medication') {
      const matchedMed = p.medications.find((m) => p.capsuleTimerState.title.includes(m.name));
      if (matchedMed?.doseNote) description = cleanCompactNote(matchedMed.doseNote, cleanTitle, clockLabel);
    } else if (p.capsuleTimerState.sourceKind === 'calendar' && p.nextActiveBlock?.description) {
      description = cleanCompactNote(cleanCalendarText(p.nextActiveBlock.description), cleanTitle, clockLabel);
    }

    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: p.activeTimeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(p.capsuleNowMs));
    const nowHhRaw = Number(nowParts.find((x) => x.type === 'hour')?.value ?? '0');
    const nowHh = nowHhRaw === 24 ? 0 : nowHhRaw;
    const nowMm = Number(nowParts.find((x) => x.type === 'minute')?.value ?? '0');
    const nowSs = Number(nowParts.find((x) => x.type === 'second')?.value ?? '0');
    const nowSecOfDay = nowHh * 3600 + nowMm * 60 + nowSs;

    let nextUpcomingSchedBlock: ScheduleBlock | null = null;
    for (const block of p.liveBlocks) {
      if (block.completed || block.deleted || block.isAllDay || p.acknowledgedBlockIdsRef.current.has(block.id)) continue;
      if (block.id.startsWith('sunlight_')) {
        const matchedSun = p.sunlightSessions.find((s) => `sunlight_${s.id}` === block.id);
        if (matchedSun?.isCloudBlocked) continue;
      }
      if (block.startMin * 60 <= nowSecOfDay) continue;
      if (!nextUpcomingSchedBlock || block.startMin < nextUpcomingSchedBlock.startMin) nextUpcomingSchedBlock = block;
    }

    const upcomingSchedDisplay = nextUpcomingSchedBlock ? resolveBlockDisplayInfo(nextUpcomingSchedBlock) : null;
    const upcomingSchedStartMin = nextUpcomingSchedBlock
      ? nextUpcomingSchedBlock.source === 'prayer'
        ? nextUpcomingSchedBlock.startMin + p.lifeProfile.adhanLeadMinutes
        : nextUpcomingSchedBlock.startMin
      : 0;
    const upcomingSchedStartClock = nextUpcomingSchedBlock ? formatMinutes12h(upcomingSchedStartMin, 'ar') : '';
    const upcomingSchedDurationSec = nextUpcomingSchedBlock
      ? (nextUpcomingSchedBlock.durationMin ?? 0) === 0 ? 0 : Math.max(60, nextUpcomingSchedBlock.durationMin * 60)
      : 0;
    const upcomingSchedRemSec = nextUpcomingSchedBlock ? Math.max(0, nextUpcomingSchedBlock.startMin * 60 - nowSecOfDay) : 0;

    const scheduleTitle = sanitizeEmojis(upcomingSchedDisplay?.title || '', 2);
    const scheduleEmoji = nextUpcomingSchedBlock
      ? resolveScheduleEmojiPair(
          nextUpcomingSchedBlock.emojiPair || upcomingSchedDisplay?.emojiOnly || '📅',
          scheduleTitle || nextUpcomingSchedBlock.categoryAr
        )
      : '📅';
    const scheduleStatusLabel = nextUpcomingSchedBlock ? sanitizeEmojis(`موعد · ${upcomingSchedStartClock}`, 2) : 'لا مواعيد مجدولة متبقية';
    const scheduleClockLabel = formatCompactTimeRange(upcomingSchedStartClock, upcomingSchedDurationSec);
    const scheduleTargetEpochMs =
      upcomingSchedRemSec > 0 ? p.capsuleNowMs - (p.capsuleNowMs % 1000) + upcomingSchedRemSec * 1000 : 0;

    const dedupKey = [
      capsuleEmoji, cleanTitle, cleanStatusLabel, p.capsuleTimerState.sourceKind,
      p.capsuleTimerState.targetEpochMs || 0, p.deviceSettings.liveAlertsEnabled, p.deviceSettings.liveAlertsLeadMinutes,
      p.deviceSettings.liveAlertsAlwaysOn ?? false, p.deviceSettings.liveAlertsShowCharging ?? true,
      p.deviceSettings.persistentCountdownNotif ?? true, clockLabel, nextUpSummary, description,
      scheduleEmoji, scheduleTitle, scheduleStatusLabel, scheduleClockLabel, scheduleTargetEpochMs, '', '',
    ].join('|');
    if (p.lastPushedLiveStatusRef.current === dedupKey) return;
    p.lastPushedLiveStatusRef.current = dedupKey;

    try {
      if (androidBridge.updateLiveStatus) {
        androidBridge.updateLiveStatus(
          JSON.stringify({
            emoji: capsuleEmoji, title: cleanTitle, countdown: p.capsuleTimerState.countdownText,
            statusLabel: cleanStatusLabel, kind: p.capsuleTimerState.sourceKind,
            targetEpochMs: p.capsuleTimerState.targetEpochMs || 0,
            liveAlertsEnabled: p.deviceSettings.liveAlertsEnabled,
            liveAlertsLeadMinutes: p.deviceSettings.liveAlertsLeadMinutes,
            liveAlertsAlwaysOn: p.deviceSettings.liveAlertsAlwaysOn ?? false,
            liveAlertsShowCharging: p.deviceSettings.liveAlertsShowCharging ?? true,
            persistentCountdownNotif: p.deviceSettings.persistentCountdownNotif ?? true,
            description, clockLabel, nextUpSummary, hydrationProgress: '',
            scheduleEmoji, scheduleTitle, scheduleStatusLabel, scheduleDescription: '',
            scheduleClockLabel, scheduleTargetEpochMs, scheduleNextUpSummary: '',
          })
        );
      } else if (androidBridge.updateCapsule) {
        androidBridge.updateCapsule(capsuleEmoji, cleanTitle, p.capsuleTimerState.countdownText, cleanStatusLabel);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.capsuleTimerState.emoji, p.capsuleTimerState.title, p.capsuleTimerState.statusLabel,
    p.capsuleTimerState.sourceKind, p.capsuleTimerState.targetEpochMs, p.capsuleTimerState.countdownText,
    p.capsuleTimerState.calendarTrack, p.capsuleTimerState.upcomingQueue, p.deviceSettings.liveAlertsEnabled,
    p.deviceSettings.liveAlertsLeadMinutes, p.deviceSettings.liveAlertsAlwaysOn,
    p.deviceSettings.liveAlertsShowCharging, p.deviceSettings.persistentCountdownNotif,
    p.hydrationToday?.cupsLogged, p.targetCups, p.dailyRhythmPlan.cupSizeMl, p.medications,
    p.nextActiveBlock?.description, p.nextActiveBlock?.emojiPair, p.nextActiveBlock?.deleted,
    p.nextActiveBlock?.completed,
  ]);
}
