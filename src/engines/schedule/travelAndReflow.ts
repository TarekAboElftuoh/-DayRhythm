import { hm } from './types';
import { CatchUpDecision, ReflowResult, ScheduleBlock, TravelState } from '../../types/dayrhythm';

export function applyTravelMatrix(
  blocks: ScheduleBlock[],
  travel: TravelState
): ScheduleBlock[] {
  if (!travel.active) return blocks;

  const deferCalendar = travel.deferredCategories?.includes('calendar') ?? false;
  const deferTasks = travel.deferredCategories?.includes('tasks') ?? false;

  return blocks.map((b) => {
    if (b.isAnchor || b.travelGroup === 'ANCHOR') {
      return b;
    }
    if (b.source === 'google_calendar') {
      return {
        ...b,
        reflowStatus: deferCalendar ? 'postponed_travel' : undefined,
      };
    }
    if (deferTasks && b.travelGroup !== 'C_PORTABLE') {
      return {
        ...b,
        reflowStatus: 'postponed_travel',
      };
    }
    if (b.travelGroup === 'C_PORTABLE') {
      return b;
    }
    if (b.travelGroup === 'A_FIXED') {
      const postponed = travel.postponedTaskIds.includes(b.id) || b.isFridayRitual;
      return {
        ...b,
        reflowStatus: postponed ? 'postponed_travel' : undefined,
      };
    }
    if (b.travelGroup === 'B_WORK') {
      const enabled = travel.enabledWorkTaskIds.includes(b.id);
      return {
        ...b,
        reflowStatus: enabled ? undefined : 'postponed_travel',
      };
    }
    return b;
  });
}

/**
 * Collision-Free Reflow & Gap Absorption Algorithm
 * W = T_anchor - T_now
 * Compresses flexible work blocks down to minDurationMin while keeping
 * Prayer (-3m), Friday Rituals, and Sleep (21:15) anchors 100% immutable.
 */
