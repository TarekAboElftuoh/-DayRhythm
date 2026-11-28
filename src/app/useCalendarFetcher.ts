import { useCallback } from 'react';
import type React from 'react';
import type { GoogleCalendarEventItem, GoogleCalendarInfo } from '../types/dayrhythm';
import { getCalendarAccessToken, getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';
import { hasSameOriginBackend } from '../services/apiClient';
import { ACTIVE_UID_STORAGE_KEY, OFFLINE_CAL_PREFIX, saveOfflineWorkspaceCache } from '../utils/appHelpers';

export interface UseCalendarFetcherParams {
  recentlyCreatedEventIdsRef: React.MutableRefObject<Set<string>>;
  setLoadingEvents: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceTokenExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setCalendarList: React.Dispatch<React.SetStateAction<GoogleCalendarInfo[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<GoogleCalendarEventItem[]>>;
  handleWorkspaceUnauthorized: () => void;
}

export function useCalendarFetcher({
  recentlyCreatedEventIdsRef,
  setLoadingEvents,
  setWorkspaceTokenExpired,
  setCalendarList,
  setCalendarEvents,
  handleWorkspaceUnauthorized,
}: UseCalendarFetcherParams) {
  return useCallback(async (tokenOverride?: string) => {
    let token: string | null = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      try {
        token = (await getOrRefreshCalendarAccessToken()) || null;
      } catch {
        // ignore
      }
    }
    if (!token) return;
    setLoadingEvents(true);

    if (hasSameOriginBackend()) {
      try {
        const res = await fetch('/api/calendar/events', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.status === 401 && contentType.includes('application/json')) {
          handleWorkspaceUnauthorized();
          setLoadingEvents(false);
          return;
        }
        if (res.ok && contentType.includes('application/json')) {
          setLoadingEvents(false);
          setWorkspaceTokenExpired(false);
          const data = await res.json();
          const nextCals = Array.isArray(data.calendars) ? data.calendars : undefined;
          const nextEvs = Array.isArray(data.events) ? data.events : undefined;
          if (nextCals) setCalendarList(nextCals);
          if (nextEvs) {
            setCalendarEvents((prev) => {
              const missingNew = prev.filter(
                (e) =>
                  !nextEvs.some((fresh: GoogleCalendarEventItem) => fresh.id === e.id) &&
                  recentlyCreatedEventIdsRef.current.has(e.id)
              );
              return [...nextEvs, ...missingNew].sort((a, b) => a.start.localeCompare(b.start));
            });
          }
          const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
          if (nextCals || nextEvs) {
            saveOfflineWorkspaceCache(OFFLINE_CAL_PREFIX, activeUid, {
              calendars: nextCals ?? [],
              events: nextEvs ?? [],
            });
          }
          return;
        }
      } catch {
        // Standalone APK/EXE without Express proxy: fall through to direct Google API
      }
    }

    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (calRes.status === 401) {
        handleWorkspaceUnauthorized();
        return;
      }
      if (!calRes.ok) return;
      setWorkspaceTokenExpired(false);
      const calJson = (await calRes.json()) as { items?: Array<Record<string, unknown>> };
      const rawCals = Array.isArray(calJson.items) ? calJson.items : [];
      const mappedCals: GoogleCalendarInfo[] = rawCals.map((c) => ({
        id: String(c.id || 'primary'),
        summary: String(c.summary || 'التقويم الرئيسي'),
        primary: Boolean(c.primary),
        backgroundColor: typeof c.backgroundColor === 'string' ? c.backgroundColor : undefined,
      }));
      setCalendarList(mappedCals);

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString();
      const targetCals = mappedCals.slice(0, 6);
      const allEvents: GoogleCalendarEventItem[] = [];

      await Promise.all(
        targetCals.map(async (cal) => {
          try {
            const baseUrl =
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events` +
              `?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
            const items: Array<Record<string, unknown>> = [];
            let pageToken = '';
            for (let page = 0; page < 6; page += 1) {
              const evRes = await fetch(
                pageToken ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}` : baseUrl,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (!evRes.ok) break;
              const evJson = (await evRes.json()) as {
                items?: Array<Record<string, unknown>>;
                nextPageToken?: string;
              };
              items.push(...(evJson.items || []));
              pageToken = evJson.nextPageToken || '';
              if (!pageToken) break;
            }
            for (const ev of items) {
              const startObj = (ev.start || {}) as { dateTime?: string; date?: string };
              const endObj = (ev.end || {}) as { dateTime?: string; date?: string };
              const startVal = startObj.dateTime || startObj.date || '';
              const endVal = endObj.dateTime || endObj.date || startVal;
              if (!startVal) continue;
              allEvents.push({
                id: String(ev.id || `${cal.id}-${startVal}`),
                calendarId: cal.id,
                calendarTitle: cal.summary,
                calendarColor: cal.backgroundColor,
                summary: String(ev.summary || '(بدون عنوان)'),
                description: typeof ev.description === 'string' ? ev.description : '',
                location: typeof ev.location === 'string' ? ev.location : undefined,
                start: startVal,
                end: endVal,
                isAllDay: Boolean(startObj.date && !startObj.dateTime),
                htmlLink: typeof ev.htmlLink === 'string' ? ev.htmlLink : undefined,
                status: typeof ev.status === 'string' ? ev.status : undefined,
                isRecurring: Boolean(ev.recurringEventId),
                recurringEventId:
                  typeof ev.recurringEventId === 'string' ? ev.recurringEventId : undefined,
              });
            }
          } catch {
            // skip individual calendar error
          }
        })
      );

      allEvents.sort((a, b) => a.start.localeCompare(b.start));
      setCalendarEvents((prev) => {
        const missingNew = prev.filter(
          (e) =>
            !allEvents.some((fresh) => fresh.id === e.id) &&
            recentlyCreatedEventIdsRef.current.has(e.id)
        );
        return [...allEvents, ...missingNew].sort((a, b) => a.start.localeCompare(b.start));
      });
      const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
      saveOfflineWorkspaceCache(OFFLINE_CAL_PREFIX, activeUid, {
        calendars: mappedCals,
        events: allEvents,
      });
    } catch {
      // ignore offline errors
    } finally {
      setLoadingEvents(false);
    }
  }, [
    handleWorkspaceUnauthorized,
    recentlyCreatedEventIdsRef,
    setCalendarEvents,
    setCalendarList,
    setLoadingEvents,
    setWorkspaceTokenExpired,
  ]);
}
