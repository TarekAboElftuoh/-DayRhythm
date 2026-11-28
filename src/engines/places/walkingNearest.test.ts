import { describe, expect, it } from 'vitest';
import {
  MAX_WALKABLE_METERS,
  MOSQUE_WALKING_RADII_METERS,
  PLACES_RANK_PREFERENCE,
  PLACES_TRAVEL_MODE,
  buildWalkingNearbySearchRequest,
  nearestWalkableMosque,
  rankPlacesByWalkingDistance,
  walkingMinutes,
  walkingSearchRadii,
} from './walkingNearest';

const places = [
  { title: 'الجامع الكبير', distanceMeters: 950 },
  { title: 'مسجد الحي الصغير', distanceMeters: 120 },
  { title: 'مسجد بعيد', distanceMeters: 2400 },
  { title: 'زاوية الشارع', distanceMeters: 340 },
];

describe('walking-distance mosque ranking', () => {
  it('ranks strictly nearest-first, so the small nearby mosque beats the prominent far one', () => {
    const ranked = rankPlacesByWalkingDistance(places);
    expect(ranked.map((p) => p.title)).toEqual([
      'مسجد الحي الصغير',
      'زاوية الشارع',
      'الجامع الكبير',
    ]);
    expect(nearestWalkableMosque(places)?.title).toBe('مسجد الحي الصغير');
  });

  it('drops anything beyond the walkable radius', () => {
    const ranked = rankPlacesByWalkingDistance(places, { maxWalkableMeters: 500 });
    expect(ranked.every((p) => p.distanceMeters <= 500)).toBe(true);
    expect(ranked.some((p) => p.title === 'مسجد بعيد')).toBe(false);
    expect(ranked).toHaveLength(2);
  });

  it('starts the mosque search radius at 300m then 500m', () => {
    expect(walkingSearchRadii(true)).toEqual([...MOSQUE_WALKING_RADII_METERS]);
    expect(MOSQUE_WALKING_RADII_METERS[0]).toBe(300);
    expect(MOSQUE_WALKING_RADII_METERS[1]).toBe(500);
  });

  it('builds a DISTANCE-ranked walking request with a small clamped radius', () => {
    const request = buildWalkingNearbySearchRequest({
      lat: 31.227,
      lng: 31.6148,
      radiusMeters: 320,
      includedTypes: ['mosque'],
    });
    expect(request.rankPreference).toBe(PLACES_RANK_PREFERENCE);
    expect(request.rankPreference).toBe('DISTANCE');
    expect(request.travelMode).toBe(PLACES_TRAVEL_MODE);
    expect(request.travelMode).toBe('WALK');
    expect(request.locationRestriction.circle.radius).toBe(320);
    expect(request.locationRestriction.circle.center).toEqual({ latitude: 31.227, longitude: 31.6148 });
    expect(request.includedTypes).toEqual(['mosque']);

    const clampedLow = buildWalkingNearbySearchRequest({ lat: 0, lng: 0, radiusMeters: 50 });
    expect(clampedLow.locationRestriction.circle.radius).toBe(300);
    const clampedHigh = buildWalkingNearbySearchRequest({ lat: 0, lng: 0, radiusMeters: 9000 });
    expect(clampedHigh.locationRestriction.circle.radius).toBe(MAX_WALKABLE_METERS);
  });

  it('converts meters to walking minutes (~80 m/min, minimum 1)', () => {
    expect(walkingMinutes(120)).toBe(2);
    expect(walkingMinutes(800)).toBe(10);
    expect(walkingMinutes(30)).toBe(1);
  });
});
