import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { QuietModeType, SharedChangelogEntry } from '../types/dayrhythm';
import type { UserSettingsPayload } from '../services/cloudStateService';

export interface UseQuietSanctuaryParams {
  quietMode: QuietModeType;
  quietRemainingSec: number;
  quietUntilTs: number | null;
  quietModeRef: React.MutableRefObject<QuietModeType>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  adhanOverrideSilentRef: React.MutableRefObject<boolean>;
  saveCloudUserSettingsRef: React.MutableRefObject<(patch: Partial<UserSettingsPayload>) => Promise<void>>;
  pushToTasksVaultRef: React.MutableRefObject<(patch?: Record<string, unknown>) => Promise<void>>;
  setQuietMode: React.Dispatch<React.SetStateAction<QuietModeType>>;
  setQuietUntilTs: React.Dispatch<React.SetStateAction<number | null>>;
  setQuietRemainingSec: React.Dispatch<React.SetStateAction<number>>;
  appendChangelog: (device: SharedChangelogEntry['device'], noteAr: string, noteEn: string) => void;
  showToast: (msg: string) => void;
}

export function useQuietSanctuary({
  quietMode,
  quietRemainingSec,
  quietUntilTs,
  quietModeRef,
  localWriteLockUntilRef,
  adhanOverrideSilentRef,
  saveCloudUserSettingsRef,
  pushToTasksVaultRef,
  setQuietMode,
  setQuietUntilTs,
  setQuietRemainingSec,
  appendChangelog,
  showToast,
}: UseQuietSanctuaryParams) {
  useEffect(() => {
    if (quietMode === 'normal' || quietRemainingSec <= 0) return;

    const targetRevertMs =
      quietUntilTs && quietUntilTs > Date.now()
        ? quietUntilTs
        : Date.now() + quietRemainingSec * 1000;

    const revertNow = () => {
      const nowMs = Date.now();
      quietModeRef.current = 'normal';
      setQuietMode('normal');
      setQuietUntilTs(null);
      setQuietRemainingSec(0);
      try {
        localStorage.setItem('dayrhythm_quiet_mode_v1', 'normal');
        localStorage.setItem('dayrhythm_quiet_until_ts_v1', 'null');
        localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(nowMs));
      } catch {
        // ignore
      }
      showToast('🔊 انتهى مؤقت الهدوء — عاد النظام للوضع العادي تلقائياً');
    };

    const revertTimeoutId = window.setTimeout(revertNow, Math.max(0, targetRevertMs - Date.now()));

    let uiIntervalId: number | null = null;
    const syncRemaining = () => {
      const leftSec = Math.max(0, Math.ceil((targetRevertMs - Date.now()) / 1000));
      setQuietRemainingSec(leftSec);
    };
    const startUiTicker = () => {
      if (uiIntervalId !== null) return;
      uiIntervalId = window.setInterval(syncRemaining, 1000);
    };
    const stopUiTicker = () => {
      if (uiIntervalId === null) return;
      window.clearInterval(uiIntervalId);
      uiIntervalId = null;
    };
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') {
        stopUiTicker();
      } else {
        syncRemaining();
        startUiTicker();
      }
    };

    if (document.visibilityState !== 'hidden') startUiTicker();
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      window.clearTimeout(revertTimeoutId);
      stopUiTicker();
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [quietMode, quietModeRef, quietRemainingSec, quietUntilTs, setQuietMode, setQuietRemainingSec, setQuietUntilTs, showToast]);

  const handleSetQuietMode = useCallback(
    (mode: QuietModeType, durationMinutes: number) => {
      const nowMs = Date.now();
      const untilTs = mode === 'normal' || durationMinutes <= 0 ? null : nowMs + durationMinutes * 60_000;
      localWriteLockUntilRef.current = nowMs + 5000;
      quietModeRef.current = mode;
      setQuietMode(mode);
      setQuietUntilTs(untilTs);
      try {
        localStorage.setItem('dayrhythm_quiet_mode_v1', mode);
        localStorage.setItem('dayrhythm_quiet_until_ts_v1', untilTs === null ? 'null' : String(untilTs));
        localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(nowMs));
      } catch {
        // ignore
      }
      if (mode === 'normal') {
        setQuietRemainingSec(0);
        showToast('🔊 تم التبديل للوضع العادي الكامل');
      } else if (durationMinutes <= 0) {
        setQuietRemainingSec(0);
        showToast(mode === 'vibrate_only' ? '📳 اهتزاز فقط لحد ما تلغيه' : '🔇 ميوت لحد ما تلغيه');
      } else {
        setQuietRemainingSec(durationMinutes * 60);
        showToast(`🔕 تفعيل وضع الهدوء (${mode}) لمدة ${durationMinutes} دقيقة`);
      }
      appendChangelog('Web/PC', `ضبط وضع الهدوء إلى ${mode}`, `Set quiet mode to ${mode}`);

      const quietPatch: Partial<UserSettingsPayload> & {
        quietUntilTs?: number | null;
        quietModeUpdatedAt?: number;
      } = {
        quietMode: mode,
        quietUntilTs: untilTs,
        quietModeUpdatedAt: nowMs,
        adhanOverrideSilent: adhanOverrideSilentRef.current,
      };
      void saveCloudUserSettingsRef.current(quietPatch);
      void pushToTasksVaultRef.current(quietPatch);
    },
    [
      adhanOverrideSilentRef,
      appendChangelog,
      localWriteLockUntilRef,
      pushToTasksVaultRef,
      quietModeRef,
      saveCloudUserSettingsRef,
      setQuietMode,
      setQuietRemainingSec,
      setQuietUntilTs,
      showToast,
    ]
  );

  const handleCycleQuietMode = useCallback(() => {
    const order: QuietModeType[] = ['normal', 'mute_audio', 'vibrate_only', 'silent_all'];
    const next = order[(order.indexOf(quietMode) + 1) % order.length];
    handleSetQuietMode(next, next === 'normal' ? 0 : 30);
  }, [handleSetQuietMode, quietMode]);

  return { handleSetQuietMode, handleCycleQuietMode };
}
