import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Compass,
  Droplets,
  Moon,
  Sparkles,
  Check,
  MapPin,
  Lock,
  Unlock,
  Brain,
  Plus,
  VolumeX,
  Volume2,
  SlidersHorizontal,
  BatteryCharging,
  BellOff,
  Download,
  Upload,
  ShieldCheck,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react';
import { MemoryItemCard } from './MemoryItemCard';
import { AndroidPermissionsCard } from './AndroidPermissionsCard';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  resetGeminiApiKey,
  checkGeminiStatus,
  isCustomGeminiApiKeySet,
  DEFAULT_GEMINI_API_KEY,
} from '../services/geminiClient';
import {
  GeoLocation,
  LifeProfile,
  MemoryCategory,
  MemoryItem,
  PhoneBatteryTelemetry,
  PrayerTimeItem,
  QuietModeType,
  SoundRepeatMap,
  SoundRepeatSetting,
  TaskSoundCategory,
} from '../types/dayrhythm';
import {
  ARABIC_WEEKDAYS,
  MEMORY_CATEGORY_LABELS,
  computeDailyRhythmPlan,
  formatDurationAr,
} from '../engines/lifeRhythmEngine';
import { TASK_SOUND_META } from '../engines/audioEngine';
import { QUIET_MODE_LABELS } from '../engines/i18n';
import {
  PRESET_LOCATIONS,
  formatMinutes12h,
  getTimeZoneUtcOffsetHours,
  getWeekdayInTimeZone,
} from '../engines/prayerEngine';

interface LifeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: LifeProfile;
  prayers: PrayerTimeItem[];
  activeLocation: GeoLocation;
  memories: MemoryItem[];
  onAddMemory: (input: { category: MemoryCategory; ruleText: string }) => void;
  onUpdateMemory?: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
  onSaveProfile: (next: LifeProfile) => void;
  onDetectGpsLocation: () => Promise<void>;
  isDetectingGps: boolean;
  includePrayerAnchors?: boolean;
  onToggleIncludePrayerAnchors?: () => void;
  isFridayMode?: boolean;
  onToggleFridayMode?: (v: boolean) => void;
  includeBiweeklyPcCleanup?: boolean;
  onToggleBiweeklyPcCleanup?: (v: boolean) => void;
  calendarConnected?: boolean;
  onGoogleSignOut?: () => Promise<void>;
  quietMode?: QuietModeType;
  onSetQuietMode?: (mode: QuietModeType, durationMinutes: number) => void;
  soundRepeats?: SoundRepeatMap;
  onUpdateSoundRepeat?: (category: TaskSoundCategory, setting: SoundRepeatSetting) => void;
  onTriggerTaskAlert?: (
    title: string,
    category: TaskSoundCategory,
    options?: { bypassSanctuary?: boolean; privacyEmoji?: string }
  ) => void;
  phoneBattery?: PhoneBatteryTelemetry | null;
  phoneChargeLimitPct?: number;
  onUpdatePhoneChargeLimit?: (limitPct: number) => void;
  smartChargeAlertEnabled?: boolean;
  onToggleSmartChargeAlertEnabled?: () => void;
  smartChargeKeepUntilUnplugged?: boolean;
  onToggleSmartChargeKeepUntilUnplugged?: () => void;
  smartChargeAudioActive?: boolean;
  onTestSmartChargeAlert?: () => void;
  onCheckAppUpdates?: () => void;
  activeBrandLogo?: { titleAr: string; src: string; isDefault?: boolean } | null;
  onOpenLogoPicker?: () => void;
  onExportBackupJson?: () => void;
  onImportBackupJson?: (rawText: string) => Promise<{
    ok: boolean;
    summaryAr: string;
  }>;
}

