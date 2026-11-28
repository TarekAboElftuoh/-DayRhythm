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
} from '../types/dayrhythm';
import {
  DEFAULT_LIFE_PROFILE,
  SEASONAL_SLEEP_CONSTANTS,
  classifyScientificTaskEnergy,
  computeDailyRhythmPlan,
  computeFreeWindows,
  pickScientificFreeSlot,
} from '../engines/lifeRhythmEngine';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  getCairoNowMinutes,
  getCairoTodayIso,
} from '../engines/prayerEngine';
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

export interface GeminiScheduleGuardContext {
  lifeProfile: LifeProfile;
  prayers?: PrayerTimeItem[];
  plan?: DailyRhythmPlan;
  occupiedBlocks?: ScheduleBlock[];
  freeWindows?: FreeWindow[];
  todayIso?: string;
  nowMinutes?: number;
  timeZone?: string;
}

export interface GeminiScheduleGuardViolation {
  kind:
    | 'sleep'
    | 'prayer'
    | 'suhoor'
    | 'nap'
    | 'wind_down'
    | 'exercise_near_sleep'
    | 'fasting_curve'
    | 'focus_buffer';
  itemTitle: string;
  requestedTime24?: string;
  reasonAr: string;
  suggestedTime24: string | null;
  suggestedTime12Ar: string | null;
}

export interface GeminiScheduleGuardResult {
  allowed: boolean;
  filteredProposal: PendingProposal | undefined;
  violations: GeminiScheduleGuardViolation[];
  refusalMessageAr: string | null;
}

function parseExplicitClockMinutes(text: string): number | null {
  const tagged24 = text.match(/(?:⏰|@|\[)\s*(\d{1,2}):(\d{2})\s*\]?/);
  if (tagged24) {
    const h = Number(tagged24[1]);
    const m = Number(tagged24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
  }
  const time12 = text.match(/(\d{1,2}):(\d{2})\s*(ص|صباحاً|صباحا|م|مساءً|مساءا|مساء|am|pm)\b/i);
  if (time12) {
    let h = Number(time12[1]);
    const m = Number(time12[2]);
    const marker = time12[3].toLowerCase();
    const isPm = marker.startsWith('م') || marker === 'pm';
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return h * 60 + m;
    }
  }
  const plain24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (plain24) {
    return Number(plain24[1]) * 60 + Number(plain24[2]);
  }
  return null;
}

function wrapMinutes1440(min: number): number {
  return ((Math.round(min) % 1440) + 1440) % 1440;
}

function formatMinutes24Str(min: number): string {
  const w = wrapMinutes1440(min);
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
}

