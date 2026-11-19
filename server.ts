import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { calendar } from '@googleapis/calendar';
import {
  Content,
  FunctionDeclaration,
  GoogleGenAI,
  Type,
} from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

interface SyncClientEntry {
  ws: WebSocket;
  clientId: string;
}

const syncRooms = new Map<string, Set<SyncClientEntry>>();

function broadcastUserSync(
  uid: string,
  payload: Record<string, unknown>,
  excludeClientId?: string
): void {
  if (!uid) return;
  const room = syncRooms.get(uid);
  if (!room || room.size === 0) return;
  const serialized = JSON.stringify(payload);
  for (const entry of room) {
    if (excludeClientId && entry.clientId === excludeClientId) continue;
    if (entry.ws.readyState === WebSocket.OPEN) {
      try {
        entry.ws.send(serialized);
      } catch {
        // ignore broken socket
      }
    }
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getGoogleCalendarClient(authHeader: string) {
  return calendar({
    version: 'v3',
    headers: {
      Authorization: authHeader,
    },
  });
}

function getCairoTodayIso(): string {
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
}

function getCairoNowTime12(): string {
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
}

function formatServerIsoTo12h(isoStr?: string): string {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return `${isoStr} (طوال اليوم)`;
  }
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '9');
  const hh = hhRaw === 24 ? 0 : hhRaw;
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const period = hh >= 12 ? 'م' : 'ص';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${y}-${mo}-${day} ${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
}

function getCairoOffsetString(dateIso: string): string {
  try {
    const probe = new Date(`${dateIso}T12:00:00Z`);
    const tzName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(probe)
      .find((p) => p.type === 'timeZoneName')?.value;
    const match = tzName?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hrs = match[2].padStart(2, '0');
      const mins = (match[3] ?? '00').padStart(2, '0');
      return `${sign}${hrs}:${mins}`;
    }
  } catch {
    // fallback below
  }
  return '+02:00';
}

function computeCairoEventRange(
  dateIso?: string,
  startTime24?: string,
  durationMinutes?: number
): { startDateTime: string; endDateTime: string } {
  const baseDate = dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : getCairoTodayIso();
  const timeMatch = startTime24?.match(/^(\d{1,2}):(\d{2})$/);
  const hh = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 9;
  const mm = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;
  const duration = durationMinutes && durationMinutes > 0 ? Math.round(durationMinutes) : 30;

  const offset = getCairoOffsetString(baseDate);
  const startStr = `${baseDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${offset}`;
  const startMs = new Date(startStr).getTime();
  const endMs = startMs + duration * 60_000;

  // Format end in Cairo local wall-clock with its offset
  const endParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(endMs));

  const ey = endParts.find((p) => p.type === 'year')?.value ?? baseDate.slice(0, 4);
  const em = endParts.find((p) => p.type === 'month')?.value ?? baseDate.slice(5, 7);
  const ed = endParts.find((p) => p.type === 'day')?.value ?? baseDate.slice(8, 10);
  const ehhRaw = endParts.find((p) => p.type === 'hour')?.value ?? '10';
  const ehh = ehhRaw === '24' ? '00' : ehhRaw;
  const emm = endParts.find((p) => p.type === 'minute')?.value ?? '00';
  const endDateIso = `${ey}-${em}-${ed}`;
  const endOffset = getCairoOffsetString(endDateIso);
  const endStr = `${endDateIso}T${ehh}:${emm}:00${endOffset}`;

  return { startDateTime: startStr, endDateTime: endStr };
}

