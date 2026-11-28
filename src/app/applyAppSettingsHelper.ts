import type React from 'react';
import type { AppLanguage, AppSettingsPatch, QuietModeType, SoundRepeatSetting, TaskSoundCategory } from '../types/dayrhythm';
import type { AppSyncSettings, OnePlusDeviceSettings } from '../firebase';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import { stopSmartChargeCompleteAlert } from '../engines/audioEngine';

export interface ApplyAppSettingsCtx {
  capsulePrefs: CapsulePrefs;
  updateAppSettings: (patch: Partial<AppSyncSettings>) => void;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  handleSetQuietMode: (mode: QuietModeType, durationMinutes: number) => void;
  handleToggleAdhanOverrideSilent: () => void;
  setLanguage: React.Dispatch<React.SetStateAction<AppLanguage>>;
  handleUpdateCapsulePrefs: (next: CapsulePrefs) => void;
  handleUpdateDeviceSettings: (patch: Partial<OnePlusDeviceSettings>) => void;
  handleUpdateSoundRepeat: (cat: TaskSoundCategory, setting: SoundRepeatSetting) => void;
  showToast: (msg: string) => void;
}

export function applyAppSettingsPatch(patch: AppSettingsPatch, ctx: ApplyAppSettingsCtx): void {
  const appPatch: Partial<AppSyncSettings> = {};
  if (typeof patch.phoneChargeLimitPct === 'number') appPatch.phoneChargeLimitPct = patch.phoneChargeLimitPct;
  if (typeof patch.chargeAlertEnabled === 'boolean') {
    appPatch.smartChargeAlertEnabled = patch.chargeAlertEnabled;
    if (!patch.chargeAlertEnabled) {
      stopSmartChargeCompleteAlert();
      ctx.setSmartChargeAudioActive(false);
    }
  }
  if (typeof patch.chargeAlertKeepUntilUnplugged === 'boolean') appPatch.smartChargeKeepUntilUnplugged = patch.chargeAlertKeepUntilUnplugged;
  if (typeof patch.waterRemindersEnabled === 'boolean') appPatch.waterRemindersEnabled = patch.waterRemindersEnabled;
  if (typeof patch.sunMode === 'boolean') appPatch.sunMode = patch.sunMode;
  if (Object.keys(appPatch).length > 0) ctx.updateAppSettings(appPatch);

  if (patch.quietMode) {
    ctx.handleSetQuietMode(patch.quietMode, patch.quietMode === 'normal' ? 0 : Math.max(0, patch.quietModeMinutes ?? 0));
  }
  if (typeof patch.adhanSoundInSilent === 'boolean') ctx.handleToggleAdhanOverrideSilent();
  if (patch.language === 'ar' || patch.language === 'en') ctx.setLanguage(patch.language);
  if (patch.capsuleOrientation || patch.capsuleSize) {
    ctx.handleUpdateCapsulePrefs({
      orientation: patch.capsuleOrientation ?? ctx.capsulePrefs.orientation,
      size: patch.capsuleSize ?? ctx.capsulePrefs.size,
    });
  }
  const devicePatch: Partial<OnePlusDeviceSettings> = {};
  if (typeof patch.liveAlertsEnabled === 'boolean') devicePatch.liveAlertsEnabled = patch.liveAlertsEnabled;
  if (patch.liveAlertsLeadMinutes) devicePatch.liveAlertsLeadMinutes = patch.liveAlertsLeadMinutes;
  if (typeof patch.liveAlertsAlwaysOn === 'boolean') devicePatch.liveAlertsAlwaysOn = patch.liveAlertsAlwaysOn;
  if (typeof patch.liveAlertsShowCharging === 'boolean') devicePatch.liveAlertsShowCharging = patch.liveAlertsShowCharging;
  if (typeof patch.persistentCountdownNotif === 'boolean') devicePatch.persistentCountdownNotif = patch.persistentCountdownNotif;
  if (Object.keys(devicePatch).length > 0) ctx.handleUpdateDeviceSettings(devicePatch);
  if (patch.soundRepeats) {
    for (const [category, value] of Object.entries(patch.soundRepeats)) {
      if (value === undefined) continue;
      const setting: SoundRepeatSetting =
        value === 'continuous' ? 'continuous' : (Math.max(1, Math.min(10, Math.round(Number(value)))) as SoundRepeatSetting);
      ctx.handleUpdateSoundRepeat(category as TaskSoundCategory, setting);
    }
  }
  ctx.showToast('⚙️ تم تطبيق الإعدادات من Gemini ✓');
}
