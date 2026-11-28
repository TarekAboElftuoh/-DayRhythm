import { describe, expect, it } from 'vitest';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import { migrateAppState, SCHEMA_VERSION } from './schemaMigration';

describe('schemaMigration', () => {
  it('fills missing v2 defaults safely when given null or empty v1 state', () => {
    const empty = migrateAppState(null);
    expect(empty.schemaVersion).toBe(SCHEMA_VERSION);
    expect(empty.lifeProfile.schemaVersion).toBe(SCHEMA_VERSION);
    expect(empty.lifeProfile.sanctuarySilenceMode).toBe('silent_inbox');
    expect(empty.lifeProfile.weightKg).toBe(DEFAULT_LIFE_PROFILE.weightKg);
    expect(empty.phoneChargeLimitPct).toBe(90);
    expect(empty.travelState.active).toBe(false);
    expect(empty.travelState.postponedTaskIds).toContain('room_cleanup');
    expect(empty.sanctuaryOverrideUntilMs).toBe(0);
  });

  it('preserves existing user data while upgrading v1 payloads', () => {
    const v1Raw = {
      version: 1,
      lifeProfile: {
        weightKg: 82,
        careerTrack: 'AI Engineering',
        sanctuarySilenceMode: 'vibrate_notif',
      },
      phoneChargeLimitPct: 80,
      sanctuaryOverrideUntilMs: 1700000000000,
      travelState: {
        active: true,
        distanceKm: 240,
      },
      customPreservedField: { keep: true },
    };

    const migrated = migrateAppState(v1Raw);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.lifeProfile.weightKg).toBe(82);
    expect(migrated.lifeProfile.careerTrack).toBe('AI Engineering');
    expect(migrated.lifeProfile.sanctuarySilenceMode).toBe('vibrate_notif');
    expect(migrated.lifeProfile.cupSizeMl).toBe(DEFAULT_LIFE_PROFILE.cupSizeMl);
    expect(migrated.phoneChargeLimitPct).toBe(80);
    expect(migrated.sanctuaryOverrideUntilMs).toBe(1700000000000);
    expect(migrated.travelState.active).toBe(true);
    expect(migrated.travelState.distanceKm).toBe(240);
    expect(migrated.customPreservedField).toEqual({ keep: true });
  });

  it('is strictly idempotent across repeated invocations', () => {
    const once = migrateAppState({
      lifeProfile: { weightKg: 74 },
      appSettings: { phoneChargeLimitPct: 85 },
    });
    const twice = migrateAppState(once);
    expect(twice).toEqual(once);
    expect(twice.phoneChargeLimitPct).toBe(85);
  });
});
