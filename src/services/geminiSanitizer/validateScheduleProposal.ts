import type {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  DailyRhythmPlan,
  DynamicHabitAnchor,
  FreeWindow,
  HabitActionProposal,
  LifeProfile,
  MedicationActionProposal,
  MemoryActionProposal,
  PendingProposal,
  PrayerTimeItem,
  ScheduleBlock,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';
import {
  DEFAULT_LIFE_PROFILE,
  SEASONAL_SLEEP_CONSTANTS,
  classifyScientificTaskEnergy,
  computeDailyRhythmPlan,
  computeFreeWindows,
  pickScientificFreeSlot,
} from '../../engines/lifeRhythmEngine';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  getCairoNowMinutes,
  getCairoTodayIso,
} from '../../engines/prayerEngine';
import { validateAndNormalizeSettingsPatch } from '../../utils/settingsPatchValidator';

import { formatMinutes24Str, parseExplicitClockMinutes, wrapMinutes1440, type GeminiScheduleGuardContext, type GeminiScheduleGuardResult, type GeminiScheduleGuardViolation } from './guardTypes';
import { checkProposedSlotConstraints, getAnchorBoundsForGuard } from './guardConstraints';

export function validateGeminiScheduleProposal(
  proposal: PendingProposal,
  context: GeminiScheduleGuardContext
): GeminiScheduleGuardResult {
  const profile = context.lifeProfile ?? DEFAULT_LIFE_PROFILE;
  const tz = context.timeZone ?? profile.currentTimeZone ?? 'Africa/Cairo';
  const todayIso = context.todayIso ?? getCairoTodayIso();
  const nowMinutes = context.nowMinutes ?? getCairoNowMinutes();

  const prayers =
    context.prayers ??
    calculateEgyptianPrayerTimes(
      {
        id: 'active',
        nameAr: profile.currentCityName,
        nameEn: profile.currentCityName,
        lat: profile.currentLat,
        lng: profile.currentLng,
        tzOffsetHours: 2,
        timeZone: tz,
      },
      new Date(),
      profile.adhanLeadMinutes
    );

  const wdParsed = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
  const todayWeekday = Number.isNaN(wdParsed) ? new Date().getDay() : wdParsed;
  const plan =
    context.plan ??
    computeDailyRhythmPlan(profile, prayers, {
      todayWeekday,
      tomorrowWeekday: (todayWeekday + 1) % 7,
      todayIso,
      timeZone: tz,
    });

  const occupiedBlocks = context.occupiedBlocks ?? [];
  const freeWindows =
    context.freeWindows && context.freeWindows.length > 0
      ? context.freeWindows.map((w) => ({ ...w }))
      : computeFreeWindows({
          prayers,
          plan,
          profile,
          occupiedBlocks,
          todayIso,
          timeZone: tz,
          minGapMinutes: 15,
        });

  const deepWorkRanges: Array<[number, number]> = [];
  for (const blk of occupiedBlocks) {
    if (blk.deleted || blk.isAllDay || blk.isAnchor) continue;
    if (classifyScientificTaskEnergy(blk.categoryAr) === 'deep_focus') {
      deepWorkRanges.push([blk.startMin, blk.startMin + Math.max(15, blk.durationMin)]);
    }
  }

  const violations: GeminiScheduleGuardViolation[] = [];
  const validActions: CalendarActionProposal[] = [];

  for (const act of proposal.actions) {
    if (act.operation === 'delete') {
      validActions.push(act);
      continue;
    }
    let startMin: number | null = null;
    if (typeof act.startTime24 === 'string') {
      const m = act.startTime24.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) startMin = hh * 60 + mm;
      }
    } else if (typeof act.startInMinutes === 'number' && Number.isFinite(act.startInMinutes)) {
      startMin = wrapMinutes1440(nowMinutes + act.startInMinutes);
    }

    if (startMin === null) {
      validActions.push(act);
      continue;
    }

    const dur = typeof act.durationMinutes === 'number' ? act.durationMinutes : 30;
    const violation = checkProposedSlotConstraints({
      title: act.title,
      startMin,
      durationMin: dur,
      prayers,
      plan,
      profile,
      remainingWindows: freeWindows,
      deepWorkRanges,
    });
    if (violation) {
      violations.push(violation);
    } else {
      validActions.push(act);
      if (classifyScientificTaskEnergy(act.title) === 'deep_focus') {
        deepWorkRanges.push([startMin, startMin + Math.max(10, dur)]);
      }
    }
  }

  const validTasks: TaskActionProposal[] = [];
  for (const tk of proposal.taskActions ?? []) {
    if (tk.operation === 'delete' || tk.operation === 'complete' || tk.operation === 'reopen') {
      validTasks.push(tk);
      continue;
    }
    const explicitMin = parseExplicitClockMinutes(`${tk.notes ?? ''} ${tk.title ?? ''}`);
    if (explicitMin === null) {
      validTasks.push(tk);
      continue;
    }
    const violation = checkProposedSlotConstraints({
      title: tk.title,
      startMin: explicitMin,
      durationMin: 30,
      prayers,
      plan,
      profile,
      remainingWindows: freeWindows,
      deepWorkRanges,
    });
    if (violation) {
      violations.push(violation);
    } else {
      validTasks.push(tk);
    }
  }

  const validHabits: HabitActionProposal[] = [];
  for (const hb of proposal.habitActions ?? []) {
    if (
      hb.operation === 'remove' ||
      hb.operation === 'pause' ||
      hb.operation === 'toggle_today' ||
      !hb.anchor
    ) {
      validHabits.push(hb);
      continue;
    }
    const bounds = getAnchorBoundsForGuard(hb.anchor, prayers, plan, profile);
    if (!bounds) {
      validHabits.push(hb);
      continue;
    }
    const dur = Math.max(10, hb.durationMin ?? 30);
    // Check if there is at least one freeWindow interval inside the anchor that passes constraints
    const candidateStart = freeWindows.find((w) => {
      const ovS = Math.max(w.startMin, bounds.start);
      const ovE = Math.min(w.endMin, bounds.end);
      return ovE - ovS >= dur;
    });
    const probeStart = candidateStart ? Math.max(candidateStart.startMin, bounds.start) : bounds.start;
    const violation = checkProposedSlotConstraints({
      title: hb.title,
      startMin: probeStart,
      durationMin: dur,
      prayers,
      plan,
      profile,
      remainingWindows: freeWindows,
      deepWorkRanges,
    });
    if (violation) {
      violations.push(violation);
    } else {
      validHabits.push(hb);
    }
  }

  const hasRemainingPayload =
    validActions.length > 0 ||
    validTasks.length > 0 ||
    validHabits.length > 0 ||
    Boolean(proposal.medicationActions && proposal.medicationActions.length > 0) ||
    Boolean(proposal.creativeActions && proposal.creativeActions.length > 0) ||
    Boolean(proposal.memoryActions && proposal.memoryActions.length > 0) ||
    Boolean(proposal.profileUpdates) ||
    Boolean(proposal.appSettings) ||
    Boolean(proposal.settingsPatchProposal);

  const filteredProposal: PendingProposal | undefined = hasRemainingPayload
    ? {
        ...proposal,
        actions: validActions,
        taskActions: validTasks.length > 0 ? validTasks : undefined,
        habitActions: validHabits.length > 0 ? validHabits : undefined,
      }
    : undefined;

  return {
    allowed: violations.length === 0,
    filteredProposal,
    violations,
    refusalMessageAr: violations.length > 0 ? violations.map((v) => v.reasonAr).join(' · ') : null,
  };
}

