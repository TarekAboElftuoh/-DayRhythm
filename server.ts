import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { calendar } from '@googleapis/calendar';
import {
  Content,
  FunctionCall,
  FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  sanitizeGeminiOutputText,
  extractPendingProposalFromFunctionCalls,
} from './src/services/geminiSanitizer';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

export function getLocalLanIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

interface SyncClientEntry {
  ws: WebSocket;
  clientId: string;
}

interface ServerBatterySnapshot {
  levelPct: number;
  charging: boolean;
  chargeLimitPct: number;
  updatedAtMs: number;
  deviceLabel: string;
}

const syncRooms = new Map<string, Set<SyncClientEntry>>();
const latestBatteryByUid = new Map<string, ServerBatterySnapshot>();

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
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
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
   - لديك صلاحية كاملة لحذف أي علاج أو مكمل عند طلب المستخدم صراحةً (مثل «امسح / احذف / وقفت علاج ...»): استخدم propose_medication_actions بعملية remove مع تمرير medicationId أو اسم العلاج الدقيق من قائمته الحالية، واقترح معه حذف الحدث المرتبط به في Google Calendar إن وُجد عبر propose_calendar_actions، وسيظهر للمستخدم زر تأكيد نهائي قبل التنفيذ لحمايته من أي حذف خاطئ.
   - ادعم الجرعات المتعددة (times24)، الأيام المحددة (daysOfWeek)، مدة الكورس (courseEndDate)، وعدد الجرعات المتبقية (remainingDoses / totalDoses).
5. تحديث الوزن والماء والثوابت بمرونة كاملة:
   - الوزن متغيّر دائماً (المرجع الحالي موجود في الدستور أدناه): لو أبلغك المستخدم بتغيّر وزنه، اقترح فوراً تحديث weightKg عبر propose_profile_updates فيُعاد حساب هدف الماء العلمي وتوزيع الأكواب تلقائياً.
   - عدّل أي ثابت بلا قيود عبر propose_profile_updates، واحفظ أي قاعدة أو مبدأ دائم عبر propose_memory_actions.
6. الأنشطة الإبداعية والهوايات والمشاريع:
   - استخدم propose_creative_actions لإضافة أو تعديل أو حذف أو تسجيل جلسة نشاط إبداعي، وعند جدولته في Google Calendar ضعه دائماً في الأوقات الفارغة الفعلية.
7. وضع اليوم الهادئ / الطاقة المنخفضة، وتعديل مدة الصمت لمرة واحدة، وتكرار الرنين، ومدة التأجيل (Snooze):
   - إذا قال المستخدم «النهارده تعبان / مرهق / طاقتي قليلة»: فعّل له وضع اليوم الهادئ بتعيين lowEnergyDateKey لتاريخ اليوم (YYYY-MM-DD) عبر propose_profile_updates، واقترح ترحيل المهام غير العاجلة بهدوء.
   - إذا طلب تعديل مدة كتم الصوت للصلاة لمرة واحدة استخدم oneTimeSilenceMinutes + oneTimeSilenceDateKey، ولعدد الرنات استخدم soundRepeats.
   - إذا طلب المستخدم تغيير مدة زر التأجيل (Snooze) للتنبيهات (مثل «خلي التأجيل 10 دقائق» أو «رجع التأجيل 5 دقائق» أو «خليه 15 دقيقة»): عدّل defaultSnoozeMinutes إلى 5 أو 10 أو 15 عبر propose_profile_updates (الافتراضي 5 دقائق).
8. الذاكرة السحابية طويلة المدى كمرجع دائم لكل مستخدم:
   - هذا التطبيق عام لكل مستخدم ويرتبط ببياناته السحابية الخاصة بحساب Google فقط؛ لا تفترض أي معلومات شخصية أو أدوية أو مدن غير موجودة فعلياً في «الدستور الشخصي» أو «الذاكرة الدائمة» أو «قائمة العلاجات» المرفقة أدناه.
   - كلما ذكر المستخدم معلومة دائمة عن حياته (مكمل جديد، هدف طويل المدى، مجال عمله، قاعدة يومية، خطة مشروع أو قرار مهم قد يرجع له مستقبلاً)، اقترح تلقائياً حفظها في الذاكرة الدائمة عبر propose_memory_actions (أو الأداة المناسبة) حتى تصبح مرجعاً سحابياً دائماً له في كل المحادثات القادمة.
   - إذا أشار المستخدم لموضوع تحدث عنه سابقاً، استعن بـ «ذاكرة المستخدم الدائمة» و«مقتطفات المحادثات السابقة المحفوظة في السحابة» للإجابة بدقة واستمرارية.
