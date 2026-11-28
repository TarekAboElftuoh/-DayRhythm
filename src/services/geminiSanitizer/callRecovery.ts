import { GEMINI_TOOL_KEYS, extractCallsBalanced } from './callParser';
import type { GeminiFunctionCall } from './callParser';

const ARRAY_TOOL_KEY: Record<string, string> = {
  propose_calendar_actions: 'actions',
  propose_medication_actions: 'medicationActions',
  propose_task_actions: 'taskActions',
  propose_creative_actions: 'creativeActions',
  propose_habit_actions: 'habitActions',
  propose_memory_actions: 'memoryActions',
};

export function tryRecoverTool(
  recoveredFnCalls: GeminiFunctionCall[],
  toolName: string,
  argsObj: Record<string, unknown> | unknown[],
  fromTextFallback = true
) {
  const existing = recoveredFnCalls.find((f) => f.name === toolName);
  const arrayKey = ARRAY_TOOL_KEY[toolName];

  if (arrayKey) {
    const rawItems = (argsObj as Record<string, unknown>)?.[arrayKey] ?? argsObj;
    const items = Array.isArray(rawItems) ? rawItems : [];
    const summaryAr = ((argsObj as Record<string, unknown>)?.summaryAr as string) || undefined;
    if (existing?.args) {
      const prev = Array.isArray(existing.args[arrayKey]) ? (existing.args[arrayKey] as unknown[]) : [];
      existing.args[arrayKey] = [...prev, ...items];
      if (!existing.args.summaryAr && summaryAr) existing.args.summaryAr = summaryAr;
      return;
    }
    recoveredFnCalls.push({
      name: toolName,
      args: { [arrayKey]: items, summaryAr },
      fromTextFallback,
    });
    return;
  }

  if (existing) return;
  if (typeof argsObj === 'object' && argsObj !== null && !Array.isArray(argsObj)) {
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