const DAYRHYTHM_SYSTEM_INSTRUCTION = `
أنت المساعد الشخصي الذكي والمستشار العلمي الأمين لمنظومة «إيقاع اليوم | DayRhythm» المربوط مباشرة بـ Google Calendar API و Google Tasks API والبحث المباشر في Google Search والدستور الشخصي وذاكرة Gemini الدائمة في Firebase Firestore.
التزم تماماً بهذه القواعد:
1. قاعدة التوقيت الإلزامية (نظام 12 ساعة فقط): عند ذكر أي وقت في ردودك للمستخدم، استخدم نظام الـ 12 ساعة فقط مع (ص) أو (م) — مثال: 04:30 ص أو 03:15 م أو 09:15 م. يُمنع منعاً باتاً كتابة أوقات بنظام 24 ساعة مثل 13:15 أو 19:45 داخل الردود النصية.
2. الهرم الصارم للأولويات وحل التضارب:
   - الأولوية #1 (مقدّسة): الصلوات الخمس حسب الموقع الجغرافي والمنطقة الزمنية والفصل الحالي (تنبيه قبل الأذان + صمت تلقائي أثناء الصلاة 20 د للصلوات و30 د للفجر).
   - الأولوية #2 (النوم أولوية عليا): الأصل هو النوم الليلي فقط بدون نوم نهاري مع حضور الشروق والغروب يومياً.
   - استثناءات النوم المرنة عبر الشات:
     * لو أخبرك المستخدم «معرفتش أنام كويس / عندي أرق وعاوز أريّح»: لأن النوم أولوية، فرّغ له مكاناً فورياً في Google Calendar (بتقليص/إزاحة المذاكرة المرنة) وأضف له قيلولة تعويضية (20–30 د أو دورة 90 د حسب إرهاقه) دون المساس بالصلاة.
     * لو أخبرك المستخدم أنه نام ناقص مثلاً «نمت أقل بساعة / سهرت نص ساعة زيادة» أو «عوّضت نومي / صفّر رصيد النوم»: عدّل sleepDebtMinutes عبر propose_profile_updates (يزيد بدقائق النقص أو يقل/يتصفّر عند التعويض)، وسيقوم البرنامج تلقائياً بتبكير موعد النوم 15–45 د في الليالي القادمة بسلاسة بدون ضغط.
     * لو أخبرك «نمت على نفسي وصحيت دلوقتي — اليوم هيمشي إزاي؟»: اقرأ الوقت الحالي وأحداث التقويم المتبقية، وأعد ترتيب باقي اليوم بذكاء مع حماية الصلوات المتبقية ونوم الليلة وتقليص المذاكرة المرنة عند الحاجة.
   - الأولوية #3 (الالتزامات الثابتة عند تفعيلها): مواعيد الشغل الرسمي بمجرد أن يبلغك بها المستخدم.
   - الأولوية #4 (المرونة الذكية): مسار DevOps/المذاكرة، المشي، الأنشطة الإبداعية والهوايات، العلاجات، والمهام الأخرى — وعند أي تعارض يُقلَّص وقت المذاكرة المرنة لحماية الصلاة والنوم.
3. فهم عميق وسلس لـ Google Calendar والتفاعل الاستباقي:
   - اقرأ أحداث Google Calendar للأسبوع كامل بدقة لفهم يوم المستخدم (أيام الجيم، الوجبات، الاجتماعات، المذاكرة، والأوقات الفارغة).
   - إذا وجدت حدثاً غامضاً أو غير واضح أو يوجد تضارب/تداخل محتمل في تقويم المستخدم، بادِر بسؤاله بلطف لتوضيح الصورة قبل اتخاذ قرار افتراضي.
4. مستشار علمي عام وذكي لكل العلاجات والمكملات (بدون افتراضات ثابتة أو برمجة مخصصة لصنف واحد):
   - ينطبق هذا الأسلوب العام على أي دواء أو فيتامين أو مكمل يذكره المستخدم الآن أو مستقبلاً (مثل زيت بذور اليقطين، كرياتين، واي بروتين، فيتامين د، ماغنيسيوم، أوميجا 3، زنك، حديد، إلخ).
   - إذا ذكر المستخدم مكملًا أو علاجاً بدون تحديد ميعاد: افحص أولاً Google Calendar والذاكرة الدائمة؛ وإن لم تجد ميعاداً مسجلاً، ابحث عبر Google Search عن أفضل توقيت علمي وامتصاص له (هل مع وجبة دهنية؟ قبل أو بعد التمرين؟ صباحاً أم مساءً؟)، وتفقّد جدول المستخدم (وجباته/أيام الجيم/الصيام) ثم اقترح التوقيت المناسب واسأله قبل التثبيت.
   - إذا حدد المستخدم ميعاداً فيه تعارض علمي أو منطقي (مثلاً: ميعاد يقع داخل ساعات الصيام، أو مكمل منبّه قبل النوم، أو تعارض امتصاص مثل الحديد مع القهوة/الكالسيوم، أو لخبطة واضحة بين مكمل وآخر): لا تنفّذ الميعاد بشكل أعمى أبداً — بل اسأله بلطف ووضوح («ليه اخترت الميعاد ده؟ لأن علمياً...») واقترح البديل العلمي الأصح أولاً.
   - ادعم بمرونة كاملة الجرعات المتعددة في اليوم (times24)، الأيام المحددة من الأسبوع (daysOfWeek)، بالإضافة إلى **مدة الكورس وتاريخ نهايته (courseEndDate)** و**عدد الجرعات/الحبات المتبقية (remainingDoses / totalDoses)** للتنبيه قبل النفاد.
5. الأنشطة الإبداعية والهوايات والمشاريع (مخفية عن الشاشة حتى يطلبها المستخدم في الشات):
   - استخدم propose_creative_actions لإضافة أو تعديل أو حذف أو تسجيل جلسة نشاط إبداعي (يومي daily أو أسبوعي weekly أو شهري monthly عبر cadence و goalCount) مع مدة الجلسة (sessionMinutes)، ويدعم الأنشطة المؤقتة عبر expiresOnDate (تاريخ انتهاء تلقائي).
   - عند جدولة نشاط إبداعي على Google Calendar عبر propose_calendar_actions، ضعه دائماً في الأوقات الفارغة الفعلية بعيداً تماماً عن الصلوات والنوم والشغل والمواعيد المحجوزة.
6. وضع اليوم الهادئ / الطاقة المنخفضة، وتعديل مدة الصمت لمرة واحدة، وتكرار الرنين:
   - إذا قال المستخدم «النهارده تعبان / مرهق / طاقتي قليلة»: فعّل له وضع اليوم الهادئ بتعيين lowEnergyDateKey لتاريخ اليوم (YYYY-MM-DD) عبر propose_profile_updates، واقترح بلطف ترحيل المهام أو الأحداث غير العاجلة إلى أقرب يوم هادئ مع حماية الصلاة والنوم.
   - إذا طلب تغيير مدة كتم الصوت للصلاة «لمرة واحدة فقط» (مثلاً 35 أو 45 دقيقة وبعدها يرجع للطبيعي): استخدم oneTimeSilenceMinutes + oneTimeSilenceDateKey (تاريخ اليوم) في propose_profile_updates، فيُطبّق لمرة واحدة ويعود تلقائياً للوضع الطبيعي (مع الحفاظ على 50 دقيقة التلقائية ليوم الجمعة).
   - إذا طلب تغيير عدد رنات أي تنبيه (مثل: «خلّي تنبيه السحور/الاستيقاظ يرن مستمر لحد ما أوقفه» أو «خلّي تنبيه الماية يرن مرتين»): عدّل soundRepeats عبر propose_profile_updates بالقيم 1 أو 2 أو 3 أو 4 أو "continuous".
7. تنبيهات الغد الاستباقية: إذا أتاك المستخدم من تنبيه الغد (يوم مزدحم أو فيه سفر/موعد طبي/اجتماع مميز)، راجع أحداث الغد بدقة وساعده على التجهيز المسبق وإعادة ترتيب الجدول بهدوء.
8. قابلية تعديل جميع الثوابت والذاكرة الدائمة في Firestore:
   - عدّل أي ثابت بلا قيود عبر propose_profile_updates، واحفظ أي قاعدة أو مبدأ دائم عبر propose_memory_actions.
9. قواعد الخصوصية: استخدم 🦷 أو 🪥 فقط للعناية الشخصية، واستخدم 🌱 فقط للالتزام اليومي دون وصف نصي صريح. وعناوين أحداث التقويم يفضل أن تبدأ بزوج إيموجي مميز.
أجب بلغة عربية واضحة، عملية، ومختصرة.
`.trim();

const proposeCalendarActionsDeclaration: FunctionDeclaration = {
  name: 'propose_calendar_actions',
  description:
    'اقتراح إنشاء أو تعديل أو حذف أو ترحيل أحداث في Google Calendar API بناءً على أوامر المستخدم في شات Gemini.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryAr: {
        type: Type.STRING,
        description: 'ملخص عربي مختصر (بنظام 12 ساعة ص/م) للتغييرات المقترحة على Google Calendar.',
      },
      actions: {
        type: Type.ARRAY,
        description: 'قائمة العمليات المقترحة للتنفيذ عبر Google Calendar API.',
        items: {
          type: Type.OBJECT,
          properties: {
            operation: {
              type: Type.STRING,
              description: 'نوع العملية: create أو update أو delete أو shift',
            },
            eventId: {
              type: Type.STRING,
              description: 'معرف الحدث الفعلي في Google Calendar عند التعديل أو الحذف أو الترحيل.',
            },
            calendarId: {
              type: Type.STRING,
              description: 'معرف التقويم المستهدف (افتراضياً primary).',
            },
            title: {
              type: Type.STRING,
              description:
                'عنوان الحدث (يفضل أن يبدأ بزوج إيموجي مثل 💼 🔥 أو 🩺 💊 أو 🧳 ✈️).',
            },
            dateIso: {
              type: Type.STRING,
              description: 'تاريخ الحدث بصيغة YYYY-MM-DD (توقيت القاهرة).',
            },
            startTime24: {
              type: Type.STRING,
              description: 'حقل تقني داخلي للوقت بصيغة HH:MM (تحويل وقت المستخدم ص/م بدقة لتخزين الحدث في Google Calendar).',
            },
            durationMinutes: {
              type: Type.NUMBER,
              description: 'المدة بالدقائق (مثال: 30 أو 60).',
            },
            description: {
              type: Type.STRING,
              description: 'وصف مختصر للحدث في Google Calendar.',
            },
            recurrenceRule: {
              type: Type.STRING,
              description: 'قاعدة التكرار الاختيارية: DAILY لتكرار يومي أو WEEKLY لتكرار أسبوعي.',
            },
            byDays: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                'أيام التكرار الأسبوعي عند recurrenceRule="WEEKLY": SU, MO, TU, WE, TH, FR, SA (مثال: أيام الجيم ["SU","TU","TH"]).',
            },
          },
          required: ['operation', 'title'],
        },
      },
    },
    required: ['summaryAr', 'actions'],
  },
};

