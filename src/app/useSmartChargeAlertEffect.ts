import { useEffect } from 'react';
import type React from 'react';
import type { ActiveSanctuaryState, PhoneBatteryTelemetry, QuietModeType } from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import { startSmartChargeCompleteAlert, stopSmartChargeCompleteAlert } from '../engines/audioEngine';
import { formatNow12hInTimeZone } from '../engines/prayerEngine';

export interface UseSmartChargeAlertEffectParams {
  activeTimeZone: string;
  phoneBattery: PhoneBatteryTelemetry | null;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  smartChargeAudioActive: boolean;
  quietMode: QuietModeType;
  activeSanctuary: ActiveSanctuaryState;
  phoneChargeNotifiedCycleRef: React.MutableRefObject<boolean>;
  setSmartChargeAudioActive: React.Dispatch<React.SetStateAction<boolean>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setPhoneChargeAlertDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (msg: string) => void;
}

export function useSmartChargeAlertEffect(p: UseSmartChargeAlertEffectParams): void {
  useEffect(() => {
    if (!p.phoneBattery) return;

    if (!p.phoneBattery.charging || p.phoneBattery.levelPct < p.phoneBattery.chargeLimitPct - 2) {
      if (p.phoneChargeNotifiedCycleRef.current || p.smartChargeAudioActive) {
        stopSmartChargeCompleteAlert();
        p.setSmartChargeAudioActive(false);
        p.setPersistentAlert((prev) => (prev?.id.startsWith('charge_') ? null : prev));
      }
      p.phoneChargeNotifiedCycleRef.current = false;
      p.setPhoneChargeAlertDismissed(false);
      return;
    }

    if (
      p.smartChargeAlertEnabled &&
      p.phoneBattery.charging &&
      p.phoneBattery.levelPct >= p.phoneBattery.chargeLimitPct &&
      !p.phoneChargeNotifiedCycleRef.current
    ) {
      p.phoneChargeNotifiedCycleRef.current = true;
      p.setPhoneChargeAlertDismissed(false);

      const isAndroidNative = Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative);
      const battery = p.phoneBattery;
      const showChargePopupAndNotify = () => {
        const currentTime12 = formatNow12hInTimeZone(p.activeTimeZone, 'ar');
        if (p.quietMode === 'silent_all' || p.activeSanctuary.type !== 'none') {
          p.showToast(`🔋 اكتمل شحن ${battery.deviceLabel || 'الموبايل'} (${battery.levelPct}%)`);
          return;
        }
        p.setPersistentAlert({
          id: `charge_${Date.now().toString(36)}`,
          emoji: `🔋 ${battery.levelPct}%`,
          title: `وصل شحن ${battery.deviceLabel || 'الموبايل'} إلى ${battery.levelPct}% — افصل الشاحن الآن`,
          sourceLabel: p.smartChargeKeepUntilUnplugged
            ? 'تنبيه الشحن · يرن دقيقة كل 5 دقائق حتى الفصل'
            : 'التنبيه الذكي لاكتمال الشحن',
          time12h: currentTime12,
          category: 'general',
          createdAtMs: Date.now(),
          durationMs: 60_000,
          isContinuous: true,
        });

        try {
          const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview;
          wv?.postMessage?.(
            JSON.stringify({
              type: 'native-alert',
              emoji: `🔋 ${battery.levelPct}%`,
              title: `وصل شحن ${battery.deviceLabel || 'الموبايل'} إلى ${battery.levelPct}% — افصل الشاحن الآن`,
              sourceLabel: 'تنبيه الشحن · دقيقة كل 5 دقائق حتى الفصل',
              time12h: currentTime12,
              category: 'charge',
              isHydration: false,
              isContinuous: true,
              durationSeconds: 60,
            })
          );
        } catch { /* ignore */ }
      };

      if (!isAndroidNative) {
        const audioResult = startSmartChargeCompleteAlert({
          sanctuary: p.activeSanctuary,
          keepRingingUntilUnplugged: p.smartChargeKeepUntilUnplugged,
          onCycleRestart: showChargePopupAndNotify,
          onAutoStop: () => p.setSmartChargeAudioActive(false),
        });
        if (audioResult.playedAudio) p.setSmartChargeAudioActive(true);
      }

      showChargePopupAndNotify();
      if (p.quietMode === 'silent_all' || p.activeSanctuary.type !== 'none') return;

      p.showToast(
        `🔋 التنبيه الذكي: وصل شحن ${battery.deviceLabel || 'الموبايل'} إلى ${battery.levelPct}% (الحد ${battery.chargeLimitPct}%)`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.activeTimeZone,
    p.phoneBattery,
    p.smartChargeAlertEnabled,
    p.smartChargeKeepUntilUnplugged,
    p.smartChargeAudioActive,
    p.activeSanctuary,
    p.showToast,
  ]);
}