export function computeCollisionFreeReflow(
  blocks: ScheduleBlock[],
  nowMin: number,
  decisions: Record<string, CatchUpDecision>,
  options?: {
    bedtimeMin?: number;
    travelState?: TravelState;
    lowEnergyActive?: boolean;
  }
): ReflowResult {
  const travel = options?.travelState;
  const deferCalendar = travel?.active ? (travel.deferredCategories?.includes('calendar') ?? false) : false;
  const deferTasks = travel?.active ? (travel.deferredCategories?.includes('tasks') ?? false) : false;
  const deferredMeds = travel?.active ? new Set(travel.deferredMedIds ?? []) : null;

  const isDeferredByTravelOrEnergy = (b: ScheduleBlock): boolean => {
    if (b.reflowStatus === 'postponed_travel') return true;
    const isDeferredMed = Boolean(
      deferredMeds && Array.from(deferredMeds).some((id) => b.id.includes(id))
    );
    if (travel?.active && !b.isAnchor) {
      if (b.source === 'google_calendar' && deferCalendar) return true;
      if (isDeferredMed) return true;
      if (deferTasks && b.source !== 'google_calendar' && b.travelGroup !== 'C_PORTABLE') {
        return true;
      }
    }
    if (
      options?.lowEnergyActive &&
      !b.isAnchor &&
      b.source !== 'google_calendar' &&
      b.source !== 'prayer' &&
      !isDeferredMed
    ) {
      return true;
    }
    return false;
  };

  const cloned = blocks.map((b) => {
    const base = {
      ...b,
      originalStartMin: b.originalStartMin ?? b.startMin,
      originalDurationMin: b.originalDurationMin ?? b.durationMin,
    };
    if (!base.deleted && !base.completed && isDeferredByTravelOrEnergy(base)) {
      base.reflowStatus = options?.lowEnergyActive && !travel?.active ? 'skipped' : 'postponed_travel';
    }
    return base;
  });

  const anchors = cloned
    .filter((b) => b.isAnchor && !b.deleted)
    .sort((a, b) => a.startMin - b.startMin);

  const overdueFlexible = cloned.filter(
    (b) =>
      !b.isAnchor &&
      !b.completed &&
      !b.deleted &&
      b.reflowStatus !== 'postponed_travel' &&
      b.reflowStatus !== 'skipped' &&
      b.startMin < nowMin
  );

  let compressedCount = 0;
  let shiftedCount = 0;
  let skippedCount = 0;
  const notesAr: string[] = [];

  for (const item of overdueFlexible) {
    const d = decisions[item.id] ?? 'skip_today';
    if (d === 'skip_today') {
      item.reflowStatus = 'skipped';
      skippedCount++;
    }
  }

  const startNowTasks = overdueFlexible.filter(
    (b) => (decisions[b.id] ?? 'skip_today') === 'start_now'
  );
  const shiftEveningTasks = overdueFlexible.filter(
    (b) => (decisions[b.id] ?? 'skip_today') === 'shift_evening'
  );

  const sleepStart = anchors.find((a) => a.id === 'sleep_anchor')?.startMin ?? (options?.bedtimeMin ?? hm(21, 15));
  let eveningCursor = Math.max(nowMin, sleepStart - 90);
  for (const item of shiftEveningTasks) {
    const dur = Math.min(item.durationMin, Math.max(item.minDurationMin, 25));
    if (eveningCursor + dur <= sleepStart - 25) {
      item.startMin = eveningCursor;
      item.durationMin = dur;
      item.reflowStatus = 'shifted_evening';
      eveningCursor += dur + 5;
      shiftedCount++;
    } else {
      item.reflowStatus = 'skipped';
      skippedCount++;
      notesAr.push(`تعذر ترحيل ${item.emojiPair} لامتلاء نافذة المساء قبل النوم.`);
    }
  }

  const upcomingFlex = cloned
    .filter(
      (b) =>
        !b.isAnchor &&
        !b.deleted &&
        !b.completed &&
        b.startMin >= nowMin &&
        b.reflowStatus !== 'shifted_evening' &&
        b.reflowStatus !== 'skipped' &&
        b.reflowStatus !== 'postponed_travel'
    )
    .sort((a, b) => a.startMin - b.startMin);

  const packQueue = [...startNowTasks, ...upcomingFlex];

  const futureAnchors = anchors.filter((a) => a.startMin + a.durationMin > nowMin);
  const windows: Array<{ start: number; end: number }> = [];
  let cursor = nowMin;

  for (const anchor of futureAnchors) {
    if (anchor.startMin > cursor) {
      windows.push({ start: cursor, end: anchor.startMin - 3 });
    }
    cursor = Math.max(cursor, anchor.startMin + anchor.durationMin + 3);
  }

  const availableBudgetMin = windows.reduce((acc, w) => acc + Math.max(0, w.end - w.start), 0);
  const requiredWorkMin = packQueue.reduce((acc, t) => acc + t.durationMin, 0);

  const minRequiredMin = packQueue.reduce((acc, t) => acc + t.minDurationMin, 0);
  const deficit = Math.max(0, requiredWorkMin - availableBudgetMin);
  const maxCompressible = Math.max(1, requiredWorkMin - minRequiredMin);
  const compressionRatio = deficit > 0 ? Math.min(1, deficit / maxCompressible) : 0;

  let winIdx = 0;
  let winCursor = windows[0]?.start ?? nowMin;

  for (const task of packQueue) {
    const isStartNow = startNowTasks.some((s) => s.id === task.id);
    const reducible = Math.max(0, task.durationMin - task.minDurationMin);
    const targetDur = Math.max(
      task.minDurationMin,
      Math.round(task.durationMin - reducible * compressionRatio)
    );

    if (targetDur < task.durationMin) {
      compressedCount++;
    }

    while (winIdx < windows.length && winCursor + targetDur > windows[winIdx].end) {
      winIdx++;
      if (winIdx < windows.length) {
        winCursor = windows[winIdx].start;
      }
    }

    if (winIdx < windows.length) {
      task.startMin = winCursor;
      task.durationMin = targetDur;
      if (isStartNow) {
        task.reflowStatus = 'started_now';
      } else if (targetDur < (task.originalDurationMin ?? task.durationMin)) {
        task.reflowStatus = 'compressed';
      }
      winCursor += targetDur + 5;
    } else {
      task.reflowStatus = 'skipped';
      skippedCount++;
      const normSleep = ((sleepStart % 1440) + 1440) % 1440;
      const sleepH24 = Math.floor(normSleep / 60);
      const sleepM = normSleep % 60;
      const sleepH12 = sleepH24 % 12 === 0 ? 12 : sleepH24 % 12;
      const sleepPeriod = sleepH24 >= 12 ? 'م' : 'ص';
      const sleepLabel = `${String(sleepH12).padStart(2, '0')}:${String(sleepM).padStart(2, '0')} ${sleepPeriod}`;
      notesAr.push(`تم إخلاء ${task.emojiPair} لحماية المراسي الثابتة والنوم ${sleepLabel}.`);
    }
  }

  if (compressedCount > 0) {
    notesAr.unshift(`تم امتصاص الفجوة بضغط ${compressedCount} مهام مرنة دون المساس بأي صلاة أو طقوس الجمعة أو النوم.`);
  }
  if (shiftedCount > 0) {
    notesAr.push(`تم ترحيل ${shiftedCount} مهام إلى نافذة المساء (07:45 م – 08:30 م).`);
  }

  cloned.sort((a, b) => a.startMin - b.startMin);

  return {
    reflowedBlocks: cloned,
    compressedCount,
    shiftedCount,
    skippedCount,
    availableBudgetMin,
    requiredWorkMin,
    collisionFree: true,
    notesAr,
  };
}

