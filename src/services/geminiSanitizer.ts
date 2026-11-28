import type {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  HabitActionProposal,
  LifeProfile,
  MedicationActionProposal,
  MemoryActionProposal,
  PendingProposal,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../types/dayrhythm';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import { validateAndNormalizeSettingsPatch } from '../utils/settingsPatchValidator';

export interface GeminiFunctionCall {
  name?: string;
  args?: Record<string, unknown>;
  fromTextFallback?: boolean;
}

export const GEMINI_TOOL_KEYS = [
  'propose_calendar_actions',
  'propose_task_actions',
  'propose_medication_actions',
  'propose_creative_actions',
  'propose_habit_actions',
  'propose_profile_updates',
  'propose_memory_actions',
  'propose_app_settings',
  'update_app_settings',
] as const;

export interface ExtractedBalancedCall {
  toolName: string;
  fullMatch: string;
  inner: string;
  start: number;
  end: number;
}

/**
 * Parses tool calls with balanced parenthesis counting, correctly handling nested
 * parentheses inside strings (e.g., event titles like "🌅 حضور الشروق (-3 د)").
 */
export function extractCallsBalanced(text: string): ExtractedBalancedCall[] {
  if (!text) return [];
  const results: ExtractedBalancedCall[] = [];

  for (const name of GEMINI_TOOL_KEYS) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(name, searchFrom);
      if (idx === -1) break;

      // Find opening '(' after the tool name
      let openIdx = idx + name.length;
      while (openIdx < text.length && /\s/.test(text[openIdx])) openIdx++;

      if (openIdx < text.length && text[openIdx] === '(') {
        let depth = 0;
        let inString: string | null = null;
        let escaped = false;
        let closeIdx = -1;

        for (let i = openIdx; i < text.length; i++) {
          const ch = text[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (inString) {
            if (ch === inString) inString = null;
          } else {
            if (ch === '"' || ch === "'") {
              inString = ch;
            } else if (ch === '(') {
              depth++;
            } else if (ch === ')') {
              depth--;
              if (depth === 0) {
                closeIdx = i;
                break;
              }
            }
          }
        }

        if (closeIdx !== -1) {
          // Check for trailing semicolon e.g. propose_xxx(...);
          let end = closeIdx + 1;
          if (end < text.length && text[end] === ';') {
            end++;
          }
          results.push({
            toolName: name,
            fullMatch: text.slice(idx, end),
            inner: text.slice(openIdx + 1, closeIdx),
            start: idx,
            end,
          });
          searchFrom = end;
          continue;
        }
      }
      searchFrom = idx + name.length;
    }
  }

  // Sort by start index ascending
  return results.sort((a, b) => a.start - b.start);
}

function tryRecoverTool(
  recoveredFnCalls: GeminiFunctionCall[],
  toolName: string,
  argsObj: Record<string, unknown> | unknown[],
  fromTextFallback = true
) {
  if (recoveredFnCalls.some((f) => f.name === toolName)) return;

  if (toolName === 'propose_calendar_actions') {
    const rawActions = (argsObj as Record<string, unknown>)?.actions ?? argsObj;
    const actions = Array.isArray(rawActions) ? rawActions : [];
    recoveredFnCalls.push({
      name: toolName,
      args: {
        actions,
        summaryAr: ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined,
      },
      fromTextFallback,
    });
  } else if (toolName === 'propose_medication_actions') {
    const rawMeds = (argsObj as Record<string, unknown>)?.medicationActions ?? argsObj;
    const medicationActions = Array.isArray(rawMeds) ? rawMeds : [];
    recoveredFnCalls.push({
      name: toolName,
      args: {
        medicationActions,
        summaryAr: ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined,
      },
      fromTextFallback,
    });
  } else if (toolName === 'propose_task_actions') {
    const rawTasks = (argsObj as Record<string, unknown>)?.taskActions ?? argsObj;
    const taskActions = Array.isArray(rawTasks) ? rawTasks : [];
    recoveredFnCalls.push({
      name: toolName,
      args: {
        taskActions,
        summaryAr: ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined,
      },
      fromTextFallback,
    });
  } else if (toolName === 'propose_creative_actions') {
    const rawCreative = (argsObj as Record<string, unknown>)?.creativeActions ?? argsObj;
    const creativeActions = Array.isArray(rawCreative) ? rawCreative : [];
    recoveredFnCalls.push({
      name: toolName,
      args: {
        creativeActions,
        summaryAr: ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined,
      },
      fromTextFallback,
    });
  } else if (toolName === 'propose_habit_actions') {
    const rawHabits = (argsObj as Record<string, unknown>)?.habitActions ?? argsObj;
    const habitActions = Array.isArray(rawHabits) ? rawHabits : [];
    recoveredFnCalls.push({
      name: toolName,
      args: {
        habitActions,
        summaryAr: ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined,
      },
      fromTextFallback,
    });
  } else if (toolName === 'propose_memory_actions') {
    const rawMem = (argsObj as Record<string, unknown>)?.memoryActions ?? argsObj;
    const memoryActions = Array.isArray(rawMem) ? rawMem : [];
    recoveredFnCalls.push({
      name: toolName,
      args: {
        memoryActions,
        summaryAr: ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined,
      },
      fromTextFallback,
    });
  } else if (typeof argsObj === 'object' && argsObj !== null && !Array.isArray(argsObj)) {
    recoveredFnCalls.push({
      name: toolName,
      args: argsObj as Record<string, unknown>,
      fromTextFallback,
    });
  }
}

