import type React from 'react';
import {
  sanitizeAppSyncSettings,
  sanitizeDeviceSettings,
  type AppSyncSettings,
  type SyncedRhythmPayload,
} from '../firebase';
import { stopContinuousAlert } from '../engines/audioEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import { SCHEMA_VERSION } from '../utils/schemaMigration';
import { sanitizeLifeProfile } from './sanitizers';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type {
  BatteryGuardState,
  LifeProfile,
  QuietModeType,
  SurfaceTheme,
  TaskSoundCategory,
} from '../types/dayrhythm';
import type { OnePlusDeviceSettings } from '../firebase';

export interface ApplyRemoteCtx {
  clientIdRef: React.MutableRefObject<string>;
  persistentAlertRef: React.MutableRefObject<{ id: string; createdAtMs: number } | null>;
  seenSyncOpIdsRef: React.MutableRefObject<Set<string>>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  appSettingsRef: React.MutableRefObject<AppSyncSettings>;
  phoneChargeLimitRef: React.MutableRefObject<number>;
  quietModeRef: React.MutableRefObject<QuietModeType>;
  adhanOverrideSilentRef: React.MutableRefObject<boolean>;
  lastSyncedQuietSigRef: React.MutableRefObject<string>;
  sanctuaryOverrideUntilMsRef: React.MutableRefObject<number>;
  lastScheduledAlarmsJsonRef: React.MutableRefObject<string>;
  lastSyncedCloudAlarmsJsonRef: React.MutableRefObject<string>;
  surfaceThemeRef: React.MutableRefObject<SurfaceTheme>;
  deviceSettingsRef: React.MutableRefObject<OnePlusDeviceSettings>;
  lifeProfileRef: React.MutableRefObject<LifeProfile>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setPhoneChargeLimitPct: React.Dispatch<React.SetStateAction<number>>;
  setBatteryGuard: React.Dispatch<React.SetStateAction<BatteryGuardState>>;
  setSmartChargeAlertEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setSmartChargeKeepUntilUnplugged: React.Dispatch<React.SetStateAction<boolean>>;
  setWaterRemindersEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setSunMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIncludePrayerAnchors: React.Dispatch<React.SetStateAction<boolean>>;
  setQuietMode: React.Dispatch<React.SetStateAction<QuietModeType>>;
  setQuietUntilTs: React.Dispatch<React.SetStateAction<number | null>>;
  setQuietRemainingSec: React.Dispatch<React.SetStateAction<number>>;
  setAdhanOverrideSilent: React.Dispatch<React.SetStateAction<boolean>>;
  setSanctuaryOverrideUntilMs: React.Dispatch<React.SetStateAction<number>>;
  setSurfaceTheme: React.Dispatch<React.SetStateAction<SurfaceTheme>>;
  setDeviceSettings: React.Dispatch<React.SetStateAction<OnePlusDeviceSettings>>;
  setLifeProfile: React.Dispatch<React.SetStateAction<LifeProfile>>;
  STORAGE_KEY: string;
  SMART_CHARGE_KEEP_KEY: string;
  WATER_REMINDER_STORAGE_KEY: string;
  SURFACE_THEME_STORAGE_KEY: string;
}