export const LifeProfileModal: React.FC<LifeProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  prayers,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onSaveProfile,
  onDetectGpsLocation,
  isDetectingGps,
  includePrayerAnchors = true,
  onToggleIncludePrayerAnchors,
  isFridayMode = false,
  onToggleFridayMode,
  includeBiweeklyPcCleanup = true,
  onToggleBiweeklyPcCleanup,
  calendarConnected = false,
  onGoogleSignOut,
  quietMode = 'normal',
  onSetQuietMode,
  soundRepeats,
  onUpdateSoundRepeat,
  onTriggerTaskAlert,
  phoneBattery = null,
  phoneChargeLimitPct = 90,
  onUpdatePhoneChargeLimit,
  smartChargeAlertEnabled = true,
  onToggleSmartChargeAlertEnabled,
  smartChargeKeepUntilUnplugged = true,
  onToggleSmartChargeKeepUntilUnplugged,
  smartChargeAudioActive = false,
  onTestSmartChargeAlert,
  onCheckAppUpdates,
  activeBrandLogo,
  onOpenLogoPicker,
  onExportBackupJson,
  onImportBackupJson,
}) => {
  const [draft, setDraft] = useState<LifeProfile>(profile);
  const [unlockHeight, setUnlockHeight] = useState(false);
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('priority');
  const [newMemoryText, setNewMemoryText] = useState('');
  const [backupStatus, setBackupStatus] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{
    fileName: string;
    rawText: string;
    previewSummary: string;
  } | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const backupFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Gemini Client-Side API Key Management
  const [apiKeyInput, setApiKeyInput] = useState(() => getGeminiApiKey());
  const [showApiKeyPlain, setShowApiKeyPlain] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<string | null>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(getGeminiApiKey());
      setKeyFeedback(null);
      setTestResult(null);
    }
  }, [isOpen]);

  const handleSaveGeminiKey = async () => {
    setIsTestingKey(true);
    setKeyFeedback(null);
    try {
      const res = setGeminiApiKey(apiKeyInput);
      setApiKeyInput(res.saved);
      window.dispatchEvent(new CustomEvent('dayrhythm:gemini-key-updated'));
      const status = await checkGeminiStatus(true);
      if (status.status === 'online') {
        setKeyFeedback(`✓ تم حفظ المفتاح بنجاح! الاتصال بـ Google Gemini جاهز (${status.latencyMs}ms)`);
        setTestResult({ ok: true, text: `🟢 متصل ومستعد (${status.latencyMs}ms)` });
      } else {
        setKeyFeedback(status.error || 'تم حفظ المفتاح، لكن تعذر الاتصال بـ Google حالياً.');
        setTestResult({ ok: false, text: `🔴 ${status.error || 'غير متصل'}` });
      }
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleResetGeminiKey = async () => {
    const def = resetGeminiApiKey();
    setApiKeyInput(def);
    window.dispatchEvent(new CustomEvent('dayrhythm:gemini-key-updated'));
    setIsTestingKey(true);
    try {
      const status = await checkGeminiStatus(true);
      setKeyFeedback('تمت استعادة المفتاح الافتراضي الأصلي بنجاح ✓');
      setTestResult({
        ok: status.status === 'online',
        text: status.status === 'online' ? `🟢 متصل بالافتراضي (${status.latencyMs}ms)` : `🔴 ${status.error || 'غير متصل'}`,
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleTestGeminiKey = async () => {
    setIsTestingKey(true);
    setKeyFeedback(null);
    try {
      const status = await checkGeminiStatus(true);
      setTestResult({
        ok: status.status === 'online',
        text: status.status === 'online' ? `🟢 متصل بنجاح (${status.latencyMs}ms)` : `🔴 ${status.error || 'غير متصل'}`,
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setDraft(profile);
      setUnlockHeight(false);
    }
  }, [isOpen, profile]);

  const previewPlan = useMemo(() => {
    const todayW = getWeekdayInTimeZone(draft.currentTimeZone);
    return computeDailyRhythmPlan(draft, prayers, {
      todayWeekday: todayW,
      tomorrowWeekday: (todayW + 1) % 7,
      fastingOverride: 'auto',
    });
  }, [draft, prayers]);

  if (!isOpen) return null;

  const toggleFastingDay = (dayId: number) => {
    setDraft((prev) => {
      const exists = prev.fastingDays.includes(dayId);
      return {
        ...prev,
        fastingDays: exists
          ? prev.fastingDays.filter((d) => d !== dayId)
          : [...prev.fastingDays, dayId],
      };
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({ ...draft, sleepStrategy: 'night_only_strict' });
    onClose();
  };

  const handleAddMemorySubmit = () => {
    const trimmed = newMemoryText.trim();
    if (!trimmed) return;
    onAddMemory({ category: newMemoryCategory, ruleText: trimmed });
    setNewMemoryText('');
  };

  const handleSelectBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupStatus(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawText = typeof reader.result === 'string' ? reader.result : '';
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || parsed.app !== 'DayRhythm') {
          setBackupStatus({
            tone: 'error',
            text: 'الملف غير صالح — اختر ملف نسخة احتياطية مُصدَّر من «إيقاع اليوم».',
          });
          setPendingRestoreFile(null);
          return;
        }
        const medsCount = Array.isArray(parsed.medications) ? parsed.medications.length : 0;
        const memCount = Array.isArray(parsed.memories) ? parsed.memories.length : 0;
        const actsCount = Array.isArray(parsed.creativeActivities) ? parsed.creativeActivities.length : 0;
        const exportedAt =
          typeof parsed.exportedAtIso === 'string' ? parsed.exportedAtIso.slice(0, 10) : 'غير محدد';
        setPendingRestoreFile({
          fileName: file.name,
          rawText,
          previewSummary: `تاريخ النسخة: ${exportedAt} · ${medsCount} علاجات · ${memCount} ذاكرة · ${actsCount} نشاط إبداعي + الثوابت والماء والإعدادات`,
        });
      } catch {
        setBackupStatus({
          tone: 'error',
          text: 'تعذر قراءة ملف JSON — تأكد أنه ملف نسخة احتياطية سليم.',
        });
        setPendingRestoreFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestoreBackup = async () => {
    if (!pendingRestoreFile || !onImportBackupJson) return;
    setIsRestoringBackup(true);
    try {
      const res = await onImportBackupJson(pendingRestoreFile.rawText);
      setBackupStatus({
        tone: res.ok ? 'ok' : 'error',
        text: res.summaryAr,
      });
      if (res.ok) {
        setPendingRestoreFile(null);
      }
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="الدستور الشخصي وذاكرة Gemini الدائمة"
    >
      <form
        onSubmit={handleSave}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0A0D12] p-5 sm:p-6 text-zinc-100 shadow-2xl space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
              <span>الإعدادات والثوابت وذاكرة Gemini</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              كل الإعدادات والقياسات محفوظة سحابياً — الأولوية لتحديثها عبر شات Gemini مع كامل الحرية اليدوية من هنا
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Scientific Hydration & Biometrics */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Droplets className="w-4 h-4 text-[#7FFFD4]" />
              <span>1. القياسات ومعادلة الماء العلمية</span>
            </h3>
            <span className="font-mono-tabular text-xs text-[#7FFFD4]">
              العادي: {previewPlan.normalTargetCups} كوب ({previewPlan.normalTargetMl} مل) · الصيام: {previewPlan.fastingTargetCups} كوب ({previewPlan.fastingMinTargetMl} مل)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-[#7FFFD4] font-semibold flex items-center justify-between">
                <span>الوزن (كجم)</span>
                <span className="text-[11px] text-zinc-400 font-normal">متغيّر · يدوي أو شات</span>
              </span>
              <input
                type="number"
                min={30}
                max={250}
                step={0.5}
                value={draft.weightKg}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, weightKg: Number(e.target.value) || 69 }))
                }
                className="w-full rounded-lg border border-[#7FFFD4]/45 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>

            <div className="space-y-1">
              <span className="text-zinc-400 flex items-center justify-between">
                <span>الطول (سم)</span>
                <button
                  type="button"
                  onClick={() => setUnlockHeight((v) => !v)}
                  className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-0.5 cursor-pointer"
                >
                  {unlockHeight ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>{unlockHeight ? 'قفل' : 'تعديل'}</span>
                </button>
              </span>
              <input
                type="number"
                min={100}
                max={240}
                step={1}
                disabled={!unlockHeight}
                value={draft.heightCm}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, heightCm: Number(e.target.value) || 175 }))
                }
                className={`w-full rounded-lg border px-3 py-2 font-mono-tabular focus:outline-none ${
                  unlockHeight
                    ? 'border-white/25 bg-black text-white focus:border-[#7FFFD4]'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 cursor-not-allowed'
                }`}
              />
            </div>

            <label className="space-y-1">
              <span className="text-zinc-400 block">حجم الكوب (أي رقم: 50–2000 مل)</span>
              <input
                type="number"
                min={50}
                max={2000}
                step={1}
                value={draft.cupSizeMl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, cupSizeMl: Number(e.target.value) || 177 }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap gap-1.5">
              {[177, 200, 250, 330, 500].map((presetMl) => (
                <button
                  key={presetMl}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, cupSizeMl: presetMl }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono-tabular cursor-pointer ${
                    draft.cupSizeMl === presetMl
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                      : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {presetMl} مل
                </button>
              ))}
            </div>
            <span className="text-[11px] text-zinc-500">
              يمكنك تعديل الوزن أو حجم الكوب لأي رقم عبر شات Gemini
            </span>
          </div>
        </section>

        {/* 2. Fasting Days, Flexible Suhoor Lead & Night Sleep Target */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Moon className="w-4 h-4 text-[#7FFFD4]" />
              <span>2. الصيام، السحور، وهدف النوم الليلي</span>
            </h3>
            <span className="font-mono-tabular text-[11px] text-zinc-400">
              الليلة: {formatMinutes12h(previewPlan.bedtimeMin)} ← {formatMinutes12h(previewPlan.wakeMin)} ({formatDurationAr(previewPlan.totalSleepMin)})
            </span>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-zinc-400 block">أيام الصيام الأسبوعية (يتكيّف الماء والسحور تلقائياً):</span>
            <div className="grid grid-cols-7 gap-1.5">
              {ARABIC_WEEKDAYS.map((day) => {
                const active = draft.fastingDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleFastingDay(day.id)}
                    className={`py-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                      active
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                        : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {day.shortAr}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-zinc-400 block">السحور قبل أذان الفجر (دقيقة · مرن 10–180):</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={10}
                  max={180}
                  step={5}
                  value={draft.suhoorLeadMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      suhoorLeadMinutes: Number(e.target.value) || 50,
                    }))
                  }
                  className="w-20 rounded-lg border border-white/15 bg-black px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                />
                {[40, 50, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, suhoorLeadMinutes: mins }))}
                    className={`flex-1 py-2 rounded-lg border font-mono-tabular cursor-pointer ${
                      draft.suhoorLeadMinutes === mins
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mins} د
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400 block">هدف النوم الليلي (دقائق · مرن 180–720):</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={180}
                  max={720}
                  step={15}
                  value={draft.sleepTargetMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      sleepTargetMinutes: Number(e.target.value) || 450,
                    }))
                  }
                  className="w-20 rounded-lg border border-white/15 bg-black px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                />
                {[
                  { min: 420, label: '7 س' },
                  { min: 450, label: '7.5 س' },
                  { min: 480, label: '8 س' },
                ].map((opt) => (
                  <button
                    key={opt.min}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, sleepTargetMinutes: opt.min }))}
                    className={`flex-1 py-2 rounded-lg border font-mono-tabular cursor-pointer ${
                      draft.sleepTargetMinutes === opt.min
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400">
            التكيّف مع تغيّر الفصول والنوم الليلي يعمل تلقائياً في الخلفية؛ وعند الأرق أو النوم المتأخر أخبر Gemini في الشات ليرتّب يومك أو يفرّغ وقتاً لقيلولة استثنائية.
          </p>
        </section>

        {/* 3. Automatic Audio Silence Sanctuaries (Prayer & Sleep) */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <VolumeX className="w-4 h-4 text-[#7FFFD4]" />
              <span>3. الحماية التلقائية للصوت (الصلاة والنوم)</span>
            </h3>
            <span className="text-[11px] text-zinc-400">
              يُحفظ كل إشعار صامتاً لتطّلع عليه لاحقاً
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-zinc-400 block">تنبيه قبل الأذان (د)</span>
              <input
                type="number"
                min={0}
                max={30}
                step={1}
                value={draft.adhanLeadMinutes}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, adhanLeadMinutes: Number(e.target.value) || 0 }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 block">كتم الصلاة من الأذان (د)</span>
              <input
                type="number"
                min={5}
                max={90}
                step={5}
                value={draft.prayerSilenceMinutes}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    prayerSilenceMinutes: Number(e.target.value) || 20,
                  }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 block">كتم الفجر من الأذان (د)</span>
              <input
                type="number"
                min={5}
                max={90}
                step={5}
                value={draft.fajrSilenceMinutes}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    fajrSilenceMinutes: Number(e.target.value) || 30,
                  }))
                }
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
          </div>
          <p className="text-[11px] text-zinc-500">
            وقت صلاة الجمعة يُمدّد الكتم تلقائياً إلى 50 دقيقة، وفي وقت النوم يُكتم الصوت كلياً حتى الاستيقاظ مع حفظ التنبيهات الصامتة.
          </p>
        </section>

        {/* 4. Continuous Offline-Ready GPS Location */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#7FFFD4]" />
              <span>4. الموقع التلقائي بالـ GPS والحساب الأوفلاين</span>
            </h3>
            <button
              type="button"
              onClick={() => void onDetectGpsLocation()}
              disabled={isDetectingGps}
              className="px-3 py-1.5 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/40 text-[#7FFFD4] text-xs font-semibold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{isDetectingGps ? 'جارٍ الكشف...' : 'تحقّق من موقعي الآن'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
            <span>
              الموقع الحالي: <strong className="text-white">{draft.currentCityName}</strong>
            </span>
            <span className="font-mono-tabular text-[11px] text-zinc-400">
              {draft.currentTimeZone} (UTC{getTimeZoneUtcOffsetHours(draft.currentTimeZone) >= 0 ? '+' : ''}
              {getTimeZoneUtcOffsetHours(draft.currentTimeZone)}) · حساب فلكي أوفلاين 100%
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_LOCATIONS.map((loc) => {
              const selected = draft.currentCityName === loc.nameAr;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      currentCityName: loc.nameAr,
                      currentTimeZone: loc.timeZone ?? 'Africa/Cairo',
                      currentLat: loc.lat,
                      currentLng: loc.lng,
                    }))
                  }
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                    selected
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-semibold'
                      : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {loc.nameAr.split('·')[0].trim()}
                </button>
              );
            })}
          </div>

          <label className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs cursor-pointer">
            <span className="text-zinc-300">
              تتبّع التحرك تلقائياً عبر GPS (بدون إنترنت) لتحديث الصلاة والشروق والغروب فور تغيّر مكانك
            </span>
            <input
              type="checkbox"
              checked={draft.autoLocationSync}
              onChange={(e) => setDraft((p) => ({ ...p, autoLocationSync: e.target.checked }))}
              className="w-4 h-4 accent-[#7FFFD4]"
            />
          </label>
        </section>

        {/* 5. Permanent Gemini Memory Bank (Firestore /users/{uid}/memories) */}
        <section className="rounded-xl border border-[#7FFFD4]/25 bg-black/60 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#7FFFD4]" />
              <span>5. ذاكرة Gemini الدائمة ({memories.length} قواعد محفوظة)</span>
            </h3>
            <span className="text-[11px] text-zinc-400">
              يقرؤها Gemini في كل محادثة ويضيف إليها ما تعلّمه له
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
              className="rounded-lg border border-white/15 bg-black px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
            >
              {(Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {MEMORY_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
            <input
              type="text"
              maxLength={320}
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddMemorySubmit();
                }
              }}
              placeholder="اكتب أي قاعدة جديدة تريد أن يتذكرها Gemini دائماً..."
              className="flex-1 rounded-lg border border-white/15 bg-black px-3 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
            />
            <button
              type="button"
              onClick={handleAddMemorySubmit}
              disabled={!newMemoryText.trim()}
              className="px-3 py-2 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/45 text-[#7FFFD4] font-semibold hover:bg-[#7FFFD4]/25 disabled:opacity-40 flex items-center justify-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>حفظ</span>
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
            {memories.map((mem) => (
              <MemoryItemCard
                key={mem.id}
                memory={mem}
                onSave={onUpdateMemory}
                onDelete={onDeleteMemory}
                variant="modal"
              />
            ))}
          </div>
        </section>

        {/* 6. Schedule, Audio & Account Settings (Moved cleanly out of the Main Dashboard) */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#7FFFD4]" />
              <span>6. إعدادات الجدول والأصوات والحساب</span>
            </h3>
            {calendarConnected && onGoogleSignOut && (
              <button
                type="button"
                onClick={() => {
                  void onGoogleSignOut();
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer"
              >
                فصل حساب Google
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onToggleIncludePrayerAnchors && (
              <button
                type="button"
                onClick={onToggleIncludePrayerAnchors}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  includePrayerAnchors
                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                    : 'border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                🕌 مراسي الصلاة (-3 د)
              </button>
            )}
            {onToggleFridayMode && (
              <button
                type="button"
                onClick={() => onToggleFridayMode(!isFridayMode)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  isFridayMode
                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                    : 'border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                🕌 طقوس الجمعة
              </button>
            )}
            {isFridayMode && onToggleBiweeklyPcCleanup && (
              <button
                type="button"
                onClick={() => onToggleBiweeklyPcCleanup(!includeBiweeklyPcCleanup)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                  includeBiweeklyPcCleanup
                    ? 'border-indigo-400/50 bg-indigo-400/15 text-indigo-200'
                    : 'border-white/10 text-zinc-400'
                }`}
              >
                💻 كل جمعتين 04:15 م
              </button>
            )}
          </div>

          {onSetQuietMode && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-[11px] text-zinc-400">وضع الهدوء السريع</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['normal', 'mute_audio', 'vibrate_only', 'silent_all'] as const).map((qm) => {
                  const active = quietMode === qm;
                  return (
                    <button
                      key={qm}
                      type="button"
                      onClick={() => onSetQuietMode(qm, 0)}
                      className={`rounded-xl border p-2 text-right transition-colors cursor-pointer ${
                        active
                          ? 'border-[#7FFFD4] bg-[#7FFFD4]/10 text-white'
                          : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{QUIET_MODE_LABELS[qm].ar}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {QUIET_MODE_LABELS[qm].descAr}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Configurable Default Snooze Duration (5 / 10 / 15 min, default 5) */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-zinc-200">
                مدة زر التأجيل للتنبيهات (تعمل أيضاً من شات Gemini)
              </span>
              <span className="font-mono-tabular text-[#7FFFD4]">
                الافتراضي: {draft.defaultSnoozeMinutes ?? 5} د
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([5, 10, 15] as const).map((mins) => {
                const active = (draft.defaultSnoozeMinutes ?? 5) === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, defaultSnoozeMinutes: mins }))}
                    className={`py-2 rounded-xl border font-mono-tabular text-xs font-bold cursor-pointer transition-colors ${
                      active
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                        : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {mins} دقائق
                  </button>
                );
              })}
            </div>
          </div>

          {soundRepeats && onUpdateSoundRepeat && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">
                  تكرار رنين التنبيهات (∞ = مستمر حتى الإيقاف)
                </span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {(
                  [
                    'sleep_suhoor',
                    'prayer',
                    'water',
                    'medication',
                    'meeting_event',
                    'focus_work',
                    'walk_health',
                  ] as const
                ).map((cat) => {
                  const meta = TASK_SOUND_META[cat];
                  const currentRepeat = soundRepeats[cat] ?? 1;
                  const repeatOptions: SoundRepeatSetting[] = [1, 2, 3, 4, 'continuous'];
                  return (
                    <div
                      key={cat}
                      className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onTriggerTaskAlert?.(meta.labelAr, cat, { bypassSanctuary: true })
                        }
                        className="flex items-center gap-1.5 text-zinc-200 hover:text-[#7FFFD4] cursor-pointer"
                        title="تجربة النغمة الآن"
                      >
                        <span>{meta.icon}</span>
                        <span className="font-medium">{meta.labelAr}</span>
                        <Volume2 className="w-3 h-3 text-zinc-500" />
                      </button>
                      <div className="flex items-center gap-1 font-mono-tabular">
                        {repeatOptions.map((opt) => {
                          const selected = currentRepeat === opt;
                          return (
                            <button
                              key={String(opt)}
                              type="button"
                              onClick={() => onUpdateSoundRepeat(cat, opt)}
                              className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer transition-colors ${
                                selected
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                  : 'border-white/10 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {opt === 'continuous' ? '∞' : `${opt}×`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Smart Charge Complete Alert Settings (Moved Inside Settings) */}
          {onToggleSmartChargeAlertEnabled && onUpdatePhoneChargeLimit && (
            <div className="space-y-2.5 pt-3 border-t border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <BatteryCharging className="w-4 h-4 text-[#7FFFD4]" />
                  <span>التنبيه الذكي عند اكتمال شحن الهاتف</span>
                </div>
                {phoneBattery && (
                  <span className="font-mono-tabular text-[11px] text-[#7FFFD4]">
                    {phoneBattery.charging ? '⚡ ' : ''}
                    {phoneBattery.levelPct}% · متبقي {Math.max(0, 100 - phoneBattery.levelPct)}% للامتلاء
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                يصدر إشعاراً صوتياً خاصاً على الكمبيوتر عند وصول شحن الهاتف إلى النسبة المحددة، مع إمكانية إيقافه بضغطة واحدة.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={onToggleSmartChargeAlertEnabled}
                  className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    smartChargeAlertEnabled
                      ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                      : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                  }`}
                >
                  {smartChargeAlertEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{smartChargeAlertEnabled ? 'التنبيه الذكي مفعّل' : 'التنبيه الذكي متوقف'}</span>
                </button>

                <span className="text-[11px] text-zinc-400">حد التنبيه:</span>
                {[80, 85, 90, 95, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => onUpdatePhoneChargeLimit(pct)}
                    className={`px-2.5 py-1 rounded-lg border font-mono-tabular text-[11px] cursor-pointer transition-colors ${
                      phoneChargeLimitPct === pct
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}

                {onToggleSmartChargeKeepUntilUnplugged && (
                  <button
                    type="button"
                    onClick={onToggleSmartChargeKeepUntilUnplugged}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      smartChargeKeepUntilUnplugged
                        ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                        : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                    }`}
                    title="عند التفعيل: يستمر رنين التنبيه دون توقف مؤقت حتى تفصل الشاحن عن الموبايل أو توقفه يدوياً"
                  >
                    <span>
                      {smartChargeKeepUntilUnplugged
                        ? '🔔 مستمر حتى فصل الشاحن ✓'
                        : '⏱️ يتوقف تلقائياً بعد دقيقتين'}
                    </span>
                  </button>
                )}

                {onTestSmartChargeAlert && (
                  <button
                    type="button"
                    onClick={onTestSmartChargeAlert}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      smartChargeAudioActive
                        ? 'border-rose-400 bg-rose-500/20 text-rose-200 font-bold'
                        : 'border-white/15 text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4]'
                    }`}
                  >
                    {smartChargeAudioActive ? (
                      <>
                        <BellOff className="w-3.5 h-3.5" />
                        <span>إيقاف التنبيه</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>تجربة الصوت</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* App Logo / Brand Icon Switcher (Default: Frosted Horizon Dome #1, with all other concepts available anytime) */}
          {onOpenLogoPicker && (
            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                {activeBrandLogo?.src && (
                  <img
                    src={activeBrandLogo.src}
                    alt={activeBrandLogo.titleAr}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-xl object-cover border border-white/15 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    شعار البرنامج: {activeBrandLogo?.titleAr ?? 'أفق الشروق الزجاجي'}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    الشعار الافتراضي «أفق الشروق الزجاجي»، ويمكنك التبديل لبقية التصميمات بأي وقت من هنا.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenLogoPicker}
                className="px-3.5 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 text-xs font-semibold hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] cursor-pointer whitespace-nowrap"
              >
                تغيير اللوجو
              </button>
            </div>
          )}

          {/* One-Click Full Local Backup Export & Restore (JSON, Zero Secrets) */}
          {(onExportBackupJson || onImportBackupJson) && (
            <div className="pt-3 border-t border-white/10 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#7FFFD4]" />
                    <span>النسخ الاحتياطي والاسترجاع الكامل (JSON)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    يحفظ علاجاتك، ذاكرة Gemini، الثوابت، الأنشطة، الماء، وتفضيلات الكبسولة واللوجو في ملف آمن بدون أي مفاتيح أو توكنات.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onExportBackupJson && (
                    <button
                      type="button"
                      onClick={() => {
                        onExportBackupJson();
                        setBackupStatus({
                          tone: 'ok',
                          text: 'تم تنزيل ملف النسخة الاحتياطية بنجاح ✓',
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#7FFFD4]/45 bg-[#7FFFD4]/15 text-[#7FFFD4] text-xs font-bold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تصدير نسخة</span>
                    </button>
                  )}
                  {onImportBackupJson && (
                    <>
                      <input
                        ref={backupFileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleSelectBackupFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => backupFileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 text-xs font-semibold hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>استرجاع نسخة</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {pendingRestoreFile && (
                <div className="rounded-xl border border-amber-400/45 bg-amber-500/10 p-3 space-y-2">
                  <div className="text-xs font-bold text-amber-200">
                    تأكيد استرجاع: {pendingRestoreFile.fileName}
                  </div>
                  <div className="text-[11px] text-zinc-200">
                    {pendingRestoreFile.previewSummary}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingRestoreFile(null)}
                      className="px-3 py-1 rounded-lg border border-white/15 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={isRestoringBackup}
                      onClick={() => void handleConfirmRestoreBackup()}
                      className="px-3.5 py-1 rounded-lg bg-amber-400 text-black text-[11px] font-bold hover:bg-amber-300 disabled:opacity-50 cursor-pointer"
                    >
                      {isRestoringBackup ? 'جارٍ الاسترجاع...' : 'تأكيد الاسترجاع ومزامنة السحابة ✓'}
                    </button>
                  </div>
                </div>
              )}

              {backupStatus && (
                <div
                  className={`rounded-lg border px-3 py-2 text-[11px] font-medium ${
                    backupStatus.tone === 'ok'
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                      : 'border-rose-400/35 bg-rose-500/10 text-rose-200'
                  }`}
                >
                  {backupStatus.text}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 7. Google Gemini Client-Side API Key & Model Settings */}
        <section className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-[#7FFFD4]" />
              <span>7. مفتاح Google Gemini API (محادثة العميل المباشرة)</span>
            </h3>
            {testResult && (
              <span className={`font-mono-tabular text-xs font-semibold ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResult.text}
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            يتصل شات Gemini وخرائط الأماكن مباشرة بواجهة Google Gemini API الرسمية من جانب العميل بدون الحاجة لأي خادم وسيط. المفتاح الافتراضي يعمل فوراً، ويمكنك تخصيص مفتاحك وحفظه محلياً في <code className="bg-black px-1.5 py-0.5 rounded text-[#7FFFD4]">localStorage</code> على هذا الجهاز.
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="font-medium">مفتاح API الخاص بك:</span>
              <button
                type="button"
                onClick={() => setShowApiKeyPlain((v) => !v)}
                className="text-[11px] text-[#7FFFD4] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {showApiKeyPlain ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showApiKeyPlain ? 'إخفاء' : 'إظهار'}</span>
              </button>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                type={showApiKeyPlain ? 'text' : 'password'}
                dir="ltr"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AQ... أو AIza..."
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#7FFFD4]"
              />
              <button
                type="button"
                onClick={() => void handleSaveGeminiKey()}
                disabled={isTestingKey}
                className="px-4 py-2 rounded-lg bg-[#7FFFD4] text-black font-bold text-xs hover:bg-[#66eec2] cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {isTestingKey ? 'جارٍ الحفظ...' : 'حفظ المفتاح'}
              </button>
            </div>
          </div>

          {keyFeedback && (
            <div
              className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                keyFeedback.startsWith('✓') || keyFeedback.includes('بنجاح')
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-200'
              }`}
            >
              {keyFeedback}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10 text-xs">
            <button
              type="button"
              onClick={() => void handleResetGeminiKey()}
              disabled={isTestingKey}
              className="text-zinc-400 hover:text-white cursor-pointer underline text-[11px]"
            >
              استعادة المفتاح الافتراضي الجاهز
            </button>
            <button
              type="button"
              onClick={() => void handleTestGeminiKey()}
              disabled={isTestingKey}
              className="px-3 py-1 rounded-lg border border-[#7FFFD4]/30 text-[#7FFFD4] hover:bg-[#7FFFD4]/10 cursor-pointer text-xs"
            >
              {isTestingKey ? 'جارٍ الفحص...' : 'فحص الاتصال بـ Google'}
            </button>
          </div>
        </section>

        {/* 8. Android Permissions Matrix (Android 12 – 16) */}
        <AndroidPermissionsCard />

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
          {onCheckAppUpdates && (
            <button
              type="button"
              onClick={onCheckAppUpdates}
              className="me-auto px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-[#7FFFD4] hover:border-[#7FFFD4]/40 cursor-pointer"
            >
              فحص التحديثات
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/15 text-xs text-zinc-300 hover:text-white cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>حفظ الثوابت ومزامنتها</span>
          </button>
        </div>
      </form>
    </div>
  );
};
