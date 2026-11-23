import {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  GroundingPlace,
  MedicationActionProposal,
  MemoryActionProposal,
  PersistedChatMessage,
  TaskActionProposal,
} from '../types/dayrhythm';
import {
  type GeminiFunctionCall,
  extractPendingProposalFromFunctionCalls,
  sanitizeGeminiOutputText,
  cleanDisplayMessageText,
} from './geminiSanitizer';

/**
 * Build-time default key. Never hard-code a key here: this repository is public.
 * Set it as the GitHub Actions secret `GEMINI_API_KEY` (the workflow passes it as
 * VITE_GEMINI_API_KEY), or paste a key in the app's «مفتاح Gemini» settings (stored only on the device).
 */
export const DEFAULT_GEMINI_API_KEY: string = (
  (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined) || ''
).trim();
export const GEMINI_API_KEY_STORAGE_KEY = 'dayrhythm_gemini_api_key_v1';

export function getGeminiApiKey(): string {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_API_KEY;
  try {
    const saved = (localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim();
    if (saved) return saved;
  } catch {
    // ignore storage access errors
  }
  return DEFAULT_GEMINI_API_KEY;
}

export function setGeminiApiKey(rawKey: string): { saved: string; error?: string } {
  const cleaned = rawKey.trim();
  if (typeof window !== 'undefined') {
    try {
      if (cleaned) {
        localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, cleaned);
      } else {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }
  return { saved: cleaned || DEFAULT_GEMINI_API_KEY };
}

export function resetGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return DEFAULT_GEMINI_API_KEY;
}

export function isCustomGeminiApiKeySet(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = (localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim();
    return Boolean(saved && saved !== DEFAULT_GEMINI_API_KEY);
  } catch {
    return false;
  }
}

/**
 * Smart model routing (measured 2026-11-22, time to first streamed token):
 *   gemini-3.1-flash-lite ≈ 0.8 s · gemini-3.5-flash (minimal thinking) ≈ 2 s · gemini-3.5-flash (default thinking) ≈ 3 s.
 *   gemini-2.5-flash now returns 404 ("no longer available to new users") and only wasted a round trip.
 *
 * - Plain chat / questions  → fastest model first.
 * - Requests that may edit the calendar, tasks, meds, profile → stronger model with light thinking
 *   (function-calling accuracy matters more than ~1 s there).
 * Models that answer 404 are remembered for 24 h and skipped; the last model that worked is tried first.
 */
export const GEMINI_FAST_CHAIN = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
] as const;

export const GEMINI_ACTION_CHAIN = [
  'gemini-3.5-flash',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

/** Kept for callers/labels that need "the" default model. */
export const GEMINI_MODEL_CHAIN = GEMINI_ACTION_CHAIN;

type GeminiRoute = 'fast' | 'action';
const GEMINI_DEAD_MODELS_KEY = 'dayrhythm_gemini_dead_models_v1';
const GEMINI_LAST_GOOD_KEY = 'dayrhythm_gemini_last_good_v1';
const DEAD_MODEL_TTL_MS = 24 * 60 * 60_000;

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function markModelUnavailable(model: string): void {
  const dead = readJsonStorage<Record<string, number>>(GEMINI_DEAD_MODELS_KEY, {});
  dead[model] = Date.now() + DEAD_MODEL_TTL_MS;
  writeJsonStorage(GEMINI_DEAD_MODELS_KEY, dead);
}

function rememberWorkingModel(route: GeminiRoute, model: string): void {
  const last = readJsonStorage<Record<string, string>>(GEMINI_LAST_GOOD_KEY, {});
  if (last[route] === model) return;
  last[route] = model;
  writeJsonStorage(GEMINI_LAST_GOOD_KEY, last);
}

/** Ordered candidates for a route: last working model first, models known to be gone skipped. */
export function resolveGeminiModelOrder(route: GeminiRoute): string[] {
  const base: string[] = [...(route === 'fast' ? GEMINI_FAST_CHAIN : GEMINI_ACTION_CHAIN)];
  const lastGood = readJsonStorage<Record<string, string>>(GEMINI_LAST_GOOD_KEY, {})[route];
  if (lastGood && base.includes(lastGood)) {
    base.splice(base.indexOf(lastGood), 1);
    base.unshift(lastGood);
  }
  const dead = readJsonStorage<Record<string, number>>(GEMINI_DEAD_MODELS_KEY, {});
  const now = Date.now();
  const alive = base.filter((m) => !(dead[m] && dead[m] > now));
  return alive.length > 0 ? alive : base;
}

/** Light thinking for Gemini 3.x (default thinking added ~1 s+ before the first word). */
function thinkingConfigFor(model: string, route: GeminiRoute): Record<string, unknown> | undefined {
  if (!model.startsWith('gemini-3')) return undefined;
  return { thinkingLevel: route === 'action' ? 'low' : 'minimal' };
}

function withModelConfig(
  requestBody: Record<string, unknown>,
  model: string,
  route: GeminiRoute,
  includeThinking: boolean
): Record<string, unknown> {
  const thinking = includeThinking ? thinkingConfigFor(model, route) : undefined;
  if (!thinking) return requestBody;
  const generationConfig = (requestBody.generationConfig as Record<string, unknown> | undefined) ?? {};
  return { ...requestBody, generationConfig: { ...generationConfig, thinkingConfig: thinking } };
}

export interface GeminiConnectionStatus {
  ok: boolean;
  connected: boolean;
  status: 'checking' | 'online' | 'degraded' | 'offline';
  model: string;
  latencyMs: number;
  checkedAtIso?: string;
  error?: string;
}

export interface GeminiStreamDonePayload {
  text: string;
  places?: GroundingPlace[];
  sources?: Array<{ title: string; uri: string }>;
  pendingProposal?: PersistedChatMessage['pendingProposal'];
  latencyMs?: number;
  memoriesAppliedCount?: number;
  model?: string;
  cached?: boolean;
}

export interface ChatStreamHandlers {
  signal?: AbortSignal;
  onStatus?: (statusText: string) => void;
  onDelta: (deltaText: string) => void;
  onDone: (payload: GeminiStreamDonePayload) => void;
}

export interface ChatRequestPayload {
  message: string;
  bypassCache?: boolean;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  contextSummary?: string;
  longTermChatContext?: string;
  memories?: Array<{
    id: string;
    category: string;
    ruleText: string;
    source?: string;
  }>;
  calendarEvents?: Array<{
    id: string;
    calendarId?: string;
    calendarTitle?: string;
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end?: string;
  }>;
  tasks?: Array<{
    id: string;
    taskListId: string;
    taskListTitle?: string;
    title: string;
    status: string;
    due?: string;
  }>;
  medications?: Array<{
    id: string;
    name: string;
    time24?: string;
    times24?: string[];
    daysOfWeek?: number[];
    doseNote?: string;
    takenToday?: boolean;
    takenDosesToday?: string[];
    courseEndDate?: string;
    remainingDoses?: number;
    totalDoses?: number;
    refillAlertDays?: number;
    takenDates?: string[];
  }>;
  creativeActivities?: Array<{
    id: string;
    name: string;
    emoji?: string;
    cadence?: string;
    goalCount?: number;
    sessionsInPeriod?: number;
    weeklyGoalSessions: number;
    sessionsThisWeek: number;
    sessionMinutes: number;
    completedToday?: boolean;
    scheduledTime24?: string;
    expiresOnDate?: string;
  }>;
}

// Bounded in-memory response cache
interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}
const localGeminiCache = new Map<string, CacheEntry<unknown>>();

