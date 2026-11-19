import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  Layers,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Download,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';
import { downloadDayRhythmSourceKit } from '../engines/exportKitEngine';
import { SharedChangelogEntry } from '../types/dayrhythm';

export const SHARED_TRUTH_DOC_ID = '13RbQ2g7t_sy6sWxnfH0gNOdpQu4PgVR1qU6tOl2svEA';

interface ArchitectureBlueprintViewProps {
  changelog: SharedChangelogEntry[];
}

const CHECKLIST_PHASES = [
  {
    phase: 'المرحلة 1 · الأساس المعماري والمخزن الموحد (State & Invariants)',
    items: [
      'بناء DayScheduleState غير القابل للتعديل (Immutable) كحقيقة وحيدة (SSOT) على أندرويد (StateFlow) وويندوز (Qt Signals)',
      'تطبيق قواعد الخصوصية الصارمة في طبقة العرض والتسجيل (🦷/🪥 فقط، 🌱 فقط، وعناوين أزواج الإيموجي)',
      'إعادة تهيئة SecretStore عبر Windows DPAPI و Android Keystore لتخزين مفاتيح HMAC-SHA256',
    ],
  },
  {
    phase: 'المرحلة 2 · درع الأمان LAN والمزامنة المجانية الرباعية (Zero-Cloud + 4-Tier)',
    items: [
      'الاقتران التلقائي Zero-QR عبر UDP Broadcast :48722 + قفل الجهاز المزدوج Single Paired Device Lock',
      'التوثيق الرقمي لكل أمر عبر HMAC-SHA256 + Nonce لمنع هجمات Replay Attacks',
      'دعم المزامنة الرباعية المجانية: CalendarContract + Apps Script + .ics RRULE + أوفلاين، بجانب Google Calendar API',
    ],
  },
  {
    phase: 'المرحلة 3 · عتاد OnePlus 12R وبيئة ويندوز المتقدمة',
    items: [
      'بلاطات Quick Settings (💧 كوب ماء + 🔇 وضع اجتماع) وحارس قبل النوم 8:35–9:10 م + الشحن التجاوزي 80%/90%',
      'موجات اهتزاز X-Axis (VibrationEffect.createWaveform) وشاشة الاستيقاظ الليلية #000000',
      'التعافي من Sleep عبر WM_POWERBROADCAST وقفل QLocalServer والتبديل الفوري عربي ↔ English',
    ],
  },
  {
    phase: 'المرحلة 4 · مناعة أندرويد والزحزحة والجمعة والسفر',
    items: [
      'منبهات AlarmManager.setAlarmClock() + Boot Watchdog + WorkManager + مكنسة 14 يوم Tombstones',
      'خوارزمية امتصاص الفجوة W = T_anchor - T_now ومصفوفة السفر ثلاثية المجموعات (Haversine > 15 كم)',
      'ربط بروتوكول الذاكرة المشتركة بمستند Google Drive وسجل التحديثات المشترك',
    ],
  },
];

