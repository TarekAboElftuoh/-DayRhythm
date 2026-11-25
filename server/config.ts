import dotenv from 'dotenv';
import { calendar } from '@googleapis/calendar';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';

dotenv.config();

export const PORT = Number(process.env.PORT || 3000);

export function getGeminiClient(): GoogleGenAI {
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

export function getGoogleCalendarClient(authHeader: string) {
  return calendar({
    version: 'v3',
    headers: {
      Authorization: authHeader,
    },
  });
}

export function getCairoTodayIso(): string {
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

export function getCairoNowTime12(): string {
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

export function formatServerIsoTo12h(isoStr?: string): string {
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

export function getCairoOffsetString(dateIso: string): string {
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

export function computeCairoEventRange(
  dateIso?: string,
  startTime24?: string,
  durationMinutes?: number
): { startDateTime: string; endDateTime: string } {
  const baseDate = dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : getCairoTodayIso();
  const timeMatch = startTime24?.match(/^(\d{1,2}):(\d{2})$/);
  const hh = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 9;
  const mm = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;
  const duration = durationMinutes === 0 ? 1 : (durationMinutes && durationMinutes > 0 ? Math.round(durationMinutes) : 30);

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

export const proposeCalendarActionsDeclaration: FunctionDeclaration = {
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

export const proposeTaskActionsDeclaration: FunctionDeclaration = {
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

export const proposeMedicationActionsDeclaration: FunctionDeclaration = {
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

export const proposeCreativeActionsDeclaration: FunctionDeclaration = {
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

export const proposeProfileUpdatesDeclaration: FunctionDeclaration = {
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

export const proposeMemoryActionsDeclaration: FunctionDeclaration = {
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

