import type { GeminiScheduleGuardContext } from './guardTypes';
import { validateGeminiScheduleProposal } from './validateScheduleProposal';
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

import type { GeminiFunctionCall } from './callParser';

export function extractPendingProposalFromFunctionCalls(
  fnCalls?: GeminiFunctionCall[],
  options?: {
    settingsSnapshot?: SettingsSnapshotContext;
    guardContext?: GeminiScheduleGuardContext;
    skipScheduleGuard?: boolean;
  }
): PendingProposal | undefined {
  if (!fnCalls || fnCalls.length === 0) return undefined;

  const calCalls = fnCalls.filter((f) => f.name === 'propose_calendar_actions');
  const taskCalls = fnCalls.filter((f) => f.name === 'propose_task_actions');
  const medCalls = fnCalls.filter((f) => f.name === 'propose_medication_actions');
  const creativeCalls = fnCalls.filter((f) => f.name === 'propose_creative_actions');
  const habitCalls = fnCalls.filter((f) => f.name === 'propose_habit_actions');
  const profileCall = fnCalls.find((f) => f.name === 'propose_profile_updates');
  const memoryCalls = fnCalls.filter((f) => f.name === 'propose_memory_actions');
  const settingsCall = fnCalls.find((f) => f.name === 'propose_app_settings');
  const unifiedSettingsCall = fnCalls.find((f) => f.name === 'update_app_settings');

  const calCall = calCalls[0];
  const taskCall = taskCalls[0];
  const medCall = medCalls[0];
  const creativeCall = creativeCalls[0];
  const habitCall = habitCalls[0];
  const memoryCall = memoryCalls[0];

  if (
    calCalls.length === 0 &&
    taskCalls.length === 0 &&
    medCalls.length === 0 &&
    creativeCalls.length === 0 &&
    habitCalls.length === 0 &&
    !profileCall &&
    memoryCalls.length === 0 &&
    !settingsCall &&
    !unifiedSettingsCall
  ) {
    return undefined;
  }

  const isFromFallback = Boolean(
    fnCalls.some((f) => f.fromTextFallback)
  );

  const calArgs = (calCall?.args ?? {}) as {
    summaryAr?: string;
    actions?: CalendarActionProposal[];
  };
  const taskArgs = (taskCall?.args ?? {}) as {
    summaryAr?: string;
    taskActions?: TaskActionProposal[];
  };
  const medArgs = (medCall?.args ?? {}) as {
    summaryAr?: string;
    medicationActions?: MedicationActionProposal[];
  };
  const creativeArgs = (creativeCall?.args ?? {}) as {
    summaryAr?: string;
    creativeActions?: CreativeActivityActionProposal[];
  };
  const habitArgs = (habitCall?.args ?? {}) as {
    summaryAr?: string;
    habitActions?: HabitActionProposal[];
  };
  const profileArgs = (profileCall?.args ?? {}) as Record<string, unknown>;
  const { summaryAr: profileSummaryAr, ...rawProfilePatch } = profileArgs;
  const memoryArgs = (memoryCall?.args ?? {}) as {
    summaryAr?: string;
    memoryActions?: MemoryActionProposal[];
  };
  const settingsArgs = (settingsCall?.args ?? {}) as Record<string, unknown>;
  const unifiedArgs = (unifiedSettingsCall?.args ?? {}) as Record<string, unknown>;

  const unwrapPatch = (raw: Record<string, unknown>): Record<string, unknown> => {
    const nested =
      raw.patch && typeof raw.patch === 'object' && !Array.isArray(raw.patch)
        ? (raw.patch as Record<string, unknown>)
        : raw;
    const out = { ...nested };
    delete out.summaryAr;
    return out;
  };

  const mergedSettingsInput: Record<string, unknown> = {
    ...(profileCall ? rawProfilePatch : {}),
    ...(settingsCall ? unwrapPatch(settingsArgs) : {}),
    ...(unifiedSettingsCall ? unwrapPatch(unifiedArgs) : {}),
  };

  let settingsPatchProposal: SettingsPatchProposal | undefined;
  let profileUpdates: Partial<LifeProfile> | undefined;
  let appSettings: AppSettingsPatch | undefined;

  if (Object.keys(mergedSettingsInput).length > 0) {
    const baseProfile = options?.settingsSnapshot?.lifeProfile ?? DEFAULT_LIFE_PROFILE;
    const validation = validateAndNormalizeSettingsPatch(
      baseProfile,
      mergedSettingsInput,
      options?.settingsSnapshot
    );
    const settingsSummary =
      (typeof unifiedArgs.summaryAr === 'string' && unifiedArgs.summaryAr) ||
      (typeof settingsArgs.summaryAr === 'string' && settingsArgs.summaryAr) ||
      (typeof profileSummaryAr === 'string' && profileSummaryAr) ||
      'تعديل إعدادات التطبيق';

    settingsPatchProposal = {
      summaryAr: settingsSummary,
      patch: validation.normalizedPatch,
      diffs: validation.diffs,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      errors: validation.errors.length > 0 ? validation.errors : undefined,
      blockedKeys: validation.blockedKeys.length > 0 ? validation.blockedKeys : undefined,
    };

    if (Object.keys(validation.profilePatch).length > 0) {
      profileUpdates = validation.profilePatch;
    }
    if (Object.keys(validation.appSettingsPatch).length > 0) {
      appSettings = validation.appSettingsPatch;
    }
  }

  const fallbackDateIso = options?.guardContext?.todayIso ?? getCairoTodayIso();
  const actions = calCalls
    .flatMap((c) => (Array.isArray(c.args?.actions) ? (c.args.actions as CalendarActionProposal[]) : []))
    .map((act) =>
      act.operation === 'create' && !act.dateIso && typeof act.startInMinutes !== 'number'
        ? { ...act, dateIso: fallbackDateIso }
        : act
    );
  const taskActions = taskCalls.flatMap((c) =>
    Array.isArray(c.args?.taskActions) ? (c.args.taskActions as TaskActionProposal[]) : []
  );
  const medicationActions = medCalls.flatMap((c) =>
    Array.isArray(c.args?.medicationActions) ? (c.args.medicationActions as MedicationActionProposal[]) : []
  );
  const creativeActions = creativeCalls.flatMap((c) =>
    Array.isArray(c.args?.creativeActions) ? (c.args.creativeActions as CreativeActivityActionProposal[]) : []
  );
  const habitActions = habitCalls.flatMap((c) =>
    Array.isArray(c.args?.habitActions) ? (c.args.habitActions as HabitActionProposal[]) : []
  );
  const memoryActions = memoryCalls.flatMap((c) =>
    Array.isArray(c.args?.memoryActions) ? (c.args.memoryActions as MemoryActionProposal[]) : []
  );

  const summary =
    calArgs.summaryAr ||
    taskArgs.summaryAr ||
    medArgs.summaryAr ||
    creativeArgs.summaryAr ||
    habitArgs.summaryAr ||
    settingsPatchProposal?.summaryAr ||
    memoryArgs.summaryAr ||
    'اقتراح تعديل على التقويم والمهام';

  const rawProposal: PendingProposal = {
    summaryAr: summary,
    actions,
    taskActions: taskActions.length > 0 ? taskActions : undefined,
    medicationActions: medicationActions.length > 0 ? medicationActions : undefined,
    creativeActions: creativeActions.length > 0 ? creativeActions : undefined,
    habitActions: habitActions.length > 0 ? habitActions : undefined,
    profileUpdates,
    memoryActions: memoryActions.length > 0 ? memoryActions : undefined,
    appSettings,
    settingsPatchProposal,
    status: 'pending',
    fromTextFallback: isFromFallback || undefined,
  };

  const guardCtx: GeminiScheduleGuardContext | null =
    options?.guardContext ??
    (options?.settingsSnapshot?.lifeProfile
      ? {
          lifeProfile: options.settingsSnapshot.lifeProfile,
          freeWindows: options.settingsSnapshot.freeWindows,
        }
      : null);

  if (guardCtx && !options?.skipScheduleGuard) {
    const guarded = validateGeminiScheduleProposal(rawProposal, guardCtx);
    return guarded.filteredProposal;
  }

  return rawProposal;
}