function checkProposedSlotConstraints(params: {
  title: string;
  startMin: number;
  durationMin: number;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  remainingWindows: FreeWindow[];
  deepWorkRanges: Array<[number, number]>;
}): GeminiScheduleGuardViolation | null {
  const { title, startMin, durationMin, prayers, plan, profile, remainingWindows, deepWorkRanges } =
    params;
  const dur = Math.max(10, Math.min(480, Math.round(durationMin || 30)));
  const endMin = startMin + dur;
  const requestedTime24 = formatMinutes24Str(startMin);

  const suggestAlt = () => {
    const slot = pickScientificFreeSlot({
      title,
      durationMin: dur,
      remainingWindows,
      prayers,
      plan,
      deepWorkRanges,
      claim: false,
    });
    return {
      suggestedTime24: slot?.time24 ?? null,
      suggestedTime12Ar: slot ? formatMinutes12h(slot.startMin, 'ar') : null,
      slot,
    };
  };

  // 1. Hard Guard: Obligatory Prayers (+ lead & silence buffer)
  const preBuffer = Math.max(5, profile.adhanLeadMinutes ?? 0);
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const silenceLen = p.id === 'fajr' ? profile.fajrSilenceMinutes : profile.prayerSilenceMinutes;
    const postBuffer = Math.max(20, silenceLen ?? 20);
    const pStart = Math.max(0, p.adhanMinutes - preBuffer);
    const pEnd = p.adhanMinutes + postBuffer;
    if (startMin < pEnd && endMin > pStart) {
      const alt = suggestAlt();
      return {
        kind: 'prayer',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت صلاتك المحمي (صلاة ${p.nameAr} ${formatMinutes12h(p.adhanMinutes, 'ar')} – ${formatMinutes12h(pEnd, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  // 2. Hard Guard: Seasonal Night Sleep (handles midnight wrap)
  const bed = wrapMinutes1440(plan.bedtimeMin);
  const wake = wrapMinutes1440(plan.wakeMin);
  const isInsideSleep = (m: number): boolean => {
    const w = wrapMinutes1440(m);
    if (bed > wake) return w >= bed || w < wake;
    return w >= bed && w < wake;
  };
  if (isInsideSleep(startMin) || isInsideSleep(endMin - 1)) {
    const alt = suggestAlt();
    return {
      kind: 'sleep',
      itemTitle: title,
      requestedTime24,
      reasonAr: `ده وقت نومك المحمي (${formatMinutes12h(bed, 'ar')} – ${formatMinutes12h(wake, 'ar')})${
        alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
      }`,
      suggestedTime24: alt.suggestedTime24,
      suggestedTime12Ar: alt.suggestedTime12Ar,
    };
  }

  // 3. Hard Guard: Suhoor on fasting days
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  if (plan.isFastingToday || plan.suhoorStartMin !== null) {
    const suhoorStart =
      plan.suhoorStartMin ??
      Math.max(0, fajrMin - (profile.suhoorLeadMinutes ?? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN));
    if (fajrMin > suhoorStart && startMin < fajrMin && endMin > suhoorStart) {
      const alt = suggestAlt();
      return {
        kind: 'suhoor',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت السحور المحمي (${formatMinutes12h(suhoorStart, 'ar')} – ${formatMinutes12h(fajrMin, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  // 4. Hard Guard: Active Recovery Naps (post-Fajr sleep & Qailulah)
  if (
    typeof plan.postFajrStartMin === 'number' &&
    typeof plan.postFajrDurationMin === 'number' &&
    plan.postFajrDurationMin > 0
  ) {
    const pfEnd = plan.postFajrStartMin + plan.postFajrDurationMin;
    if (startMin < pfEnd && endMin > plan.postFajrStartMin) {
      const alt = suggestAlt();
      return {
        kind: 'nap',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت الراحة التعويضية المحمي (${formatMinutes12h(plan.postFajrStartMin, 'ar')} – ${formatMinutes12h(pfEnd, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }
  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    const qEnd = plan.qailulahStartMin + plan.qailulahDurationMin;
    if (startMin < qEnd && endMin > plan.qailulahStartMin) {
      const alt = suggestAlt();
      return {
        kind: 'nap',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت القيلولة المحمي (${formatMinutes12h(plan.qailulahStartMin, 'ar')} – ${formatMinutes12h(qEnd, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  // 5. Circadian & Energy Logic
  const energy = classifyScientificTaskEnergy(title);
  const effectiveBed = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;
  const windDownStart =
    plan.seasonalSleep?.windDownStartMin ?? Math.max(plan.wakeMin, effectiveBed - 55);
  const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;

  if (energy === 'deep_focus') {
    if (startMin < effectiveBed && endMin > windDownStart) {
      const alt = suggestAlt();
      return {
        kind: 'wind_down',
        itemTitle: title,
        requestedTime24,
        reasonAr: `نطاق التهدئة قبل النوم (${formatMinutes12h(windDownStart, 'ar')}) غير مناسب للتركيز العميق${
          alt.suggestedTime12Ar ? ` — الأفضل في ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
    if (plan.isFastingToday && startMin < maghribMin && endMin > maghribMin - 120) {
      const alt = suggestAlt();
      return {
        kind: 'fasting_curve',
        itemTitle: title,
        requestedTime24,
        reasonAr: `آخر ساعتين قبل المغرب في الصيام مخصصة للمهام الخفيفة${
          alt.suggestedTime12Ar ? ` — الأفضل نقل العمل العميق إلى ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
    if (deepWorkRanges.some(([ds, de]) => startMin < de + 15 && endMin + 15 > ds)) {
      const alt = suggestAlt();
      return {
        kind: 'focus_buffer',
        itemTitle: title,
        requestedTime24,
        reasonAr: `يلزم فاصل راحة 10–15 دقيقة بين جلسات التركيز العميق${
          alt.suggestedTime12Ar ? ` — أنسب وقت هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  } else if (energy === 'exercise') {
    const exerciseCutoff = Math.max(plan.wakeMin, effectiveBed - 120);
    if (startMin < effectiveBed && endMin > exerciseCutoff) {
      const alt = suggestAlt();
      return {
        kind: 'exercise_near_sleep',
        itemTitle: title,
        requestedTime24,
        reasonAr: `الرياضة قبل النوم بأقل من ساعتين تؤثر على جودة النوم${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  return null;
}

function getAnchorBoundsForGuard(
  anchor: DynamicHabitAnchor,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile: LifeProfile
): { start: number; end: number } | null {
  if (anchor === 'any-free-slot') return null;
  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;
  const pre = Math.max(5, profile.adhanLeadMinutes ?? 0);
  const post = Math.max(20, profile.prayerSilenceMinutes ?? 20);
  const bed = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;

  switch (anchor) {
    case 'after-fajr':
      return { start: fajr + Math.max(post, profile.fajrSilenceMinutes ?? 30), end: sunrise };
    case 'sunrise-light':
      return { start: sunrise + 15, end: Math.min(dhuhr - pre, sunrise + 75) };
    case 'duha':
      return { start: sunrise + 30, end: dhuhr - pre };
    case 'after-dhuhr':
      return { start: dhuhr + post, end: asr - pre };
    case 'after-asr':
      return { start: asr + post, end: maghrib - pre };
    case 'pre-maghrib':
      return { start: Math.max(asr + post, maghrib - 75), end: maghrib - pre };
    case 'after-maghrib':
      return { start: maghrib + post, end: isha - pre };
    case 'after-isha':
      return { start: isha + post, end: bed };
  }
}

/**
 * Programmatic Hard-Guard validator for Gemini scheduling proposals.
 * Rejects any calendar action, timed task, or habit placement colliding with
 * Prayers, Seasonal Sleep, Suhoor, Recovery Naps, or violating circadian/energy rules.
 */
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

export function extractPendingProposalFromFunctionCalls(
  fnCalls?: GeminiFunctionCall[],
  options?: {
    settingsSnapshot?: SettingsSnapshotContext;
    guardContext?: GeminiScheduleGuardContext;
    skipScheduleGuard?: boolean;
  }
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
