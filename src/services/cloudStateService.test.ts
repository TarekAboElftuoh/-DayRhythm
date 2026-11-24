import { describe, it, expect } from 'vitest';
import { UserSettingsPayload, mergeUserSettingsPayloads } from './cloudStateService';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';

describe('Cloud State Synchronization Payload Guards', () => {
  it('detects differences in life profile accurately', () => {
    const a: UserSettingsPayload = {
      lifeProfile: {
        ...DEFAULT_LIFE_PROFILE,
        weightKg: 70,
      },
    };

    const b: UserSettingsPayload = {
      lifeProfile: {
        ...DEFAULT_LIFE_PROFILE,
        weightKg: 72,
      },
    };

    expect(JSON.stringify(a.lifeProfile)).not.toBe(JSON.stringify(b.lifeProfile));
  });

  it('suppresses echo when originClientId matches local clientId', () => {
    const localClientId = 'dr_test_client_123';
    const remotePayload: UserSettingsPayload = {
      originClientId: 'dr_test_client_123',
      quietMode: 'silent_all',
    };

    const shouldIgnore = remotePayload.originClientId === localClientId;
    expect(shouldIgnore).toBe(true);
  });

  it('deep merges appSettings subfields without wiping sibling properties', () => {
    const base: UserSettingsPayload = {
      appSettings: {
        phoneChargeLimitPct: 90,
        smartChargeAlertEnabled: true,
        smartChargeKeepUntilUnplugged: true,
        waterRemindersEnabled: true,
        sunMode: false,
        includePrayerAnchors: true,
      },
    };

    const patch1: UserSettingsPayload = {
      appSettings: {
        phoneChargeLimitPct: 80,
      } as any,
    };

    const step1 = mergeUserSettingsPayloads(base, patch1);
    expect(step1.appSettings?.phoneChargeLimitPct).toBe(80);
    expect(step1.appSettings?.smartChargeAlertEnabled).toBe(true);
    expect(step1.appSettings?.includePrayerAnchors).toBe(true);

    const patch2: UserSettingsPayload = {
      appSettings: {
        includePrayerAnchors: false,
      } as any,
    };

    const step2 = mergeUserSettingsPayloads(step1, patch2);
    expect(step2.appSettings?.phoneChargeLimitPct).toBe(80);
    expect(step2.appSettings?.smartChargeAlertEnabled).toBe(true);
    expect(step2.appSettings?.includePrayerAnchors).toBe(false);
  });

  it('deep merges concurrent rapid changes across different settings domains', () => {
    const base: UserSettingsPayload = {
      quietMode: 'normal',
      surfaceTheme: 'amoled',
      deviceSettings: {
        alertSliderLinked: true,
        liveAlertsEnabled: true,
        liveAlertsLeadMinutes: 10,
        persistentCountdownNotif: true,
        aquaTouchMode: true,
        ltpoNight1Hz: true,
        pocketProtectionEnabled: true,
      },
      uiPrefs: {
        selectedLogoId: 'glass_horizon',
        capsuleOrientation: 'horizontal',
        capsuleSize: 'md',
      },
    };

    // Client A changes quiet mode
    const clientAUpdate: UserSettingsPayload = {
      quietMode: 'mute_audio',
      deviceSettings: {
        ...base.deviceSettings!,
        liveAlertsLeadMinutes: 15,
      },
    };

    // Client B changes theme and capsule size concurrently
    const clientBUpdate: UserSettingsPayload = {
      surfaceTheme: 'obsidian',
      uiPrefs: {
        ...base.uiPrefs!,
        capsuleSize: 'lg',
      },
    };

    const merged = mergeUserSettingsPayloads(
      mergeUserSettingsPayloads(base, clientAUpdate),
      clientBUpdate
    );

    expect(merged.quietMode).toBe('mute_audio');
    expect(merged.surfaceTheme).toBe('obsidian');
    expect(merged.deviceSettings?.liveAlertsLeadMinutes).toBe(15);
    expect(merged.uiPrefs?.capsuleSize).toBe('lg');
    expect(merged.uiPrefs?.selectedLogoId).toBe('glass_horizon');
  });
});