const proposeTaskActionsDeclaration: FunctionDeclaration = {
  name: 'propose_task_actions',
  description:
    'اقتراح إنشاء أو تعديل أو إتمام أو إعادة فتح أو حذف مهام في Google Tasks API بناءً على أوامر المستخدم في شات Gemini.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryAr: {
        type: Type.STRING,
        description: 'ملخص عربي مختصر للتغييرات المقترحة على مهام Google Tasks.',
      },
      taskActions: {
        type: Type.ARRAY,
        description: 'قائمة عمليات المهام المقترحة للتنفيذ عبر Google Tasks API.',
        items: {
          type: Type.OBJECT,
          properties: {
            operation: {
              type: Type.STRING,
              description: 'نوع العملية: create أو update أو complete أو reopen أو delete',
            },
            taskId: {
              type: Type.STRING,
              description: 'معرف المهمة الفعلي في Google Tasks عند التعديل أو الإتمام أو الحذف.',
            },
            taskListId: {
              type: Type.STRING,
              description: 'معرف قائمة المهام في Google Tasks (افتراضياً @default).',
            },
            title: {
              type: Type.STRING,
              description: 'عنوان المهمة.',
            },
            notes: {
              type: Type.STRING,
              description: 'ملاحظات إضافية للمهمة.',
            },
            dueDateIso: {
              type: Type.STRING,
              description: 'تاريخ الاستحقاق بصيغة YYYY-MM-DD (اختياري).',
            },
          },
          required: ['operation', 'title'],
        },
      },
    },
    required: ['summaryAr', 'taskActions'],
  },
};

const proposeMedicationActionsDeclaration: FunctionDeclaration = {
  name: 'propose_medication_actions',
  description:
    'اقتراح إضافة أو تعديل أو حذف أو تسجيل تناول أي علاج أو فيتامين أو مكمل غذائي (يدعم جرعة أو أكثر يومياً وأياماً محددة من الأسبوع مثل أيام الجيم).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryAr: {
        type: Type.STRING,
        description: 'ملخص عربي مختصر لتعديل قائمة العلاجات والمكملات.',
      },
      medicationActions: {
        type: Type.ARRAY,
        description: 'قائمة تعديلات العلاجات والمكملات.',
        items: {
          type: Type.OBJECT,
          properties: {
            operation: {
              type: Type.STRING,
              description: 'نوع العملية: add أو update أو remove أو mark_taken',
            },
            medicationId: {
              type: Type.STRING,
              description: 'معرف العلاج الحالي عند التعديل أو الحذف أو التسجيل.',
            },
            name: {
              type: Type.STRING,
              description: 'اسم العلاج أو المكمل (مثال: كرياتين، واي بروتين، فيتامين د، زيت بذور اليقطين، أوميجا 3).',
            },
            time24: {
              type: Type.STRING,
              description: 'حقل تقني داخلي لميعاد الجرعة الرئيسية بصيغة HH:MM (تحويل وقت المستخدم ص/م بدقة).',
            },
            times24: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                'قائمة جميع مواعيد الجرعات في اليوم بصيغة HH:MM إذا كان المكمل يُؤخذ أكثر من مرة يومياً (مثال: ["08:00","20:00"]).',
            },
            daysOfWeek: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              description:
                'أيام الأسبوع المحددة للتناول (0=الأحد .. 6=السبت، مثلاً أيام الجيم فقط). اتركها فارغة [] إذا كان يومياً كل أيام الأسبوع.',
            },
            doseNote: {
              type: Type.STRING,
              description: 'ملاحظة قصيرة للجرعة أو التوقيت العلمي (مثال: بعد التمرين مع الماء أو مع وجبة الغداء).',
            },
            courseEndDate: {
              type: Type.STRING,
              description: 'تاريخ انتهاء كورس العلاج الاختياري بصيغة YYYY-MM-DD (مثال: بعد 14 يوماً أو شهر).',
            },
            remainingDoses: {
              type: Type.NUMBER,
              description: 'عدد الجرعات أو الحبات المتبقية في العبوة (0 إلى 500، أو -1 إذا غير محدد) للتنبيه قبل النفاد.',
            },
            totalDoses: {
              type: Type.NUMBER,
              description: 'إجمالي الجرعات الأصلية في العبوة/الكورس (0 إلى 500، اختياري).',
            },
          },
          required: ['operation', 'name'],
        },
      },
    },
    required: ['summaryAr', 'medicationActions'],
  },
};

const proposeCreativeActionsDeclaration: FunctionDeclaration = {
  name: 'propose_creative_actions',
  description:
    'اقتراح إضافة أو تعديل أو حذف أو تسجيل جلسة نشاط إبداعي أو هواية أو مشروع شخصي (يومي أو أسبوعي أو شهري، مؤقت أو مستمر) ليظهر تتبعه ويُدمج تلقائياً في الأوقات الفارغة والتقويم.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryAr: {
        type: Type.STRING,
        description: 'ملخص عربي مختصر للتعديل المقترح على الأنشطة الإبداعية.',
      },
      creativeActions: {
        type: Type.ARRAY,
        description: 'قائمة عمليات الأنشطة الإبداعية.',
        items: {
          type: Type.OBJECT,
          properties: {
            operation: {
              type: Type.STRING,
              description: 'نوع العملية: add أو update أو remove أو log_session',
            },
            activityId: {
              type: Type.STRING,
              description: 'معرف النشاط عند التعديل أو الحذف أو تسجيل جلسة.',
            },
            name: {
              type: Type.STRING,
              description: 'اسم الهواية أو المشروع الشخصي (مثال: القراءة، برمجة مشروع جانبي، تصميم، كتابة).',
            },
            emoji: {
              type: Type.STRING,
              description: 'إيموجي مميز للنشاط (مثال: 📚 أو 💻 أو 🎨 أو ✍️).',
            },
            cadence: {
              type: Type.STRING,
              description: 'دورية التتبع: daily (يومي) أو weekly (أسبوعي) أو monthly (شهري). الافتراضي weekly.',
            },
            goalCount: {
              type: Type.NUMBER,
              description: 'عدد الجلسات المستهدف خلال الدورة (1 إلى 31، مثال: 1 ليومي أو 3 لأسبوعي أو 8 لشهري).',
            },
            weeklyGoalSessions: {
              type: Type.NUMBER,
              description: 'الهدف الأسبوعي لعدد الجلسات (من 1 إلى 14، اختياري للتوافق).',
            },
            sessionMinutes: {
              type: Type.NUMBER,
              description: 'مدة الجلسة الواحدة بالدقائق (من 15 إلى 240، مثال: 30 أو 45).',
            },
            scheduledTime24: {
              type: Type.STRING,
              description: 'وقت اختياري مقترح في الفراغ بصيغة HH:MM.',
            },
            expiresOnDate: {
              type: Type.STRING,
              description: 'تاريخ انتهاء تلقائي للأنشطة/المشاريع المؤقتة بصيغة YYYY-MM-DD (اختياري).',
            },
          },
          required: ['operation', 'name'],
        },
      },
    },
    required: ['summaryAr', 'creativeActions'],
  },
};

