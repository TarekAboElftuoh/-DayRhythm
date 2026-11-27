import React, { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'vaul';
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
  Monitor,
  Rows2,
  Columns2,
  Cloud,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { getDriveApiStatus } from '../services/googleDriveStorage';
import { MemoryItemCard } from './MemoryItemCard';
import { AndroidPermissionsCard } from './AndroidPermissionsCard';
import { SunlightSettingsSection } from './SunlightSettingsSection';
import type { CapsulePrefs } from './FloatingPiPCapsule';
import { isMobileDevice } from '../services/platform';
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
  SunlightSettings,
  TaskSoundCategory,
  APP_VERSION,
} from '../types/dayrhythm';
import type { SanctuarySilenceMode } from '../services/cloudStateService';
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

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

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
  capsulePrefs?: CapsulePrefs;
  onChangeCapsulePrefs?: (next: CapsulePrefs) => void;
  googleDriveSynced?: boolean;
  onSyncGoogleDriveNow?: () => Promise<boolean>;
  isSyncingGoogleDrive?: boolean;
  onExportBackupJson?: () => void;
  onImportBackupJson?: (rawText: string) => Promise<{
    ok: boolean;
    summaryAr: string;
  }>;
  sunlightSettings?: SunlightSettings;
  onUpdateSunlightSettings?: (next: SunlightSettings) => void;
}

type NumericProfileKey =
  | 'weightKg'
  | 'heightCm'
  | 'cupSizeMl'
  | 'suhoorLeadMinutes'
  | 'sleepTargetMinutes'
  | 'adhanLeadMinutes'
  | 'prayerSilenceMinutes'
  | 'fajrSilenceMinutes';

const NUMERIC_FIELD_BOUNDS: Record<
  NumericProfileKey,
  { min: number; max: number; fallback: number; allowFloat?: boolean }
> = {
  weightKg: { min: 40, max: 200, fallback: 70, allowFloat: true },
  heightCm: { min: 120, max: 230, fallback: 177 },
  cupSizeMl: { min: 100, max: 1000, fallback: 250 },
  suhoorLeadMinutes: { min: 10, max: 120, fallback: 50 },
  sleepTargetMinutes: { min: 240, max: 720, fallback: 450 },
  adhanLeadMinutes: { min: 0, max: 30, fallback: 0 },
  prayerSilenceMinutes: { min: 0, max: 60, fallback: 20 },
  fajrSilenceMinutes: { min: 0, max: 90, fallback: 30 },
};

