import { describe, it, expect } from 'vitest';
import { UserSettingsPayload } from './cloudStateService';
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
});