9. قواعد الخصوصية (إلزامية): لا تكتب أبداً نصاً صريحاً لتنظيف الأسنان — استخدم 🦷 أو 🪥 فقط، و🌱 فقط للالتزام اليومي دون وصف نصي صريح. عناوين أحداث التقويم: إيموجي واحد أو اثنان في البداية فقط ثم نص قصير، بدون أي إيموجي مكرر.
10. الإيجاز: ممنوع تكرار نفس الإيموجي في نفس السطر، وممنوع تكرار نفس المعلومة أو نفس الحدث مرتين؛ جملتين إلى أربع جمل كحد أقصى.
11. التنبيهات والتذكيرات من الشات (إلزامي): أي «نبهني / فكرني / ذكرني» لازم يتحول لحدث عبر propose_calendar_actions (create) — ممنوع ترد «تم» من غير الأداة. للطلب النسبي («بعد 5 دقايق») حط startInMinutes بعدد الدقايق ومتحسبش الوقت بنفسك. العنوان = الحاجة نفسها: "⏰ اتصل بمحمد" (أو "⏰ تنبيه") من غير وقت أو مدة جوه العنوان، والمدة الافتراضية 15 دقيقة.
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
            startInMinutes: {
              type: Type.NUMBER,
              description:
                'للتنبيهات النسبية فقط («بعد 5 دقايق»): عدد الدقايق من دلوقتي، والتطبيق بيحسب الوقت. لما تستخدمه متبعتش dateIso ولا startTime24.',
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
            applyToAllDays: {
              type: Type.BOOLEAN,
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
              description: 'اسم العلاج أو المكمل (مثال: فيتامين د، ماغنيسيوم، أوميجا 3، حديد، أو أي دواء يذكره المستخدم).',
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
            refillAlertDays: {
              type: Type.NUMBER,
              description: 'عدد الأيام قبل انتهاء العبوة لإطلاق تنبيه شراء جرعات جديدة (من 1 إلى 14، الافتراضي 3 أيام أو يومين).',
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
      defaultSnoozeMinutes: {
        type: Type.NUMBER,
        description: 'مدة التأجيل الافتراضية لزر تأجيل التنبيهات بالدقائق: 5 أو 10 أو 15 فقط (الافتراضي 5).',
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
        description: 'المجال أو المسار المهني والدراسي للمستخدم (مثال: برمجة، تصميم، طب، إدارة، دراسة).',
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
              description: 'نوع العملية: add (إضافة قاعدة جديدة) أو update (تعديل قاعدة موجودة) أو remove (حذف قاعدة قديمة).',
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
  applyToAllDays?: boolean;
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
  refillAlertDays?: number;
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
  operation: 'add' | 'update' | 'remove';
  memoryId?: string;
  category: 'priority' | 'sleep' | 'fasting' | 'hydration' | 'work_devops' | 'travel' | 'general';
  ruleText: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    // Allow standalone Windows EXE & Android APK (served on Firebase-authorized virtual host or local WebView) to call /api/*
    const origin = req.headers.origin;
    if (
      typeof origin === 'string' &&
      (origin === 'https://gen-lang-client-0625331922.web.app' ||
        origin === 'https://gen-lang-client-0625331922.firebaseapp.com' ||
        origin.endsWith('.run.app') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('https://localhost') ||
        origin === 'null')
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Cache-Control, x-user-uid, x-client-id'
      );
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    // Keeps window.opener intact for Firebase Google OAuth signInWithPopup across Desktop & Mobile Chrome
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  let geminiProbeCache: {
    ok: boolean;
    connected: boolean;
    status: 'online' | 'degraded' | 'offline';
    model: string;
    latencyMs: number;
    checkedAtIso: string;
    error?: string;
    expiresAtMs: number;
  } | null = null;

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      wsSyncRooms: syncRooms.size,
      serverTimeIso: new Date().toISOString(),
    });
  });

  app.get('/api/lan-server-info', (_req, res) => {
    const ips = getLocalLanIps();
    const primaryIp = ips[0] || 'localhost';
    res.json({
      port: PORT,
      localIps: ips,
      primaryUrl: `http://${primaryIp}:${PORT}`,
      socketPath: '/socket.io',
    });
  });

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
  app.get('/api/calendar/events', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لعرض أحداث التقويم.' });
        return;
      }

      const now = new Date();
      const startRange = new Date(now.getTime() - 24 * 60 * 60_000);
      const endRange = new Date(now.getTime() + 14 * 24 * 60 * 60_000);

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
            maxResults: 120,
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
            isRecurring: Boolean(ev.recurringEventId),
            recurringEventId: ev.recurringEventId ? String(ev.recurringEventId) : undefined,
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
        isRecurring?: boolean;
        recurringEventId?: string;
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
        if (act.applyToAllDays && targetEventId && targetEventId.includes('_')) {
          targetEventId = targetEventId.split('_')[0];
        }

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
            targetEventId = (act.applyToAllDays && match.recurringEventId)
              ? match.recurringEventId
              : (act.applyToAllDays && match.id.includes('_'))
                ? match.id.split('_')[0]
                : match.id;
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
        .filter((l) => Boolean(l.id) && l.title !== '[DayRhythm Sync Vault]')
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
            .filter((t) => Boolean(t.id && t.title) && t.title !== 'sync_state')
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

  interface ChatRequestPayload {
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

  function buildChatSystemInstruction(payload: ChatRequestPayload): {
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
            .map(
              (m, idx) =>
                `${idx + 1}. [id=${m.id}|${m.category}] ${m.ruleText.trim().slice(0, 180)}`
            )
            .join('\n')}`
        : '';

    const eventsListText =
      Array.isArray(payload.calendarEvents) && payload.calendarEvents.length > 0
        ? `\n\nأحداث Google Calendar:\n${payload.calendarEvents
            .slice(0, 18)
            .map((e) => `- [id=${e.id}${e.calendarId ? `|cal=${e.calendarId}` : ''}] ${e.summary} | ${formatServerIsoTo12h(e.start)}${e.end ? `–${formatServerIsoTo12h(e.end)}` : ''}`)
            .join('\n')}`
        : '';

    const tasksListText =
      Array.isArray(payload.tasks) && payload.tasks.length > 0
        ? `\n\nمهام Google Tasks:\n${payload.tasks
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
              const cadAr =
                a.cadence === 'daily' ? 'يومي' : a.cadence === 'monthly' ? 'شهري' : 'أسبوعي';
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

  // Tools are attached universally so Gemini executes Function Calling reliably instead of printing raw code
  function shouldAttachChatTools(_message?: string): boolean {
    return true;
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

  // Primary frontier fast model (gemini-3.5-flash with calibrated LOW thinking for deep reasoning and circadian precision)
  // with fallback to gemini-4-hydrogen (pro-grade reasoning) and gemini-3.1-flash-lite (economy fallback)
  const GEMINI_CHAT_MODEL_CHAIN = [
    'gemini-3.5-flash',
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
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
    const { systemInstruction, memoriesAppliedCount } = buildChatSystemInstruction(payload);

    let activeModel: string = GEMINI_CHAT_MODEL_CHAIN[0];
    let fullText = '';
    const collectedFnCalls: FunctionCall[] = [];
    let streamCompleted = false;
    let lastStreamErr: unknown = null;

    const needsTools = shouldAttachChatTools(userMessage);

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
  app.post('/api/chat/stream', async (req, res) => {
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
  app.post('/api/chat', async (req, res) => {
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
      const { systemInstruction, memoriesAppliedCount } = buildChatSystemInstruction(payload);

      let activeModel: string = GEMINI_CHAT_MODEL_CHAIN[0];
      let response: Awaited<ReturnType<ReturnType<GoogleGenAI['chats']['create']>['sendMessage']>> | null = null;
      let lastErr: unknown = null;

      const needsTools = shouldAttachChatTools(payload.message);

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
  app.post('/api/maps/stream', async (req, res) => {
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
  app.post('/api/maps', async (req, res) => {
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
  app.post('/api/search/stream', async (req, res) => {
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
  app.post('/api/search', async (req, res) => {
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

  const httpServer = http.createServer(app);

  // Real-Time Cross-Device Sync with Socket.IO (<50ms ultra-low-latency sync across devices)
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  io.on('connection', (socket) => {
    let currentRoom = '';

    socket.on('join', (data: { uid?: string; clientId?: string }) => {
      const uid = typeof data?.uid === 'string' ? data.uid.trim() : '';
      if (!uid || uid.length > 128) return;
      if (currentRoom) {
        void socket.leave(currentRoom);
      }
      currentRoom = `user_${uid}`;
      void socket.join(currentRoom);
      socket.data.uid = uid;
      socket.data.clientId = String(data?.clientId ?? 'anon').slice(0, 64);
      socket.emit('joined', { uid, room: currentRoom, clientId: socket.data.clientId });

      const cachedBattery = latestBatteryByUid.get(uid);
      if (cachedBattery) {
        socket.emit('battery', { clientId: 'server_cache', battery: cachedBattery });
      }
    });

    socket.on('settings_update', (data: { uid?: string; clientId?: string; settings?: unknown; timestampMs?: number }) => {
      const uid = typeof data?.uid === 'string' ? data.uid.trim() : (socket.data.uid as string | undefined);
      if (!uid || !data?.settings) return;
      const room = `user_${uid}`;
      const payload = {
        uid,
        clientId: data.clientId || socket.data.clientId || 'unknown',
        settings: data.settings,
        timestampMs: data.timestampMs || Date.now(),
      };
      socket.to(room).emit('settings_update', payload);
    });

    socket.on('alarm_signal', (data: { uid?: string; clientId?: string; signal?: unknown; timestampMs?: number }) => {
      const uid = typeof data?.uid === 'string' ? data.uid.trim() : (socket.data.uid as string | undefined);
      if (!uid || !data?.signal) return;
      const room = `user_${uid}`;
      socket.to(room).emit('alarm_signal', {
        uid,
        clientId: data.clientId || socket.data.clientId || 'unknown',
        signal: data.signal,
        timestampMs: data.timestampMs || Date.now(),
      });
    });

    socket.on('battery', (data: { uid?: string; clientId?: string; battery?: Partial<ServerBatterySnapshot> }) => {
      const uid = typeof data?.uid === 'string' ? data.uid.trim() : (socket.data.uid as string | undefined);
      if (!uid || !data?.battery || typeof data.battery !== 'object') return;
      const rawLvl = Number(data.battery.levelPct);
      if (Number.isFinite(rawLvl)) {
        const snapshot: ServerBatterySnapshot = {
          levelPct: Math.max(0, Math.min(100, Math.round(rawLvl))),
          charging: Boolean(data.battery.charging),
          chargeLimitPct: Math.max(60, Math.min(100, Math.round(Number(data.battery.chargeLimitPct) || 90))),
          updatedAtMs: Date.now(),
          deviceLabel: String(data.battery.deviceLabel ?? 'الهاتف').trim().slice(0, 40) || 'الهاتف',
        };
        latestBatteryByUid.set(uid, snapshot);
        socket.to(`user_${uid}`).emit('battery', {
          clientId: data.clientId || socket.data.clientId || 'unknown',
          battery: snapshot,
        });
      }
    });

    socket.on('sync_event', (data: { uid?: string; clientId?: string; event?: unknown; timestampMs?: number }) => {
      const uid = typeof data?.uid === 'string' ? data.uid.trim() : (socket.data.uid as string | undefined);
      if (!uid) return;
      socket.to(`user_${uid}`).emit('sync_event', {
        uid,
        clientId: data.clientId || socket.data.clientId || 'unknown',
        event: data.event,
        timestampMs: data.timestampMs || Date.now(),
      });
    });

    socket.on('disconnect', () => {
      if (currentRoom) {
        void socket.leave(currentRoom);
      }
    });
  });

  // Real-Time Cross-Device Sync + Ultra-Low-Latency Gemini Chat WebSocket Hub (/ws/sync) on port 3000
  // Disable perMessageDeflate + enable TCP_NODELAY so chat token deltas flush immediately with zero buffering delay
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (pathname === '/ws/sync') {
      if ('setNoDelay' in socket && typeof socket.setNoDelay === 'function') {
        socket.setNoDelay(true);
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const aliveSockets = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    let joinedUid = '';
    let entry: SyncClientEntry | null = null;
    const cancelledChatIds = new Set<string>();
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
          battery?: Partial<ServerBatterySnapshot>;
          requestId?: string;
          payload?: ChatRequestPayload;
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
          const cachedBattery = latestBatteryByUid.get(joinedUid);
          if (cachedBattery) {
            ws.send(JSON.stringify({ type: 'battery', clientId: 'server_cache', battery: cachedBattery }));
          }
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
        } else if (msg.type === 'battery' && joinedUid && entry && msg.battery && typeof msg.battery === 'object') {
          const rawLvl = Number(msg.battery.levelPct);
          if (Number.isFinite(rawLvl)) {
            const snapshot: ServerBatterySnapshot = {
              levelPct: Math.max(0, Math.min(100, Math.round(rawLvl))),
              charging: Boolean(msg.battery.charging),
              chargeLimitPct: Math.max(
                60,
                Math.min(100, Math.round(Number(msg.battery.chargeLimitPct) || 90))
              ),
              updatedAtMs: Date.now(),
              deviceLabel: String(msg.battery.deviceLabel ?? 'الهاتف').trim().slice(0, 40) || 'الهاتف',
            };
            latestBatteryByUid.set(joinedUid, snapshot);
            broadcastUserSync(
              joinedUid,
              {
                type: 'battery',
                clientId: entry.clientId,
                battery: snapshot,
              },
              entry.clientId
            );
          }
        } else if (msg.type === 'gemini_chat_cancel' && typeof msg.requestId === 'string') {
          cancelledChatIds.add(msg.requestId);
        } else if (msg.type === 'gemini_chat' && typeof msg.requestId === 'string' && msg.payload?.message) {
          const reqId = msg.requestId;
          cancelledChatIds.delete(reqId);
          void executeGeminiChatStream(
            msg.payload,
            (evt) => {
              if (ws.readyState !== WebSocket.OPEN || cancelledChatIds.has(reqId)) return;
              ws.send(JSON.stringify({ ...evt, type: `gemini_chat_${evt.type}`, requestId: reqId }));
            },
            () => ws.readyState !== WebSocket.OPEN || cancelledChatIds.has(reqId)
          )
            .catch((err: unknown) => {
              if (ws.readyState === WebSocket.OPEN && !cancelledChatIds.has(reqId)) {
                ws.send(
                  JSON.stringify({
                    type: 'gemini_chat_error',
                    requestId: reqId,
                    error: formatFriendlyGeminiErrorAr(err),
                  })
                );
              }
            })
            .finally(() => {
              cancelledChatIds.delete(reqId);
            });
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // ignore malformed WS payload
      }
    });

    ws.on('close', () => {
      cancelledChatIds.clear();
      removeFromRoom();
    });
    ws.on('error', () => {
      cancelledChatIds.clear();
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
    const lanIps = getLocalLanIps();
    console.log(`📡 DayRhythm server listening on http://0.0.0.0:${PORT}`);
    console.log(`   - PC Local URL:   http://localhost:${PORT}`);
    lanIps.forEach((ip) => {
      console.log(`   - Mobile LAN URL: http://${ip}:${PORT}`);
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start DayRhythm server:', err);
  process.exit(1);
});