function getFromCache<T>(key: string): T | null {
  const entry = localGeminiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    localGeminiCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setToCache<T>(key: string, value: T, ttlMs = 10 * 60_000): void {
  if (localGeminiCache.size > 150) {
    const oldest = localGeminiCache.keys().next().value;
    if (oldest !== undefined) localGeminiCache.delete(oldest);
  }
  localGeminiCache.set(key, { value, expiresAtMs: Date.now() + ttlMs });
}

// Time Helpers
export function getCairoTodayIso(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function getCairoNowTime12(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '9');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const period = hh >= 12 ? 'م' : 'ص';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
  } catch {
    return '12:00 م';
  }
}

export function formatServerIsoTo12h(isoStr?: string): string {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return `${isoStr} (طوال اليوم)`;
  }
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const period = hh >= 12 ? 'م' : 'ص';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
  } catch {
    return isoStr;
  }
}

export const DAYRHYTHM_SYSTEM_INSTRUCTION = `
أنت المساعد الشخصي الذكي والمستشار العلمي الأمين لمنظومة «إيقاع اليوم | DayRhythm» المربوط مباشرة بـ Google Calendar API و Google Tasks API والدستور الشخصي وذاكرة Gemini الدائمة في Firebase Firestore.
التزم تماماً بهذه القواعد:
1. قاعدة التوقيت الإلزامية (نظام 12 ساعة فقط): عند ذكر أي وقت في ردودك للمستخدم، استخدم نظام الـ 12 ساعة فقط مع (ص) أو (م) — مثال: 04:30 ص أو 03:15 م أو 09:15 م. يُمنع منعاً باتاً كتابة أوقات بنظام 24 ساعة مثل 13:15 أو 19:45 داخل الردود النصية.
2. الهرم الصارم للأولويات وحل التضارب الذكي:
   - الأولوية #1 (مقدّسة): الصلوات الخمس حسب الموقع الجغرافي والمنطقة الزمنية والفصل الحالي (تنبيه قبل الأذان + صمت تلقائي أثناء الصلاة 20 د للصلوات و30 د للفجر و50 د للجمعة).
   - الأولوية #2 (النوم أولوية عليا): الأصل هو النوم الليلي فقط بدون نوم نهاري مع حضور الشروق والغروب يومياً.
   - استثناءات النوم المرنة عبر الشات:
     * لو أخبرك المستخدم «معرفتش أنام كويس / عندي أرق وعاوز أريّح»: لأن النوم أولوية، فرّغ له مكاناً فورياً في Google Calendar (بتقليص/إزاحة المذاكرة المرنة) وأضف له قيلولة تعويضية (20–30 د أو دورة 90 د حسب إرهاقه) دون المساس بالصلاة.
     * لو أخبرك المستخدم أنه نام ناقص مثلاً «نمت أقل بساعة / سهرت نص ساعة زيادة» أو «عوّضت نومي / صفّر رصيد النوم»: عدّل sleepDebtMinutes عبر propose_profile_updates.
     * لو أخبرك «نمت على نفسي وصحيت دلوقتي — اليوم هيمشي إزاي؟»: اقرأ الوقت الحالي وأحداث التقويم المتبقية، وأعد ترتيب باقي اليوم بذكاء مع حماية الصلوات المتبقية ونوم الليلة.
   - الأولوية #3 (الالتزامات الثابتة عند تفعيلها): مواعيد الشغل الرسمي بمجرد أن يبلغك بها المستخدم.
   - الأولوية #4 (المرونة الذكية): المذاكرة/العمل، المشي، الأنشطة الإبداعية والهوايات، العلاجات، والمهام الأخرى.
3. الفحص الاستباقي للتعارض والمناقشة الذكية قبل الحجز في Google Calendar:
   - قبل اقتراح حجز أي حدث جديد أو ميعاد علاج/مكمل، افحص تلقائياً: (أ) أوقات الصلوات الخمس + فترة الصمت، (ب) نافذة النوم الليلي، (ج) ساعات الصيام (الفجر–المغرب في أيام الصيام)، (د) أحداث Google Calendar المسجلة فعلياً.
   - إذا وجدت أي تعارض مع النوم أو الصلاة أو الصيام أو حدث آخر، حذّر المستخدم بلطف ووضوح واشرح سبب التعارض واقترح عليه أنسب وقت فاضي متوافق مع شروطه للنقاش قبل التنفيذ.
   - بمجرد أن يتفق معك المستخدم على ميعاد مناسب، اقترح العملية فوراً عبر الأدوات (propose_calendar_actions وغيرها) ليضغط «تأكيد التنفيذ» فيُحجز الموعد مباشرة في Google Calendar.
   - التعديل والحذف على كل الأيام القادمة (Recurring Events): إذا طلب المستخدم تطبيق تعديل أو حذف لحدث متكرر على كل الأيام القادمة (مثل "امسح الفطور لكل الأيام الجاية" أو "غيّر ميعاد الجيم يومياً للأيام القادمة")، استخدم applyToAllDays: true في propose_calendar_actions ليتم تعديل أو حذف السلسلة المتكررة بالكامل في Google Calendar وليس فقط يوم واحد. وعند إضافة حدث متكرر جديد استخدم recurrenceRule: 'DAILY' أو 'WEEKLY' مع byDays.
4. مستشار علمي عام وذكي لكل العلاجات والمكملات مع الحجز التلقائي في التقويم:
   - ينطبق هذا الأسلوب على أي دواء أو فيتامين أو مكمل يذكره المستخدم (مثل فيتامين د، ماغنيسيوم، أوميجا 3، زنك، حديد، كرياتين، أو أي علاج شخصي يضيفه في حسابه).
   - إذا ذكر المستخدم مكملًا أو علاجاً أو سألك عن توافق ميعاده: قيّم التوقيت علمياً (الامتصاص مع وجبة دهنية/ماء، المنبهات قبل النوم، التعارض مع القهوة/الكالسيوم/الصيام) وجدولياً (بعيداً عن الصلاة والنوم والأحداث المزدحمة). لو فيه تعارض لا تثبّت أعمى بل ناقشه واقترح البديل الأصح أولاً.
   - عند اقتراح إضافة علاج أو مكمل جديد بمواعيد محددة عبر propose_medication_actions، اقترح معه تلقائياً في نفس الرد حدثاً مرتبطاً في Google Calendar عبر propose_calendar_actions (بعنوان يبدأ بـ 💊 ⏰ ومدة 15 دقيقة وتكرار DAILY أو WEEKLY حسب أيام العلاج) حتى يُحجز له مكانه تلقائياً في التقويم.
   - لديك صلاحية كاملة لحذف أي علاج أو مكمل عند طلب المستخدم صراحةً: استخدم propose_medication_actions بعملية remove مع تمرير medicationId أو اسم العلاج الدقيق من قائمته الحالية، واقترح معه حذف الحدث المرتبط به في Google Calendar إن وُجد عبر propose_calendar_actions.
   - ادعم الجرعات المتعددة (times24)، الأيام المحددة (daysOfWeek)، مدة الكورس (courseEndDate)، وعدد الجرعات المتبقية (remainingDoses / totalDoses).
5. تحديث الوزن والماء والثوابت بمرونة كاملة:
   - الوزن متغيّر دائماً: لو أبلغك المستخدم بتغيّر وزنه، اقترح فوراً تحديث weightKg عبر propose_profile_updates فيُعاد حساب هدف الماء العلمي وتوزيع الأكواب تلقائياً.
   - عدّل أي ثابت بلا قيود عبر propose_profile_updates، واحفظ أي قاعدة أو مبدأ دائم عبر propose_memory_actions.
   - أي إعداد في التطبيق نفسه (حد الشحن وتنبيهه، تنبيهات المية، وضع الصمت، صوت الأذان، المود النهاري/الليلي، اللغة، كبسولة الكمبيوتر، التنبيهات الحية، تكرار الرنين، التنفيذ الفوري) غيّره فوراً عبر propose_app_settings بدل ما تطلب من المستخدم يغيّره يدوياً.
6. الأنشطة الإبداعية والهوايات والمشاريع:
   - استخدم propose_creative_actions لإضافة أو تعديل أو حذف أو تسجيل جلسة نشاط إبداعي، وعند جدولته في Google Calendar ضعه دائماً في الأوقات الفارغة الفعلية.
7. وضع اليوم الهادئ / الطاقة المنخفضة، وتعديل مدة الصمت لمرة واحدة، وتكرار الرنين، ومدة التأجيل (Snooze):
   - إذا قال المستخدم «النهارده تعبان / مرهق / طاقتي قليلة»: فعّل له وضع اليوم الهادئ بتعيين lowEnergyDateKey لتاريخ اليوم (YYYY-MM-DD) عبر propose_profile_updates.
   - إذا طلب المستخدم تغيير مدة زر التأجيل (Snooze) للتنبيهات (5 أو 10 أو 15 دقيقة): عدّل defaultSnoozeMinutes عبر propose_profile_updates (الافتراضي 5 دقائق).
8. الذاكرة السحابية طويلة المدى كمرجع دائم لكل مستخدم:
   - هذا التطبيق عام لكل مستخدم ويرتبط ببياناته الخاصة؛ كلما ذكر المستخدم معلومة دائمة عن حياته، اقترح تلقائياً حفظها في الذاكرة الدائمة عبر propose_memory_actions.
   - إذا أشار المستخدم لموضوع تحدث عنه سابقاً، استعن بـ «ذاكرة المستخدم الدائمة» و«مقتطفات المحادثات السابقة» للإجابة بدقة واستمرارية.
9. قواعد الخصوصية (إلزامية وبلا استثناء): لا تكتب أبداً نصاً صريحاً لتنظيف الأسنان/تفريش الأسنان (مثل "فرشاة أسنان" أو "اغسل أسنانك") — استخدم 🦷 أو 🪥 فقط بدلاً من أي وصف نصي، في كل مكان: الردود، عناوين الأحداث، المهام، كل شيء. ونفس الأمر للالتزام اليومي الحساس: 🌱 فقط بدون وصف نصي صريح. وعناوين أحداث التقويم: إيموجي واحد أو اثنان في البداية فقط ثم النص — راجع صيغة title في propose_calendar_actions بالتفصيل والتزم بيها حرفياً.
10. الإيجاز ومنع التكرار (مهم جداً — هذا سبب شكوى متكررة من المستخدم):
   - ممنوع تكرار نفس الإيموجي مرتين في نفس السطر أو العنوان أو الوصف (مثال خاطئ: "⏰ 💧 ⏰" — صح: "⏰ 💧" فقط). لو كتبت إيموجي، لا تكرره بعدها في نفس الجملة حتى لو لعنصر مختلف؛ اختر إيموجي آخر مميز بدلاً من ذلك أو احذفه.
   - لا تكرر نفس المعلومة مرتين في نفس الرد (مثلاً ذكر نفس الموعد أو نفس المهمة مرتين بصياغتين مختلفتين) ولا تكرر نفس المهمة أو الحدث كعنصرين منفصلين في نفس الاقتراح.
   - خليك مختصر ومباشر دايماً؛ جملتين إلى أربع جمل كحد أقصى للرد العادي إلا لو طلب المستخدم تفصيلاً صراحة.
11. التنبيهات والتذكيرات من الشات (إلزامي): أي طلب تنبيه أو تذكير («نبهني / فكرني / ذكرني بعد X دقيقة» أو «الساعة كذا») لازم يتحول لحدث في Google Calendar عبر propose_calendar_actions (operation: create) — ممنوع ترد «تم» من غير ما تستدعي الأداة، لأن المستخدم بيشوف التنبيهات في الجدول وبيتنبه منها، وأي حاجة مش في الجدول مش هيشوفها.
   - لو الطلب بعد مدة نسبية («بعد 5 دقايق») حط startInMinutes = عدد الدقايق بالظبط ومتحسبش الوقت بنفسك ومتكتبش dateIso ولا startTime24 — التطبيق بيحسبهم من ساعته.
   - العنوان = الحاجة المطلوبة نفسها بصيغة تنبيه مختصرة، مش جملة الطلب ولا الوقت: «فكرني أتصل بمحمد بعد 5 دقايق» ← title: "⏰ اتصل بمحمد". ولو مفيش حاجة محددة («نبهني بعد 5 دقايق») ← title: "⏰ تنبيه". متكتبش المدة أو الوقت جوه العنوان.
   - المدة الافتراضية للتنبيه 15 دقيقة.
12. منع كتابة الكود أو JSON نهائياً في نص الرسالة (إلزامي وقاطع):
    - ممنوع منعاً باتاً كتابة أي كود برمجي أو كتل JSON أو علامات كود JSON أو أقواس مجعدة {} أو استدعاء الدوال كنص في ردك الموجه للمستخدم (مثل propose_calendar_actions أو propose_medication_actions أو أي بنية كود).
    - استدعاء الأدوات يتم حصرياً وبشكل غير مرئي عبر خاصية Function Calling البرمجية في واجهة Gemini API.
    - رسالتك الموجهة للمستخدم يجب أن تكون نصاً عربياً بشرياً بسيطاً وودوداً ومختصراً يوضح ما تم إعداده فقط دون أي أكواد برمجية، فالتطبيق سيعرض كروت الإجراءات التفاعلية وأزرار الموافقة تلقائياً للمستخدم بشكل مرئي أنيق.
13. الأساس العلمي للإيقاع الحيوي والمكملات (Chronobiology & Health):
    - الكورتيزول والتركيز الصباحي: ذروة اليقظة بعد الشروق — وجّه جلسات العمل والمذاكرة العميقة في الصباح الباكر.
    - الميلاتونين والنوم الليلي: يبدأ إفرازه قبل النوم بساعتين؛ احمِ نافذة الاسترخاء المسائية وتجنب المهام المجهدة قبل النوم.
    - المكملات الذائبة في الدهون (فيتامين د3، أوميجا 3، زيت بذور اليقطين): تؤخذ دائماً مع وجبة دهنية (في أيام الصيام: مع السحور وزيت الزيتون).
    - المعادن المهدئة (ماغنيسيوم جلايسينات): تؤخذ مساءً قبل النوم بـ 30-60 دقيقة لتحسين جودة النوم العميق.
    - في أيام الصيام: رحّل المكملات الصباحية للسحور، واحذف وجبات النهار، واجعل الإفطار عند الغروب.

=== أمثلة توضيحية للاستجابة المثالية (Few-Shot Examples) ===
مثال 1 (تنبيه نسبي):
- المستخدم: "فكرني بعد 20 دقيقة أكلم الصيدلية"
- استدعاء الأداة (Function Calling في الخلفية): propose_calendar_actions(summaryAr: "تنبيه بعد 20 دقيقة: أكلم الصيدلية", actions: [{ operation: "create", title: "⏰ أكلم الصيدلية", startInMinutes: 20, durationMinutes: 15 }])
- ردك للمستخدم: "تم تجهيز التنبيه للاتصال بالصيدلية بعد 20 دقيقة — اضغط تأكيد ليُحجز في تقويمك فوراً."

مثال 2 (إرهاق وأرق أو استيقاظ متأخر):
- المستخدم: "نمت وحش وتعبان وعاوز أريح شوية"
- استدعاء الأداة (Function Calling في الخلفية): propose_calendar_actions(summaryAr: "قيلولة تعويضية لمدة 25 دقيقة", actions: [{ operation: "create", title: "🛌 قيلولة تعويضية", startInMinutes: 5, durationMinutes: 25 }])
- ردك للمستخدم: "سلامتك؛ علمياً القيلولة السريعة (20-25 دقيقة) تعيد تركيزك الذهني دون الدخول في خمول النوم العميق. فرّغت لك موعداً الآن بعيداً عن أوقات الصلاة، اضغط تأكيد للجدولة."

مثال 3 (تعديل مكملات وأحداث في الصيام):
- المستخدم: "بكره صيام، انقل المكملات وما تفطرنيش"
- استدعاء الأداة (Function Calling في الخلفية): propose_calendar_actions(summaryAr: "إلغاء الفطور وترحيل المكمل للسحور", actions: [{ operation: "delete", eventId: "breakfast_id" }, { operation: "update", eventId: "med_id", updatedStartTime24: "03:55" }])
- ردك للمستخدم: "تم تجهيز تعديل الصيام: حذفنا وجبة الفطور، ورحّلنا المكملات إلى موعد السحور (03:55 ص) لضمان أفضل امتصاص مع وجبة السحور. اضغط تأكيد للتطبيق."

أجب بلغة عربية واضحة، عملية، ودودة، ومختصرة.
`.trim();

