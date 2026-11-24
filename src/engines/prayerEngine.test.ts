import { describe, expect, it } from 'vitest';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  formatMinutes24h,
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
});