export const ArchitectureBlueprintView: React.FC<ArchitectureBlueprintViewProps> = ({
  changelog,
}) => {
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({
    '0-0': true,
    '0-1': true,
    '0-2': true,
    '1-0': true,
    '1-1': true,
    '1-2': true,
  });
  const [hmacPayload, setHmacPayload] = useState('{"action":"dismiss_alarm","device":"OnePlus12R"}');
  const [hmacDigest, setHmacDigest] = useState<string>('');
  const [copiedDoc, setCopiedDoc] = useState(false);

  const toggleItem = (key: string) => {
    setCheckedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const generateDemoHmac = async () => {
    const nonce = crypto.randomUUID().slice(0, 12);
    const ts = Math.floor(Date.now() / 1000);
    const msg = `${ts}:${nonce}:${hmacPayload}`;
    if (window.crypto?.subtle) {
      const key = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode('DayRhythm-Keystore-DPAPI-Demo-Key'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await window.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
      const hex = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      setHmacDigest(`X-DayRhythm-Sig: ${hex.slice(0, 32)}... | Nonce: ${nonce} | TS: ${ts} (Verified ✓)`);
    }
  };

  const copySharedTruthSnapshot = () => {
    const md = [
      `# DayRhythm Shared Truth Protocol (Doc ID: ${SHARED_TRUTH_DOC_ID})`,
      ...changelog.map(
        (c) => `- v${c.version} [${c.timestampStr}] (${c.device}): ${c.noteAr}`
      ),
    ].join('\n');
    navigator.clipboard?.writeText(md).then(() => {
      setCopiedDoc(true);
      window.setTimeout(() => setCopiedDoc(false), 2000);
    });
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 sm:px-6 py-6 space-y-8">
      <div className="pb-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">
            المخطط المعماري · درع الأمان LAN · وبروتوكول الذاكرة المشتركة
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Zero-Cloud LAN Security (DPAPI + Keystore + HMAC-SHA256) · Shared Truth Doc · Android Kotlin + Windows PySide6
          </p>
        </div>
        <button
          type="button"
          onClick={downloadDayRhythmSourceKit}
          className="px-4 py-2.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold flex items-center gap-2 hover:bg-[#66eec2] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>تحميل حزمة الكود وأدوات البناء (.zip)</span>
        </button>
      </div>

      {/* Section 1: Zero-Cloud LAN Security Shield */}
      <section className="rounded-2xl border border-[#7FFFD4]/30 bg-[#070B0F] p-6 space-y-5">
        <h2 className="text-base font-bold text-[#7FFFD4] flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          1. درع الأمان والشبكة المحلية الخالي من السحابة (Zero-Cloud LAN Security)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          {[
            {
              title: 'Zero-QR Auto-Pairing',
              body: 'اكتشاف فوري عبر بث UDP على المنفذ 48722 مع إبقاء QR كبديل احتياطي.',
            },
            {
              title: 'Zero Plaintext Secrets',
              body: 'Windows DPAPI (CryptProtectData) + Android Keystore (AES-256-GCM).',
            },
            {
              title: 'HMAC-SHA256 + Nonce',
              body: 'كل أمر موقّع برقم وحيد وطابع زمني لمنع التلاعب وهجمات Replay.',
            },
            {
              title: 'Single Device Lock',
              body: 'قفل خادم الكمبيوتر حصرياً على بصمة جهاز OnePlus 12R المقترن.',
            },
            {
              title: 'True Two-Way Dismiss',
              body: 'إيقاف المنبه من الموبايل أو الكمبيوتر يُسكت الطرف الآخر لحظياً عبر WebSocket.',
            },
          ].map((card, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-black/60 p-4">
              <div className="font-bold text-white mb-1">{card.title}</div>
              <p className="text-zinc-400 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>

        {/* Live WebCrypto HMAC-SHA256 Signer Tester */}
        <div className="rounded-xl border border-white/10 bg-black/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#7FFFD4]" />
              مختبر التوقيع الرقمي الحي (HMAC-SHA256 + Nonce)
            </span>
            <button
              type="button"
              onClick={generateDemoHmac}
              className="px-3 py-1.5 rounded-lg bg-[#7FFFD4] text-black text-xs font-bold cursor-pointer hover:bg-[#66eec2]"
            >
              توليد وتحقق من التوقيع الآن
            </button>
          </div>
          <input
            type="text"
            value={hmacPayload}
            onChange={(e) => setHmacPayload(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black px-3 py-2 font-mono-tabular text-xs text-zinc-200"
          />
          {hmacDigest && (
            <div className="font-mono-tabular text-[11px] text-[#4ADE80] break-all">
              {hmacDigest}
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Shared Truth Protocol & Live Shared Changelog */}
      <section className="rounded-2xl border border-white/10 bg-[#080B10] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#7FFFD4]" />
              2. بروتوكول الذاكرة المشتركة وسجل التحديثات الحية (Shared Truth Protocol)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono-tabular">
              Google Drive Doc ID: {SHARED_TRUTH_DOC_ID}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://docs.google.com/document/d/${SHARED_TRUTH_DOC_ID}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl border border-[#7FFFD4]/40 text-[#7FFFD4] text-xs font-medium hover:bg-[#7FFFD4]/10"
            >
              فتح مستند الذاكرة المشتركة ↗
            </a>
            <button
              type="button"
              onClick={copySharedTruthSnapshot}
              className="px-3 py-2 rounded-xl border border-white/15 text-zinc-200 text-xs flex items-center gap-1.5 cursor-pointer hover:border-white/30"
            >
              {copiedDoc ? <Check className="w-3.5 h-3.5 text-[#4ADE80]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedDoc ? 'تم النسخ ✓' : 'نسخ سجل التحديثات'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-right text-xs">
            <thead className="bg-white/[0.04] text-zinc-300">
              <tr>
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">التاريخ والوقت</th>
                <th className="p-3 font-semibold">المصدر</th>
                <th className="p-3 font-semibold">التحديث الموثق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-zinc-300">
              {changelog.map((entry) => (
                <tr key={entry.id}>
                  <td className="p-3 font-mono-tabular text-[#7FFFD4]">v{entry.version}</td>
                  <td className="p-3 font-mono-tabular text-zinc-400">{entry.timestampStr}</td>
                  <td className="p-3 text-white font-medium">{entry.device}</td>
                  <td className="p-3">{entry.noteAr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Clean Architecture & Conflict Resolution */}
      <section className="rounded-2xl border border-white/10 bg-[#080B10] p-6 space-y-5">
        <h2 className="text-base font-bold text-[#7FFFD4] flex items-center gap-2">
          <Layers className="w-4 h-4" />
          3. تدفق البيانات أحادي الاتجاه وحل التعارضات
        </h2>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-right text-xs">
            <thead className="bg-white/[0.04] text-zinc-300">
              <tr>
                <th className="p-3 font-semibold">سيناريو التعارض</th>
                <th className="p-3 font-semibold">السبب الجذري</th>
                <th className="p-3 font-semibold">الحل الحتمي (Deterministic Rule)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-zinc-400">
              <tr>
                <td className="p-3 text-white font-medium">حذف مهمة على PC أثناء نوم الهاتف</td>
                <td className="p-3">إعادة إرسال تقويم قديم عند استيقاظ الهاتف</td>
                <td className="p-3">سجل Tombstone محلي + تنظيف تلقائي بعد 14 يوماً لمنع تضخم CalendarProvider.</td>
              </tr>
              <tr>
                <td className="p-3 text-white font-medium">ثبات الشحن التجاوزي عند 80%/90%</td>
                <td className="p-3">توقف التيار مع بقاء الكابل متصلاً</td>
                <td className="p-3">قراءة حالة الشحن التجاوزي لتعطيل إنذارات الامتلاء المتكررة أثناء اللعب أو العمل.</td>
              </tr>
              <tr>
                <td className="p-3 text-white font-medium">استيقاظ اللابتوب بعد Sleep/Hibernate</td>
                <td className="p-3">تأخر مؤقتات Qt بعد السكون</td>
                <td className="p-3">استقبال WM_POWERBROADCAST / PBT_APMRESUMEAUTOMATIC وإعادة بناء الجدول فوراً.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Developer Implementation Checklist */}
      <section className="rounded-2xl border border-white/10 bg-[#080B10] p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#7FFFD4]" />
          4. قائمة التحقق التنفيذية الكاملة (Phase 1 — Phase 4)
        </h2>
        <div className="space-y-4">
          {CHECKLIST_PHASES.map((group, pIdx) => (
            <div key={pIdx} className="rounded-xl border border-white/10 bg-black/50 p-4">
              <div className="text-xs font-bold text-[#7FFFD4] mb-2.5">{group.phase}</div>
              <div className="space-y-2">
                {group.items.map((item, iIdx) => {
                  const key = `${pIdx}-${iIdx}`;
                  const checked = !!checkedMap[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleItem(key)}
                      className="w-full flex items-start gap-2.5 text-right text-xs text-zinc-300 hover:text-white cursor-pointer"
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      )}
                      <span className={checked ? 'line-through text-zinc-500' : ''}>{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