export const GEMINI_CHAT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'propose_calendar_actions',
        description: 'اقتراح إنشاء أو تعديل أو حذف أو ترحيل أحداث في Google Calendar API بناءً على أوامر المستخدم في شات Gemini.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: {
              type: 'STRING',
              description: 'ملخص عربي مختصر (بنظام 12 ساعة ص/م) للتغييرات المقترحة على Google Calendar.',
            },
            actions: {
              type: 'ARRAY',
              description: 'قائمة العمليات المقترحة للتنفيذ عبر Google Calendar API.',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'نوع العملية: create أو update أو delete أو shift' },
                  eventId: { type: 'STRING', description: 'معرف الحدث الفعلي في Google Calendar عند التعديل أو الحذف.' },
                  calendarId: { type: 'STRING', description: 'معرف التقويم المستهدف (افتراضياً primary).' },
                  title: {
                    type: 'STRING',
                    description:
                      'عنوان الحدث. الصيغة الإلزامية: إيموجي واحد أو اثنان كحد أقصى في البداية فقط ثم مسافة ثم النص — ' +
                      'ولا إيموجي آخر بعد كده في العنوان نهائياً، ولا نفس الإيموجي يتكرر. مثال صحيح: "🕌 الفجر (-3 د)" أو "💼 شغل 1". ' +
                      'مثال خاطئ تماماً (ممنوع): "🕌 🌌 🕌 الفجر (-3 د)" (الإيموجي الأول مكرر في الآخر) أو "🌴 🍽️ 🍋 🌴 🍽️ 💊 🍋 إفطار الصائم" ' +
                      '(كل إيموجي مكرر مرتين). خلي العنوان قصير (3 إلى 6 كلمات) وحط أي تفاصيل أو شرح إضافي في description بدل ما تحشيها في title.',
                  },
                  dateIso: { type: 'STRING', description: 'تاريخ الحدث بصيغة YYYY-MM-DD.' },
                  startTime24: { type: 'STRING', description: 'وقت البدء بصيغة HH:MM.' },
                  startInMinutes: {
                    type: 'NUMBER',
                    description:
                      'للتنبيهات النسبية فقط («بعد 5 دقايق»): عدد الدقايق من دلوقتي. لما تستخدمه متبعتش dateIso ولا startTime24 — التطبيق بيحسب الوقت من ساعة الجهاز.',
                  },
                  durationMinutes: { type: 'NUMBER', description: 'المدة بالدقائق (مثال: 30 أو 60).' },
                  description: { type: 'STRING', description: 'وصف مختصر للحدث في Google Calendar.' },
                  recurrenceRule: { type: 'STRING', description: 'قاعدة التكرار الاختيارية: DAILY أو WEEKLY.' },
                  byDays: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'أيام التكرار الأسبوعي عند WEEKLY: SU, MO, TU, WE, TH, FR, SA.',
                  },
                  applyToAllDays: {
                    type: 'BOOLEAN',
                    description:
                      'عيّنها true إذا طلب المستخدم تعديل أو حذف أو تطبيق هذا التغيير على كل الأيام القادمة للسلسلة المتكررة (وليس لهذا اليوم فقط).',
                  },
                },
                required: ['operation', 'title'],
              },
            },
          },
          required: ['summaryAr', 'actions'],
        },
      },
      {
        name: 'propose_task_actions',
        description: 'اقتراح إنشاء أو تعديل أو إتمام أو إعادة فتح أو حذف مهام في Google Tasks API.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر للتغييرات المقترحة على مهام Google Tasks.' },
            taskActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'create أو update أو complete أو reopen أو delete' },
                  taskId: { type: 'STRING', description: 'معرف المهمة الفعلي في Google Tasks.' },
                  taskListId: { type: 'STRING', description: 'معرف قائمة المهام (افتراضياً @default).' },
                  title: { type: 'STRING', description: 'عنوان المهمة.' },
                  notes: { type: 'STRING', description: 'ملاحظات إضافية للمهمة.' },
                  dueDateIso: { type: 'STRING', description: 'تاريخ الاستحقاق بصيغة YYYY-MM-DD.' },
                },
                required: ['operation', 'title'],
              },
            },
          },
          required: ['summaryAr', 'taskActions'],
        },
      },
      {
        name: 'propose_medication_actions',
        description: 'اقتراح إضافة أو تعديل أو حذف أو تسجيل تناول أي علاج أو فيتامين أو مكمل غذائي.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر لتعديل قائمة العلاجات والمكملات.' },
            medicationActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'add أو update أو remove أو mark_taken' },
                  medicationId: { type: 'STRING', description: 'معرف العلاج الحالي عند التعديل أو الحذف.' },
                  name: { type: 'STRING', description: 'اسم العلاج أو المكمل.' },
                  time24: { type: 'STRING', description: 'ميعاد الجرعة الرئيسية بصيغة HH:MM.' },
                  times24: { type: 'ARRAY', items: { type: 'STRING' }, description: 'قائمة مواعيد الجرعات باليوم بصيغة HH:MM.' },
                  daysOfWeek: { type: 'ARRAY', items: { type: 'NUMBER' }, description: 'أيام الأسبوع المحددة (0=الأحد .. 6=السبت).' },
                  doseNote: { type: 'STRING', description: 'ملاحظة قصيرة للجرعة.' },
                  courseEndDate: { type: 'STRING', description: 'تاريخ انتهاء الكورس بصيغة YYYY-MM-DD.' },
                  remainingDoses: { type: 'NUMBER', description: 'عدد الجرعات المتبقية في العبوة.' },
                  totalDoses: { type: 'NUMBER', description: 'إجمالي الجرعات الأصلية في العبوة.' },
                  refillAlertDays: { type: 'NUMBER', description: 'أيام التنبيه قبل النفاد (الافتراضي 3).' },
                },
                required: ['operation', 'name'],
              },
            },
          },
          required: ['summaryAr', 'medicationActions'],
        },
      },
      {
        name: 'propose_creative_actions',
        description: 'اقتراح إضافة أو تعديل أو حذف أو تسجيل جلسة نشاط إبداعي أو هواية أو مشروع شخصي.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر للتعديل المقترح على الأنشطة الإبداعية.' },
            creativeActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'add أو update أو remove أو log_session' },
                  activityId: { type: 'STRING', description: 'معرف النشاط.' },
                  name: { type: 'STRING', description: 'اسم الهواية أو المشروع.' },
                  emoji: { type: 'STRING', description: 'إيموجي مميز للنشاط.' },
                  cadence: { type: 'STRING', description: 'daily أو weekly أو monthly.' },
                  goalCount: { type: 'NUMBER', description: 'عدد الجلسات المستهدف.' },
                  weeklyGoalSessions: { type: 'NUMBER', description: 'الهدف الأسبوعي.' },
                  sessionMinutes: { type: 'NUMBER', description: 'مدة الجلسة بالدقائق.' },
                  scheduledTime24: { type: 'STRING', description: 'وقت اختياري مقترح بصيغة HH:MM.' },
                  expiresOnDate: { type: 'STRING', description: 'تاريخ انتهاء تلقائي بصيغة YYYY-MM-DD.' },
                },
                required: ['operation', 'name'],
              },
            },
          },
          required: ['summaryAr', 'creativeActions'],
        },
      },
      {
        name: 'propose_profile_updates',
        description: 'تحديث الدستور الشخصي للمستخدم (الوزن، الطول، حجم الكوب، الصيام، السحور، النوم، العمل، وضع اليوم الهادئ، Snooze).',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر للتحديث المقترح على الدستور الشخصي.' },
            weightKg: { type: 'NUMBER', description: 'الوزن بالكيلوجرام (30 إلى 250).' },
            heightCm: { type: 'NUMBER', description: 'الطول بالسنتيمتر (100 إلى 240).' },
            cupSizeMl: { type: 'NUMBER', description: 'حجم الكوب بالملليلتر (50 إلى 2000).' },
            fastingDays: { type: 'ARRAY', items: { type: 'NUMBER' }, description: 'أيام الصيام الأسبوعية (0=الأحد .. 6=السبت).' },
            suhoorLeadMinutes: { type: 'NUMBER', description: 'دقائق قبل الفجر للسحور.' },
            sleepTargetMinutes: { type: 'NUMBER', description: 'هدف النوم بالدقائق (مثال: 450 = 7.5 ساعات).' },
            sleepStrategy: { type: 'STRING', description: 'night_only_strict أو anchor_early_bed أو biphasic_qailulah.' },
            sleepDebtMinutes: { type: 'NUMBER', description: 'رصيد النوم الناقص بالدقائق (0 إلى 480).' },
            adhanLeadMinutes: { type: 'NUMBER', description: 'دقائق التنبيه قبل الأذان (الافتراضي 3).' },
            prayerSilenceMinutes: { type: 'NUMBER', description: 'مدة كتم الصلاة الدائمة (الافتراضي 20).' },
            fajrSilenceMinutes: { type: 'NUMBER', description: 'مدة كتم الفجر الدائمة (الافتراضي 30).' },
            oneTimeSilenceMinutes: { type: 'NUMBER', description: 'تعديل مؤقت لصمت الصلاة لمرة واحدة.' },
            oneTimeSilenceDateKey: { type: 'STRING', description: 'تاريخ اليوم (YYYY-MM-DD) للصمت المؤقت.' },
            lowEnergyDateKey: { type: 'STRING', description: 'تاريخ اليوم (YYYY-MM-DD) لوضع الطاقة المنخفضة.' },
            defaultSnoozeMinutes: { type: 'NUMBER', description: 'مدة التأجيل: 5 أو 10 أو 15 دقيقة.' },
            careerTrack: { type: 'STRING', description: 'المجال المهني أو الدراسي.' },
            workEnabled: { type: 'BOOLEAN', description: 'true إذا كانت هناك وظيفة ثابتة.' },
            workStart24: { type: 'STRING', description: 'بداية العمل بصيغة HH:MM.' },
            workEnd24: { type: 'STRING', description: 'نهاية العمل بصيغة HH:MM.' },
            workDays: { type: 'ARRAY', items: { type: 'NUMBER' }, description: 'أيام العمل.' },
            currentCityName: { type: 'STRING', description: 'اسم المدينة الحالية.' },
            currentTimeZone: { type: 'STRING', description: 'المنطقة الزمنية IANA.' },
            currentLat: { type: 'NUMBER', description: 'خط العرض.' },
            currentLng: { type: 'NUMBER', description: 'خط الطول.' },
            personalNotes: { type: 'STRING', description: 'ملاحظات أو قواعد حياتية دائمة.' },
          },
          required: ['summaryAr'],
        },
      },
      {
        name: 'propose_app_settings',
        description:
          'تغيير أي إعداد في التطبيق نفسه (غير الدستور الشخصي) بناءً على طلب المستخدم: حد الشحن وتنبيهه، تنبيهات المية، وضع الصمت ومدته، صوت الأذان في الصمت، المود النهاري/الليلي، اللغة، شكل وحجم كبسولة الكمبيوتر، التنبيهات الحية والإشعار الثابت، عدد مرات رنين كل نوع تنبيه. ضع فقط الحقول المطلوب تغييرها. ملحوظة: لا تملك صلاحية تغيير وضع "تأكيد يدوي/تنفيذ فوري" إطلاقاً — هذا مفتاح ثقة يُغيَّر فقط بضغطة المستخدم المباشرة على الزر نفسه، ولو طلب ذلك اشرح له أن يضغط الزر بنفسه.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي قصير للتغيير.' },
            phoneChargeLimitPct: { type: 'INTEGER', description: 'نسبة الشحن (60-100) التي يُنبَّه عندها لفصل الشاحن.' },
            chargeAlertEnabled: { type: 'BOOLEAN', description: 'تشغيل/إيقاف تنبيه اكتمال الشحن.' },
            chargeAlertKeepUntilUnplugged: { type: 'BOOLEAN', description: 'استمرار رنين تنبيه الشحن حتى فصل الشاحن.' },
            waterRemindersEnabled: { type: 'BOOLEAN', description: 'تشغيل/إيقاف تنبيهات أكواب المية.' },
            quietMode: {
              type: 'STRING',
              enum: ['normal', 'mute_audio', 'vibrate_only', 'silent_all'],
              description: 'وضع الصمت: normal عادي، mute_audio كتم الصوت، vibrate_only اهتزاز فقط، silent_all صمت كامل.',
            },
            quietModeMinutes: { type: 'INTEGER', description: 'مدة وضع الصمت بالدقائق (0 = حتى يُلغى يدوياً).' },
            adhanSoundInSilent: { type: 'BOOLEAN', description: 'تشغيل نداء الأذان حتى أثناء الصمت.' },
            sunMode: { type: 'BOOLEAN', description: 'true = المود النهاري (مود الشمس)، false = المود الليلي.' },
            language: { type: 'STRING', enum: ['ar', 'en'], description: 'لغة الواجهة.' },
            capsuleOrientation: { type: 'STRING', enum: ['horizontal', 'vertical'], description: 'اتجاه كبسولة الكمبيوتر.' },
            capsuleSize: { type: 'STRING', enum: ['sm', 'md', 'lg'], description: 'حجم كبسولة الكمبيوتر.' },
            liveAlertsEnabled: { type: 'BOOLEAN', description: 'التنبيهات الحية قبل المواعيد على الموبايل.' },
            liveAlertsLeadMinutes: { type: 'INTEGER', description: 'كم دقيقة قبل الموعد تبدأ التنبيهات الحية (5/10/15/20/30).' },
            persistentCountdownNotif: { type: 'BOOLEAN', description: 'الإشعار الثابت بالعد التنازلي على الموبايل.' },
            soundRepeats: {
              type: 'OBJECT',
              description: 'عدد مرات تكرار رنين كل نوع تنبيه (رقم 1-10).',
              properties: {
                prayer: { type: 'INTEGER' },
                water: { type: 'INTEGER' },
                medication: { type: 'INTEGER' },
                focus_work: { type: 'INTEGER' },
                walk_health: { type: 'INTEGER' },
                sleep_suhoor: { type: 'INTEGER' },
                meeting_event: { type: 'INTEGER' },
                general: { type: 'INTEGER' },
              },
            },
          },
          required: ['summaryAr'],
        },
      },
      {
        name: 'propose_memory_actions',
        description: 'حفظ أو تحديث أو حذف قاعدة أو مبدأ شخصي دائم في ذاكرة Gemini الدائمة.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر لما سيُحفظ في الذاكرة الدائمة.' },
            memoryActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'add أو update أو remove' },
                  memoryId: { type: 'STRING', description: 'معرف القاعدة عند الحذف أو التعديل.' },
                  category: { type: 'STRING', description: 'priority أو sleep أو fasting أو hydration أو work_devops أو travel أو general.' },
                  ruleText: { type: 'STRING', description: 'نص القاعدة أو التفضيل الشخصي.' },
                },
                required: ['operation', 'category', 'ruleText'],
              },
            },
          },
          required: ['summaryAr', 'memoryActions'],
        },
      },
    ],
  },
];