function parsePythonOrJsonCall(
  codeStr: string,
  recoveredFnCalls: GeminiFunctionCall[]
): boolean {
  const trimmed = (codeStr || '').trim();
  if (!trimmed) return false;

  // 1. JSON format: { "propose_...": ... } or { "name": "propose_...", "args": ... }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      let handled = false;
      for (const key of GEMINI_TOOL_KEYS) {
        if (key in parsed) {
          handled = true;
          tryRecoverTool(recoveredFnCalls, key, (parsed[key] as Record<string, unknown>) || parsed, true);
        }
      }
      if (typeof parsed.name === 'string' && (GEMINI_TOOL_KEYS as readonly string[]).includes(parsed.name)) {
        handled = true;
        tryRecoverTool(recoveredFnCalls, parsed.name, (parsed.args as Record<string, unknown>) || {}, true);
      }
      if (handled) return true;
    } catch {
      // ignore
    }
  }

  // 2. Python call format: propose_calendar_actions(...) using balanced parser
  const extracted = extractCallsBalanced(trimmed);
  if (extracted.length > 0) {
    for (const call of extracted) {
      const { toolName, inner } = call;
      const argsObj: Record<string, unknown> = {};

      const kwargRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\s\S]*?)(?=(?:,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=|$))/g;
      let kwMatch: RegExpExecArray | null;
      let foundKw = false;
      while ((kwMatch = kwargRegex.exec(inner)) !== null) {
        foundKw = true;
        const key = kwMatch[1];
        let valStr = kwMatch[2].trim();
        if (valStr.endsWith(',')) valStr = valStr.slice(0, -1).trim();

        const jsonStr = valStr
          .replace(/'/g, '"')
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null');

        try {
          argsObj[key] = JSON.parse(jsonStr);
        } catch {
          argsObj[key] = valStr;
        }
      }

      if (!foundKw && (inner.startsWith('{') || inner.startsWith('['))) {
        try {
          const jsonStr = inner
            .replace(/'/g, '"')
            .replace(/\bTrue\b/g, 'true')
            .replace(/\bFalse\b/g, 'false')
            .replace(/\bNone\b/g, 'null');
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) {
            argsObj.actions = parsed;
          } else {
            Object.assign(argsObj, parsed);
          }
        } catch {
          // ignore
        }
      }

      tryRecoverTool(recoveredFnCalls, toolName, argsObj, true);
    }
    return true;
  }

  // Check if the snippet contains tool keys
  for (const key of GEMINI_TOOL_KEYS) {
    if (trimmed.includes(key)) {
      return true;
    }
  }

  return false;
}

/**
 * Universal Gemini output sanitizer:
 * Strips code blocks, JSON snippets, and bare python tool calls from human-facing text.
 * Recovers function calls into recoveredFnCalls marked with fromTextFallback: true.
 */
