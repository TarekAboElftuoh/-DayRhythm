import { describe, it, expect } from 'vitest';
import {
  formatDurationAr,
  computeScientificHydration,
  DEFAULT_LIFE_PROFILE,
} from './lifeRhythmEngine';

describe('Life Rhythm Engine Pure Functions', () => {
  it('formats Arabic duration correctly', () => {
    expect(formatDurationAr(0)).toBe('0 د');
    expect(formatDurationAr(45)).toBe('45 د');
    expect(formatDurationAr(60)).toBe('1 س');
    expect(formatDurationAr(90)).toBe('1 س 30 د');
    expect(formatDurationAr(150)).toBe('2 س 30 د');
  });

  it('computes scientific hydration targets reliably', () => {
    const hydration = computeScientificHydration(DEFAULT_LIFE_PROFILE, false);
    expect(hydration.normalTargetMl).toBeGreaterThan(1500);
    expect(hydration.normalTargetCups).toBeGreaterThan(5);
    expect(hydration.normalTargetCups).toBeLessThan(35);
    expect(hydration.fastingMinTargetMl).toBeLessThanOrEqual(hydration.normalTargetMl);
  });
});
