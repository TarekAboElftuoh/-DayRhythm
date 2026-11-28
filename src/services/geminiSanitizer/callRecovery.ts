import { GEMINI_TOOL_KEYS, extractCallsBalanced } from './callParser';
import type { GeminiFunctionCall } from './callParser';

export function tryRecoverTool(
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

export function parsePythonOrJsonCall(
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
