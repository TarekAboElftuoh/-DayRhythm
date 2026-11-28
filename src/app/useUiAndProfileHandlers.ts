import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { LifeProfile, SurfaceTheme, UiPrefs } from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import type { TasksVaultPayload } from '../types/appTypes';
import type { UserSettingsPayload } from '../services/cloudStateService';
import {
  sanitizeDeviceSettings,
  sanitizeUiPrefs,
  type OnePlusDeviceSettings,
} from '../firebase';
import { DEFAULT_LOGO_ID, getLogoConceptById, SELECTED_LOGO_STORAGE_KEY } from '../components/logoRegistry';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { getSavedCloudApiUrl } from '../services/apiClient';
import { CAPSULE_PREFS_STORAGE_KEY, STORAGE_KEY } from '../utils/appHelpers';
import { sanitizeLifeProfile } from './sanitizers';

export interface UseUiAndProfileHandlersParams {
  activeTimeZone: string;
  lifeProfile: LifeProfile;
  SURFACE_THEME_STORAGE_KEY: string;
  selectedLogoIdRef: React.MutableRefObject<string>;
  capsulePrefsRef: React.MutableRefObject<CapsulePrefs>;
  surfaceThemeRef: React.MutableRefObject<SurfaceTheme>;
  deviceSettingsRef: React.MutableRefObject<OnePlusDeviceSettings>;
  lifeProfileRef: React.MutableRefObject<LifeProfile>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  setCapsulePrefs: React.Dispatch<React.SetStateAction<CapsulePrefs>>;
  setSelectedLogoId: React.Dispatch<React.SetStateAction<string>>;
  setFastingOverride: React.Dispatch<React.SetStateAction<'auto' | 'fasting' | 'normal'>>;
  setSurfaceTheme: React.Dispatch<React.SetStateAction<SurfaceTheme>>;
  setDeviceSettings: React.Dispatch<React.SetStateAction<OnePlusDeviceSettings>>;
  setLifeProfile: React.Dispatch<React.SetStateAction<LifeProfile>>;
  updateLifeProfileLocal: (updater: (prev: LifeProfile) => LifeProfile) => LifeProfile;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: (customToken?: string, overrides?: { lifeProfile?: LifeProfile }) => Promise<boolean>;
  saveCloudUserSettingsImmediately: (patch?: Partial<UserSettingsPayload>) => Promise<void>;
  showToast: (msg: string) => void;
}

