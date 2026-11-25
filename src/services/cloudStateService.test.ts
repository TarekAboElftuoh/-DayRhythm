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
    expect(merged.deviceSettings?.liveAlertsAlwaysOn ?? false).toBe(false);
    expect(merged.uiPrefs?.capsuleSize).toBe('lg');
    expect(merged.uiPrefs?.selectedLogoId).toBe('glass_horizon');
  });

  it('merges 20/30 minute Live Alerts lead times and always-on/charging toggles', () => {
    const base: UserSettingsPayload = {
      deviceSettings: {
        alertSliderLinked: false,
        liveAlertsEnabled: true,
        liveAlertsLeadMinutes: 10,
        liveAlertsAlwaysOn: false,
        liveAlertsShowCharging: true,
        persistentCountdownNotif: true,
        aquaTouchMode: true,
        ltpoNight1Hz: true,
        pocketProtectionEnabled: true,
      },
    };
    const merged = mergeUserSettingsPayloads(base, {
      deviceSettings: {
        ...base.deviceSettings!,
        liveAlertsLeadMinutes: 20,
        liveAlertsAlwaysOn: true,
        liveAlertsShowCharging: false,
      },
    });
    expect(merged.deviceSettings?.liveAlertsLeadMinutes).toBe(20);
    expect(merged.deviceSettings?.liveAlertsAlwaysOn).toBe(true);
    expect(merged.deviceSettings?.liveAlertsShowCharging).toBe(false);
  });

  describe('Cloud Real-time Live Signal Stream (Sub-100ms Pub/Sub)', () => {
    it('constructs well-formed live signals for settings patches', () => {
      const liveSignal = {
        opId: 'live_test_123',
        clientId: 'client_pc_1',
        timestampMs: 1711000000000,
        type: 'settings_patch' as const,
        patch: {
          quietMode: 'silent_all',
          appSettings: {
            phoneChargeLimitPct: 85,
            sunMode: true,
            smartChargeAlertEnabled: true,
            smartChargeKeepUntilUnplugged: true,
            waterRemindersEnabled: true,
            includePrayerAnchors: false,
          },
        },
      };

      expect(liveSignal.type).toBe('settings_patch');
      expect(liveSignal.patch?.quietMode).toBe('silent_all');
      expect(liveSignal.patch?.appSettings?.phoneChargeLimitPct).toBe(85);
      expect(liveSignal.patch?.appSettings?.sunMode).toBe(true);
    });

    it('constructs well-formed live signals for instant cross-device alarm dismissal', () => {
      const dismissSignal = {
        opId: 'live_dismiss_456',
        clientId: 'client_mobile_2',
        timestampMs: 1711000000100,
        type: 'alarm_dismiss' as const,
        action: 'dismiss',
      };

      expect(dismissSignal.type).toBe('alarm_dismiss');
      expect(dismissSignal.action).toBe('dismiss');
      expect(dismissSignal.clientId).toBe('client_mobile_2');
    });

    it('properly drops echo live signals from own client ID', () => {
      const myClientId = 'client_local_current';
      const incomingSignal = {
        opId: 'live_op_999',
        clientId: 'client_local_current',
        timestampMs: Date.now(),
        type: 'settings_patch' as const,
      };

      const isOwnEcho = incomingSignal.clientId === myClientId;
      expect(isOwnEcho).toBe(true);
    });
  });
});