function clampNumericProfileField(key: NumericProfileKey, raw: string | number): number {
  const { min, max, fallback, allowFloat } = NUMERIC_FIELD_BOUNDS[key];
  if (typeof raw === 'string' && raw.trim() === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return allowFloat ? Math.round(clamped * 10) / 10 : Math.round(clamped);
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
  soundRepeats,
  onUpdateSoundRepeat,
  onTriggerTaskAlert,
  onCheckAppUpdates,
  activeBrandLogo,
  onOpenLogoPicker,
  capsulePrefs,
  onChangeCapsulePrefs,
  googleDriveSynced = false,
  onSyncGoogleDriveNow,
  isSyncingGoogleDrive = false,
  onExportBackupJson,
  onImportBackupJson,
  sunlightSettings,
  onUpdateSunlightSettings,
}) => {
  const [draft, setDraft] = useState<LifeProfile>(profile);
  const [rawInputs, setRawInputs] = useState<Partial<Record<NumericProfileKey, string>>>({});
  const isDirtyRef = React.useRef(false);
  const touchedKeysRef = React.useRef<Set<keyof LifeProfile>>(new Set());
  const updateDraft = (updater: (prev: LifeProfile) => LifeProfile) => {
    isDirtyRef.current = true;
    setDraft((prev) => {
      const next = updater(prev);
      for (const k of Object.keys(next) as Array<keyof LifeProfile>) {
        if (next[k] !== prev[k]) {
          touchedKeysRef.current.add(k);
        }
      }
      return next;
    });
  };
  const [unlockHeight, setUnlockHeight] = useState(false);
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('priority');
  const [newMemoryText, setNewMemoryText] = useState('');
  const [backupStatus, setBackupStatus] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [driveSyncNotice, setDriveSyncNotice] = useState<string | null>(null);
  const [driveEnableUrl, setDriveEnableUrl] = useState<string | null>(null);
  const [isSyncingDriveLocal, setIsSyncingDriveLocal] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{
    fileName: string;
    rawText: string;
    previewSummary: string;
  } | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const isMobile = isMobileDevice();
  const isMobileViewport = useIsMobileViewport();

  const capsuleOrientation = capsulePrefs?.orientation ?? 'horizontal';
  const capsuleSize = capsulePrefs?.size ?? 'md';

  const handleUpdateCapsuleOrientation = (o: 'horizontal' | 'vertical') => {
    onChangeCapsulePrefs?.({
      orientation: o,
      size: capsuleSize,
    });
  };

  const handleUpdateCapsuleSize = (s: 'sm' | 'md' | 'lg') => {
    onChangeCapsulePrefs?.({
      orientation: capsuleOrientation,
      size: s,
    });
  };
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

  const prevIsOpenRef = React.useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Modal just opened: initialize draft and clear dirty status
      setDraft(profile);
      setRawInputs({});
      isDirtyRef.current = false;
      touchedKeysRef.current.clear();
      setUnlockHeight(false);
    } else if (isOpen) {
      if (!isDirtyRef.current) {
        // Modal open and not modified by user: keep in sync with external live updates
        setDraft(profile);
      } else {
        // User modified some fields: keep untouched fields synced with incoming remote updates!
        setDraft((prev) => {
          const merged = { ...prev };
          for (const key of Object.keys(profile) as Array<keyof LifeProfile>) {
            if (!touchedKeysRef.current.has(key)) {
              (merged as any)[key] = profile[key];
            }
          }
          return merged;
        });
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, profile]);

  const previewPlan = useMemo(() => {
    const todayW = getWeekdayInTimeZone(draft.currentTimeZone);
    return computeDailyRhythmPlan(draft, prayers, {
      todayWeekday: todayW,
      tomorrowWeekday: (todayW + 1) % 7,
      fastingOverride: 'auto',
    });
  }, [draft, prayers]);

  const toggleFastingDay = (dayId: number) => {
    updateDraft((prev) => {
      const exists = prev.fastingDays.includes(dayId);
      return {
        ...prev,
        fastingDays: exists
          ? prev.fastingDays.filter((d) => d !== dayId)
          : [...prev.fastingDays, dayId],
      };
    });
  };

  const handleNumericChange = (key: NumericProfileKey, raw: string) => {
    setRawInputs((prev) => ({ ...prev, [key]: raw }));
    isDirtyRef.current = true;
    touchedKeysRef.current.add(key);
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setDraft((prev) => ({ ...prev, [key]: parsed }));
    }
  };

  const handleNumericBlur = (key: NumericProfileKey) => {
    const raw = rawInputs[key];
    const source = raw !== undefined ? raw : draft[key];
    const clamped = clampNumericProfileField(key, source);
    setRawInputs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    updateDraft((p) => ({ ...p, [key]: clamped }));
  };

  const getSanitizedDraft = (): LifeProfile => {
    const next: LifeProfile = {
      ...draft,
      sleepStrategy: draft.sleepStrategy || 'night_only_strict',
      sanctuarySilenceMode: draft.sanctuarySilenceMode ?? 'silent_inbox',
    };
    for (const key of Object.keys(NUMERIC_FIELD_BOUNDS) as NumericProfileKey[]) {
      const raw = rawInputs[key];
      next[key] = clampNumericProfileField(key, raw !== undefined ? raw : next[key]);
    }
    return next;
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const sanitized = getSanitizedDraft();
    setDraft(sanitized);
    setRawInputs({});
    isDirtyRef.current = false;
    touchedKeysRef.current.clear();
    onSaveProfile(sanitized);
    onClose();
  };

  const handleClose = () => {
    // If the user modified any setting without explicitly clicking save, auto-save so nothing is lost!
    if (isDirtyRef.current) {
      const sanitized = getSanitizedDraft();
      setDraft(sanitized);
      setRawInputs({});
      isDirtyRef.current = false;
      touchedKeysRef.current.clear();
      onSaveProfile(sanitized);
    }
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

  const renderFormContent = (headerTitle: React.ReactNode, isSheet: boolean) => (
    <form
      onSubmit={handleSave}
      className={
        isSheet
          ? 'flex-1 overflow-y-auto px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zinc-100 space-y-4'
          : 'w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-6 text-zinc-100 shadow-2xl space-y-4'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-white/[0.06]">
        <div className="min-w-0">
          {headerTitle}
          <p className="text-xs text-zinc-400 mt-0.5">
            كل الإعدادات والقياسات محفوظة سحابياً — الأولوية لتحديثها عبر شات Gemini مع كامل الحرية اليدوية من هنا
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer shrink-0"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

        {/* 1. Scientific Hydration & Biometrics */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
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
                min={40}
                max={200}
                step={0.5}
                value={rawInputs.weightKg ?? String(draft.weightKg)}
                onChange={(e) => handleNumericChange('weightKg', e.target.value)}
                onBlur={() => handleNumericBlur('weightKg')}
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
                min={120}
                max={230}
                step={1}
                disabled={!unlockHeight}
                value={rawInputs.heightCm ?? String(draft.heightCm)}
                onChange={(e) => handleNumericChange('heightCm', e.target.value)}
                onBlur={() => handleNumericBlur('heightCm')}
                className={`w-full rounded-lg border px-3 py-2 font-mono-tabular focus:outline-none ${
                  unlockHeight
                    ? 'border-white/25 bg-black text-white focus:border-[#7FFFD4]'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 cursor-not-allowed'
                }`}
              />
            </div>

            <label className="space-y-1">
              <span className="text-zinc-400 block">حجم الكوب (100–1000 مل)</span>
              <input
                type="number"
                min={100}
                max={1000}
                step={1}
                value={rawInputs.cupSizeMl ?? String(draft.cupSizeMl)}
                onChange={(e) => handleNumericChange('cupSizeMl', e.target.value)}
                onBlur={() => handleNumericBlur('cupSizeMl')}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap gap-1.5">
              {[177, 200, 250, 330, 500].map((presetMl) => (
                <button
                  key={presetMl}
                  type="button"
                  onClick={() => {
                    setRawInputs((prev) => {
                      const next = { ...prev };
                      delete next.cupSizeMl;
                      return next;
                    });
                    updateDraft((p) => ({ ...p, cupSizeMl: presetMl }));
                  }}
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
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
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
              <label className="text-zinc-400 block">السحور قبل أذان الفجر (دقيقة · مرن 10–120):</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={10}
                  max={120}
                  step={5}
                  value={rawInputs.suhoorLeadMinutes ?? String(draft.suhoorLeadMinutes)}
                  onChange={(e) => handleNumericChange('suhoorLeadMinutes', e.target.value)}
                  onBlur={() => handleNumericBlur('suhoorLeadMinutes')}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                />
                {[40, 50, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setRawInputs((prev) => {
                        const next = { ...prev };
                        delete next.suhoorLeadMinutes;
                        return next;
                      });
                      updateDraft((p) => ({ ...p, suhoorLeadMinutes: mins }));
                    }}
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
              <label className="text-zinc-400 block">هدف النوم الليلي (دقائق · مرن 240–720):</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={240}
                  max={720}
                  step={15}
                  value={rawInputs.sleepTargetMinutes ?? String(draft.sleepTargetMinutes)}
                  onChange={(e) => handleNumericChange('sleepTargetMinutes', e.target.value)}
                  onBlur={() => handleNumericBlur('sleepTargetMinutes')}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                />
                {[
                  { min: 420, label: '7 س' },
                  { min: 450, label: '7.5 س' },
                  { min: 480, label: '8 س' },
                ].map((opt) => (
                  <button
                    key={opt.min}
                    type="button"
                    onClick={() => {
                      setRawInputs((prev) => {
                        const next = { ...prev };
                        delete next.sleepTargetMinutes;
                        return next;
                      });
                      updateDraft((p) => ({ ...p, sleepTargetMinutes: opt.min }));
                    }}
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
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
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
                value={rawInputs.adhanLeadMinutes ?? String(draft.adhanLeadMinutes)}
                onChange={(e) => handleNumericChange('adhanLeadMinutes', e.target.value)}
                onBlur={() => handleNumericBlur('adhanLeadMinutes')}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 block">كتم الصلاة من الأذان (د)</span>
              <input
                type="number"
                min={0}
                max={60}
                step={5}
                value={rawInputs.prayerSilenceMinutes ?? String(draft.prayerSilenceMinutes)}
                onChange={(e) => handleNumericChange('prayerSilenceMinutes', e.target.value)}
                onBlur={() => handleNumericBlur('prayerSilenceMinutes')}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 block">كتم الفجر من الأذان (د)</span>
              <input
                type="number"
                min={0}
                max={90}
                step={5}
                value={rawInputs.fajrSilenceMinutes ?? String(draft.fajrSilenceMinutes)}
                onChange={(e) => handleNumericChange('fajrSilenceMinutes', e.target.value)}
                onBlur={() => handleNumericBlur('fajrSilenceMinutes')}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>
          </div>
          <div className="space-y-2 pt-1">
            <span className="text-xs text-zinc-400 block">
              سلوك التنبيهات أثناء صمت الصلاة والنوم:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {(
                [
                  {
                    id: 'silent_inbox' as SanctuarySilenceMode,
                    title: 'كتم الصوت + حفظ في الصامت',
                    desc: 'حفظ التنبيه في صندوق الصامت فقط بدون إزعاج',
                  },
                  {
                    id: 'silent_notif' as SanctuarySilenceMode,
                    title: 'إشعار صامت بدون صوت',
                    desc: 'إظهار إشعار مرئي صامت دون رنين أو اهتزاز',
                  },
                  {
                    id: 'vibrate_notif' as SanctuarySilenceMode,
                    title: 'اهتزاز + إشعار بدون صوت',
                    desc: 'اهتزاز خفيف وإشعار مرئي مع كتم الصوت تماماً',
                  },
                  {
                    id: 'hide_all' as SanctuarySilenceMode,
                    title: 'إخفاء تام',
                    desc: 'إخفاء جميع التنبيهات كلياً طوال فترة الصمت',
                  },
                ] as const
              ).map((opt) => {
                const active = (draft.sanctuarySilenceMode ?? 'silent_inbox') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      updateDraft((p) => ({ ...p, sanctuarySilenceMode: opt.id }))
                    }
                    className={`rounded-xl border p-2.5 text-right transition-colors cursor-pointer ${
                      active
                        ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                        : 'border-white/[0.08] bg-[var(--bg-card)] text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            وقت صلاة الجمعة يُمدّد الكتم تلقائياً إلى 50 دقيقة، وفي وقت النوم يُكتم الصوت كلياً حتى الاستيقاظ مع حفظ التنبيهات الصامتة.
          </p>
        </section>

        {sunlightSettings && onUpdateSunlightSettings && (
          <SunlightSettingsSection
            settings={sunlightSettings}
            onChange={onUpdateSunlightSettings}
          />
        )}

        {/* 4. Continuous Offline-Ready GPS Location */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
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
                    updateDraft((p) => ({
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
              onChange={(e) => updateDraft((p) => ({ ...p, autoLocationSync: e.target.checked }))}
              className="w-4 h-4 accent-[#7FFFD4]"
            />
          </label>
        </section>

        {/* 5. Permanent Gemini Memory Bank (Google Cloud Vault) */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
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
              className="rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
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
              className="flex-1 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
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
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
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
            {!isMobile && isFridayMode && onToggleBiweeklyPcCleanup && (
              <button
                type="button"
                onClick={() => onToggleBiweeklyPcCleanup(!includeBiweeklyPcCleanup)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                  includeBiweeklyPcCleanup
                    ? 'border-indigo-400/50 bg-indigo-400/15 text-indigo-200'
                    : 'border-white/10 text-zinc-400'
                }`}
                title="تذكير دوري بصيانة ونظافة جهاز الكمبيوتر"
              >
                💻 صيانة الكمبيوتر (كل جمعتين)
              </button>
            )}
          </div>

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
                    onClick={() => updateDraft((p) => ({ ...p, defaultSnoozeMinutes: mins }))}
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

          {/* Google Account Cloud Sync (Drive AppData) */}
          <div className="pt-3 border-t border-white/10 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-[#7FFFD4]" />
                  <span>مزامنة الحساب السحابية (Google Drive AppData)</span>
                  {googleDriveSynced && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                      ✓ متزامن
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  تخزين سحابي مجاني ومشفّر ومحمي في حسابك Google لحفظ الدستور، العلاجات، ذاكرة Gemini، وإعدادات الكبسولة دون فقدانها أبداً.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {calendarConnected && onSyncGoogleDriveNow ? (
                  <button
                    type="button"
                    disabled={isSyncingGoogleDrive || isSyncingDriveLocal}
                    onClick={async () => {
                      setIsSyncingDriveLocal(true);
                      setDriveSyncNotice(null);
                      setDriveEnableUrl(null);
                      try {
                        const ok = await onSyncGoogleDriveNow();
                        if (ok) {
                          setDriveSyncNotice('✓ تم حفظ ومزامنة جميع الإعدادات والدستور مع حسابك على Google Drive بنجاح');
                        } else {
                          const statusInfo = getDriveApiStatus();
                          if (statusInfo.status === 'service_disabled') {
                            setDriveSyncNotice(
                              '⚠️ خدمة Google Drive API معطلة في مشروع Google Cloud الخاص بك. اضغط على الزر بالأسفل لتفعيلها بضغطة زر واحدة (Enable):'
                            );
                            setDriveEnableUrl(statusInfo.enableUrl);
                          } else {
                            setDriveSyncNotice('⚠️ تعذر رفع النسخة السحابية الآن — تأكد من الاتصال وجدد ربط Google إذا تطلب الأمر.');
                          }
                        }
                      } finally {
                        setIsSyncingDriveLocal(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[#7FFFD4]/45 bg-[#7FFFD4]/15 text-[#7FFFD4] text-xs font-bold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGoogleDrive || isSyncingDriveLocal ? 'animate-spin' : ''}`} />
                    <span>{isSyncingGoogleDrive || isSyncingDriveLocal ? 'جارٍ المزامنة...' : 'مزامنة الحساب الآن'}</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-zinc-500">
                    {calendarConnected ? 'المزامنة التلقائية قيد العمل' : 'سجّل الدخول بـ Google لتفعيل المزامنة'}
                  </span>
                )}
              </div>
            </div>
            {driveSyncNotice && (
              <div className="text-[11px] text-zinc-200 bg-black/40 border border-[#7FFFD4]/30 rounded-lg p-3 space-y-2">
                <p>{driveSyncNotice}</p>
                {driveEnableUrl && (
                  <div>
                    <a
                      href={driveEnableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs hover:bg-emerald-500/30 transition-colors"
                    >
                      <span>تفعيل Google Drive API في مشروعك (اضغط هنا)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

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
        {/* Desktop PC Exclusive: Floating PiP Capsule Controls */}
          {!isMobile && (
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Monitor className="w-4 h-4 text-[#7FFFD4]" />
                  <span>إعدادات كبسولة سطح المكتب للكمبيوتر (Desktop PiP Capsule)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#7FFFD4]/10 text-[#7FFFD4] border border-[#7FFFD4]/20 font-mono">
                  Windows / Desktop
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                الكبسولة العائمة تظل ظاهرة فوق كافة البرامج والنوافذ على شاشة الكمبيوتر لتعرض العد التنازلي للحدث القادم والتنبيهات السريعة.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-400 text-[11px]">اتجاه الكبسولة:</span>
                <button
                  type="button"
                  onClick={() => handleUpdateCapsuleOrientation('horizontal')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                    capsuleOrientation === 'horizontal'
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4]'
                      : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Rows2 className="w-3.5 h-3.5" />
                  <span>أفقي (مستطيل)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateCapsuleOrientation('vertical')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                    capsuleOrientation === 'vertical'
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4]'
                      : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>رأسي (عمودي)</span>
                </button>

                <span className="text-zinc-400 text-[11px] mr-2">الحجم:</span>
                {(['sm', 'md', 'lg'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleUpdateCapsuleSize(s)}
                    className={`px-2.5 py-1 rounded-lg border font-mono-tabular text-xs cursor-pointer transition ${
                      capsuleSize === s
                        ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {s === 'sm' ? 'صغير' : s === 'md' ? 'متوسط' : 'عريض'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 7. Google Gemini Client-Side API Key & Model Settings */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
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
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#7FFFD4]"
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



        {/* Android Native Permissions Matrix (Shown ONLY on Android Native APK) */}
        <AndroidPermissionsCard />

        {/* Footer */}
        <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onCheckAppUpdates && (
              <button
                type="button"
                onClick={onCheckAppUpdates}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs text-zinc-400 hover:text-[#7FFFD4] hover:border-[#7FFFD4]/40 cursor-pointer"
              >
                فحص التحديثات
              </button>
            )}
            <span className="text-[10.5px] font-mono-tabular text-zinc-500/70 select-none px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06]">
              {APP_VERSION}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs text-zinc-300 hover:text-white cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>حفظ الثوابت ومزامنتها</span>
            </button>
          </div>
        </div>
      </form>
  );

  if (isMobileViewport) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        direction="bottom"
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <Drawer.Content
            dir="rtl"
            aria-describedby={undefined}
            aria-label="الدستور الشخصي وذاكرة Gemini الدائمة"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-x border-white/[0.08] bg-[var(--bg-card)] text-zinc-100 shadow-2xl outline-none"
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <Drawer.Handle className="h-1.5 w-11 rounded-full bg-white/20" />
            </div>
            {renderFormContent(
              <Drawer.Title className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
                <span>الإعدادات والثوابت وذاكرة Gemini</span>
              </Drawer.Title>,
              true
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="الدستور الشخصي وذاكرة Gemini الدائمة"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {renderFormContent(
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
          <span>الإعدادات والثوابت وذاكرة Gemini</span>
        </h2>,
        false
      )}
    </div>
  );
};