export function sanitizeGeminiOutputText(
  rawText: string,
  existingFnCalls: GeminiFunctionCall[] = []
): { cleanText: string; recoveredFnCalls: GeminiFunctionCall[] } {
  if (!rawText) return { cleanText: '', recoveredFnCalls: [...existingFnCalls] };

  const recoveredFnCalls = [...existingFnCalls];

  // 1. Strip all closed markdown code blocks that are tool calls or contain propose_
  const codeBlockRegex = /```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```/gi;
  let cleaned = rawText.replace(codeBlockRegex, (match, inner: string) => {
    if (parsePythonOrJsonCall(inner, recoveredFnCalls)) {
      return '';
    }
    return match;
  });

  // 2. Strip unclosed code blocks if they contain propose_ (e.g. while streaming)
  cleaned = cleaned.replace(/```(?:[a-zA-Z0-9_-]+)?\s*(?:propose_[\s\S]*?)$/gi, '');

  // 3. Strip bare tool calls outside code blocks using balanced call detection
  const bareCalls = extractCallsBalanced(cleaned);
  if (bareCalls.length > 0) {
    // Replace from right to left so indices remain stable
    for (let i = bareCalls.length - 1; i >= 0; i--) {
      const call = bareCalls[i];
      parsePythonOrJsonCall(call.fullMatch, recoveredFnCalls);
      cleaned = cleaned.slice(0, call.start) + cleaned.slice(call.end);
    }
  }

  // Remove residual double/triple empty lines and trim
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanText: cleaned, recoveredFnCalls };
}

export function cleanDisplayMessageText(rawText?: string | null): string {
  if (!rawText) return '';
  return sanitizeGeminiOutputText(rawText).cleanText;
}

export function extractPendingProposalFromFunctionCalls(
  fnCalls?: GeminiFunctionCall[],
  options?: { settingsSnapshot?: SettingsSnapshotContext }
): PendingProposal | undefined {
  if (!fnCalls || fnCalls.length === 0) return undefined;

  const calCall = fnCalls.find((f) => f.name === 'propose_calendar_actions');
  const taskCall = fnCalls.find((f) => f.name === 'propose_task_actions');
  const medCall = fnCalls.find((f) => f.name === 'propose_medication_actions');
  const creativeCall = fnCalls.find((f) => f.name === 'propose_creative_actions');
  const habitCall = fnCalls.find((f) => f.name === 'propose_habit_actions');
  const profileCall = fnCalls.find((f) => f.name === 'propose_profile_updates');
  const memoryCall = fnCalls.find((f) => f.name === 'propose_memory_actions');
  const settingsCall = fnCalls.find((f) => f.name === 'propose_app_settings');
  const unifiedSettingsCall = fnCalls.find((f) => f.name === 'update_app_settings');

  if (
    !calCall &&
    !taskCall &&
    !medCall &&
    !creativeCall &&
    !habitCall &&
    !profileCall &&
    !memoryCall &&
    !settingsCall &&
    !unifiedSettingsCall
  ) {
    return undefined;
  }

  const isFromFallback = Boolean(
    calCall?.fromTextFallback ||
    taskCall?.fromTextFallback ||
    medCall?.fromTextFallback ||
    creativeCall?.fromTextFallback ||
    habitCall?.fromTextFallback ||
    profileCall?.fromTextFallback ||
    memoryCall?.fromTextFallback ||
    settingsCall?.fromTextFallback ||
    unifiedSettingsCall?.fromTextFallback
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

  const actions = Array.isArray(calArgs.actions) ? calArgs.actions : [];
  const taskActions = Array.isArray(taskArgs.taskActions) ? taskArgs.taskActions : [];
  const medicationActions = Array.isArray(medArgs.medicationActions)
    ? medArgs.medicationActions
    : [];
  const creativeActions = Array.isArray(creativeArgs.creativeActions)
    ? creativeArgs.creativeActions
    : [];
  const habitActions = Array.isArray(habitArgs.habitActions)
    ? habitArgs.habitActions
    : [];
  const memoryActions = Array.isArray(memoryArgs.memoryActions)
    ? memoryArgs.memoryActions
    : [];

  const summary =
    calArgs.summaryAr ||
    taskArgs.summaryAr ||
    medArgs.summaryAr ||
    creativeArgs.summaryAr ||
    habitArgs.summaryAr ||
    settingsPatchProposal?.summaryAr ||
    memoryArgs.summaryAr ||
    'اقتراح تعديل على التقويم والمهام';

  return {
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
}