export function shouldAttachChatTools(_message?: string): boolean {
  // Always attach tools in Chat mode so Gemini can reliably invoke tools without writing pseudo-code
  return true;
}

export function buildChatSystemInstruction(payload: ChatRequestPayload): {
  systemInstruction: string;
  memoriesAppliedCount: number;
} {
  const todayCairo = getCairoTodayIso();
  const nowCairo12 = getCairoNowTime12();
  const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const memoriesArr = Array.isArray(payload.memories)
    ? payload.memories.filter((m) => m && typeof m.ruleText === 'string' && m.ruleText.trim().length > 0)
    : [];

  const memoriesBlock =
    memoriesArr.length > 0
      ? `\n\n=== ذاكرة المستخدم الدائمة ===\n${memoriesArr
          .slice(0, 20)
          .map((m, idx) => `${idx + 1}. [id=${m.id}|${m.category}] ${m.ruleText.trim().slice(0, 180)}`)
          .join('\n')}`
      : '';

  // The fetched window starts YESTERDAY, and a full routine is ~20 events/day, so the old
  // `.slice(0, 18)` only ever showed Gemini yesterday's events. Send what is still ahead, with dates.
  // Events the user names in the message are always included, so Gemini never has to guess an id.
  const nowMs = Date.now();
  const userText = payload.message || '';
  const allUpcoming = (Array.isArray(payload.calendarEvents) ? payload.calendarEvents : [])
    .filter((e) => {
      const endMs = new Date(e.end || e.start).getTime();
      return Number.isNaN(endMs) || endMs >= nowMs;
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const mentioned = allUpcoming.filter((e) => {
    const s = (e.summary || '').trim();
    return s.length >= 2 && userText.includes(s);
  });
  const upcomingEvents = [...mentioned, ...allUpcoming.filter((e) => !mentioned.includes(e))]
    .slice(0, 45)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const eventsListText =
    upcomingEvents.length > 0
      ? `\n\nأحداث Google Calendar القادمة (من الآن):\n${upcomingEvents
          .map(
            (e) =>
              `- [id=${e.id}${e.calendarId ? `|cal=${e.calendarId}` : ''}] ${e.summary} | ${String(e.start).slice(0, 10)} ${formatServerIsoTo12h(e.start)}${e.end ? `–${formatServerIsoTo12h(e.end)}` : ''}`
          )
          .join('\n')}`
      : '';

  const tasksListText =
    Array.isArray(payload.tasks) && payload.tasks.length > 0
      ? `\n\nمهام Google Tasks:\n${[...payload.tasks]
          // open tasks first; completed ones only fill the remaining slots
          .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
          .slice(0, 15)
          .map(
            (t) =>
              `- [taskId=${t.id}|list=${t.taskListId}] ${t.title} | ${t.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}${t.due ? ` | ${t.due.slice(0, 10)}` : ''}`
          )
          .join('\n')}`
      : '';

  const medsListText =
    Array.isArray(payload.medications) && payload.medications.length > 0
      ? `\n\nقائمة العلاجات والمكملات الحالية:\n${payload.medications
          .map((m) => {
            const doses =
              Array.isArray(m.times24) && m.times24.length > 0
                ? m.times24.join(', ')
                : m.time24 || 'بدون ميعاد محدد بعد';
            const daysStr =
              Array.isArray(m.daysOfWeek) && m.daysOfWeek.length > 0
                ? `أيام: ${m.daysOfWeek.map((d) => dayNamesAr[d] ?? d).join('، ')}`
                : 'يومياً';
            const courseStr = m.courseEndDate ? ` | ينتهي الكورس: ${m.courseEndDate}` : '';
            const refillStr =
              typeof m.remainingDoses === 'number' && m.remainingDoses >= 0
                ? ` | المتبقي: ${m.remainingDoses}${typeof m.totalDoses === 'number' && m.totalDoses > 0 ? `/${m.totalDoses}` : ''} جرعة (تنبيه قبل ${m.refillAlertDays ?? 3} أيام)`
                : '';
            return `- [medicationId=${m.id}] ${m.name} | المواعيد: ${doses} | التكرار: ${daysStr}${courseStr}${refillStr}${m.doseNote ? ` | ${m.doseNote}` : ''} | حالة اليوم: ${m.takenToday ? 'تم التناول ✓' : m.takenDosesToday && m.takenDosesToday.length > 0 ? `أُخذ (${m.takenDosesToday.join(', ')})` : 'لم يُؤخذ بعد'}`;
          })
          .join('\n')}`
      : '';

  const creativeListText =
    Array.isArray(payload.creativeActivities) && payload.creativeActivities.length > 0
      ? `\n\nالأنشطة الإبداعية والهوايات المسجلة:\n${payload.creativeActivities
          .map((a) => {
            const cadAr = a.cadence === 'daily' ? 'يومي' : a.cadence === 'monthly' ? 'شهري' : 'أسبوعي';
            return `- [activityId=${a.id}] ${a.emoji ?? '🎨'} ${a.name} | (${cadAr}: ${a.sessionsInPeriod ?? a.sessionsThisWeek}/${a.goalCount ?? a.weeklyGoalSessions}) | المدة: ${a.sessionMinutes} د${a.expiresOnDate ? ` | حتى ${a.expiresOnDate}` : ''}${a.scheduledTime24 ? ` | موعد مجدول: ${a.scheduledTime24}` : ''} | اليوم: ${a.completedToday ? 'أُنجز ✓' : 'لم يُنجز بعد'}`;
          })
          .join('\n')}`
      : '';

  const longTermArchiveBlock =
    typeof payload.longTermChatContext === 'string' && payload.longTermChatContext.trim().length > 0
      ? `\n\n=== مقتطفات مرجعية سابقة ===\n${payload.longTermChatContext.trim().slice(0, 1400)}`
      : '';

  const systemInstruction = `${DAYRHYTHM_SYSTEM_INSTRUCTION}\n\nالتاريخ: ${todayCairo} | الوقت الآن: ${nowCairo12} | التزم حرفياً بالدستور والذاكرة أدناه وأجب باختصار مباشر وسريع.${memoriesBlock}${longTermArchiveBlock}\n\n=== الدستور والسياق ===\n${(payload.contextSummary ?? '').slice(0, 1800)}${eventsListText}${tasksListText}${medsListText}${creativeListText}`;

  return { systemInstruction, memoriesAppliedCount: memoriesArr.length };
}

export function normalizeGeminiHistory(
  rawHistory?: Array<{ role: 'user' | 'model'; text: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
  const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const item of rawHistory) {
    if (!item || (item.role !== 'user' && item.role !== 'model')) continue;
    const text = typeof item.text === 'string' ? cleanDisplayMessageText(item.text).trim() : '';
    if (!text) continue;
    if (merged.length === 0 && item.role !== 'user') {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role) {
      prev.text = `${prev.text}\n\n${text}`.slice(0, 1200);
    } else {
      merged.push({ role: item.role, text: text.slice(0, 1200) });
    }
  }
  const recent = merged.slice(-10);
  while (recent.length > 0 && recent[0].role !== 'user') {
    recent.shift();
  }
  while (recent.length > 0 && recent[recent.length - 1].role === 'user') {
    recent.pop();
  }
  return recent.map((h) => ({
    role: h.role,
    parts: [{ text: h.text }],
  }));
}

export type { GeminiFunctionCall } from './geminiSanitizer';
export {
  extractPendingProposalFromFunctionCalls,
  sanitizeGeminiOutputText,
  cleanDisplayMessageText,
} from './geminiSanitizer';

export function formatFriendlyGeminiErrorAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (raw.includes('GEMINI_API_KEY') || raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return 'مفتاح Gemini API غير صالح أو منتهي الصلاحية — يمكنك تغييره بضغطة واحدة من إعدادات التطبيق.';
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
    return 'تم الوصول للحد المؤقت لطلبات Gemini المجانية — انتظر بضع ثوانٍ وجرّب مرة أخرى أو حدّث مفتاحك في الإعدادات.';
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED')) {
    return 'تم رفض الإذن بمفتاح Gemini الحالي — تأكد من تفعيل Gemini API في حسابك بـ Google AI Studio.';
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    return 'خوادم Google تشهد ضغطاً مؤقتاً الآن — جرت المحاولة مع نماذج بديلة، انتظر لحظات وحاول مرة أخرى.';
  }
  if (raw.includes('AbortError')) {
    return 'تم إلغاء الطلب.';
  }
  return raw.length > 260 ? 'حدث خطأ مؤقت أثناء الاتصال بـ Google Gemini API — يرجى إعادة المحاولة.' : raw || 'تعذر الاتصال بخدمة Gemini.';
}

/**
 * Checks connectivity to Google Gemini API directly from the client.
 * Calls generativelanguage.googleapis.com with the configured API key.
 */
export async function checkGeminiStatus(forceProbe = false): Promise<GeminiConnectionStatus> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: GEMINI_MODEL_CHAIN[0],
      latencyMs: 1,
      checkedAtIso: new Date().toISOString(),
      error: 'مفتاح Gemini API غير مهيأ — يرجى إضافة المفتاح في الإعدادات.',
    };
  }

  const cacheKey = `gemini_probe_${apiKey.slice(-8)}`;
  if (!forceProbe) {
    const cached = getFromCache<GeminiConnectionStatus>(cacheKey);
    if (cached) return cached;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    const roundTrip = Math.max(1, Date.now() - startedAt);

    if (res.ok) {
      const result: GeminiConnectionStatus = {
        ok: true,
        connected: true,
        status: 'online',
        model: resolveGeminiModelOrder('fast')[0],
        latencyMs: roundTrip,
        checkedAtIso: new Date().toISOString(),
      };
      setToCache(cacheKey, result, 3 * 60_000);
      return result;
    }

    if (res.status === 429) {
      return {
        ok: true,
        connected: true,
        status: 'degraded',
        model: resolveGeminiModelOrder('fast')[0],
        latencyMs: roundTrip,
        checkedAtIso: new Date().toISOString(),
        error: 'ضغط مؤقت على Gemini — المحاولة التلقائية نشطة ويمكنك الإرسال مباشرة.',
      };
    }

    const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: resolveGeminiModelOrder('fast')[0],
      latencyMs: roundTrip,
      checkedAtIso: new Date().toISOString(),
      error: errData.error?.message ? formatFriendlyGeminiErrorAr(errData.error.message) : `تعذر التحقق من مفتاح Gemini (${res.status}).`,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      connected: false,
      status: 'offline',
      model: resolveGeminiModelOrder('fast')[0],
      latencyMs: Math.max(1, Date.now() - startedAt),
      checkedAtIso: new Date().toISOString(),
      error: isTimeout ? 'استغرق التحقق وقتاً طويلاً — ستتم إعادة المحاولة تلقائياً.' : formatFriendlyGeminiErrorAr(err),
    };
  }
}