export function useUiAndProfileHandlers(p: UseUiAndProfileHandlersParams) {
  const syncUiPrefsCloud = useCallback(
    (nextLogoId?: string, nextCapsule?: Partial<CapsulePrefs>, cloudApiUrlOverride?: string) => {
      const effectiveLogo = nextLogoId || p.selectedLogoIdRef.current;
      const effectiveCapsule: CapsulePrefs = { ...p.capsulePrefsRef.current, ...(nextCapsule || {}) };
      const effectiveUrl = cloudApiUrlOverride !== undefined ? cloudApiUrlOverride : getSavedCloudApiUrl();
      const clean: UiPrefs = sanitizeUiPrefs({
        selectedLogoId: effectiveLogo,
        capsuleOrientation: effectiveCapsule.orientation,
        capsuleSize: effectiveCapsule.size,
        cloudApiUrl: effectiveUrl || undefined,
      }) ?? { selectedLogoId: DEFAULT_LOGO_ID, capsuleOrientation: 'horizontal', capsuleSize: 'md' };
      p.selectedLogoIdRef.current = clean.selectedLogoId;
      p.capsulePrefsRef.current = { orientation: clean.capsuleOrientation, size: clean.capsuleSize };
      void p.pushToTasksVaultImmediately({ uiPrefs: clean });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.pushToTasksVaultImmediately]
  );

  const handleSaveCloudApiUrl = useCallback(
    (url: string) => syncUiPrefsCloud(p.selectedLogoIdRef.current, p.capsulePrefsRef.current, url),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncUiPrefsCloud]
  );

  const handleUpdateCapsulePrefs = useCallback(
    (next: CapsulePrefs) => {
      p.setCapsulePrefs(next);
      p.capsulePrefsRef.current = next;
      try { window.localStorage.setItem(CAPSULE_PREFS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      syncUiPrefsCloud(undefined, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncUiPrefsCloud]
  );

  useEffect(() => {
    const onCapsulePrefs = (ev: Event) => {
      const d = (ev as CustomEvent<{ orientation?: string; size?: string }>).detail || {};
      handleUpdateCapsulePrefs({
        orientation: d.orientation === 'vertical' ? 'vertical' : 'horizontal',
        size: d.size === 'sm' || d.size === 'lg' ? d.size : 'md',
      });
    };
    window.addEventListener('dayrhythm:capsule-prefs', onCapsulePrefs);
    return () => window.removeEventListener('dayrhythm:capsule-prefs', onCapsulePrefs);
  }, [handleUpdateCapsulePrefs]);

  const handleSelectBrandLogo = useCallback(
    (id: string) => {
      p.setSelectedLogoId(id);
      p.selectedLogoIdRef.current = id;
      try { window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, id); } catch { /* ignore */ }
      syncUiPrefsCloud(id);
      const picked = getLogoConceptById(id);
      if (picked) p.showToast(`تم تفعيل ومزامنة شعار «${picked.titleAr}» على أجهزتك ✓`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.showToast, syncUiPrefsCloud]
  );

  const handleResetBrandLogo = useCallback(() => {
    p.setSelectedLogoId(DEFAULT_LOGO_ID);
    p.selectedLogoIdRef.current = DEFAULT_LOGO_ID;
    try { window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, DEFAULT_LOGO_ID); } catch { /* ignore */ }
    syncUiPrefsCloud(DEFAULT_LOGO_ID);
    p.showToast('تمت العودة للشعار الافتراضي (أفق الشروق الزجاجي) ومزامنته ✓');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.showToast, syncUiPrefsCloud]);

  const handleChangeFastingOverride = useCallback(
    (next: 'auto' | 'fasting' | 'normal') => {
      p.setFastingOverride(next);
      void p.pushToTasksVaultImmediately({ fastingOverride: next });
    },
    [p.pushToTasksVaultImmediately, p.setFastingOverride]
  );

  const handleToggleSurfaceTheme = useCallback(
    (theme: SurfaceTheme) => {
      p.surfaceThemeRef.current = theme;
      p.setSurfaceTheme(theme);
      try { localStorage.setItem(p.SURFACE_THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
      void p.pushToTasksVaultImmediately({ surfaceTheme: theme });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.pushToTasksVaultImmediately]
  );

  const handleUpdateDeviceSettings = useCallback(
    (patch: Partial<OnePlusDeviceSettings>) => {
      p.localWriteLockUntilRef.current = Date.now() + 4000;
      const next = sanitizeDeviceSettings({ ...p.deviceSettingsRef.current, ...patch });
      p.deviceSettingsRef.current = next;
      p.setDeviceSettings(next);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: next }));
      } catch { /* ignore */ }
      void p.pushToTasksVaultImmediately({ deviceSettings: next });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.pushToTasksVaultImmediately]
  );

  const handleUpdateLifeProfile = useCallback(
    (patch: Partial<LifeProfile>) => {
      p.localWriteLockUntilRef.current = Date.now() + 4000;
      const nextProfile = sanitizeLifeProfile({ ...p.lifeProfileRef.current, ...patch });
      p.lifeProfileRef.current = nextProfile;
      p.setLifeProfile(nextProfile);
      try {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, lifeProfile: nextProfile }));
      } catch { /* ignore */ }
      p.showToast('تم حفظ وتحديث «الدستور الشخصي» ومزامنته سحابياً ✓');
      void p.pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
      void p.pushToTasksVaultImmediately({ lifeProfile: nextProfile });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.showToast, p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately]
  );

  const handleQuickUpdateWeight = useCallback(
    (nextWeightKg: number) => {
      const clamped = Math.max(35, Math.min(220, Math.round(nextWeightKg * 2) / 2));
      p.localWriteLockUntilRef.current = Date.now() + 300;
      const nextProfile = sanitizeLifeProfile({ ...p.lifeProfileRef.current, weightKg: clamped });
      p.lifeProfileRef.current = nextProfile;
      p.setLifeProfile(nextProfile);
      try {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, lifeProfile: nextProfile }));
      } catch { /* ignore */ }
      p.showToast(`⚖️ تم تحديث الوزن إلى ${clamped} كجم وإعادة حساب الماء تلقائياً`);
      void p.pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
      void p.pushToTasksVaultImmediately({ lifeProfile: nextProfile });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.showToast, p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately]
  );

  const handleToggleLowEnergyToday = useCallback(() => {
    const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
    const nextActive = p.lifeProfile.lowEnergyDateKey !== todayIso;
    const nextProfile = p.updateLifeProfileLocal((prev) =>
      sanitizeLifeProfile({ ...prev, lowEnergyDateKey: nextActive ? todayIso : '' })
    );
    void p.saveCloudUserSettingsImmediately({ lifeProfile: nextProfile });
    void p.pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
    p.showToast(
      nextActive
        ? '🕊️ تم تفعيل «اليوم الهادئ»: الصيام والصلوات وأساسياتك محفوظة وخُفّفت التنبيهات'
        : '✓ تم إنهاء وضع اليوم الهادئ وعاد الإيقاع العادي'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.activeTimeZone, p.lifeProfile.lowEnergyDateKey, p.pushFullCloudBackupImmediately, p.saveCloudUserSettingsImmediately, p.showToast, p.updateLifeProfileLocal]);

  return {
    syncUiPrefsCloud,
    handleSaveCloudApiUrl,
    handleUpdateCapsulePrefs,
    handleSelectBrandLogo,
    handleResetBrandLogo,
    handleChangeFastingOverride,
    handleToggleSurfaceTheme,
    handleUpdateDeviceSettings,
    handleUpdateLifeProfile,
    handleQuickUpdateWeight,
    handleToggleLowEnergyToday,
  };
}
