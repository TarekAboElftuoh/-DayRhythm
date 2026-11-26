import crypto from 'crypto';
import type { Express } from 'express';
import { Content, FunctionCall, ThinkingLevel, Type, type GoogleGenAI } from '@google/genai';
import { sanitizeGeminiOutputText, extractPendingProposalFromFunctionCalls } from '../src/services/geminiSanitizer';
import { createRateLimiter, requireFirebaseAuth } from './security';

const geminiHttpLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'http_gemini',
});

interface GeminiProbeCacheEntry {
  ok: boolean;
  connected: boolean;
  status: 'online' | 'degraded' | 'offline';
  model: string;
  latencyMs: number;
  checkedAtIso: string;
  error?: string;
  expiresAtMs: number;
}

let geminiProbeCache: GeminiProbeCacheEntry | null = null;
import {
  getGeminiClient,
  getCairoTodayIso,
  getCairoNowTime12,
  formatServerIsoTo12h,
  DAYRHYTHM_SYSTEM_INSTRUCTION,
  proposeCalendarActionsDeclaration,
  proposeTaskActionsDeclaration,
  proposeMedicationActionsDeclaration,
  proposeCreativeActionsDeclaration,
  proposeProfileUpdatesDeclaration,
  proposeMemoryActionsDeclaration,
} from './config';

