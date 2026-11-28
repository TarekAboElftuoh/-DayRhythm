import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AndroidPermissionsCard } from './AndroidPermissionsCard';
import { isMobileDevice } from '../services/platform';
import type { LifeProfile } from '../types/dayrhythm';
import { computeDailyRhythmPlan } from '../engines/lifeRhythmEngine';
import { getWeekdayInTimeZone } from '../engines/prayerEngine';
import {
  NUMERIC_FIELD_BOUNDS,
  clampNumericProfileField,
  useIsMobileViewport,
  type LifeProfileModalProps,
  type NumericProfileKey,
} from './lifeProfile/types';
import { HydrationAndSleepSection } from './lifeProfile/HydrationAndSleepSection';
import { SanctuaryGpsMemorySection } from './lifeProfile/SanctuaryGpsMemorySection';
import { ScheduleAndAudioSection } from './lifeProfile/ScheduleAndAudioSection';
import { CloudBackupCapsuleSection } from './lifeProfile/CloudBackupCapsuleSection';
import { GeminiApiKeySection } from './lifeProfile/GeminiApiKeySection';
import { LifeProfileModalFooter, LifeProfileModalShell } from './lifeProfile/LifeProfileModalShell';

export type { LifeProfileModalProps };

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
  const isDirtyRef = useRef(false);
  const touchedKeysRef = useRef<Set<keyof LifeProfile>>(new Set());
  const isMobile = isMobileDevice();
  const isMobileViewport = useIsMobileViewport();

  const updateDraft = (updater: (prev: LifeProfile) => LifeProfile) => {
    isDirtyRef.current = true;
    setDraft((prev) => {
      const next = updater(prev);
      for (const k of Object.keys(next) as Array<keyof LifeProfile>) {
        if (next[k] !== prev[k]) touchedKeysRef.current.add(k);
      }
      return next;
    });
  };

  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setDraft(profile);
      setRawInputs({});
      isDirtyRef.current = false;
      touchedKeysRef.current.clear();
    } else if (isOpen) {
      if (!isDirtyRef.current) {
        setDraft(profile);
      } else {
        setDraft((prev) => {
          const merged = { ...prev };
          for (const key of Object.keys(profile) as Array<keyof LifeProfile>) {
            if (!touchedKeysRef.current.has(key)) {
              (merged as Record<string, unknown>)[key] = profile[key];
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
    const clamped = clampNumericProfileField(key, raw !== undefined ? raw : draft[key]);
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

  const commitDraft = () => {
    const sanitized = getSanitizedDraft();
    setDraft(sanitized);
    setRawInputs({});
    isDirtyRef.current = false;
    touchedKeysRef.current.clear();
    onSaveProfile(sanitized);
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    commitDraft();
    onClose();
  };

  const handleClose = () => {
    if (isDirtyRef.current) commitDraft();
    onClose();
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

      <HydrationAndSleepSection
        draft={draft}
        rawInputs={rawInputs}
        setRawInputs={setRawInputs}
        previewPlan={previewPlan}
        updateDraft={updateDraft}
        handleNumericChange={handleNumericChange}
        handleNumericBlur={handleNumericBlur}
        onSaveProfile={onSaveProfile}
      />

      <SanctuaryGpsMemorySection
        draft={draft}
        rawInputs={rawInputs}
        updateDraft={updateDraft}
        handleNumericChange={handleNumericChange}
        handleNumericBlur={handleNumericBlur}
        sunlightSettings={sunlightSettings}
        onUpdateSunlightSettings={onUpdateSunlightSettings}
        onDetectGpsLocation={onDetectGpsLocation}
        isDetectingGps={isDetectingGps}
        memories={memories}
        onAddMemory={onAddMemory}
        onUpdateMemory={onUpdateMemory}
        onDeleteMemory={onDeleteMemory}
      />

      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
        <ScheduleAndAudioSection
          draft={draft}
          updateDraft={updateDraft}
          isMobile={isMobile}
          calendarConnected={calendarConnected}
          onGoogleSignOut={onGoogleSignOut}
          onClose={onClose}
          includePrayerAnchors={includePrayerAnchors}
          onToggleIncludePrayerAnchors={onToggleIncludePrayerAnchors}
          isFridayMode={isFridayMode}
          onToggleFridayMode={onToggleFridayMode}
          includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
          onToggleBiweeklyPcCleanup={onToggleBiweeklyPcCleanup}
          soundRepeats={soundRepeats}
          onUpdateSoundRepeat={onUpdateSoundRepeat}
          onTriggerTaskAlert={onTriggerTaskAlert}
          activeBrandLogo={activeBrandLogo}
          onOpenLogoPicker={onOpenLogoPicker}
        />
        <CloudBackupCapsuleSection
          isMobile={isMobile}
          calendarConnected={calendarConnected}
          googleDriveSynced={googleDriveSynced}
          onSyncGoogleDriveNow={onSyncGoogleDriveNow}
          isSyncingGoogleDrive={isSyncingGoogleDrive}
          onExportBackupJson={onExportBackupJson}
          onImportBackupJson={onImportBackupJson}
          capsulePrefs={capsulePrefs}
          onChangeCapsulePrefs={onChangeCapsulePrefs}
        />
      </section>

      <GeminiApiKeySection isOpen={isOpen} />
      <AndroidPermissionsCard />

      <LifeProfileModalFooter onCheckAppUpdates={onCheckAppUpdates} onClose={handleClose} />
    </form>
  );

  return (
    <LifeProfileModalShell
      isOpen={isOpen}
      isMobileViewport={isMobileViewport}
      onClose={handleClose}
      renderFormContent={renderFormContent}
    />
  );
};