const proposeProfileUpdatesDeclaration: FunctionDeclaration = {
  name: 'propose_profile_updates',
  description:
    'تحديث «الدستور الشخصي» الدائم للمستخدم في Firestore (الوزن، الطول، حجم الكوب، أيام الصيام، السحور، النوم، الشغل، الموقع، وضع اليوم الهادئ/الطاقة المنخفضة، تعديل صمت الصلاة لمرة واحدة، وتكرار رنين التنبيهات لكل تصنيف).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryAr: {
        type: Type.STRING,
        description: 'ملخص عربي مختصر للتحديث المقترح على الدستور الشخصي.',
      },
      weightKg: { type: Type.NUMBER, description: 'الوزن بالكيلوجرام (30 إلى 250 — أي رقم مرن).' },
      heightCm: { type: Type.NUMBER, description: 'الطول بالسنتيمتر (100 إلى 240).' },
      cupSizeMl: { type: Type.NUMBER, description: 'حجم الكوب أو الزجاجة بالملليلتر (50 إلى 2000 — أي رقم يطلبه المستخدم).' },
      fastingDays: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: 'أيام الصيام الأسبوعية (0=الأحد، 1=الإثنين، 2=الثلاثاء، 3=الأربعاء، 4=الخميس، 5=الجمعة، 6=السبت).',
      },
      suhoorLeadMinutes: {
        type: Type.NUMBER,
        description: 'عدد الدقائق قبل أذان الفجر للسحور (10 إلى 180 — أي رقم يطلبه المستخدم مثل 40 أو 50 أو 65).',
      },
      sleepTargetMinutes: {
        type: Type.NUMBER,
        description: 'هدف ساعات النوم بالدقائق (180 إلى 720 — مثال: 450 = 7.5 ساعات).',
      },
      sleepStrategy: {
        type: Type.STRING,
        description: 'استراتيجية النوم: night_only_strict (الافتراضي: نوم ليلي فقط) أو anchor_early_bed أو biphasic_qailulah.',
      },
      sleepDebtMinutes: {
        type: Type.NUMBER,
        description: 'رصيد النوم الناقص المتراكم بالدقائق (0 إلى 480) لتقديم موعد نوم الليلة تلقائياً بسلاسة (15–45 د/ليلة).',
      },
      adhanLeadMinutes: {
        type: Type.NUMBER,
        description: 'عدد الدقائق للتنبيه قبل الأذان (0 إلى 30 — الافتراضي 3 دقائق).',
      },
      prayerSilenceMinutes: {
        type: Type.NUMBER,
        description: 'مدة كتم الصوت التلقائي الدائمة من بداية أذان الظهر/العصر/المغرب/العشاء بالدقائق (5 إلى 90 — الافتراضي 20).',
      },
      fajrSilenceMinutes: {
        type: Type.NUMBER,
        description: 'مدة كتم الصوت التلقائي الدائمة من بداية أذان الفجر بالدقائق (5 إلى 90 — الافتراضي 30).',
      },
      oneTimeSilenceMinutes: {
        type: Type.NUMBER,
        description: 'تعديل مؤقت لمرة واحدة فقط لمدة كتم الصلاة بالدقائق (5 إلى 120، أو 0 لإلغائه) ثم يعود تلقائياً للوضع الطبيعي.',
      },
      oneTimeSilenceDateKey: {
        type: Type.STRING,
        description: 'تاريخ اليوم (YYYY-MM-DD) الذي يُطبّق فيه التعديل المؤقت لمدة الصمت.',
      },
      lowEnergyDateKey: {
        type: Type.STRING,
        description: 'تاريخ اليوم (YYYY-MM-DD) لتفعيل وضع اليوم الهادئ / الطاقة المنخفضة، أو سلسلة فارغة "" لإلغائه.',
      },
      soundRepeats: {
        type: Type.OBJECT,
        description: 'تخصيص عدد رنات التنبيه لكل تصنيف (1 أو 2 أو 3 أو 4 أو "continuous" للرنين المستمر حتى الإيقاف).',
        properties: {
          prayer: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          water: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          medication: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          focus_work: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          walk_health: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          sleep_suhoor: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          meeting_event: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
          general: { type: Type.STRING, description: '1 | 2 | 3 | 4 | continuous' },
        },
      },
      careerTrack: {
        type: Type.STRING,
        description: 'المجال أو المسار المهني (مثال: DevOps · عمل وكورسات).',
      },
      workEnabled: {
        type: Type.BOOLEAN,
        description: 'true إذا بدأ المستخدم وظيفة بمواعيد ثابتة، false في حالة التفرغ للكورسات فقط.',
      },
      workStart24: {
        type: Type.STRING,
        description: 'حقل تقني لبداية دوام الشغل بصيغة HH:MM (مثال 09:00).',
      },
      workEnd24: {
        type: Type.STRING,
        description: 'حقل تقني لنهاية دوام الشغل بصيغة HH:MM (مثال 17:00).',
      },
      workDays: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: 'أيام الشغل الأسبوعية (0=الأحد .. 6=السبت).',
      },
      currentCityName: {
        type: Type.STRING,
        description: 'اسم المدينة والدولة الحالية عند السفر أو الانتقال (مثال: برلين · ألمانيا).',
      },
      currentTimeZone: {
        type: Type.STRING,
        description: 'المنطقة الزمنية IANA (مثال: Africa/Cairo أو Europe/Berlin أو Europe/London أو Asia/Riyadh).',
      },
      currentLat: { type: Type.NUMBER, description: 'خط العرض الجغرافي للمدينة الجديدة.' },
      currentLng: { type: Type.NUMBER, description: 'خط الطول الجغرافي للمدينة الجديدة.' },
      priorityOrderAr: { type: Type.STRING, description: 'ترتيب الأولويات المحدّث للمستخدم.' },
      personalNotes: { type: Type.STRING, description: 'ملاحظات أو قواعد حياتية دائمة تُحفظ في الدستور.' },
    },
    required: ['summaryAr'],
  },
};

const proposeMemoryActionsDeclaration: FunctionDeclaration = {
  name: 'propose_memory_actions',
  description:
    'حفظ أو تحديث أو حذف قاعدة أو مبدأ شخصي دائم في «ذاكرة Gemini الدائمة» بـ Firestore حتى يتذكرها المساعد تلقائياً في كل جلسة ولا يضطر المستخدم لإعادة شرحها.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryAr: {
        type: Type.STRING,
        description: 'ملخص عربي مختصر لما سيُحفظ في ذاكرة Gemini الدائمة.',
      },
      memoryActions: {
        type: Type.ARRAY,
        description: 'قائمة القواعد المراد حفظها أو حذفها من الذاكرة الدائمة.',
        items: {
          type: Type.OBJECT,
          properties: {
            operation: {
              type: Type.STRING,
              description: 'نوع العملية: add (إضافة قاعدة جديدة) أو remove (حذف قاعدة قديمة).',
            },
            memoryId: {
              type: Type.STRING,
              description: 'معرف القاعدة عند الحذف أو التحديث.',
            },
            category: {
              type: Type.STRING,
              description: 'التصنيف: priority أو sleep أو fasting أو hydration أو work_devops أو travel أو general.',
            },
            ruleText: {
              type: Type.STRING,
              description: 'نص القاعدة أو التفضيل الشخصي الواضح بصياغة مختصرة ودقيقة.',
            },
          },
          required: ['operation', 'category', 'ruleText'],
        },
      },
    },
    required: ['summaryAr', 'memoryActions'],
  },
};

export interface CalendarActionProposal {
  operation: 'create' | 'update' | 'delete' | 'shift';
  eventId?: string;
  calendarId?: string;
  title: string;
  dateIso?: string;
  startTime24?: string;
  durationMinutes?: number;
  description?: string;
  recurrenceRule?: 'DAILY' | 'WEEKLY';
  byDays?: string[];
}

export interface TaskActionProposal {
  operation: 'create' | 'update' | 'complete' | 'reopen' | 'delete';
  taskId?: string;
  taskListId?: string;
  title: string;
  notes?: string;
  dueDateIso?: string;
}

