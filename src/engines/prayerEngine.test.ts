import { describe, expect, it } from 'vitest';
import {
  calculateEgyptianPrayerTimes,
  computeEventRangeInTimeZone,
  formatMinutes12h,
  formatMinutes24h,
  getTimeZoneOffsetString,
  haversineDistanceKm,
} from './prayerEngine';
import { GeoLocation } from '../types/dayrhythm';

describe('prayerEngine', () => {
  const cairoLocation: GeoLocation = {
    id: 'cairo',
    nameAr: 'القاهرة',
    nameEn: 'Cairo',
    lat: 30.0444,
    lng: 31.2357,
    tzOffsetHours: 2,
    timeZone: 'Africa/Cairo',
  };

  const alexLocation: GeoLocation = {
    id: 'alex',
    nameAr: 'الإسكندرية',
    nameEn: 'Alexandria',
    lat: 31.2001,
    lng: 29.9187,
    tzOffsetHours: 2,
    timeZone: 'Africa/Cairo',
  };

  it('calculates Egyptian prayer times accurately for Cairo coordinates', () => {
    const testDate = new Date('2026-06-21T12:00:00Z');
    const prayers = calculateEgyptianPrayerTimes(cairoLocation, testDate, 3);

    expect(prayers.length).toBe(6); // Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha
    const prayerNames = prayers.map((p) => p.nameEn);
    expect(prayerNames).toEqual(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);

    // Check chronological order throughout the day
    for (let i = 0; i < prayers.length - 1; i++) {
      expect(prayers[i].adhanMinutes).toBeLessThan(prayers[i + 1].adhanMinutes);
    }
  });

  it('formats minutes into 12h and 24h formats properly', () => {
    expect(formatMinutes24h(750)).toBe('12:30');
    expect(formatMinutes24h(0)).toBe('00:00');
    expect(formatMinutes24h(1439)).toBe('23:59');

    expect(formatMinutes12h(750, 'en')).toBe('12:30 PM');
    expect(formatMinutes12h(60, 'en')).toBe('01:00 AM');
    expect(formatMinutes12h(750, 'ar')).toBe('12:30 م');
  });

  it('calculates geographic distance with haversine distance formula', () => {
    const distanceKm = haversineDistanceKm(cairoLocation, alexLocation);

    // Cairo to Alexandria is ~180 km
    expect(distanceKm).toBeGreaterThan(170);
    expect(distanceKm).toBeLessThan(190);
  });

  it('formats timezone offset strings accurately for ISO/RFC3339 timestamps', () => {
    const cairoOffset = getTimeZoneOffsetString('Africa/Cairo', new Date('2026-01-15T12:00:00Z'));
    expect(cairoOffset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(cairoOffset).toBe('+02:00');

    const utcOffset = getTimeZoneOffsetString('UTC', new Date('2026-01-15T12:00:00Z'));
    expect(utcOffset).toBe('+00:00');
  });

  it('computes symmetric start and end times for Google Calendar events without mixing Z and offset', () => {
    // Normal 30-min event
    const range30 = computeEventRangeInTimeZone('2026-11-24', '15:30', 30, 'Africa/Cairo');
    expect(range30.startDateTime).toBe('2026-11-24T15:30:00+02:00');
    expect(range30.endDateTime).toBe('2026-11-24T16:00:00+02:00');

    // 0-duration event stored with 1-min window for API validity while preserving local offset
    const range0 = computeEventRangeInTimeZone('2026-11-24', '10:00', 0, 'Africa/Cairo');
    expect(range0.startDateTime).toBe('2026-11-24T10:00:00+02:00');
    expect(range0.endDateTime).toBe('2026-11-24T10:01:00+02:00');
    expect(range0.endDateTime).not.toContain('Z');

    // Midnight crossing
    const rangeCrossing = computeEventRangeInTimeZone('2026-11-24', '23:45', 30, 'Africa/Cairo');
    expect(rangeCrossing.startDateTime).toBe('2026-11-24T23:45:00+02:00');
    expect(rangeCrossing.endDateTime).toBe('2026-11-25T00:15:00+02:00');
  });
});