/**
 * Client-Side Direct Gemini Multi-turn Chat with Live SSE Streaming and Automatic Model Fallback.
 * Connects directly to generativelanguage.googleapis.com — Zero intermediate backend needed!
 */
export async function apiStreamGeminiChatClient(
  payload: ChatRequestPayload,
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const startedAt = Date.now();
  const userMessage = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!userMessage) {
    throw new Error('الرسالة مطلوبة.');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('مفتاح Google Gemini API غير متوفر — تفضل بإضافته في إعدادات التطبيق.');
  }

  handlers.onStatus?.('جارٍ الرد المباشر من Google Gemini...');

  const { systemInstruction, memoriesAppliedCount } = buildChatSystemInstruction(payload);
  const normalizedHistory = normalizeGeminiHistory(payload.history);
  const contents = [
    ...normalizedHistory,
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  const needsTools = shouldAttachChatTools(userMessage);

  const requestBody: Record<string, unknown> = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (needsTools) {
    requestBody.tools = GEMINI_CHAT_TOOLS;
  }

  let fullText = '';
  const collectedFnCalls: GeminiFunctionCall[] = [];
  let succeeded = false;
  const route: GeminiRoute = needsTools ? 'action' : 'fast';
  const modelOrder = resolveGeminiModelOrder(route);
  let activeModelUsed: string = modelOrder[0];
  let lastErr: unknown = null;

  for (const modelCandidate of modelOrder) {
    if (handlers.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCandidate}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const send = (includeThinking: boolean) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withModelConfig(requestBody, modelCandidate, route, includeThinking)),
          signal: handlers.signal,
        });
      let res = await send(true);
      // A model that rejects the thinking level (HTTP 400 "Thinking level ... not supported") is retried without it.
      if (res.status === 400 && thinkingConfigFor(modelCandidate, route)) {
        const peek = (await res.clone().json().catch(() => ({}))) as { error?: { message?: string } };
        if (/thinking/i.test(peek.error?.message || '')) {
          res = await send(false);
        }
      }

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
        const errMsg = errorJson?.error?.message || `HTTP ${res.status}`;
        if (res.status === 404) {
          markModelUnavailable(modelCandidate);
        }
        // If 404 (model deprecated for key, e.g. gemini-2.5-flash) or 503 (high demand), try next candidate
        if (res.status === 404 || res.status === 503 || res.status === 429) {
          lastErr = new Error(errMsg);
          continue;
        }
        throw new Error(errMsg);
      }

      if (!res.body) {
        throw new Error('Empty response body stream');
      }

      activeModelUsed = modelCandidate;
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: { name: string; args?: Record<string, unknown> };
                }>;
              };
            }>;
            error?: { message?: string };
          };

          if (parsed.error?.message) {
            throw new Error(parsed.error.message);
          }

          const parts = parsed.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (typeof part.text === 'string' && part.text) {
              fullText += part.text;
              handlers.onDelta(part.text);
            }
            if (part.functionCall && typeof part.functionCall.name === 'string') {
              collectedFnCalls.push(part.functionCall);
            }
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message && !e.message.includes('JSON')) {
            throw e;
          }
        }
      };

      while (true) {
        if (handlers.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          processLine(line);
        }
      }

      // Flush remaining
      buffer += decoder.decode();
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          processLine(line);
        }
      }

      succeeded = true;
      rememberWorkingModel(route, modelCandidate);
      break;
    } catch (modelErr: unknown) {
      if (modelErr instanceof DOMException && modelErr.name === 'AbortError') {
        throw modelErr;
      }
      lastErr = modelErr;
      if (fullText) {
        // We already streamed partial tokens to the user, do not restart
        break;
      }
      // Try next model candidate
      continue;
    }
  }

  if (!succeeded && !fullText) {
    // Non-streaming fallback attempt if SSE had issues
    try {
      const nonStreamFallback = await fetchGeminiChatNonStream(requestBody, apiKey, modelOrder, route);
      if (nonStreamFallback) {
        fullText = nonStreamFallback.text;
        if (nonStreamFallback.fnCalls) {
          collectedFnCalls.push(...nonStreamFallback.fnCalls);
        }
        handlers.onDelta(fullText);
        succeeded = true;
      }
    } catch {
      // ignore
    }
  }

  if (!succeeded && !fullText) {
    throw new Error(formatFriendlyGeminiErrorAr(lastErr));
  }

  const sanitized = sanitizeGeminiOutputText(fullText, collectedFnCalls);
  const pendingProposal = extractPendingProposalFromFunctionCalls(sanitized.recoveredFnCalls);
  const finalText =
    sanitized.cleanText ||
    pendingProposal?.summaryAr ||
    'أعددتُ التعديلات المطلوبة — راجع التفاصيل وأكد التنفيذ.';

  handlers.onDone({
    text: finalText,
    pendingProposal,
    latencyMs: Math.max(1, Date.now() - startedAt),
    memoriesAppliedCount,
    model: activeModelUsed,
    cached: false,
  });

  return true;
}

