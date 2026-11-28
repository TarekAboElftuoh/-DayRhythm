/**
 * Nearest-place lookup tuned for walking: small radius first (300m then 500m), Places-style
 * rankPreference DISTANCE, walking travel mode, and strict nearest-first ordering — a small mosque
 * 120m away must beat a prominent mosque 900m away.
 */
export const NEAREST_PLACE_RADII_METERS = [300, 500, 800, 1500] as const;
export const MOSQUE_WALKING_RADII_METERS = [300, 500] as const;
export const PLACES_RANK_PREFERENCE = 'DISTANCE' as const;
export const PLACES_TRAVEL_MODE = 'WALK' as const;
export const MAX_WALKABLE_METERS = 1500;
export const WALKING_METERS_PER_MINUTE = 80;

export interface NearbyPlaceLike {
  title: string;
  distanceMeters: number;
  uri?: string;
  snippets?: string[];
}

export interface WalkingNearbySearchRequest {
  includedTypes?: string[];
  locationRestriction: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
  rankPreference: typeof PLACES_RANK_PREFERENCE;
  travelMode: typeof PLACES_TRAVEL_MODE;
  maxResultCount: number;
}

export function walkingMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(Math.max(0, distanceMeters) / WALKING_METERS_PER_MINUTE));
}

export function walkingSearchRadii(isMosqueQuery: boolean): number[] {
  return isMosqueQuery ? [...MOSQUE_WALKING_RADII_METERS] : [...NEAREST_PLACE_RADII_METERS];
}

export function buildWalkingNearbySearchRequest(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  maxResultCount?: number;
  includedTypes?: string[];
}): WalkingNearbySearchRequest {
  const radius = Math.min(MAX_WALKABLE_METERS, Math.max(300, Math.round(params.radiusMeters)));
  const maxResultCount = Math.min(20, Math.max(1, Math.round(params.maxResultCount ?? 7)));
  return {
    ...(params.includedTypes && params.includedTypes.length > 0
      ? { includedTypes: params.includedTypes }
      : {}),
    locationRestriction: {
      circle: {
        center: { latitude: params.lat, longitude: params.lng },
        radius,
      },
    },
    rankPreference: PLACES_RANK_PREFERENCE,
    travelMode: PLACES_TRAVEL_MODE,
    maxResultCount,
  };
}

/** Nearest-first, walkable-only. Prominence/fame never influences order. */
export function rankPlacesByWalkingDistance<T extends NearbyPlaceLike>(
  places: T[],
  options?: { maxWalkableMeters?: number; limit?: number }
): T[] {
  const maxWalkableMeters = options?.maxWalkableMeters ?? MAX_WALKABLE_METERS;
  const limit = options?.limit ?? 7;
  return places
    .filter((place) => Number.isFinite(place.distanceMeters) && place.distanceMeters <= maxWalkableMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export function nearestWalkableMosque<T extends NearbyPlaceLike>(
  places: T[],
  maxWalkableMeters: number = MAX_WALKABLE_METERS
): T | undefined {
  return rankPlacesByWalkingDistance(places, { maxWalkableMeters, limit: 1 })[0];
}