export interface ChatRequestPayload {
  message?: string;
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

export interface GeminiChatBridge {
  executeGeminiChatStream: (
    payload: ChatRequestPayload,
    emit: (event: Record<string, unknown>) => void,
    isAborted: () => boolean
  ) => Promise<void>;
  formatErrorAr: (err: unknown) => string;
}

export function registerGeminiRoutes(app: Express): GeminiChatBridge {
  function markGeminiProbeOnline(model: string, latencyMs: number): void {
    geminiProbeCache = {
      ok: true,
      connected: true,
      status: 'online',
      model,
      latencyMs: Math.max(1, latencyMs),
      checkedAtIso: new Date().toISOString(),
      expiresAtMs: Date.now() + 300_000,
    };
  }

  // Real Gemini connectivity & latency probe (fast 5s timeout, 5m healthy cache, transient tolerance)
  app.get('/api/gemini/status', async (req, res) => {
    const forceProbe = req.query.probe === '1' || req.query.force === '1';
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    if (!hasKey) {
      res.status(503).json({
        ok: false,
        connected: false,
        status: 'offline',
        model: 'gemini-3.1-flash-lite',
        latencyMs: 0,
        checkedAtIso: new Date().toISOString(),
        error: 'مفتاح Gemini API غير مهيأ في إعدادات الخادم (Settings > Secrets).',
      });
      return;
    }

    const nowMs = Date.now();
    if (!forceProbe && geminiProbeCache && geminiProbeCache.expiresAtMs > nowMs) {
      const { expiresAtMs: _ignore, ...cachedPayload } = geminiProbeCache;
      res.json(cachedPayload);
      return;
    }

    const startedAt = Date.now();
    const probeModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
    let lastErrMsg = 'تعذر الاتصال بخدمة Gemini.';
    let sawTransientError = false;

    for (const modelName of probeModels) {
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        const ai = getGeminiClient();
        const probePromise = ai.models.generateContent({
          model: modelName,
          contents: 'جاهز؟ أجب بكلمة واحدة.',
          config:
            modelName === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : undefined,
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('PROBE_TIMEOUT: استغرق فحص Gemini أكثر من 5 ثوانٍ')),
            5_000
          );
        });
        const probeRes = await Promise.race([probePromise, timeoutPromise]);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const latencyMs = Math.max(1, Date.now() - startedAt);
        const connected = Boolean((probeRes.text ?? '').trim().length > 0);
        if (connected) {
          markGeminiProbeOnline(modelName, latencyMs);
          const { expiresAtMs: _ignore, ...payload } = geminiProbeCache!;
          res.json(payload);
          return;
        }
      } catch (err: unknown) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastErrMsg = err instanceof Error ? err.message : 'تعذر الاتصال بخدمة Gemini.';
        const isAuthFailure =
          lastErrMsg.includes('API_KEY_INVALID') ||
          lastErrMsg.includes('PERMISSION_DENIED') ||
          lastErrMsg.includes('403');
        if (isAuthFailure) {
          sawTransientError = false;
          break;
        }
        sawTransientError = true;
      }
    }

    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (sawTransientError) {
      const degradedPayload = {
        ok: true,
        connected: true,
        status: 'degraded' as const,
        model: 'gemini-3.1-flash-lite',
        latencyMs,
        checkedAtIso: new Date().toISOString(),
        error: 'ضغط مؤقت على Gemini — إعادة الاتصال التلقائي نشطة ويمكنك الإرسال مباشرة.',
      };
      geminiProbeCache = {
        ...degradedPayload,
        expiresAtMs: Date.now() + 20_000,
      };
      res.json(degradedPayload);
      return;
    }

    const statusPayload = {
      ok: false,
      connected: false,
      status: 'offline' as const,
      model: 'gemini-3.1-flash-lite',
      latencyMs,
      checkedAtIso: new Date().toISOString(),
      error: lastErrMsg,
    };
    geminiProbeCache = {
      ...statusPayload,
      expiresAtMs: Date.now() + 10_000,
    };
    res.status(502).json(statusPayload);
  });

  // 1. Read user's real Google Calendar events across ALL user calendars via @googleapis/calendar

  function normalizeGeminiHistory(
    rawHistory?: Array<{ role: 'user' | 'model'; text: string }>
  ): Content[] {
    if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
    const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
    for (const item of rawHistory) {
      if (!item || (item.role !== 'user' && item.role !== 'model')) continue;
      const text = typeof item.text === 'string' ? sanitizeGeminiOutputText(item.text).cleanText.trim() : '';
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

  function buildChatSystemInstruction(
    payload: ChatRequestPayload,
    options?: { lean?: boolean }
  ): {
    systemInstruction: string;
    memoriesAppliedCount: number;
  } {
    // Plain conversation skips the calendar/tasks/meds dumps and the old archive:
    // they were pure prefill latency on every "ازيك".
    const lean = Boolean(options?.lean);
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
            .map(
              (m, idx) =>
                `${idx + 1}. [id=${m.id}|${m.category}] ${m.ruleText.trim().slice(0, 180)}`
            )
            .join('\n')}`
        : '';

    const eventsListText =
      !lean && Array.isArray(payload.calendarEvents) && payload.calendarEvents.length > 0
        ? `\n\nأحداث Google Calendar:\n${payload.calendarEvents
            .slice(0, 18)
            .map((e) => `- [id=${e.id}${e.calendarId ? `|cal=${e.calendarId}` : ''}] ${e.summary} | ${formatServerIsoTo12h(e.start)}${e.end ? `–${formatServerIsoTo12h(e.end)}` : ''}`)
            .join('\n')}`
        : '';

    const tasksListText =
      !lean && Array.isArray(payload.tasks) && payload.tasks.length > 0
        ? `\n\nمهام Google Tasks:\n${payload.tasks
            .slice(0, 15)
            .map(
              (t) =>
                `- [taskId=${t.id}|list=${t.taskListId}] ${t.title} | ${t.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}${t.due ? ` | ${t.due.slice(0, 10)}` : ''}`
            )
            .join('\n')}`
        : '';

    const medsListText =
      !lean && Array.isArray(payload.medications) && payload.medications.length > 0
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
      !lean && Array.isArray(payload.creativeActivities) && payload.creativeActivities.length > 0
        ? `\n\nالأنشطة الإبداعية والهوايات المسجلة:\n${payload.creativeActivities
            .map((a) => {
              const cadAr =
                a.cadence === 'daily' ? 'يومي' : a.cadence === 'monthly' ? 'شهري' : 'أسبوعي';
              return `- [activityId=${a.id}] ${a.emoji ?? '🎨'} ${a.name} | (${cadAr}: ${a.sessionsInPeriod ?? a.sessionsThisWeek}/${a.goalCount ?? a.weeklyGoalSessions}) | المدة: ${a.sessionMinutes} د${a.expiresOnDate ? ` | حتى ${a.expiresOnDate}` : ''}${a.scheduledTime24 ? ` | موعد مجدول: ${a.scheduledTime24}` : ''} | اليوم: ${a.completedToday ? 'أُنجز ✓' : 'لم يُنجز بعد'}`;
            })
            .join('\n')}`
        : '';

    const longTermArchiveBlock =
      !lean &&
      typeof payload.longTermChatContext === 'string' &&
      payload.longTermChatContext.trim().length > 0
        ? `\n\n=== مقتطفات مرجعية سابقة ===\n${payload.longTermChatContext.trim().slice(0, 1400)}`
        : '';

    const contextText = (payload.contextSummary ?? '').slice(0, lean ? 600 : 1800);
    const systemInstruction = `${DAYRHYTHM_SYSTEM_INSTRUCTION}\n\nالتاريخ: ${todayCairo} | الوقت الآن: ${nowCairo12} | التزم حرفياً بالدستور والذاكرة أدناه وأجب باختصار مباشر وسريع.${memoriesBlock}${longTermArchiveBlock}\n\n=== الدستور والسياق ===\n${contextText}${eventsListText}${tasksListText}${medsListText}${creativeListText}`;

    return { systemInstruction, memoriesAppliedCount: memoriesArr.length };
  }

  // Tools cost a tool round-trip plus their declarations on every turn. Attach them only
  // when the message may change data; a greeting must not pay for six function schemas.
  const ACTION_INTENT_PATTERN =
    /(أضف|اضف|ضيف|ضيّف|أنشئ|انشئ|اعمل|أنشأ|جدول|جدوللي|عدّل|عدل|غيّر|غير|احذف|امسح|ألغ|الغ|ذكرني|فكّرني|فكرني|مهمة|مهمه|مهام|تاسك|موعد|حدث|أحداث|دواء|علاج|جرعة|نشاط|عادة|هدف|ذاكرة|قاعدة|احفظ|سجل|سجّل|أجل|انقل|رحّل|رتب|نظم|plan|schedule|remind|create|add|edit|delete|cancel|task|event|memory)/i;

  function shouldAttachChatTools(message?: string): boolean {
    return ACTION_INTENT_PATTERN.test(message ?? '');
  }

  // Dedicated function-calling tools for Chat (NO forced googleSearch grounding on every chat turn,
  // which previously exhausted Google Search quota and caused 429 RESOURCE_EXHAUSTED on normal messages!)
  const GEMINI_CHAT_TOOLS = [
    {
      functionDeclarations: [
        proposeCalendarActionsDeclaration,
        proposeTaskActionsDeclaration,
        proposeMedicationActionsDeclaration,
        proposeCreativeActionsDeclaration,
        proposeProfileUpdatesDeclaration,
        proposeMemoryActionsDeclaration,
      ],
    },
  ];

  // Fastest stable model first (measured ~0.8s to first token), then the stronger fallbacks.
  const GEMINI_CHAT_MODEL_CHAIN = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-4-hydrogen',
  ] as const;

  function isRetryableGeminiError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return (
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('500') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('high demand') ||
      msg.includes('quota') ||
      msg.includes('overloaded') ||
      msg.includes('NOT_FOUND')
    );
  }

  function formatFriendlyGeminiErrorAr(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    if (raw.includes('GEMINI_API_KEY')) {
      return 'مفتاح Gemini غير مهيأ على الخادم — تأكد من إعدادات Secrets في AI Studio.';
    }
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
      return 'تم الوصول للحد المؤقت لطلبات Gemini المجانية — انتظر بضع ثوانٍ وحاول مرة أخرى أو أضف مفتاحاً بباقة أعلى في Settings > Secrets.';
    }
    if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
      return 'تعذر التحقق من صلاحية مفتاح Gemini في الخادم — راجع Settings > Secrets.';
    }
    if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
      return 'خوادم Gemini تشهد ضغطاً مؤقتاً الآن — اضغط «إعادة المحاولة» بعد لحظات.';
    }
    return raw.length > 260 ? 'حدث خطأ مؤقت أثناء الاتصال بـ Gemini — جرّب إعادة المحاولة.' : raw || 'حدث خطأ أثناء الاتصال بـ Gemini.';
  }

  // Bounded In-Memory TTL + LRU Cache for Repeated Gemini Requests (Chat Q&A, Maps, Web Search)
  interface CachedGeminiEntry<T> {
    value: T;
    expiresAtMs: number;
    createdAtMs: number;
  }

  class GeminiTtlLruCache<T> {
    private readonly store = new Map<string, CachedGeminiEntry<T>>();
    constructor(
      private readonly maxEntries: number,
      private readonly defaultTtlMs: number
    ) {}

    get(key: string): T | null {
      const entry = this.store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAtMs) {
        this.store.delete(key);
        return null;
      }
      // Refresh LRU recency
      this.store.delete(key);
      this.store.set(key, entry);
      return entry.value;
    }

    set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
      if (this.store.has(key)) {
        this.store.delete(key);
      } else if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) {
          this.store.delete(oldestKey);
        }
      }
      this.store.set(key, {
        value,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + ttlMs,
      });
    }
  }

  interface CachedChatValue {
    text: string;
    memoriesAppliedCount: number;
    model: string;
  }

  interface CachedMapsValue {
    text: string;
    places: Array<{ title: string; uri: string; snippets: string[] }>;
    memoriesAppliedCount: number;
    model: string;
  }

  interface CachedSearchValue {
    text: string;
    sources: Array<{ title: string; uri: string }>;
    memoriesAppliedCount: number;
    model: string;
  }

  const chatResponseCache = new GeminiTtlLruCache<CachedChatValue>(150, 10 * 60_000);
  const mapsResponseCache = new GeminiTtlLruCache<CachedMapsValue>(80, 15 * 60_000);
  const searchResponseCache = new GeminiTtlLruCache<CachedSearchValue>(80, 10 * 60_000);

  function hashCacheKey(parts: unknown[]): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('hex')
      .slice(0, 40);
  }

  function normalizeQueryForCache(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function isContextDependentQuery(raw: string): boolean {
    const q = normalizeQueryForCache(raw);
    if (q.length <= 12) return true;
    return /(^|\s)(ده|دي|دول|كمل|كمّل|أكمل|اكمل|وضح|وضّح|اشرح|لماذا|ليه|غيره|غيّره|عدله|عدّله|احذفه|تمام|نعم|لا|أوك|اوك|ok|yes|no|more|continue|it|that|this|above)(\s|$)/i.test(
      q
    );
  }

  function buildChatCacheKey(payload: ChatRequestPayload, formattedHistory: Content[]): string {
    // 10-minute time bucket so repeated Q&A hits cache rapidly while time-relative answers stay fresh
    const timeBucket10m = Math.floor(Date.now() / (10 * 60_000));
    const memoriesSig = (payload.memories ?? []).map((m) => `${m.id}:${m.category}:${m.ruleText}`);
    const eventsSig = (payload.calendarEvents ?? [])
      .slice(0, 28)
      .map((e) => `${e.id}:${e.summary}:${e.start}:${e.end ?? ''}`);
    const tasksSig = (payload.tasks ?? [])
      .slice(0, 20)
      .map((t) => `${t.id}:${t.title}:${t.status}:${t.due ?? ''}`);
    const medsSig = (payload.medications ?? []).map(
      (m) => `${m.id}:${m.name}:${m.takenToday ? 1 : 0}:${m.remainingDoses ?? -1}`
    );
    const includeHistory = isContextDependentQuery(payload.message ?? '');
    const historySig = includeHistory
      ? formattedHistory.slice(-4).map((h) => ({
          role: h.role,
          text: (h.parts?.[0]?.text ?? '').slice(0, 220),
        }))
      : [];
    return hashCacheKey([
      'chat_v2',
      getCairoTodayIso(),
      timeBucket10m,
      normalizeQueryForCache(payload.message ?? ''),
      historySig,
      (payload.contextSummary ?? '').slice(0, 900),
      memoriesSig,
      eventsSig,
      tasksSig,
      medsSig,
    ]);
  }

  function buildMapsCacheKey(
    query: string,
    lat: number,
    lng: number,
    memories?: Array<{ ruleText: string; category?: string }>,
    constitutionBrief?: string
  ): string {
    return hashCacheKey([
      'maps_v1',
      normalizeQueryForCache(query),
      lat.toFixed(3),
      lng.toFixed(3),
      (constitutionBrief ?? '').slice(0, 300),
      (memories ?? []).slice(0, 10).map((m) => m.ruleText),
    ]);
  }

  function buildSearchCacheKey(
    query: string,
    lat: number,
    lng: number,
    memories?: Array<{ ruleText: string; category?: string }>,
    constitutionBrief?: string
  ): string {
    return hashCacheKey([
      'search_v1',
      getCairoTodayIso(),
      normalizeQueryForCache(query),
      lat.toFixed(2),
      lng.toFixed(2),
      (constitutionBrief ?? '').slice(0, 300),
      (memories ?? []).slice(0, 10).map((m) => m.ruleText),
    ]);
  }

  // Shared ultra-low-latency streaming core used by BOTH persistent WebSocket (/ws/sync) & HTTP SSE (/api/chat/stream)
  async function executeGeminiChatStream(
    payload: ChatRequestPayload,
    emit: (event: Record<string, unknown>) => void,
    isAborted: () => boolean
  ): Promise<void> {
    const startedAt = Date.now();
    const userMessage = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!userMessage) {
      emit({ type: 'error', error: 'الرسالة مطلوبة.' });
      return;
    }
    const formattedHistory = normalizeGeminiHistory(payload.history);
    const cacheKey = buildChatCacheKey({ ...payload, message: userMessage }, formattedHistory);

    if (!payload.bypassCache) {
      const cached = chatResponseCache.get(cacheKey);
      if (cached) {
        emit({ type: 'delta', text: cached.text });
        emit({
          type: 'done',
          text: cached.text,
          latencyMs: Math.max(1, Date.now() - startedAt),
          memoriesAppliedCount: cached.memoriesAppliedCount,
          model: cached.model,
          cached: true,
        });
        return;
      }
    }

    emit({ type: 'status', text: 'جارٍ الرد السريع وفق ذاكرتك...' });

    const ai = getGeminiClient();
    const needsTools = shouldAttachChatTools(userMessage);
    const { systemInstruction, memoriesAppliedCount } = buildChatSystemInstruction(payload, {
      lean: !needsTools,
    });

    let activeModel: string = GEMINI_CHAT_MODEL_CHAIN[0];
    let fullText = '';
    const collectedFnCalls: FunctionCall[] = [];
    let streamCompleted = false;
    let lastStreamErr: unknown = null;

    for (const candidateModel of GEMINI_CHAT_MODEL_CHAIN) {
      if (isAborted()) return;
      activeModel = candidateModel;
      let firstChunkTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        const chat = ai.chats.create({
          model: candidateModel,
          history: formattedHistory,
          config: {
            systemInstruction,
            thinkingConfig: {
              thinkingLevel:
                candidateModel === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            ...(needsTools ? { tools: GEMINI_CHAT_TOOLS } : {}),
          },
        });

        // Ultra-fast 5s failover if the primary model stalls before producing its first chunk
        const streamPromise = chat.sendMessageStream({ message: userMessage });
        const timeoutPromise = new Promise<never>((_, reject) => {
          firstChunkTimer = setTimeout(
            () => reject(new Error('503 UNAVAILABLE: stream_connect_timeout')),
            5_000
          );
        });
        const stream = await Promise.race([streamPromise, timeoutPromise]);
        if (firstChunkTimer) {
          clearTimeout(firstChunkTimer);
          firstChunkTimer = null;
        }

        for await (const chunk of stream) {
          if (isAborted()) break;
          const delta = chunk.text ?? '';
          if (delta) {
            fullText += delta;
            emit({ type: 'delta', text: delta });
          }
          if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
            collectedFnCalls.push(...chunk.functionCalls);
          }
        }
        streamCompleted = true;
        break;
      } catch (modelErr: unknown) {
        if (firstChunkTimer) clearTimeout(firstChunkTimer);
        lastStreamErr = modelErr;
        if (!fullText && isRetryableGeminiError(modelErr)) {
          continue;
        }
        throw modelErr;
      }
    }

    if (isAborted()) return;

    if (!streamCompleted) {
      throw lastStreamErr ?? new Error('تعذر الاتصال بـ Gemini حالياً.');
    }

    const sanitized = sanitizeGeminiOutputText(fullText, collectedFnCalls);
    const pendingProposal = extractPendingProposalFromFunctionCalls(sanitized.recoveredFnCalls);
    const finalText =
      sanitized.cleanText ||
      pendingProposal?.summaryAr ||
      'أعددتُ التعديلات المطلوبة — راجع التفاصيل وأكد التنفيذ.';

    // Cache purely informational responses (never cache mutating tool proposals)
    if (!pendingProposal && finalText.length > 0) {
      chatResponseCache.set(cacheKey, {
        text: finalText,
        memoriesAppliedCount,
        model: activeModel,
      });
    }

    const streamLatencyMs = Math.max(1, Date.now() - startedAt);
    markGeminiProbeOnline(activeModel, streamLatencyMs);

    emit({
      type: 'done',
      text: finalText,
      pendingProposal,
      latencyMs: streamLatencyMs,
      memoriesAppliedCount,
      model: activeModel,
      cached: false,
    });
  }

  // 3A. Fast Streaming Multi-turn Gemini Chat (SSE with TCP_NODELAY + TTL/LRU Caching + automatic failover)
  app.post('/api/chat/stream', requireFirebaseAuth, geminiHttpLimiter.middleware, async (req, res) => {
    const payload = req.body as ChatRequestPayload;
    if (!payload?.message || typeof payload.message !== 'string') {
      res.status(400).json({ error: 'الرسالة مطلوبة.' });
      return;
    }

    req.socket?.setNoDelay?.(true);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (obj: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      await executeGeminiChatStream(payload, writeEvent, () => res.writableEnded);
      res.end();
    } catch (err: unknown) {
      writeEvent({ type: 'error', error: formatFriendlyGeminiErrorAr(err) });
      res.end();
    }
  });

  // 3B. Multi-turn Gemini Chat JSON Fallback (with TTL/LRU Caching + resilient model failover + Memories)
  app.post('/api/chat', requireFirebaseAuth, geminiHttpLimiter.middleware, async (req, res) => {
    const startedAt = Date.now();
    try {
      const payload = req.body as ChatRequestPayload;
      if (!payload?.message || typeof payload.message !== 'string') {
        res.status(400).json({ error: 'الرسالة مطلوبة.' });
        return;
      }

      const formattedHistory = normalizeGeminiHistory(payload.history);
      const cacheKey = buildChatCacheKey(payload, formattedHistory);

      if (!payload.bypassCache) {
        const cached = chatResponseCache.get(cacheKey);
        if (cached) {
          res.json({
            text: cached.text,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount: cached.memoriesAppliedCount,
            model: cached.model,
            cached: true,
          });
          return;
        }
      }

      const ai = getGeminiClient();
      const needsTools = shouldAttachChatTools(payload.message);
      const { systemInstruction, memoriesAppliedCount } = buildChatSystemInstruction(payload, {
        lean: !needsTools,
      });

      let activeModel: string = GEMINI_CHAT_MODEL_CHAIN[0];
      let response: Awaited<ReturnType<ReturnType<GoogleGenAI['chats']['create']>['sendMessage']>> | null = null;
      let lastErr: unknown = null;

      for (const candidateModel of GEMINI_CHAT_MODEL_CHAIN) {
        activeModel = candidateModel;
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        try {
          const chat = ai.chats.create({
            model: candidateModel,
            history: formattedHistory,
            config: {
              systemInstruction,
              thinkingConfig: {
                thinkingLevel:
                  candidateModel === 'gemini-3.1-flash-lite'
                    ? ThinkingLevel.MINIMAL
                    : ThinkingLevel.LOW,
              },
              ...(needsTools ? { tools: GEMINI_CHAT_TOOLS } : {}),
            },
          });
          const respPromise = chat.sendMessage({ message: payload.message });
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('503 UNAVAILABLE: chat_timeout')),
              9_000
            );
          });
          response = await Promise.race([respPromise, timeoutPromise]);
          if (timeoutHandle) clearTimeout(timeoutHandle);
          break;
        } catch (modelErr: unknown) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          lastErr = modelErr;
          if (isRetryableGeminiError(modelErr)) {
            continue;
          }
          throw modelErr;
        }
      }

      if (!response) {
        throw lastErr ?? new Error('تعذر الاتصال بـ Gemini حالياً.');
      }

      const sanitized = sanitizeGeminiOutputText(response.text ?? '', response.functionCalls ?? []);
      const pendingProposal = extractPendingProposalFromFunctionCalls(sanitized.recoveredFnCalls);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      markGeminiProbeOnline(activeModel, latencyMs);

      if (pendingProposal) {
        res.json({
          text:
            sanitized.cleanText ||
            pendingProposal.summaryAr ||
            'أعددتُ التعديلات المطلوبة — راجع التفاصيل وأكد التنفيذ.',
          pendingProposal,
          latencyMs,
          memoriesAppliedCount,
          model: activeModel,
          cached: false,
        });
        return;
      }

      const finalText = sanitized.cleanText;
      if (finalText) {
        chatResponseCache.set(cacheKey, {
          text: finalText,
          memoriesAppliedCount,
          model: activeModel,
        });
      }

      res.json({
        text: finalText,
        latencyMs,
        memoriesAppliedCount,
        model: activeModel,
        cached: false,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: formatFriendlyGeminiErrorAr(err) });
    }
  });

  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function extractPlaceSearchKeyword(query: string): { ar: string; en: string } {
    const q = query.trim();
    if (/(مسجد|مساجد|جامع|جوامع|صلاة|الجماعة|mosque)/i.test(q)) return { ar: 'مسجد', en: 'mosque' };
    if (/(صيدلية|صيدليات|دواء|علاج|pharmacy)/i.test(q)) return { ar: 'صيدلية', en: 'pharmacy' };
    if (/(مستشفى|مستشفيات|عيادة|طوارئ|دكتور|hospital|clinic)/i.test(q)) return { ar: 'مستشفى', en: 'hospital' };
    if (/(مطعم|مطاعم|أكل|وجبات|طعام|استراحة|restaurant)/i.test(q)) return { ar: 'مطعم', en: 'restaurant' };
    if (/(كافيه|قهوة|مقهى|cafe|coffee)/i.test(q)) return { ar: 'كافيه', en: 'cafe' };
    if (/(سوبر ماركت|ماركت|بقالة|supermarket)/i.test(q)) return { ar: 'سوبر ماركت', en: 'supermarket' };
    if (/(بنزين|وقود|محطة|fuel|gas)/i.test(q)) return { ar: 'محطة بنزين', en: 'fuel' };
    if (/(جيم|نادي|رياضة|gym)/i.test(q)) return { ar: 'جيم', en: 'gym' };
    if (/(بنك|صراف|atm|bank)/i.test(q)) return { ar: 'بنك', en: 'bank' };
    const cleaned = q
      .replace(/(أقرب|اقرب|في|بالقرب|من|موقعي|الحالي|المفتوحة|الآن|الان|طريقي)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { ar: cleaned || q, en: cleaned || q };
  }

  async function fetchLiveNearbyPlaces(
    query: string,
    lat: number,
    lng: number
  ): Promise<Array<{ title: string; uri: string; snippets: string[]; distanceKm: number }>> {
    const kw = extractPlaceSearchKeyword(query);
    const delta = 0.14;
    const viewbox = `${(lng - delta).toFixed(4)},${(lat + delta).toFixed(4)},${(lng + delta).toFixed(4)},${(lat - delta).toFixed(4)}`;

    const [photonRes, nomArRes, nomEnRes] = await Promise.allSettled([
      fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(kw.ar)}&lat=${lat}&lon=${lng}&limit=10`,
        {
          headers: { 'User-Agent': 'DayRhythmApp/1.0' },
          signal: AbortSignal.timeout(4500),
        }
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(kw.ar)}&format=json&limit=8&viewbox=${viewbox}&bounded=1&accept-language=ar`,
        {
          headers: { 'User-Agent': 'DayRhythmApp/1.0' },
          signal: AbortSignal.timeout(4500),
        }
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(kw.en)}&format=json&limit=8&viewbox=${viewbox}&bounded=1&accept-language=ar`,
        {
          headers: { 'User-Agent': 'DayRhythmApp/1.0' },
          signal: AbortSignal.timeout(4500),
        }
      ).then((r) => (r.ok ? r.json() : null)),
    ]);

    const rawPlaces: Array<{ title: string; lat: number; lng: number; address: string }> = [];

    if (photonRes.status === 'fulfilled' && photonRes.value?.features) {
      for (const feat of photonRes.value.features as Array<{
        properties?: { name?: string; street?: string; city?: string; state?: string };
        geometry?: { coordinates?: [number, number] };
      }>) {
        const coords = feat.geometry?.coordinates;
        const name = (feat.properties?.name || '').trim();
        if (!coords || !name) continue;
        const [pLng, pLat] = coords;
        const address = [feat.properties?.street, feat.properties?.city, feat.properties?.state]
          .filter(Boolean)
          .join('، ');
        rawPlaces.push({ title: name, lat: pLat, lng: pLng, address });
      }
    }

    for (const nomSettled of [nomArRes, nomEnRes]) {
      if (nomSettled.status === 'fulfilled' && Array.isArray(nomSettled.value)) {
        for (const item of nomSettled.value as Array<{
          name?: string;
          display_name?: string;
          lat?: string;
          lon?: string;
        }>) {
          const pLat = Number(item.lat);
          const pLng = Number(item.lon);
          const title = (item.name || item.display_name?.split(',')[0] || '').trim();
          if (!title || Number.isNaN(pLat) || Number.isNaN(pLng)) continue;
          rawPlaces.push({
            title,
            lat: pLat,
            lng: pLng,
            address: String(item.display_name ?? '').slice(0, 140),
          });
        }
      }
    }

    const dedup = new Map<string, { title: string; uri: string; snippets: string[]; distanceKm: number }>();
    for (const p of rawPlaces) {
      const dist = haversineKm(lat, lng, p.lat, p.lng);
      if (dist > 35) continue;
      const key = p.title.toLowerCase().replace(/\s+/g, ' ');
      if (dedup.has(key)) continue;
      const distLabel = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;
      dedup.set(key, {
        title: p.title,
        uri: `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`,
        snippets: [`المسافة التقريبية: ${distLabel}${p.address ? ` · ${p.address}` : ''}`],
        distanceKm: dist,
      });
    }

    const sorted = Array.from(dedup.values())
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 7);

    // Always include a direct Google Maps live search link at the user's exact coordinates
    sorted.push({
      title: `فتح «${kw.ar}» مباشرة على خرائط Google بالقرب منك`,
      uri: `https://www.google.com/maps/search/${encodeURIComponent(kw.ar)}/@${lat.toFixed(5)},${lng.toFixed(5)},15z`,
      snippets: ['عرض جميع الأماكن المفتوحة والتقييمات والاتجاهات الحية على خرائط Google'],
      distanceKm: 0,
    });

    return sorted;
  }

  function decodeXmlEntities(str: string): string {
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function fetchLiveWebSearchFallback(
    query: string,
    lat = 31.1953,
    lng = 31.5212
  ): Promise<{ contextText: string; sources: Array<{ title: string; uri: string }> }> {
    const sources: Array<{ title: string; uri: string }> = [];
    const snippets: string[] = [];

    const wantsWeather = /(طقس|حرارة|جو|مطر|رطوبة|رياح|weather|temp)/i.test(query);
    const wantsPrayer = /(مواقيت|صلاة|أذان|اذان|الفجر|الظهر|العصر|المغرب|العشاء|prayer)/i.test(query);

    const tasks: Array<Promise<void>> = [];

    if (wantsWeather) {
      tasks.push(
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FCairo&forecast_days=2`,
          { signal: AbortSignal.timeout(4000) }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((w) => {
            if (!w?.current) return;
            snippets.push(
              `بيانات الطقس الحية الآن (Open-Meteo): الحرارة الحالية ${w.current.temperature_2m}°C (المحسوسة ${w.current.apparent_temperature}°C)، الرطوبة ${w.current.relative_humidity_2m}%، الرياح ${w.current.wind_speed_10m} كم/س، العظمى اليوم ${w.daily?.temperature_2m_max?.[0]}°C والصغرى ${w.daily?.temperature_2m_min?.[0]}°C، احتمال المطر ${w.daily?.precipitation_probability_max?.[0] ?? 0}%.`
            );
            sources.push({
              title: 'Open-Meteo — بيانات الطقس الحية',
              uri: `https://open-meteo.com/`,
            });
          })
          .catch(() => {})
      );
    }

    if (wantsPrayer) {
      tasks.push(
        fetch(
          `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=5`,
          { signal: AbortSignal.timeout(4000) }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((p) => {
            const t = p?.data?.timings;
            if (!t) return;
            snippets.push(
              `مواقيت الصلاة الحية اليوم وفق الهيئة المصرية العامة للمساحة (Aladhan): الفجر ${t.Fajr}، الشروق ${t.Sunrise}، الظهر ${t.Dhuhr}، العصر ${t.Asr}، المغرب ${t.Maghrib}، العشاء ${t.Isha} (حوّلها إلى نظام 12 ساعة ص/م في ردك).`
            );
            sources.push({
              title: 'Aladhan — الهيئة المصرية للمساحة',
              uri: 'https://aladhan.com/',
            });
          })
          .catch(() => {})
      );
    }

    // Arabic Wikipedia live search + snippet
    tasks.push(
      fetch(
        `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`,
        {
          headers: { 'User-Agent': 'DayRhythmApp/1.0' },
          signal: AbortSignal.timeout(4000),
        }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((wiki) => {
          const hits = (wiki?.query?.search ?? []) as Array<{ title?: string; snippet?: string }>;
          for (const h of hits.slice(0, 3)) {
            if (!h.title) continue;
            const cleanSnip = decodeXmlEntities(h.snippet ?? '');
            snippets.push(`ويكيبيديا (${h.title}): ${cleanSnip}`);
            sources.push({
              title: `ويكيبيديا — ${h.title}`,
              uri: `https://ar.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/\s+/g, '_'))}`,
            });
          }
        })
        .catch(() => {})
    );

    // Google News Arabic live RSS search
    tasks.push(
      fetch(
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ar&gl=EG&ceid=EG:ar`,
        {
          headers: { 'User-Agent': 'DayRhythmApp/1.0' },
          signal: AbortSignal.timeout(4000),
        }
      )
        .then((r) => (r.ok ? r.text() : ''))
        .then((xml) => {
          if (!xml) return;
          const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
          for (const rawItem of items.slice(0, 4)) {
            const title = decodeXmlEntities(rawItem.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
            const link = decodeXmlEntities(rawItem.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
            const pubDate = decodeXmlEntities(rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
            if (!title || !link) continue;
            snippets.push(`خبر/مقال (${pubDate}): ${title}`);
            sources.push({ title: title.slice(0, 90), uri: link });
          }
        })
        .catch(() => {})
    );

    await Promise.allSettled(tasks);

    return {
      contextText: snippets.join('\n'),
      sources: sources.slice(0, 6),
    };
  }

  // 4A. Streaming Google Maps Grounding Endpoint (SSE + TTL/LRU Cache + Native Maps + Live Photon/OSM Fallback)
  app.post('/api/maps/stream', requireFirebaseAuth, geminiHttpLimiter.middleware, async (req, res) => {
    const startedAt = Date.now();
    const { query, lat, lng, memories, constitutionBrief, bypassCache } = req.body as {
      query?: string;
      lat?: number;
      lng?: number;
      memories?: Array<{ ruleText: string; category?: string }>;
      constitutionBrief?: string;
      bypassCache?: boolean;
    };

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'استعلام الخرائط مطلوب.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (obj: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const latitude = typeof lat === 'number' ? lat : 31.1953;
      const longitude = typeof lng === 'number' ? lng : 31.5212;
      const memoriesAppliedCount = Array.isArray(memories) ? memories.length : 0;
      const cacheKey = buildMapsCacheKey(query, latitude, longitude, memories, constitutionBrief);

      if (!bypassCache) {
        const cached = mapsResponseCache.get(cacheKey);
        if (cached) {
          writeEvent({ type: 'delta', text: cached.text });
          writeEvent({
            type: 'done',
            text: cached.text,
            places: cached.places,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount: cached.memoriesAppliedCount,
            model: cached.model,
            cached: true,
          });
          res.end();
          return;
        }
      }

      writeEvent({ type: 'status', text: 'جارٍ البحث في الخرائط حول موقعك...' });

      const memLines =
        Array.isArray(memories) && memories.length > 0
          ? `\nقواعد ذاكرة المستخدم:\n${memories
              .slice(0, 10)
              .map((m) => `- ${m.ruleText}`)
              .join('\n')}`
          : '';

      const ai = getGeminiClient();

      // 1) Try native Gemini Google Maps grounding with streaming first
      let nativeText = '';
      const nativePlaces: Array<{ title: string; uri: string; snippets: string[] }> = [];
      let nativeSucceeded = false;

      try {
        const stream = await ai.models.generateContentStream({
          model: 'gemini-3.1-flash-lite',
          contents: query,
          config: {
            systemInstruction: `أجب بالعربية بوضوح واختصار واذكر أقرب الأماكن والمساجد والخدمات بدقة بناءً على خرائط جوجل، بنظام 12 ساعة (ص/م).${constitutionBrief ? `\n${constitutionBrief.slice(0, 500)}` : ''}${memLines}`,
            tools: [{ googleMaps: {} }],
            toolConfig: {
              retrievalConfig: {
                latLng: { latitude, longitude },
              },
            },
          },
        });

        const seenUris = new Set<string>();
        for await (const chunk of stream) {
          if (res.writableEnded) break;
          const delta = chunk.text ?? '';
          if (delta) {
            nativeText += delta;
            writeEvent({ type: 'delta', text: delta });
          }
          const gChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          for (const c of gChunks) {
            if (!c.maps?.uri || seenUris.has(c.maps.uri)) continue;
            seenUris.add(c.maps.uri);
            nativePlaces.push({
              title: c.maps.title ?? 'مكان على الخريطة',
              uri: c.maps.uri,
              snippets:
                c.maps.placeAnswerSources?.reviewSnippets
                  ?.map(
                    (s) =>
                      (s as { review?: string; text?: string; content?: string }).review ??
                      (s as { text?: string }).text ??
                      ''
                  )
                  .filter(Boolean) ?? [],
            });
          }
        }
        if (nativeText.trim()) {
          nativeSucceeded = true;
        }
      } catch {
        // Free-tier keys often have 0 quota on built-in googleMaps grounding -> fall through cleanly
      }

      if (nativeSucceeded) {
        const finalText = nativeText.trim();
        mapsResponseCache.set(cacheKey, {
          text: finalText,
          places: nativePlaces,
          memoriesAppliedCount,
          model: 'gemini-3.1-flash-lite',
        });
        writeEvent({
          type: 'done',
          text: finalText,
          places: nativePlaces,
          latencyMs: Math.max(1, Date.now() - startedAt),
          memoriesAppliedCount,
          model: 'gemini-3.1-flash-lite',
          cached: false,
        });
        res.end();
        return;
      }

      // 2) Live Real Geographic Lookup (Photon + Nominatim around exact GPS) + Streaming Gemini Synthesis
      writeEvent({ type: 'status', text: 'جارٍ رصد أقرب الأماكن والمسافات الحية...' });
      const livePlaces = await fetchLiveNearbyPlaces(query, latitude, longitude);
      const placesContext = livePlaces
        .map((p, i) => `${i + 1}. ${p.title} — ${p.snippets[0] ?? ''}`)
        .join('\n');

      let streamedText = '';
      const summaryStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: `طلب المستخدم: ${query}\nإحداثياته الحالية: (${latitude.toFixed(4)}, ${longitude.toFixed(4)})\n\nالأماكن القريبة الفعلية المرصودة الآن:\n${placesContext}\n\nقدّم إجابة عربية سريعة، منظمة، وعملية توضح أقرب الخيارات والمسافات ونصيحة سريعة (بنظام 12 ساعة ص/م عند ذكر أي وقت).`,
        config: {
          systemInstruction: `أنت دليل الأماكن والخرائط في إيقاع اليوم. اعتمد على الأماكن الحقيقية المرفقة أدناه بدون اختلاق أسماء، واكتب بوضوح واختصار.${memLines}`,
        },
      });

      for await (const chunk of summaryStream) {
        if (res.writableEnded) break;
        const delta = chunk.text ?? '';
        if (delta) {
          streamedText += delta;
          writeEvent({ type: 'delta', text: delta });
        }
      }

      const finalText =
        streamedText.trim() ||
        `إليك أقرب النتائج المرصودة حول موقعك الحالي (${livePlaces.length - 1} موقع):`;
      const cleanPlaces = livePlaces.map(({ title, uri, snippets }) => ({ title, uri, snippets }));

      mapsResponseCache.set(cacheKey, {
        text: finalText,
        places: cleanPlaces,
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
      });

      writeEvent({
        type: 'done',
        text: finalText,
        places: cleanPlaces,
        latencyMs: Math.max(1, Date.now() - startedAt),
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
        cached: false,
      });
      res.end();
    } catch (err: unknown) {
      writeEvent({ type: 'error', error: formatFriendlyGeminiErrorAr(err) });
      res.end();
    }
  });

  // 4B. Google Maps Grounding Endpoint JSON Fallback (with TTL/LRU Cache)
  app.post('/api/maps', requireFirebaseAuth, geminiHttpLimiter.middleware, async (req, res) => {
    const startedAt = Date.now();
    try {
      const { query, lat, lng, memories, constitutionBrief, bypassCache } = req.body as {
        query?: string;
        lat?: number;
        lng?: number;
        memories?: Array<{ ruleText: string; category?: string }>;
        constitutionBrief?: string;
        bypassCache?: boolean;
      };

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'استعلام الخرائط مطلوب.' });
        return;
      }

      const latitude = typeof lat === 'number' ? lat : 31.1953;
      const longitude = typeof lng === 'number' ? lng : 31.5212;
      const memoriesAppliedCount = Array.isArray(memories) ? memories.length : 0;
      const cacheKey = buildMapsCacheKey(query, latitude, longitude, memories, constitutionBrief);

      if (!bypassCache) {
        const cached = mapsResponseCache.get(cacheKey);
        if (cached) {
          res.json({
            text: cached.text,
            places: cached.places,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount: cached.memoriesAppliedCount,
            model: cached.model,
            cached: true,
          });
          return;
        }
      }

      const memLines =
        Array.isArray(memories) && memories.length > 0
          ? `\nقواعد ذاكرة المستخدم:\n${memories
              .slice(0, 10)
              .map((m) => `- ${m.ruleText}`)
              .join('\n')}`
          : '';

      const ai = getGeminiClient();

      // 1) Try native Gemini Google Maps grounding first
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: query,
          config: {
            systemInstruction: `أجب بالعربية بوضوح واختصار واذكر أقرب الأماكن والمساجد والخدمات بدقة بناءً على خرائط جوجل، بنظام 12 ساعة (ص/م).${constitutionBrief ? `\n${constitutionBrief.slice(0, 500)}` : ''}${memLines}`,
            tools: [{ googleMaps: {} }],
            toolConfig: {
              retrievalConfig: {
                latLng: { latitude, longitude },
              },
            },
          },
        });

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const places = chunks
          .filter((c) => c.maps)
          .map((c) => ({
            title: c.maps?.title ?? 'مكان على الخريطة',
            uri: c.maps?.uri ?? '',
            snippets:
              c.maps?.placeAnswerSources?.reviewSnippets
                ?.map(
                  (s) =>
                    (s as { review?: string; text?: string; content?: string }).review ??
                    (s as { text?: string }).text ??
                    ''
                )
                .filter(Boolean) ?? [],
          }))
          .filter((p) => p.uri);

        if ((response.text ?? '').trim()) {
          const finalText = (response.text ?? '').trim();
          mapsResponseCache.set(cacheKey, {
            text: finalText,
            places,
            memoriesAppliedCount,
            model: 'gemini-3.1-flash-lite',
          });
          res.json({
            text: finalText,
            places,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount,
            model: 'gemini-3.1-flash-lite',
            cached: false,
          });
          return;
        }
      } catch {
        // Free-tier keys often have 0 quota on built-in googleMaps grounding -> fall through to live OSM/Photon + Gemini synthesis
      }

      // 2) Live Real Geographic Lookup (Photon + Nominatim around exact GPS) + Fast Gemini Summary
      const livePlaces = await fetchLiveNearbyPlaces(query, latitude, longitude);
      const placesContext = livePlaces
        .map((p, i) => `${i + 1}. ${p.title} — ${p.snippets[0] ?? ''}`)
        .join('\n');

      const summaryRes = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `طلب المستخدم: ${query}\nإحداثياته الحالية: (${latitude.toFixed(4)}, ${longitude.toFixed(4)})\n\nالأماكن القريبة الفعلية المرصودة الآن:\n${placesContext}\n\nقدّم إجابة عربية سريعة، منظمة، وعملية توضح أقرب الخيارات والمسافات ونصيحة سريعة (بنظام 12 ساعة ص/م عند ذكر أي وقت).`,
        config: {
          systemInstruction: `أنت دليل الأماكن والخرائط في إيقاع اليوم. اعتمد على الأماكن الحقيقية المرفقة أدناه بدون اختلاق أسماء، واكتب بوضوح واختصار.${memLines}`,
        },
      });

      const finalText =
        (summaryRes.text ?? '').trim() ||
        `إليك أقرب النتائج المرصودة حول موقعك الحالي (${livePlaces.length - 1} موقع):`;
      const cleanPlaces = livePlaces.map(({ title, uri, snippets }) => ({ title, uri, snippets }));

      mapsResponseCache.set(cacheKey, {
        text: finalText,
        places: cleanPlaces,
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
      });

      res.json({
        text: finalText,
        places: cleanPlaces,
        latencyMs: Math.max(1, Date.now() - startedAt),
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
        cached: false,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: formatFriendlyGeminiErrorAr(err) });
    }
  });

  // 5A. Streaming Google Search Grounding Endpoint (SSE + TTL/LRU Cache + Live Multi-Source Fallback)
  app.post('/api/search/stream', requireFirebaseAuth, geminiHttpLimiter.middleware, async (req, res) => {
    const startedAt = Date.now();
    const { query, lat, lng, memories, constitutionBrief, bypassCache } = req.body as {
      query?: string;
      lat?: number;
      lng?: number;
      memories?: Array<{ ruleText: string; category?: string }>;
      constitutionBrief?: string;
      bypassCache?: boolean;
    };

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'استعلام البحث مطلوب.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (obj: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const latitude = typeof lat === 'number' ? lat : 31.1953;
      const longitude = typeof lng === 'number' ? lng : 31.5212;
      const memoriesAppliedCount = Array.isArray(memories) ? memories.length : 0;
      const cacheKey = buildSearchCacheKey(query, latitude, longitude, memories, constitutionBrief);

      if (!bypassCache) {
        const cached = searchResponseCache.get(cacheKey);
        if (cached) {
          writeEvent({ type: 'delta', text: cached.text });
          writeEvent({
            type: 'done',
            text: cached.text,
            sources: cached.sources,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount: cached.memoriesAppliedCount,
            model: cached.model,
            cached: true,
          });
          res.end();
          return;
        }
      }

      writeEvent({ type: 'status', text: 'جارٍ البحث المباشر وتجميع المصادر الحية...' });

      const memLines =
        Array.isArray(memories) && memories.length > 0
          ? `\nقواعد ذاكرة المستخدم:\n${memories
              .slice(0, 10)
              .map((m) => `- ${m.ruleText}`)
              .join('\n')}`
          : '';

      const ai = getGeminiClient();

      // 1) Try native Gemini Google Search grounding with streaming first
      let nativeText = '';
      const nativeSources: Array<{ title: string; uri: string }> = [];
      let nativeSucceeded = false;

      try {
        const stream = await ai.models.generateContentStream({
          model: 'gemini-3.1-flash-lite',
          contents: query,
          config: {
            systemInstruction: `أجب بالعربية بدقة واختصار مستنداً إلى نتائج البحث الحية، مع احترام نظام 12 ساعة (ص/م) والدستور الشخصي وذاكرة المستخدم.${constitutionBrief ? `\n${constitutionBrief.slice(0, 500)}` : ''}${memLines}`,
            tools: [{ googleSearch: {} }],
          },
        });

        const seenUris = new Set<string>();
        for await (const chunk of stream) {
          if (res.writableEnded) break;
          const delta = chunk.text ?? '';
          if (delta) {
            nativeText += delta;
            writeEvent({ type: 'delta', text: delta });
          }
          const gChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          for (const c of gChunks) {
            if (!c.web?.uri || seenUris.has(c.web.uri)) continue;
            seenUris.add(c.web.uri);
            nativeSources.push({
              title: c.web.title ?? c.web.uri ?? 'مصدر ويب',
              uri: c.web.uri,
            });
          }
        }
        if (nativeText.trim()) {
          nativeSucceeded = true;
        }
      } catch {
        // Free-tier keys often have 0 quota on built-in googleSearch grounding -> fall through cleanly
      }

      if (nativeSucceeded) {
        const finalText = nativeText.trim();
        searchResponseCache.set(cacheKey, {
          text: finalText,
          sources: nativeSources,
          memoriesAppliedCount,
          model: 'gemini-3.1-flash-lite',
        });
        writeEvent({
          type: 'done',
          text: finalText,
          sources: nativeSources,
          latencyMs: Math.max(1, Date.now() - startedAt),
          memoriesAppliedCount,
          model: 'gemini-3.1-flash-lite',
          cached: false,
        });
        res.end();
        return;
      }

      // 2) Live Multi-Source Web Search Fallback + Streaming Gemini Synthesis
      writeEvent({ type: 'status', text: 'جارٍ تحليل المصادر وصياغة الإجابة الفورية...' });
      const liveWeb = await fetchLiveWebSearchFallback(query, latitude, longitude);

      let streamedText = '';
      const synthStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: `سؤال البحث: ${query}\n\nنتائج ومصادر حية تم جلبها الآن:\n${liveWeb.contextText || 'لا توجد مقتطفات إضافية — أجب بدقة علمية ووضّح إن كان الأمر يحتاج متابعة حية.'}`,
        config: {
          systemInstruction: `أنت باحث ذكي وسريع في إيقاع اليوم. أجب بالعربية بدقة ووضوح واختصار مستنداً إلى البيانات الحية المرفقة، وحوّل أي وقت إلى نظام 12 ساعة (ص/م) مع احترام الدستور الشخصي وذاكرة المستخدم.${constitutionBrief ? `\n${constitutionBrief.slice(0, 500)}` : ''}${memLines}`,
        },
      });

      for await (const chunk of synthStream) {
        if (res.writableEnded) break;
        const delta = chunk.text ?? '';
        if (delta) {
          streamedText += delta;
          writeEvent({ type: 'delta', text: delta });
        }
      }

      const finalText = streamedText.trim() || 'تم جلب نتائج البحث.';
      searchResponseCache.set(cacheKey, {
        text: finalText,
        sources: liveWeb.sources,
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
      });

      writeEvent({
        type: 'done',
        text: finalText,
        sources: liveWeb.sources,
        latencyMs: Math.max(1, Date.now() - startedAt),
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
        cached: false,
      });
      res.end();
    } catch (err: unknown) {
      writeEvent({ type: 'error', error: formatFriendlyGeminiErrorAr(err) });
      res.end();
    }
  });

  // 5B. Google Search Grounding Endpoint JSON Fallback (with TTL/LRU Cache)
  app.post('/api/search', requireFirebaseAuth, geminiHttpLimiter.middleware, async (req, res) => {
    const startedAt = Date.now();
    try {
      const { query, lat, lng, memories, constitutionBrief, bypassCache } = req.body as {
        query?: string;
        lat?: number;
        lng?: number;
        memories?: Array<{ ruleText: string; category?: string }>;
        constitutionBrief?: string;
        bypassCache?: boolean;
      };
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'استعلام البحث مطلوب.' });
        return;
      }

      const latitude = typeof lat === 'number' ? lat : 31.1953;
      const longitude = typeof lng === 'number' ? lng : 31.5212;
      const memoriesAppliedCount = Array.isArray(memories) ? memories.length : 0;
      const cacheKey = buildSearchCacheKey(query, latitude, longitude, memories, constitutionBrief);

      if (!bypassCache) {
        const cached = searchResponseCache.get(cacheKey);
        if (cached) {
          res.json({
            text: cached.text,
            sources: cached.sources,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount: cached.memoriesAppliedCount,
            model: cached.model,
            cached: true,
          });
          return;
        }
      }

      const memLines =
        Array.isArray(memories) && memories.length > 0
          ? `\nقواعد ذاكرة المستخدم:\n${memories
              .slice(0, 10)
              .map((m) => `- ${m.ruleText}`)
              .join('\n')}`
          : '';

      const ai = getGeminiClient();

      // 1) Try native Gemini Google Search grounding first
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: query,
          config: {
            systemInstruction: `أجب بالعربية بدقة واختصار مستنداً إلى نتائج البحث الحية، مع احترام نظام 12 ساعة (ص/م) والدستور الشخصي وذاكرة المستخدم.${constitutionBrief ? `\n${constitutionBrief.slice(0, 500)}` : ''}${memLines}`,
            tools: [{ googleSearch: {} }],
          },
        });

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources = chunks
          .filter((c) => c.web?.uri)
          .map((c) => ({
            title: c.web?.title ?? c.web?.uri ?? 'مصدر ويب',
            uri: c.web?.uri ?? '',
          }));

        if ((response.text ?? '').trim()) {
          const finalText = (response.text ?? '').trim();
          searchResponseCache.set(cacheKey, {
            text: finalText,
            sources,
            memoriesAppliedCount,
            model: 'gemini-3.1-flash-lite',
          });
          res.json({
            text: finalText,
            sources,
            latencyMs: Math.max(1, Date.now() - startedAt),
            memoriesAppliedCount,
            model: 'gemini-3.1-flash-lite',
            cached: false,
          });
          return;
        }
      } catch {
        // Free-tier keys often have 0 quota on built-in googleSearch grounding -> fall through to live web sources + Gemini synthesis
      }

      // 2) Live Multi-Source Web Search Fallback (Open-Meteo + Aladhan + Wikipedia AR + Google News RSS) + Fast Gemini Synthesis
      const liveWeb = await fetchLiveWebSearchFallback(query, latitude, longitude);

      const synthRes = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `سؤال البحث: ${query}\n\nنتائج ومصادر حية تم جلبها الآن:\n${liveWeb.contextText || 'لا توجد مقتطفات إضافية — أجب بدقة علمية ووضّح إن كان الأمر يحتاج متابعة حية.'}`,
        config: {
          systemInstruction: `أنت باحث ذكي وسريع في إيقاع اليوم. أجب بالعربية بدقة ووضوح واختصار مستنداً إلى البيانات الحية المرفقة، وحوّل أي وقت إلى نظام 12 ساعة (ص/م) مع احترام الدستور الشخصي وذاكرة المستخدم.${constitutionBrief ? `\n${constitutionBrief.slice(0, 500)}` : ''}${memLines}`,
        },
      });

      const finalText = (synthRes.text ?? '').trim() || 'تم جلب نتائج البحث.';
      searchResponseCache.set(cacheKey, {
        text: finalText,
        sources: liveWeb.sources,
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
      });

      res.json({
        text: finalText,
        sources: liveWeb.sources,
        latencyMs: Math.max(1, Date.now() - startedAt),
        memoriesAppliedCount,
        model: 'gemini-3.1-flash-lite',
        cached: false,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: formatFriendlyGeminiErrorAr(err) });
    }
  });

  // 2d. Read-only Smart Gmail Digest (extracts actionable appointments/meetings/travel/deadlines via Gemini)
  app.get('/api/gmail/digest', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'يرجى تسجيل الدخول بحساب جوجل لقراءة ملخص Gmail.',
          needsReauth: true,
        });
        return;
      }

      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=in:inbox+newer_than:7d',
        {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(7000),
        }
      );

      if (listRes.status === 401 || listRes.status === 403) {
        const errData = (await listRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        res.status(listRes.status).json({
          error:
            errData?.error?.message ||
            'يرجى إعادة تسجيل الدخول بحساب Google لمنح صلاحية قراءة Gmail (للقراءة فقط).',
          needsReauth: true,
        });
        return;
      }

      if (!listRes.ok) {
        res.status(listRes.status).json({ error: 'تعذر الوصول إلى صندوق وارد Gmail حالياً.' });
        return;
      }

      const listJson = (await listRes.json()) as {
        messages?: Array<{ id?: string }>;
      };
      const messageIds = (listJson.messages ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, 10);

      if (messageIds.length === 0) {
        res.json({ scannedCount: 0, digestItems: [] });
        return;
      }

      const detailResults = await Promise.allSettled(
        messageIds.map(async (msgId) => {
          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              msgId
            )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            {
              headers: { Authorization: authHeader },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (!mRes.ok) return null;
          const mJson = (await mRes.json()) as {
            id?: string;
            snippet?: string;
            payload?: { headers?: Array<{ name?: string; value?: string }> };
          };
          const headers = mJson.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
          return {
            id: String(mJson.id ?? msgId),
            subject: getHeader('Subject').slice(0, 140),
            from: getHeader('From').slice(0, 100),
            date: getHeader('Date').slice(0, 60),
            snippet: String(mJson.snippet ?? '').slice(0, 180),
          };
        })
      );

      const allEmails = detailResults
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((e): e is NonNullable<typeof e> => Boolean(e && (e.subject || e.snippet)));

      // Pre-filter obvious OTP / security-code noise before calling Gemini
      const noiseRegex = /(verification code|one-time password|\botp\b|security alert|رمز التحقق|كود التفعيل|unsubscribe|newsletter)/i;
      const candidateEmails = allEmails.filter(
        (e) => !noiseRegex.test(`${e.subject} ${e.snippet}`)
      );

      if (allEmails.length === 0 || candidateEmails.length === 0) {
        res.json({ scannedCount: allEmails.length, digestItems: [] });
        return;
      }

      const todayCairo = getCairoTodayIso();
      const emailListPrompt = candidateEmails
        .map(
          (e, i) =>
            `[${i + 1}] id=${e.id} | From:${e.from} | Date:${e.date} | Subj:${e.subject} | Text:${e.snippet}`
        )
        .join('\n');

      const ai = getGeminiClient();
      const digestModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
      let rawText = '{"items":[]}';
      let lastDigestErr: unknown = null;

      for (const digestModel of digestModels) {
        try {
          const genPromise = ai.models.generateContent({
            model: digestModel,
            contents: `اليوم (القاهرة): ${todayCairo}\nرسائل البريد:\n${emailListPrompt}\nاستخرج فقط المواعيد الحقيقية (اجتماع، مقابلة، سفر، طبي، تسليم مهم، توصيل) وتجاهل الإعلانات والنشرات. أرجع JSON فقط.`,
            config: {
              ...(digestModel === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              systemInstruction:
                'محلل سريع لصندوق Gmail. أرجع JSON فقط وفق المخطط. بالعربية، YYYY-MM-DD للتاريخ و HH:MM للوقت. إذا لا توجد مواعيد أرجع items فارغة.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        messageId: { type: Type.STRING },
                        category: {
                          type: Type.STRING,
                          description: 'meeting | travel | medical | deadline | delivery | other',
                        },
                        titleAr: { type: Type.STRING },
                        sender: { type: Type.STRING },
                        summaryAr: { type: Type.STRING },
                        dateIso: { type: Type.STRING },
                        startTime24: { type: Type.STRING },
                        durationMinutes: { type: Type.NUMBER },
                      },
                      required: ['messageId', 'category', 'titleAr', 'sender', 'summaryAr'],
                    },
                  },
                },
                required: ['items'],
              },
            },
          });

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('انتهت مهلة تحليل Gmail مؤقتاً — أعد المحاولة.')), 14_000)
          );
          const response = await Promise.race([genPromise, timeoutPromise]);
          rawText = response.text ?? '{"items":[]}';
          lastDigestErr = null;
          break;
        } catch (mErr: unknown) {
          lastDigestErr = mErr;
        }
      }

      if (lastDigestErr) {
        throw lastDigestErr;
      }

      const emails = allEmails;
      const parsed = JSON.parse(rawText) as {
        items?: Array<{
          messageId?: string;
          category?: string;
          titleAr?: string;
          sender?: string;
          summaryAr?: string;
          dateIso?: string;
          startTime24?: string;
          durationMinutes?: number;
        }>;
      };

      const validCats = new Set(['meeting', 'travel', 'medical', 'deadline', 'delivery', 'other']);
      const catEmoji: Record<string, string> = {
        meeting: '💼 🤝',
        travel: '🧳 ✈️',
        medical: '🩺 💊',
        deadline: '📌 ⏰',
        delivery: '📦 🚚',
        other: '📧 📅',
      };

      const digestItems = (parsed.items ?? []).slice(0, 8).map((item, idx) => {
        const category = validCats.has(String(item.category))
          ? (item.category as 'meeting' | 'travel' | 'medical' | 'deadline' | 'delivery' | 'other')
          : 'other';
        const dateIso =
          item.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(item.dateIso)
            ? item.dateIso
            : todayCairo;
        const startTime24 =
          item.startTime24 && /^\d{1,2}:\d{2}$/.test(item.startTime24)
            ? item.startTime24.padStart(5, '0')
            : '10:00';
        const durationMinutes =
          typeof item.durationMinutes === 'number' && item.durationMinutes >= 15 && item.durationMinutes <= 360
            ? Math.round(item.durationMinutes)
            : 45;
        const cleanTitle = String(item.titleAr ?? 'موعد من Gmail').trim().slice(0, 100);
        return {
          id: `gmail_${item.messageId ?? idx}_${idx}`,
          messageId: String(item.messageId ?? ''),
          category,
          titleAr: cleanTitle,
          sender: String(item.sender ?? '').slice(0, 80),
          summaryAr: String(item.summaryAr ?? '').slice(0, 200),
          dateIso,
          startTime24,
          durationMinutes,
          suggestedAction: {
            operation: 'create' as const,
            calendarId: 'primary',
            title: `${catEmoji[category] ?? '📧 📅'} ${cleanTitle}`,
            dateIso,
            startTime24,
            durationMinutes,
            description: `مُستخرج من Gmail (${String(item.sender ?? '').slice(0, 60)}): ${String(
              item.summaryAr ?? ''
            ).slice(0, 180)}`,
          },
        };
      });

      res.json({ scannedCount: emails.length, digestItems });
    } catch (err: unknown) {
      res.status(500).json({ error: formatFriendlyGeminiErrorAr(err) });
    }
  });

  return { executeGeminiChatStream, formatErrorAr: formatFriendlyGeminiErrorAr };
}
