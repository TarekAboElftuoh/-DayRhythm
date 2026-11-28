import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  BatteryGuardState,
  PhoneBatteryTelemetry,
  SharedChangelogEntry,
  TaskSoundCategory,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { EmitCrossDeviceSync } from '../types/appTypes';
import { publishPhoneBatteryTelemetry, type AppSyncSettings } from '../firebase';
import { playBatteryFullSignature, playSoftChime, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { formatNow12hInTimeZone } from '../engines/prayerEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';

export interface UseBatteryGuardHandlersParams {
  activeTimeZone: string;
  firebaseUser: User | null;
  batteryGuard: BatteryGuardState;
  smartChargeAudioActive: boolean;
  appSettingsRef: React.MutableRefObject<AppSyncSettings>;
  phoneChargeLimitRef: React.MutableRefObject<number>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  setBatteryGuard: React.Dispatch<React.SetStateAction<BatteryGuardState>>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setPhoneChargeAlertDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setPhoneBattery: React.Dispatch<React.SetStateAction<PhoneBatteryTelemetry | null>>;
  updateAppSettings: (patch: Partial<AppSyncSettings>) => void;
  triggerTaskAlert: (title: string, category: TaskSoundCategory, opts?: Record<string, unknown>) => void;
  emitCrossDeviceSync: EmitCrossDeviceSync;
  appendChangelog: (device: SharedChangelogEntry['device'], noteAr: string, noteEn: string) => void;
  showToast: (msg: string) => void;
}

export function useBatteryGuardHandlers(p: UseBatteryGuardHandlersParams) {
  const handleTriggerRing = useCallback(() => {
    p.setAlarmRinging(true);
    p.triggerTaskAlert('🔔', 'general', {
      privacyEmoji: '🔔',
      displayTitle: 'اختبار تنبيه متزامن (الموبايل ↔ الكمبيوتر)',
      description: 'عند الضغط على تم يتوقف التنبيه فوراً على جميع أجهزتك',
      sourceLabel: 'مزامنة فورية (Wi-Fi / بيانات الهاتف)',
      bypassSanctuary: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.triggerTaskAlert]);

  const handleSimulateCharge90 = () => {
    if (p.batteryGuard.bypassChargingLimitPct !== null) {
      p.showToast(`🎮 الشحن التجاوزي (${p.batteryGuard.bypassChargingLimitPct}%) نشط — تم منع تنبيه الامتلاء الوهمي`);
      return;
    }
    p.setBatteryGuard((prev) => ({
      ...prev, levelPct: 90, cableConnected: true, pcAlertActive: true, autoSilencedByDisconnect: false, bedtimeGuardTriggered: false,
    }));
    playSoftChime('focus_done');
    p.showToast('⚡ SUPERVOOC وصل 90%: تم إرسال التنبيه إلى الكمبيوتر');
  };

  const handleSimulatePowerDisconnect = () => {
    p.setBatteryGuard((prev) => ({ ...prev, cableConnected: false, pcAlertActive: false, autoSilencedByDisconnect: true }));
    p.showToast('🔌 ACTION_POWER_DISCONNECTED: تم كتم الصوت وإغلاق كارد التنبيه بالكمبيوتر تلقائياً');
  };

  const handleSimulateBedtimeLowBattery = () => {
    p.setBatteryGuard((prev) => ({
      ...prev, levelPct: 22, cableConnected: false, pcAlertActive: false,
      autoSilencedByDisconnect: false, bedtimeGuardTriggered: true, eveningTimeSimMin: 20 * 60 + 45,
    }));
    p.showToast('🔋 تنبيه وقائي قبل النوم (08:45 م · 22%): اشحن الهاتف قبل 09:15 م');
  };

  const handleToggleBypassCharging = (limit: number | null) => {
    const clamped = limit === null ? null : Math.max(60, Math.min(100, Math.round(limit)));
    const guardVal: 80 | 90 | null = clamped === null ? null : clamped <= 80 ? 80 : 90;
    p.setBatteryGuard((prev) => ({
      ...prev, bypassChargingLimitPct: guardVal, pcAlertActive: guardVal !== null ? false : prev.pcAlertActive,
    }));
    try { localStorage.setItem('dayrhythm_bypass_limit_v1', clamped === null ? 'off' : String(clamped)); } catch { /* ignore */ }
    if (clamped !== null) p.updateAppSettings({ phoneChargeLimitPct: clamped });
    p.showToast(
      clamped === null
        ? 'تم الرجوع لوضع الشحن العادي'
        : `🎮 تفعيل الشحن التجاوزي عند ${clamped}% (منع الإنذارات الوهمية)`
    );
  };

  const handleSimulateWindowsWake = () => {
    const ts = formatNow12hInTimeZone(p.activeTimeZone, 'ar');
    p.appendChangelog('Web/PC', `تعافي فوري من Sleep عبر WM_POWERBROADCAST (${ts})`, `Win32 Sleep/Wake recovery (${ts})`);
    p.showToast('💻 WM_POWERBROADCAST: تمت إعادة جدولة المنبهات والمزامنة فور استيقاظ ويندوز');
    return `PBT_APMRESUMEAUTOMATIC (${ts}) — تم تحديث المنبهات وجدول اليوم ✓`;
  };

  const handleStopSmartChargeAlert = useCallback(() => {
    stopSmartChargeCompleteAlert();
    stopNativeAlerts();
    p.setSmartChargeAudioActive(false);
    p.setPhoneChargeAlertDismissed(true);
    p.setPersistentAlert((prev) => (prev?.id.startsWith('charge_') ? null : prev));
    p.emitCrossDeviceSync('alarm_dismiss', 'charge_dismiss', undefined, { alertId: 'charge' });
    p.showToast('🔕 تم إسكات تنبيه الشحن على كل أجهزتك ✓ (هينبّه تاني في الشحنة الجاية)');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.emitCrossDeviceSync, p.showToast]);

  const handleToggleSmartChargeKeepUntilUnplugged = useCallback(() => {
    const next = !p.appSettingsRef.current.smartChargeKeepUntilUnplugged;
    p.showToast(
      next
        ? '🔌 سيستمر منبّه الشحن بالرنين حتى فصل الموبايل من الشاحن (أو إيقافه يدوياً)'
        : '⏱️ سيتوقف منبّه الشحن تلقائياً بعد دقيقتين إذا لم يتم إيقافه'
    );
    p.updateAppSettings({ smartChargeKeepUntilUnplugged: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.showToast, p.updateAppSettings]);

  const handleToggleSmartChargeAlertEnabled = useCallback(() => {
    const next = !p.appSettingsRef.current.smartChargeAlertEnabled;
    if (!next) {
      stopSmartChargeCompleteAlert();
      p.setSmartChargeAudioActive(false);
    }
    p.showToast(
      next
        ? `🔋 تم تفعيل التنبيه الذكي عند اكتمال الشحن (${p.appSettingsRef.current.phoneChargeLimitPct}%)`
        : '🔕 تم إيقاف التنبيه الصوتي التلقائي لاكتمال الشحن'
    );
    p.updateAppSettings({ smartChargeAlertEnabled: next });
    p.setPhoneBattery((prev) => {
      if (!prev) return prev;
      const updated: PhoneBatteryTelemetry = {
        ...prev, chargeLimitPct: p.appSettingsRef.current.phoneChargeLimitPct, updatedAtMs: Date.now(),
      };
      if (p.firebaseUser?.uid && p.firebaseUser.emailVerified) {
        void publishPhoneBatteryTelemetry(p.firebaseUser.uid, updated).catch(() => {});
      }
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.firebaseUser?.uid, p.firebaseUser?.emailVerified, p.showToast, p.updateAppSettings]);

  const handleTestSmartChargeAlert = useCallback(() => {
    if (p.smartChargeAudioActive) {
      handleStopSmartChargeAlert();
      return;
    }
    playBatteryFullSignature();
    p.showToast(`🔊 نغمة التنبيه الذكي عند وصول الموبايل إلى ${p.phoneChargeLimitRef.current}%`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.smartChargeAudioActive, handleStopSmartChargeAlert, p.showToast]);

  useEffect(() => () => { stopSmartChargeCompleteAlert(); }, []);

  return {
    handleTriggerRing, handleSimulateCharge90, handleSimulatePowerDisconnect,
    handleSimulateBedtimeLowBattery, handleToggleBypassCharging, handleSimulateWindowsWake,
    handleStopSmartChargeAlert, handleToggleSmartChargeKeepUntilUnplugged,
    handleToggleSmartChargeAlertEnabled, handleTestSmartChargeAlert,
  };
}
