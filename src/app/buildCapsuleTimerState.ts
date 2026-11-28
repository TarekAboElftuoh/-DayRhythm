import type {
  DailyRhythmPlan,
  GoogleTaskItem,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  PrayerTimeItem,
  ScheduleBlock,
  TravelState,
} from '../types/dayrhythm';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import type { CapsuleTrackInfo } from '../components/FloatingPiPCapsule';
import { formatCountdown } from '../hooks/useCountdown';
import { cleanCalendarText, resolveBlockDisplayInfo } from '../services/apiClient';
import { collectCapsuleCandidates, type UnifiedCapsuleCandidate } from './capsuleCandidates';

export function buildCapsuleTimerState(args: {
  needsAuth: boolean;
  useOfflineDemo: boolean;
  activeTimeZone: string;
  capsuleNowMs: number;
  todayCairoIso: string;
  travelState: TravelState;
  liveBlocks: ScheduleBlock[];
  acknowledgedBlockIds: Set<string>;
  sunlightSessions: ComputedSunlightSession[];
  lifeProfile: LifeProfile;
  hydrationHistory: HydrationDayLog[];
  dailyRhythmPlan: DailyRhythmPlan;
  prayers: PrayerTimeItem[];
  medications: MedicationItem[];
  googleTasks: GoogleTaskItem[];
  nextActiveBlock: ScheduleBlock | null;
}) {
  const { needsAuth, useOfflineDemo, activeTimeZone, capsuleNowMs, nextActiveBlock } = args;
  const display = resolveBlockDisplayInfo(nextActiveBlock);
  const fallbackEmoji = (nextActiveBlock?.emojiPair || '✅').split(' ')[0] || '📅';

  if (needsAuth && !useOfflineDemo) {
    return {
      emoji: '🔐',
      title: 'سجّل الدخول بحساب Google',
      statusLabel: 'بانتظار الربط السحابي',
      sourceKind: 'none' as const,
      countdownText: '00:00',
      isNow: false,
      isUrgent: false,
      progressRatio: 0,
      targetEpochMs: 0,
      durationSeconds: 0,
      calendarTrack: null as CapsuleTrackInfo | null,
      taskTrack: null as CapsuleTrackInfo | null,
      upcomingQueue: [] as CapsuleTrackInfo[],
    };
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: activeTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(capsuleNowMs));
  const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const hh = hhRaw === 24 ? 0 : hhRaw;
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const ss = Number(parts.find((p) => p.type === 'second')?.value ?? '0');
  const nowSecOfDay = hh * 3600 + mm * 60 + ss;

  const { candidates, untimedTaskFallback } = collectCapsuleCandidates({ ...args, nowSecOfDay });
  candidates.sort((a, b) => a.targetSec - b.targetSec);
  const activeCandidates = candidates.filter((c) => c.targetSec > nowSecOfDay);

  const buildTrack = (c: UnifiedCapsuleCandidate): CapsuleTrackInfo => {
    const remSec = Math.max(0, c.targetSec - nowSecOfDay);
    const countdownText = formatCountdown(remSec * 1000);
    const statusLabel =
      c.sourceKind === 'water'
        ? c.isNow ? 'موعد شرب الماء الآن' : `الكوب القادم · ${c.clockLabel}`
        : c.sourceKind === 'medication'
          ? c.isNow ? 'موعد الجرعة الآن' : `جرعة قادمة · ${c.clockLabel}`
          : c.sourceKind === 'task'
            ? c.isNow ? 'مهمة الآن' : `مهمة · ${c.clockLabel}`
            : c.isNow ? 'جارٍ الآن' : `موعد · ${c.clockLabel}`;
    return {
      emoji: c.emoji,
      title: c.title,
      statusLabel,
      clockLabel: c.clockLabel,
      countdownText,
      isNow: c.isNow,
      isUrgent: remSec > 0 && remSec <= 60,
      targetEpochMs: remSec > 0 ? capsuleNowMs - (capsuleNowMs % 1000) + remSec * 1000 : 0,
      durationSeconds: c.durationSec,
    };
  };

  const nearestCalendar = activeCandidates.find((c) => c.sourceKind === 'calendar') ?? null;
  const nearestRhythmOrTask = activeCandidates.find((c) => c.sourceKind !== 'calendar') ?? null;

  const calendarTrack: CapsuleTrackInfo | null = nearestCalendar
    ? buildTrack(nearestCalendar)
    : nextActiveBlock?.isAllDay
      ? { emoji: fallbackEmoji, title: display.title, statusLabel: 'طوال اليوم', countdownText: 'اليوم', isNow: true, isUrgent: false, targetEpochMs: 0, durationSeconds: 0 }
      : null;

  const taskTrack: CapsuleTrackInfo | null = nearestRhythmOrTask
    ? buildTrack(nearestRhythmOrTask)
    : untimedTaskFallback
      ? { emoji: '☑️', title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم', statusLabel: 'مهام اليوم', countdownText: 'اليوم', isNow: false, isUrgent: false, targetEpochMs: 0, durationSeconds: 0 }
      : null;

  const upcomingQueue: CapsuleTrackInfo[] = activeCandidates.slice(0, 4).map(buildTrack);
  if (upcomingQueue.length < 4 && untimedTaskFallback) {
    upcomingQueue.push({
      emoji: '☑️',
      title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
      statusLabel: 'مهام اليوم',
      countdownText: 'اليوم',
      isNow: false,
      isUrgent: false,
      targetEpochMs: 0,
      durationSeconds: 0,
    });
  }

  const winner = activeCandidates[0];
  if (winner) {
    const winnerTrack = buildTrack(winner);
    const remainingSec = Math.max(0, winner.targetSec - nowSecOfDay);
    const progressRatio = winner.isNow
      ? Math.min(1, Math.max(0, (nowSecOfDay - winner.startSec) / winner.durationSec))
      : 0;
    return {
      emoji: winnerTrack.emoji,
      title: winnerTrack.title,
      statusLabel: winnerTrack.statusLabel,
      sourceKind: winner.sourceKind,
      countdownText: winnerTrack.countdownText,
      isNow: winnerTrack.isNow,
      isUrgent: winnerTrack.isUrgent,
      progressRatio,
      targetEpochMs:
        winner.isNow && winner.durationSec === 0
          ? 0
          : remainingSec > 0 ? capsuleNowMs - (capsuleNowMs % 1000) + remainingSec * 1000 : 0,
      durationSeconds: winner.durationSec,
      calendarTrack,
      taskTrack,
      upcomingQueue,
    };
  }

  if (nextActiveBlock?.isAllDay) {
    return {
      emoji: fallbackEmoji,
      title: display.title,
      statusLabel: 'طوال اليوم',
      sourceKind: 'calendar' as const,
      countdownText: 'اليوم',
      isNow: true,
      isUrgent: false,
      progressRatio: 0,
      targetEpochMs: 0,
      durationSeconds: 0,
      calendarTrack,
      taskTrack,
      upcomingQueue,
    };
  }

  if (untimedTaskFallback) {
    return {
      emoji: '☑️',
      title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
      statusLabel: 'مهام اليوم',
      sourceKind: 'task' as const,
      countdownText: 'اليوم',
      isNow: false,
      isUrgent: false,
      progressRatio: 0,
      targetEpochMs: 0,
      durationSeconds: 0,
      calendarTrack,
      taskTrack,
      upcomingQueue,
    };
  }

  return {
    emoji: '✅',
    title: 'أنجزت مهام اليوم',
    statusLabel: 'يوم هادئ ومكتمل',
    sourceKind: 'none' as const,
    countdownText: '✓',
    isNow: false,
    isUrgent: false,
    progressRatio: 0,
    targetEpochMs: 0,
    durationSeconds: 0,
    calendarTrack: null as CapsuleTrackInfo | null,
    taskTrack: null as CapsuleTrackInfo | null,
    upcomingQueue: [] as CapsuleTrackInfo[],
  };
}