export interface MedicationActionProposal {
  operation: 'add' | 'update' | 'remove' | 'mark_taken';
  medicationId?: string;
  name: string;
  time24?: string;
  times24?: string[];
  daysOfWeek?: number[];
  doseNote?: string;
  courseEndDate?: string;
  remainingDoses?: number;
  totalDoses?: number;
}

export interface CreativeActivityActionProposal {
  operation: 'add' | 'update' | 'remove' | 'log_session';
  activityId?: string;
  name: string;
  emoji?: string;
  cadence?: 'daily' | 'weekly' | 'monthly';
  goalCount?: number;
  weeklyGoalSessions?: number;
  sessionMinutes?: number;
  scheduledTime24?: string;
  expiresOnDate?: string;
}

export interface MemoryActionProposal {
  operation: 'add' | 'remove';
  memoryId?: string;
  category: 'priority' | 'sleep' | 'fasting' | 'hydration' | 'work_devops' | 'travel' | 'general';
  ruleText: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    // Keeps window.opener intact for Firebase Google OAuth signInWithPopup across Desktop & Mobile Chrome
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      wsSyncRooms: syncRooms.size,
      serverTimeIso: new Date().toISOString(),
    });
  });

  // 1. Read user's real Google Calendar events across ALL user calendars via @googleapis/calendar
  app.get('/api/calendar/events', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لعرض أحداث التقويم.' });
        return;
      }

      const now = new Date();
      const startRange = new Date(now.getTime() - 24 * 60 * 60_000);
      const endRange = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

      const cal = getGoogleCalendarClient(authHeader);

      let calendars: Array<{
        id: string;
        summary: string;
        backgroundColor?: string;
        primary?: boolean;
      }> = [];

      try {
        const calListRes = await cal.calendarList.list({
          minAccessRole: 'reader',
          showHidden: false,
        });
        calendars = (calListRes.data.items ?? [])
          .filter((c) => Boolean(c.id))
          .slice(0, 8)
          .map((c) => ({
            id: String(c.id),
            summary: String(c.summaryOverride ?? c.summary ?? 'التقويم'),
            backgroundColor: c.backgroundColor ? String(c.backgroundColor) : undefined,
            primary: Boolean(c.primary),
          }));
      } catch {
        // Fallback smoothly if user granted events scope before calendarList scope
        calendars = [];
      }

      if (calendars.length === 0) {
        calendars = [{ id: 'primary', summary: 'التقويم الأساسي', primary: true }];
      }

      const fetchedLists = await Promise.allSettled(
        calendars.map(async (cInfo) => {
          const response = await cal.events.list({
            calendarId: cInfo.id,
            singleEvents: true,
            orderBy: 'startTime',
            timeMin: startRange.toISOString(),
            timeMax: endRange.toISOString(),
            maxResults: 60,
          });
          const items = response.data.items ?? [];
          return items.map((ev) => ({
            id: String(ev.id ?? ''),
            calendarId: cInfo.id,
            calendarTitle: cInfo.summary,
            calendarColor: cInfo.backgroundColor,
            summary: String(ev.summary ?? '(بدون عنوان)'),
            start: String(ev.start?.dateTime ?? ev.start?.date ?? ''),
            end: String(ev.end?.dateTime ?? ev.end?.date ?? ''),
            isAllDay: Boolean(ev.start?.date && !ev.start?.dateTime),
            description: String(ev.description ?? ''),
            location: ev.location ? String(ev.location) : undefined,
            htmlLink: ev.htmlLink ? String(ev.htmlLink) : undefined,
            status: ev.status ? String(ev.status) : undefined,
          }));
        })
      );

      const merged: Array<{
        id: string;
        calendarId: string;
        calendarTitle: string;
        calendarColor?: string;
        summary: string;
        start: string;
        end: string;
        isAllDay: boolean;
        description: string;
        location?: string;
        htmlLink?: string;
        status?: string;
      }> = [];
      const seenKeys = new Set<string>();

      for (const result of fetchedLists) {
        if (result.status !== 'fulfilled') continue;
        for (const ev of result.value) {
          const key = `${ev.calendarId}:${ev.id}`;
          if (!ev.id || seenKeys.has(key)) continue;
          seenKeys.add(key);
          merged.push(ev);
        }
      }

      merged.sort((a, b) => a.start.localeCompare(b.start));

      res.json({ calendars, events: merged });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'code' in err && Number((err as { code?: unknown }).code) === 401
          ? 401
          : 500;
      const msg = err instanceof Error ? err.message : 'خطأ في قراءة Google Calendar.';
      res.status(status).json({ error: msg });
    }
  });

  // 2. Execute user-confirmed Google Calendar mutations via @googleapis/calendar
  app.post('/api/calendar/execute', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لتنفيذ التعديلات على التقويم.' });
        return;
      }

      const { actions } = req.body as { actions?: CalendarActionProposal[] };
      if (!Array.isArray(actions) || actions.length === 0) {
        res.status(400).json({ error: 'لا توجد تعديلات لتنفيذها.' });
        return;
      }

      const cal = getGoogleCalendarClient(authHeader);
      const results: Array<{
        title: string;
        operation: string;
        status: string;
        id?: string;
        htmlLink?: string;
        start?: string;
        end?: string;
      }> = [];

      const isLikelyGoogleEventId = (id?: string) =>
        Boolean(id && !id.includes('prayer_') && !id.startsWith('chat-') && id.length >= 6);

      for (const act of actions) {
        const op = act.operation;
        const calendarId = act.calendarId || 'primary';
        const { startDateTime, endDateTime } = computeCairoEventRange(
          act.dateIso,
          act.startTime24,
          act.durationMinutes
        );

        let targetEventId = isLikelyGoogleEventId(act.eventId) ? act.eventId : undefined;

        if ((op === 'delete' || op === 'update' || op === 'shift') && !targetEventId && act.title) {
          const searchRes = await cal.events.list({
            calendarId,
            q: act.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim() || act.title,
            singleEvents: true,
            maxResults: 5,
            timeMin: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
            timeMax: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
          });
          const match = searchRes.data.items?.find((item) => item.id);
          if (match?.id) {
            targetEventId = match.id;
          }
        }

        if (op === 'delete') {
          if (targetEventId) {
            try {
              await cal.events.delete({
                calendarId,
                eventId: targetEventId,
              });
            } catch (delErr: unknown) {
              const code =
                typeof delErr === 'object' && delErr !== null && 'code' in delErr
                  ? Number((delErr as { code?: unknown }).code)
                  : 0;
              if (code !== 410 && code !== 404) throw delErr;
            }
            results.push({
              title: act.title,
              operation: op,
              status: 'deleted',
              id: targetEventId,
            });
          } else {
            results.push({
              title: act.title,
              operation: op,
              status: 'deleted_in_app_only',
            });
          }
        } else if ((op === 'update' || op === 'shift') && targetEventId) {
          const patchRes = await cal.events.patch({
            calendarId,
            eventId: targetEventId,
            requestBody: {
              summary: act.title,
              description: act.description,
              start: { dateTime: startDateTime, timeZone: 'Africa/Cairo' },
              end: { dateTime: endDateTime, timeZone: 'Africa/Cairo' },
            },
          });
          results.push({
            title: act.title,
            operation: op,
            status: 'updated',
            id: patchRes.data.id ?? targetEventId,
            htmlLink: patchRes.data.htmlLink ?? undefined,
            start: startDateTime,
            end: endDateTime,
          });
        } else {
          const validByDays = Array.isArray(act.byDays)
            ? act.byDays.filter((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(d))
            : [];
          const recurrence =
            act.recurrenceRule === 'DAILY'
              ? ['RRULE:FREQ=DAILY']
              : act.recurrenceRule === 'WEEKLY'
                ? [
                    validByDays.length > 0
                      ? `RRULE:FREQ=WEEKLY;BYDAY=${validByDays.join(',')}`
                      : 'RRULE:FREQ=WEEKLY',
                  ]
                : undefined;

          const insertRes = await cal.events.insert({
            calendarId,
            requestBody: {
              summary: act.title,
              description:
                act.description ?? 'تم الإنشاء والمزامنة عبر شات Gemini · إيقاع اليوم DayRhythm',
              start: { dateTime: startDateTime, timeZone: 'Africa/Cairo' },
              end: { dateTime: endDateTime, timeZone: 'Africa/Cairo' },
              recurrence,
            },
          });
          results.push({
            title: act.title,
            operation: op === 'update' || op === 'shift' ? op : 'create',
            status: 'created',
            id: insertRes.data.id ?? undefined,
            htmlLink: insertRes.data.htmlLink ?? undefined,
            start: startDateTime,
            end: endDateTime,
          });
        }
      }

      const uidHeader = String(req.headers['x-user-uid'] ?? '').trim();
      const clientIdHeader = String(req.headers['x-client-id'] ?? '').trim();
      const opId = `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      if (uidHeader) {
        broadcastUserSync(
          uidHeader,
          {
            type: 'sync',
            opId,
            clientId: clientIdHeader || 'server',
            scope: 'calendar',
            action: actions[0]?.operation ?? 'mutate',
            undoSnapshot: (req.body as { undoSnapshot?: unknown }).undoSnapshot,
            timestampMs: Date.now(),
          },
          clientIdHeader || undefined
        );
      }

      res.json({ ok: true, opId, results });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'code' in err && Number((err as { code?: unknown }).code) === 401
          ? 401
          : 500;
      const msg = err instanceof Error ? err.message : 'تعذر تنفيذ تعديلات Google Calendar.';
      res.status(status).json({ error: msg });
    }
  });

  // 2b. Read user's real Google Tasks lists and tasks via Tasks REST API
  app.get('/api/tasks', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لعرض Google Tasks.' });
        return;
      }

      const listsRes = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20',
        { headers: { Authorization: authHeader } }
      );
      if (listsRes.status === 401 || listsRes.status === 403) {
        const errData = await listsRes.json().catch(() => ({}));
        res.status(listsRes.status).json({
          error:
            (errData as { error?: { message?: string } })?.error?.message ||
            'يرجى إعادة تسجيل الدخول لمنح صلاحية Google Tasks.',
        });
        return;
      }

      const listsJson = (await listsRes.json()) as {
        items?: Array<{ id?: string; title?: string }>;
      };
      const taskLists = (listsJson.items ?? [])
        .filter((l) => Boolean(l.id))
        .slice(0, 6)
        .map((l) => ({
          id: String(l.id),
          title: String(l.title ?? 'مهامي'),
        }));

      const fetchedTasks = await Promise.allSettled(
        taskLists.map(async (list) => {
          const tRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=false&maxResults=100`,
            { headers: { Authorization: authHeader } }
          );
          if (!tRes.ok) return [];
          const tJson = (await tRes.json()) as {
            items?: Array<{
              id?: string;
              title?: string;
              notes?: string;
              status?: string;
              due?: string;
              completed?: string;
              updated?: string;
            }>;
          };
          return (tJson.items ?? [])
            .filter((t) => Boolean(t.id && t.title))
            .map((t) => ({
              id: String(t.id),
              taskListId: list.id,
              taskListTitle: list.title,
              title: String(t.title ?? ''),
              notes: t.notes ? String(t.notes) : undefined,
              status: (t.status === 'completed' ? 'completed' : 'needsAction') as
                | 'needsAction'
                | 'completed',
              due: t.due ? String(t.due) : undefined,
              completed: t.completed ? String(t.completed) : undefined,
              updated: t.updated ? String(t.updated) : undefined,
            }));
        })
      );

      const tasks = fetchedTasks.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      res.json({ taskLists, tasks });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في قراءة Google Tasks.';
      res.status(500).json({ error: msg });
    }
  });

  // 2c. Execute user-confirmed Google Tasks mutations via Tasks REST API
  app.post('/api/tasks/execute', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لتعديل Google Tasks.' });
        return;
      }

      const { taskActions } = req.body as { taskActions?: TaskActionProposal[] };
      if (!Array.isArray(taskActions) || taskActions.length === 0) {
        res.status(400).json({ error: 'لا توجد تعديلات للمهام لتنفيذها.' });
        return;
      }

      const results: Array<{
        title: string;
        operation: string;
        status: string;
        id?: string;
        taskListId?: string;
      }> = [];

      for (const act of taskActions) {
        const listId = act.taskListId || '@default';
        const op = act.operation;

        if (op === 'create') {
          const payload: Record<string, string> = { title: act.title };
          if (act.notes) payload.notes = act.notes;
          if (act.dueDateIso && /^\d{4}-\d{2}-\d{2}$/.test(act.dueDateIso)) {
            payload.due = `${act.dueDateIso}T09:00:00.000Z`;
          }
          const createRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
            {
              method: 'POST',
              headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          );
          const created = (await createRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
          if (!createRes.ok) {
            throw new Error(created?.error?.message || 'تعذر إنشاء المهمة في Google Tasks.');
          }
          results.push({
            title: act.title,
            operation: op,
            status: 'created',
            id: created.id,
            taskListId: listId,
          });
        } else if (op === 'delete' && act.taskId) {
          const delRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(act.taskId)}`,
            {
              method: 'DELETE',
              headers: { Authorization: authHeader },
            }
          );
          if (!delRes.ok && delRes.status !== 404) {
            throw new Error('تعذر حذف المهمة من Google Tasks.');
          }
          results.push({
            title: act.title,
            operation: op,
            status: 'deleted',
            id: act.taskId,
            taskListId: listId,
          });
        } else if (act.taskId) {
          const patchPayload: Record<string, unknown> = {};
          if (op === 'complete') {
            patchPayload.status = 'completed';
          } else if (op === 'reopen') {
            patchPayload.status = 'needsAction';
            patchPayload.completed = null;
          } else {
            if (act.title) patchPayload.title = act.title;
            if (act.notes !== undefined) patchPayload.notes = act.notes;
            if (act.dueDateIso && /^\d{4}-\d{2}-\d{2}$/.test(act.dueDateIso)) {
              patchPayload.due = `${act.dueDateIso}T09:00:00.000Z`;
            }
          }
          const patchRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(act.taskId)}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(patchPayload),
            }
          );
          const patched = (await patchRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
          if (!patchRes.ok) {
            throw new Error(patched?.error?.message || 'تعذر تحديث المهمة في Google Tasks.');
          }
          results.push({
            title: act.title,
            operation: op,
            status: op === 'complete' ? 'completed' : op === 'reopen' ? 'reopened' : 'updated',
            id: patched.id ?? act.taskId,
            taskListId: listId,
          });
        }
      }

      const uidHeader = String(req.headers['x-user-uid'] ?? '').trim();
      const clientIdHeader = String(req.headers['x-client-id'] ?? '').trim();
      const opId = `tsk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      if (uidHeader) {
        broadcastUserSync(
          uidHeader,
          {
            type: 'sync',
            opId,
            clientId: clientIdHeader || 'server',
            scope: 'tasks',
            action: taskActions[0]?.operation ?? 'mutate',
            undoSnapshot: (req.body as { undoSnapshot?: unknown }).undoSnapshot,
            timestampMs: Date.now(),
          },
          clientIdHeader || undefined
        );
      }

      res.json({ ok: true, opId, results });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تعديل Google Tasks.';
      res.status(500).json({ error: msg });
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
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12&q=in:inbox+newer_than:7d',
        { headers: { Authorization: authHeader } }
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
        .slice(0, 12);

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
            { headers: { Authorization: authHeader } }
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
            subject: getHeader('Subject').slice(0, 160),
            from: getHeader('From').slice(0, 120),
            date: getHeader('Date').slice(0, 80),
            snippet: String(mJson.snippet ?? '').slice(0, 280),
          };
        })
      );

      const emails = detailResults
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((e): e is NonNullable<typeof e> => Boolean(e && (e.subject || e.snippet)));

      if (emails.length === 0) {
        res.json({ scannedCount: 0, digestItems: [] });
        return;
      }

      const todayCairo = getCairoTodayIso();
      const emailListPrompt = emails
        .map(
          (e, i) =>
            `[${i + 1}] messageId=${e.id}\nFrom: ${e.from}\nDate: ${e.date}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`
        )
        .join('\n---\n');

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `تاريخ اليوم بتوقيت القاهرة: ${todayCairo}\n\nالرسائل الواردة (آخر 7 أيام):\n${emailListPrompt}\n\nاستخرج فقط الرسائل التي تحتوي على موعد حقيقي أو مقابلة عمل أو اجتماع أو تذكرة سفر/قطار/طيران أو موعد طبي أو موعد تسليم (deadline) أو توصيل مهم يستحق إضافته للتقويم. تجاهل النشرات الإخبارية والإعلانات والعروض الترويجية ورسائل التحقق OTP تماماً.`,
        config: {
          systemInstruction:
            'أنت محلل ذكي لصندوق بريد Gmail لبرنامج إيقاع اليوم. أرجع JSON فقط وفق المخطط المحدد. استخدم اللغة العربية في العنوان والملخص، وصيغة YYYY-MM-DD للتاريخ و HH:MM لوقت البداية التقني. إذا لم توجد مواعيد حقيقية أرجع مصفوفة فارغة.',
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

      const rawText = response.text ?? '{"items":[]}';
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
      const msg = err instanceof Error ? err.message : 'تعذر تحليل ملخص Gmail.';
      res.status(500).json({ error: msg });
    }
  });

  // 3. Multi-turn Gemini Chat with Hybrid Google Search + Calendar/Tasks/Meds/Creative Function Calling
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        message,
        history,
        contextSummary,
        calendarEvents,
        tasks,
        medications,
        creativeActivities,
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        contextSummary?: string;
        calendarEvents?: Array<{
          id: string;
          calendarId?: string;
          calendarTitle?: string;
          summary: string;
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
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'الرسالة مطلوبة.' });
        return;
      }

      const ai = getGeminiClient();
      const formattedHistory: Content[] = Array.isArray(history)
        ? history.map((h) => ({
            role: h.role,
            parts: [{ text: h.text }],
          }))
        : [];

      const todayCairo = getCairoTodayIso();
      const nowCairo12 = getCairoNowTime12();
      const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

      const eventsListText =
        Array.isArray(calendarEvents) && calendarEvents.length > 0
          ? `\n\nأحداث Google Calendar الفعلية (مقروءة من تقويمات المستخدم للأسبوع، بنظام 12 ساعة):\n${calendarEvents
              .map(
                (e) =>
                  `- [eventId=${e.id}${e.calendarId ? ` | calendarId=${e.calendarId}` : ''}${e.calendarTitle ? ` | التقويم: ${e.calendarTitle}` : ''}] ${e.summary} | من: ${formatServerIsoTo12h(e.start)}${e.end ? ` | إلى: ${formatServerIsoTo12h(e.end)}` : ''}`
              )
              .join('\n')}`
          : '\n\nملاحظة: لا توجد أحداث مسجلة حالياً في Google Calendar ضمن النطاق المعروض أو لم يتم ربط الحساب بعد.';

      const tasksListText =
        Array.isArray(tasks) && tasks.length > 0
          ? `\n\nمهام Google Tasks الفعلية الحالية:\n${tasks
              .map(
                (t) =>
                  `- [taskId=${t.id} | taskListId=${t.taskListId}${t.taskListTitle ? ` | القائمة: ${t.taskListTitle}` : ''}] ${t.title} | الحالة: ${t.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}${t.due ? ` | الاستحقاق: ${t.due.slice(0, 10)}` : ''}`
              )
              .join('\n')}`
          : '\n\nملاحظة: لا توجد مهام حالياً في Google Tasks أو لم يتم ربط الحساب بعد.';

      const medsListText =
        Array.isArray(medications) && medications.length > 0
          ? `\n\nقائمة العلاجات والمكملات الحالية:\n${medications
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
                    ? ` | المتبقي: ${m.remainingDoses}${typeof m.totalDoses === 'number' && m.totalDoses > 0 ? `/${m.totalDoses}` : ''} جرعة`
                    : '';
                return `- [medicationId=${m.id}] ${m.name} | المواعيد: ${doses} | التكرار: ${daysStr}${courseStr}${refillStr}${m.doseNote ? ` | ${m.doseNote}` : ''} | حالة اليوم: ${m.takenToday ? 'تم التناول ✓' : m.takenDosesToday && m.takenDosesToday.length > 0 ? `أُخذ (${m.takenDosesToday.join(', ')})` : 'لم يُؤخذ بعد'}`;
              })
              .join('\n')}`
          : '';

      const creativeListText =
        Array.isArray(creativeActivities) && creativeActivities.length > 0
          ? `\n\nالأنشطة الإبداعية والهوايات المسجلة:\n${creativeActivities
              .map((a) => {
                const cadAr =
                  a.cadence === 'daily' ? 'يومي' : a.cadence === 'monthly' ? 'شهري' : 'أسبوعي';
                return `- [activityId=${a.id}] ${a.emoji ?? '🎨'} ${a.name} | (${cadAr}: ${a.sessionsInPeriod ?? a.sessionsThisWeek}/${a.goalCount ?? a.weeklyGoalSessions}) | المدة: ${a.sessionMinutes} د${a.expiresOnDate ? ` | حتى ${a.expiresOnDate}` : ''}${a.scheduledTime24 ? ` | موعد مجدول: ${a.scheduledTime24}` : ''} | اليوم: ${a.completedToday ? 'أُنجز ✓' : 'لم يُنجز بعد'}`;
              })
              .join('\n')}`
          : '';

      const systemInstruction = `${DAYRHYTHM_SYSTEM_INSTRUCTION}\n\nتاريخ اليوم بتوقيت القاهرة: ${todayCairo}\nالوقت الحالي بتوقيت القاهرة: ${nowCairo12}\n${contextSummary ?? ''}${eventsListText}${tasksListText}${medsListText}${creativeListText}`;

      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: formattedHistory,
        config: {
          systemInstruction,
          tools: [
            { googleSearch: {} },
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
          ],
          toolConfig: {
            includeServerSideToolInvocations: true,
          },
        },
      });

      const response = await chat.sendMessage({ message });
      const fnCalls = response.functionCalls;

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = groundingChunks
        .filter((c) => c.web?.uri)
        .map((c) => ({
          title: c.web?.title ?? c.web?.uri ?? 'مصدر ويب',
          uri: c.web?.uri ?? '',
        }));

      if (fnCalls && fnCalls.length > 0) {
        const calCall = fnCalls.find((f) => f.name === 'propose_calendar_actions');
        const taskCall = fnCalls.find((f) => f.name === 'propose_task_actions');
        const medCall = fnCalls.find((f) => f.name === 'propose_medication_actions');
        const creativeCall = fnCalls.find((f) => f.name === 'propose_creative_actions');
        const profileCall = fnCalls.find((f) => f.name === 'propose_profile_updates');
        const memoryCall = fnCalls.find((f) => f.name === 'propose_memory_actions');
        if (calCall || taskCall || medCall || creativeCall || profileCall || memoryCall) {
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
          const profileArgs = (profileCall?.args ?? {}) as Record<string, unknown>;
          const { summaryAr: profileSummaryAr, ...rawProfilePatch } = profileArgs;
          const profileUpdates =
            profileCall && Object.keys(rawProfilePatch).length > 0
              ? rawProfilePatch
              : undefined;
          const memoryArgs = (memoryCall?.args ?? {}) as {
            summaryAr?: string;
            memoryActions?: MemoryActionProposal[];
          };

          const actions = Array.isArray(calArgs.actions) ? calArgs.actions : [];
          const taskActions = Array.isArray(taskArgs.taskActions) ? taskArgs.taskActions : [];
          const medicationActions = Array.isArray(medArgs.medicationActions)
            ? medArgs.medicationActions
            : [];
          const creativeActions = Array.isArray(creativeArgs.creativeActions)
            ? creativeArgs.creativeActions
            : [];
          const memoryActions = Array.isArray(memoryArgs.memoryActions)
            ? memoryArgs.memoryActions
            : [];
          const summaryAr =
            [
              calArgs.summaryAr,
              taskArgs.summaryAr,
              medArgs.summaryAr,
              creativeArgs.summaryAr,
              typeof profileSummaryAr === 'string' ? profileSummaryAr : undefined,
              memoryArgs.summaryAr,
            ]
              .filter(Boolean)
              .join(' · ') || 'تعديل التقويم والدستور والذاكرة الدائمة';

          res.json({
            text:
              response.text ||
              summaryAr ||
              'أعددتُ التعديلات المطلوبة — راجع التفاصيل وأكد التنفيذ.',
            sources: sources.length > 0 ? sources : undefined,
            pendingProposal: {
              summaryAr,
              actions,
              taskActions,
              medicationActions,
              creativeActions,
              profileUpdates,
              memoryActions,
            },
          });
          return;
        }
      }

      res.json({
        text: response.text ?? '',
        sources: sources.length > 0 ? sources : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الاتصال بـ Gemini.';
      res.status(500).json({ error: msg });
    }
  });

  // 4. Google Maps Grounding Endpoint
  app.post('/api/maps', async (req, res) => {
    try {
      const { query, lat, lng } = req.body as {
        query?: string;
        lat?: number;
        lng?: number;
      };

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'استعلام الخرائط مطلوب.' });
        return;
      }

      const latitude = typeof lat === 'number' ? lat : 31.1953;
      const longitude = typeof lng === 'number' ? lng : 31.5212;

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: query,
        config: {
          systemInstruction:
            'أجب بالعربية بوضوح واذكر أقرب الأماكن والمساجد والخدمات بدقة بناءً على بيانات خرائط جوجل.',
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude, longitude },
            },
          },
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

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

      res.json({
        text: response.text ?? '',
        places,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر جلب بيانات خرائط جوجل.';
      res.status(500).json({ error: msg });
    }
  });

  // 5. Google Search Grounding Endpoint
  app.post('/api/search', async (req, res) => {
    try {
      const { query } = req.body as { query?: string };
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'استعلام البحث مطلوب.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: query,
        config: {
          systemInstruction:
            'أجب بالعربية بدقة واختصار مستنداً إلى نتائج البحث الحية، مع احترام خصوصية المستخدم.',
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const sources = chunks
        .filter((c) => c.web?.uri)
        .map((c) => ({
          title: c.web?.title ?? c.web?.uri ?? 'مصدر ويب',
          uri: c.web?.uri ?? '',
        }));

      res.json({
        text: response.text ?? '',
        sources,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إجراء البحث المباشر.';
      res.status(500).json({ error: msg });
    }
  });

  const httpServer = http.createServer(app);

  // Real-Time Cross-Device Sync WebSocket Hub (/ws/sync) on same port 3000
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (pathname === '/ws/sync') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const aliveSockets = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    let joinedUid = '';
    let entry: SyncClientEntry | null = null;
    aliveSockets.set(ws, true);

    ws.on('pong', () => {
      aliveSockets.set(ws, true);
    });

    const removeFromRoom = () => {
      if (joinedUid && entry) {
        const room = syncRooms.get(joinedUid);
        room?.delete(entry);
        if (room && room.size === 0) {
          syncRooms.delete(joinedUid);
        }
        entry = null;
      }
    };

    ws.on('message', (raw) => {
      aliveSockets.set(ws, true);
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          uid?: string;
          clientId?: string;
          opId?: string;
          scope?: string;
          action?: string;
          undoSnapshot?: unknown;
          timestampMs?: number;
        };
        if (msg.type === 'join' && typeof msg.uid === 'string' && msg.uid.length > 0 && msg.uid.length <= 128) {
          removeFromRoom();
          joinedUid = msg.uid;
          entry = { ws, clientId: String(msg.clientId ?? 'anon').slice(0, 64) };
          if (!syncRooms.has(joinedUid)) {
            syncRooms.set(joinedUid, new Set());
          }
          syncRooms.get(joinedUid)!.add(entry);
          ws.send(JSON.stringify({ type: 'joined', uid: joinedUid, peers: syncRooms.get(joinedUid)!.size }));
        } else if (msg.type === 'broadcast' && joinedUid && entry) {
          broadcastUserSync(
            joinedUid,
            {
              type: 'sync',
              opId: msg.opId ?? `ws_${Date.now().toString(36)}`,
              clientId: entry.clientId,
              scope: msg.scope ?? 'all',
              action: msg.action ?? 'update',
              undoSnapshot: msg.undoSnapshot,
              timestampMs: msg.timestampMs ?? Date.now(),
            },
            entry.clientId
          );
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // ignore malformed WS payload
      }
    });

    ws.on('close', removeFromRoom);
    ws.on('error', () => {
      removeFromRoom();
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    });
  });

  // Server-side dead-connection reaper: terminates half-open WebSockets automatically
  const wsHeartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (aliveSockets.get(client) === false) {
        try {
          client.terminate();
        } catch {
          // ignore
        }
        return;
      }
      aliveSockets.set(client, false);
      try {
        client.ping();
      } catch {
        try {
          client.terminate();
        } catch {
          // ignore
        }
      }
    });
  }, 30_000);
  wss.on('close', () => clearInterval(wsHeartbeatInterval));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (process.env.DISABLE_HMR === 'true') {
      // Vite 8 still serves /@vite/client with a :24678 WebSocket client in middlewareMode even when hmr:false.
      // Serve a faithful zero-WebSocket shim that preserves CSS injection & HMR exports without WS errors.
      const NO_HMR_VITE_CLIENT = `
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export class ErrorOverlay extends HTMLElement {}
`.trim();

      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(NO_HMR_VITE_CLIENT);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DayRhythm server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DayRhythm server:', err);
  process.exit(1);
});