async function fetchGeminiChatNonStream(
  requestBody: Record<string, unknown>,
  apiKey: string,
  modelOrder: string[],
  route: GeminiRoute
): Promise<{ text: string; fnCalls: GeminiFunctionCall[] } | null> {
  for (const modelCandidate of modelOrder) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCandidate}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Plain body (no thinking override) — this is the last-resort path.
        body: JSON.stringify(withModelConfig(requestBody, modelCandidate, route, false)),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: { name: string; args?: Record<string, unknown> };
            }>;
          };
        }>;
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      let text = '';
      const fnCalls: GeminiFunctionCall[] = [];
      for (const p of parts) {
        if (p.text) text += p.text;
        if (p.functionCall) fnCalls.push(p.functionCall);
      }
      if (text || fnCalls.length > 0) {
        const sanitized = sanitizeGeminiOutputText(text, fnCalls);
        return { text: sanitized.cleanText, fnCalls: sanitized.recoveredFnCalls };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Client-Side Maps Query: Queries free OSM Photon API directly for nearby geographic places,
 * then generates a clean Gemini Arabic summary with live Google Maps URLs!
 */
export async function apiStreamGeminiMapsClient(
  payload: {
    query: string;
    lat?: number;
    lng?: number;
    memories?: Array<{ ruleText: string; category?: string }>;
    constitutionBrief?: string;
  },
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const startedAt = Date.now();
  const apiKey = getGeminiApiKey();
  const query = (payload.query || '').trim();
  const lat = typeof payload.lat === 'number' ? payload.lat : 31.1953;
  const lng = typeof payload.lng === 'number' ? payload.lng : 31.5212;

  handlers.onStatus?.('جارٍ البحث الجغرافي المباشر حول موقعك...');

  let places: GroundingPlace[] = [];
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&limit=6`;
    const res = await fetch(photonUrl, { signal: handlers.signal });
    if (res.ok) {
      const data = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            name?: string;
            street?: string;
            city?: string;
            state?: string;
            country?: string;
            osm_value?: string;
          };
        }>;
      };
      if (Array.isArray(data.features)) {
        places = data.features
          .filter((f) => f.properties?.name)
          .map((f) => {
            const p = f.properties!;
            const coords = f.geometry?.coordinates;
            const placeLat = coords ? coords[1] : lat;
            const placeLng = coords ? coords[0] : lng;
            const address = [p.street, p.city, p.state].filter(Boolean).join('، ');
            return {
              title: p.name || query,
              uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name || ''} ${address}`.trim())}&center=${placeLat},${placeLng}`,
              snippets: [address || 'مكان بالقرب من موقعك الجغرافي'].filter(Boolean),
            };
          });
      }
    }
  } catch {
    // ignore photon failures and let Gemini synthesize
  }

  handlers.onStatus?.('جارٍ تلخيص الأماكن عبر Gemini...');

  const placesContext =
    places.length > 0
      ? places.map((p, i) => `${i + 1}. ${p.title} (${(p.snippets ?? []).join(' - ')}) - رابط خرائط: ${p.uri}`).join('\n')
      : 'لم تتوفر نتائج تلقائية مباشرة من الخريطة.';

  const prompt = `أنت دليل الأماكن والخرائط في تطبيق «إيقاع اليوم».