export function applyRemoteAlertsAndSettings(
  remote: SyncedRhythmPayload,
  migratedRemote: SyncedRhythmPayload,
  ctx: ApplyRemoteCtx
): void {
  const remoteDismiss =
    (remote as { lastDismissSignal?: { opId?: string; timestampMs: number; scope: string; action: string; clientId: string } })
      .lastDismissSignal || remote.syncSignal;
  const remoteSenderId =
    (remoteDismiss as { clientId?: string; originClientId?: string })?.clientId ||
    (remoteDismiss as { originClientId?: string })?.originClientId;

  if (remoteDismiss && remoteSenderId !== ctx.clientIdRef.current) {
    const dismissTs = remoteDismiss.timestampMs || 0;
    const dismissOpId =
      (remoteDismiss as { opId?: string }).opId ||
      `remote_dism_${dismissTs}_${remoteSenderId || 'unknown'}`;
    const activeAlertCreatedAt = ctx.persistentAlertRef.current?.createdAtMs ?? 0;
    const isOlderThanActiveAlert = activeAlertCreatedAt > 0 && dismissTs < activeAlertCreatedAt;
    if (!isOlderThanActiveAlert && Date.now() - dismissTs < 180_000 && !ctx.seenSyncOpIdsRef.current.has(dismissOpId)) {
      if (
        remoteDismiss.scope === 'alarm_dismiss' ||
        remoteDismiss.action?.includes('dismiss') ||
        remoteDismiss.action?.includes('done') ||
        remoteDismiss.action?.includes('water')
      ) {
        ctx.seenSyncOpIdsRef.current.add(dismissOpId);
        if (ctx.seenSyncOpIdsRef.current.size > 150) {
          const oldest = ctx.seenSyncOpIdsRef.current.values().next().value;
          if (oldest) ctx.seenSyncOpIdsRef.current.delete(oldest);
        }
        stopContinuousAlert();
        stopNativeAlerts();
        ctx.setActiveAudioAlert(null);
        ctx.setPersistentAlert(null);
        ctx.setAlarmRinging(false);
        try {
          const bridge = (window as Window & { DayRhythmNative?: { dismissActiveAlerts?: () => void; stopNativeAlarmSound?: () => void } }).DayRhythmNative;
          bridge?.stopNativeAlarmSound?.();
          bridge?.dismissActiveAlerts?.();
        } catch { /* ignore */ }
      }
    }
  }

  if (remote.appSettings && Date.now() >= ctx.localWriteLockUntilRef.current) {
    const a = sanitizeAppSyncSettings(remote.appSettings);
    if (a) {
      const merged: AppSyncSettings = { ...ctx.appSettingsRef.current, ...a };
      ctx.appSettingsRef.current = merged;
      ctx.setPhoneChargeLimitPct(merged.phoneChargeLimitPct);
      ctx.phoneChargeLimitRef.current = merged.phoneChargeLimitPct;
      ctx.setBatteryGuard((prev) => ({
        ...prev,
        bypassChargingLimitPct: prev.bypassChargingLimitPct === null ? null : merged.phoneChargeLimitPct <= 80 ? 80 : 90,
      }));
      ctx.setSmartChargeAlertEnabled(merged.smartChargeAlertEnabled);
      ctx.setSmartChargeKeepUntilUnplugged(merged.smartChargeKeepUntilUnplugged);
      ctx.setWaterRemindersEnabled(merged.waterRemindersEnabled);
      ctx.setSunMode(merged.sunMode);
      if (typeof a.includePrayerAnchors === 'boolean') ctx.setIncludePrayerAnchors(a.includePrayerAnchors);
      try {
        localStorage.setItem('dayrhythm_phone_charge_limit', String(merged.phoneChargeLimitPct));
        const savedBypass = localStorage.getItem('dayrhythm_bypass_limit_v1');
        if (savedBypass !== 'off' && savedBypass !== 'null') localStorage.setItem('dayrhythm_bypass_limit_v1', String(merged.phoneChargeLimitPct));
        localStorage.setItem('dayrhythm_smart_charge_alert_enabled', String(merged.smartChargeAlertEnabled));
        localStorage.setItem(ctx.SMART_CHARGE_KEEP_KEY, String(merged.smartChargeKeepUntilUnplugged));
        localStorage.setItem(ctx.WATER_REMINDER_STORAGE_KEY, String(merged.waterRemindersEnabled));
        if (typeof a.includePrayerAnchors === 'boolean') localStorage.setItem('dayrhythm_include_prayer_anchors', String(a.includePrayerAnchors));
      } catch { /* ignore */ }
      try {
        (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
          .DayRhythmNative?.setChargeLimit?.(merged.phoneChargeLimitPct, merged.smartChargeAlertEnabled);
      } catch { /* ignore */ }
    }
  }

  const targetQuiet = remote.quietMode || ctx.quietModeRef.current;
  const targetAdhan = typeof remote.adhanOverrideSilent === 'boolean' ? remote.adhanOverrideSilent : ctx.adhanOverrideSilentRef.current;
  ctx.lastSyncedQuietSigRef.current = `${targetQuiet}:${targetAdhan}`;

  if (remote.quietMode && remote.quietMode !== ctx.quietModeRef.current && Date.now() >= ctx.localWriteLockUntilRef.current) {
    let localQuietUpdatedAt = 0;
    try { localQuietUpdatedAt = Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0); } catch { localQuietUpdatedAt = 0; }
    const remoteQuietMeta = remote as { quietUntilTs?: number | null; quietModeUpdatedAt?: number; updatedAtMs?: number };
    const remoteQuietUpdatedAt = remoteQuietMeta.quietModeUpdatedAt ?? remoteQuietMeta.updatedAtMs ?? 0;
    if (remoteQuietUpdatedAt > localQuietUpdatedAt || localQuietUpdatedAt === 0) {
      const nextUntil = remote.quietMode === 'normal' ? null : typeof remoteQuietMeta.quietUntilTs === 'number' && remoteQuietMeta.quietUntilTs > 0 ? remoteQuietMeta.quietUntilTs : null;
      ctx.quietModeRef.current = remote.quietMode;
      ctx.setQuietMode(remote.quietMode);
      ctx.setQuietUntilTs(nextUntil);
      ctx.setQuietRemainingSec(remote.quietMode !== 'normal' && nextUntil !== null && nextUntil > Date.now() ? Math.max(1, Math.ceil((nextUntil - Date.now()) / 1000)) : 0);
      try {
        localStorage.setItem('dayrhythm_quiet_mode_v1', remote.quietMode);
        localStorage.setItem('dayrhythm_quiet_until_ts_v1', nextUntil === null ? 'null' : String(nextUntil));
        localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(remoteQuietUpdatedAt || Date.now()));
      } catch { /* ignore */ }
    }
  }
  if (typeof remote.adhanOverrideSilent === 'boolean' && remote.adhanOverrideSilent !== ctx.adhanOverrideSilentRef.current) {
    ctx.adhanOverrideSilentRef.current = remote.adhanOverrideSilent;
    ctx.setAdhanOverrideSilent(remote.adhanOverrideSilent);
  }
  const remoteSanctuaryOverride = (remote as { sanctuaryOverrideUntilMs?: number }).sanctuaryOverrideUntilMs;
  if (typeof remoteSanctuaryOverride === 'number' && Date.now() >= ctx.localWriteLockUntilRef.current) {
    const incomingUntil = Math.max(0, Math.round(remoteSanctuaryOverride));
    const effectiveUntil = incomingUntil > Date.now() ? incomingUntil : 0;
    if (effectiveUntil !== ctx.sanctuaryOverrideUntilMsRef.current) {
      ctx.sanctuaryOverrideUntilMsRef.current = effectiveUntil;
      ctx.setSanctuaryOverrideUntilMs(effectiveUntil);
      ctx.lastScheduledAlarmsJsonRef.current = '';
      ctx.lastSyncedCloudAlarmsJsonRef.current = '';
      try {
        if (effectiveUntil > 0) localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(effectiveUntil));
        else localStorage.removeItem('dayrhythm_sanctuary_override_until_v1');
      } catch { /* ignore */ }
    }
  }
  if (remote.surfaceTheme && remote.surfaceTheme !== ctx.surfaceThemeRef.current) {
    ctx.surfaceThemeRef.current = remote.surfaceTheme;
    ctx.setSurfaceTheme(remote.surfaceTheme);
    try { localStorage.setItem(ctx.SURFACE_THEME_STORAGE_KEY, remote.surfaceTheme); } catch { /* ignore */ }
  }
  if (remote.deviceSettings) {
    const cleanDev = sanitizeDeviceSettings(remote.deviceSettings);
    if (JSON.stringify(cleanDev) !== JSON.stringify(ctx.deviceSettingsRef.current) && Date.now() >= ctx.localWriteLockUntilRef.current) {
      ctx.deviceSettingsRef.current = cleanDev;
      ctx.setDeviceSettings(cleanDev);
      try {
        const raw = localStorage.getItem(ctx.STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(ctx.STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: cleanDev }));
      } catch { /* ignore */ }
    }
  }
  if (remote.lifeProfile) {
    const cleanProfile = sanitizeLifeProfile(migratedRemote.lifeProfile);
    if (JSON.stringify(cleanProfile) !== JSON.stringify(ctx.lifeProfileRef.current) && Date.now() >= ctx.localWriteLockUntilRef.current) {
      ctx.lifeProfileRef.current = cleanProfile;
      ctx.setLifeProfile(cleanProfile);
      try {
        const raw = localStorage.getItem(ctx.STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(ctx.STORAGE_KEY, JSON.stringify({ ...parsed, schemaVersion: SCHEMA_VERSION, lifeProfile: cleanProfile }));
        localStorage.setItem('dayrhythm_life_profile_updated_at_v1', String((remote as { updatedAtMs?: number }).updatedAtMs || Date.now()));
      } catch { /* ignore */ }
    }
  }
}
