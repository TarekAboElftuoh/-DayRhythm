import { parsePythonOrJsonCall, tryRecoverTool } from './callRecovery';

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

