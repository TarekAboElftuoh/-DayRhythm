import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { LifeProfile } from '../types/dayrhythm';
import {
  haversineDistanceKm,
  PRESET_LOCATIONS,
  resolveOfflineCityName,
  reverseGeocodeCityName,
} from '../engines/prayerEngine';
import { detectIsMobileDeviceClient } from '../utils/appHelpers';
import { sanitizeLifeProfile } from './sanitizers';

export interface UseGpsLocationSyncParams {
  lifeProfile: LifeProfile;
  needsAuth: boolean;
  setIsDetectingGps: React.Dispatch<React.SetStateAction<boolean>>;
  setLocationResolutionState: React.Dispatch<
    React.SetStateAction<'idle' | 'resolving_gps' | 'gps_locked' | 'timezone_fallback'>
  >;
  updateLifeProfileLocal: (updater: (prev: LifeProfile) => LifeProfile) => void;
  showToast: (msg: string) => void;
}

export function useGpsLocationSync(p: UseGpsLocationSyncParams) {
  const lastCoordsRef = useRef<{ lat: number; lng: number }>({
    lat: p.lifeProfile.currentLat,
    lng: p.lifeProfile.currentLng,
  });
  useEffect(() => {
    lastCoordsRef.current = { lat: p.lifeProfile.currentLat, lng: p.lifeProfile.currentLng };
  }, [p.lifeProfile.currentLat, p.lifeProfile.currentLng]);

  const handleDetectGpsLocation = useCallback(async () => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
    const isMobileClient = detectIsMobileDeviceClient();

    const tryIpGeolocationFallback = async (): Promise<boolean> => {
      try {
        const res = await fetch('https://get.geojs.io/v1/ip/geo.json', {
          signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
        });
        if (!res.ok) return false;
        const geo = (await res.json()) as {
          latitude?: string | number;
          longitude?: string | number;
          city?: string;
          timezone?: string;
        };
        const lat = Number(geo.latitude);
        const lng = Number(geo.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        const roundedLat = Math.round(lat * 10000) / 10000;
        const roundedLng = Math.round(lng * 10000) / 10000;
        const tz = geo.timezone || browserTz;
        const offlineCity = resolveOfflineCityName(roundedLat, roundedLng, tz);
        const displayCity = geo.city ? `${geo.city}` : offlineCity;
        lastCoordsRef.current = { lat: roundedLat, lng: roundedLng };
        p.updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({ ...prev, currentCityName: displayCity, currentTimeZone: tz, currentLat: roundedLat, currentLng: roundedLng })
        );
        p.setLocationResolutionState('gps_locked');
        p.showToast(`🌐 تم تحديد موقعك التقريبي (${displayCity}) — وموقع GPS الموبايل يتزامن تلقائياً`);
        void reverseGeocodeCityName(roundedLat, roundedLng, displayCity).then((refined) => {
          if (refined && refined !== displayCity) {
            p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
          }
        });
        return true;
      } catch {
        return false;
      }
    };

    if (!navigator.geolocation) {
      p.setIsDetectingGps(true);
      const ok = !isMobileClient ? await tryIpGeolocationFallback() : false;
      p.setIsDetectingGps(false);
      if (!ok) p.showToast('📱 افتح التطبيق على الموبايل لتحديث GPS وسيتزامن الموقع تلقائياً للكمبيوتر');
      return;
    }

    p.setIsDetectingGps(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: isMobileClient ? 12000 : 6000,
          maximumAge: 0,
          enableHighAccuracy: isMobileClient,
        });
      });
      const lat = Math.round(pos.coords.latitude * 10000) / 10000;
      const lng = Math.round(pos.coords.longitude * 10000) / 10000;
      const offlineCityName = resolveOfflineCityName(lat, lng, browserTz);
      lastCoordsRef.current = { lat, lng };
      p.updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({ ...prev, currentCityName: offlineCityName, currentTimeZone: browserTz, currentLat: lat, currentLng: lng })
      );
      p.setLocationResolutionState('gps_locked');
      p.showToast(
        isMobileClient
          ? `📍 تم تحديد موقعك بالـ GPS (${offlineCityName}) ومزامنته تلقائياً للكمبيوتر ✓`
          : `📍 تم تحديد موقعك بالـ GPS وحساب المواقيت بدقة: ${offlineCityName}`
      );
      void reverseGeocodeCityName(lat, lng, offlineCityName).then((refinedName) => {
        if (refinedName && refinedName !== offlineCityName) {
          p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refinedName }));
        }
      });
    } catch (err: unknown) {
      if (!isMobileClient) {
        const ipOk = await tryIpGeolocationFallback();
        if (ipOk) return;
        p.showToast('📱 الكمبيوتر لا يملك GPS مباشر — سيتبع تلقائياً آخر موقع GPS من موبايلك');
        return;
      }
      const geoErr = err as { code?: number } | null;
      p.showToast(
        geoErr?.code === 1
          ? '⚠️ يرجى السماح بصلاحية الموقع (GPS) من إعدادات التطبيق على الموبايل لتحديد مدينتك الفعلية.'
          : 'تعذر التقاط إشارة GPS حالياً — تأكد من تفعيل الموقع (Location) على الموبايل.'
      );
    } finally {
      p.setIsDetectingGps(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.showToast]);

  useEffect(() => {
    if (!p.lifeProfile.autoLocationSync) return;
    if (!detectIsMobileDeviceClient()) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Math.round(pos.coords.latitude * 10000) / 10000;
          const lng = Math.round(pos.coords.longitude * 10000) / 10000;
          const prevCoords = lastCoordsRef.current;
          const movedKm = haversineDistanceKm(
            { id: 'prev', nameAr: '', nameEn: '', lat: prevCoords.lat, lng: prevCoords.lng, tzOffsetHours: 2 },
            { id: 'curr', nameAr: '', nameEn: '', lat, lng, tzOffsetHours: 2 }
          );
          if (movedKm < 5) return;
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
          const cityName = resolveOfflineCityName(lat, lng, browserTz);
          lastCoordsRef.current = { lat, lng };
          p.updateLifeProfileLocal((prev) =>
            sanitizeLifeProfile({ ...prev, currentCityName: cityName, currentTimeZone: browserTz, currentLat: lat, currentLng: lng })
          );
          p.showToast(`📍 تم رصد انتقالك تلقائياً (${Math.round(movedKm)} كم) وتحديث المواقيت أوفلاين: ${cityName}`);
          void reverseGeocodeCityName(lat, lng, cityName).then((refined) => {
            if (refined && refined !== cityName) {
              p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
            }
          });
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 180_000, timeout: 12_000 }
      );
    };

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((perm) => {
        if (perm.state === 'granted') startWatch();
      }).catch(() => {});
    }
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.lifeProfile.autoLocationSync, p.showToast]);

  const autoSyncedTzRef = useRef<string | null>(null);
  useEffect(() => {
    if (!p.lifeProfile.autoLocationSync || !detectIsMobileDeviceClient()) return;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTz || browserTz === p.lifeProfile.currentTimeZone || autoSyncedTzRef.current === browserTz) return;
    autoSyncedTzRef.current = browserTz;

    const tzPreset = PRESET_LOCATIONS.find((l) => l.timeZone === browserTz);
    if (tzPreset) {
      p.updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({ ...prev, currentCityName: tzPreset.nameAr, currentTimeZone: browserTz, currentLat: tzPreset.lat, currentLng: tzPreset.lng })
      );
      p.showToast(`🌍 تم اكتشاف منطقة زمنية جديدة (${tzPreset.nameAr}) وتحديث المواقيت والنوم تلقائياً`);
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((perm) => {
        if (perm.state === 'granted') {
          void handleDetectGpsLocation();
        } else {
          p.updateLifeProfileLocal((prev) =>
            sanitizeLifeProfile({
              ...prev,
              currentCityName: browserTz.split('/').pop()?.replace(/_/g, ' ') || prev.currentCityName,
              currentTimeZone: browserTz,
            })
          );
        }
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.lifeProfile.autoLocationSync, p.lifeProfile.currentTimeZone, handleDetectGpsLocation, p.showToast]);

  const gpsFirstAttemptedRef = useRef<boolean>(false);
  useEffect(() => {
    if (gpsFirstAttemptedRef.current) return;
    gpsFirstAttemptedRef.current = true;

    if (!detectIsMobileDeviceClient()) {
      p.setLocationResolutionState('gps_locked');
      return;
    }
    p.setLocationResolutionState('resolving_gps');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      p.setLocationResolutionState('timezone_fallback');
      return;
    }

    let settled = false;
    const hardTimeoutId = window.setTimeout(() => {
      if (!settled) { settled = true; p.setLocationResolutionState('timezone_fallback'); }
    }, 7500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimeoutId);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || p.lifeProfile.currentTimeZone || 'Africa/Cairo';
        const offlineCityName = resolveOfflineCityName(lat, lng, browserTz);
        lastCoordsRef.current = { lat, lng };
        p.updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({ ...prev, currentCityName: offlineCityName, currentTimeZone: browserTz, currentLat: lat, currentLng: lng })
        );
        p.setLocationResolutionState('gps_locked');
        void reverseGeocodeCityName(lat, lng, offlineCityName).then((refined) => {
          if (refined && refined !== offlineCityName) {
            p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
          }
        });
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimeoutId);
        p.setLocationResolutionState('timezone_fallback');
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 7000 }
    );
    return () => window.clearTimeout(hardTimeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.needsAuth, p.lifeProfile.currentTimeZone]);

  return { lastCoordsRef, handleDetectGpsLocation, gpsFirstAttemptedRef };
}