المستخدم يبحث عن: "${query}"
موقعه الحالي: خط عرض ${lat} وخط طول ${lng}.
النتائج الجغرافية المكتشفة:
${placesContext}

أجب باختصار مباشر وودود باللغة العربية، موضحاً أسماء الأماكن المقترحة وأقربها وأفضل نصيحة توقيت لزيارتها.`;

  return apiStreamGeminiChatClient(
    {
      message: prompt,
      contextSummary: payload.constitutionBrief,
      memories: payload.memories?.map((m, idx) => ({ id: `m-${idx}`, category: m.category || 'general', ruleText: m.ruleText })),
    },
    {
      signal: handlers.signal,
      onStatus: handlers.onStatus,
      onDelta: handlers.onDelta,
      onDone: (donePayload) => {
        handlers.onDone({
          ...donePayload,
          places: places.length > 0 ? places : donePayload.places,
          latencyMs: Math.max(1, Date.now() - startedAt),
        });
      },
    }
  );
}

/**
 * Client-Side Web Search Query: Synthesizes live search answers via Google Gemini client-side.
 */
export async function apiStreamGeminiSearchClient(
  payload: {
    query: string;
    lat?: number;
    lng?: number;
    memories?: Array<{ ruleText: string; category?: string }>;
    constitutionBrief?: string;
  },
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const startedAt = Date.now();
  const query = (payload.query || '').trim();

  handlers.onStatus?.('جارٍ البحث والتحليل العلمي الذكي...');

  const prompt = `أنت الباحث العلمي الذكي في تطبيق «إيقاع اليوم | DayRhythm».
استعلام البحث: "${query}"

أجب باللغة العربية بوضوح ودقة واختصار، مع مراعاة النصائح الصحية والعلمية ونظام التوقيت 12 ساعة (ص/م).`;

  return apiStreamGeminiChatClient(
    {
      message: prompt,
      contextSummary: payload.constitutionBrief,
      memories: payload.memories?.map((m, idx) => ({ id: `m-${idx}`, category: m.category || 'general', ruleText: m.ruleText })),
    },
    {
      signal: handlers.signal,
      onStatus: handlers.onStatus,
      onDelta: handlers.onDelta,
      onDone: (donePayload) => {
        handlers.onDone({
          ...donePayload,
          latencyMs: Math.max(1, Date.now() - startedAt),
        });
      },
    }
  );
}
