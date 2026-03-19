"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, MemberRegistration } from "./api";
import { apiCalendarEvents, apiMemberRegistrations } from "./api";
import {
  getCalendarEventsCache,
  setCalendarEventsCache,
  getMemberRegistrationsCache,
  setMemberRegistrationsCache,
} from "./web-cache";

type NavRefreshContextValue = {
  calendarEvents: CalendarEvent[] | null;
  /** Use this for display: never blanks once we have data (falls back to cache). */
  displayCalendarEvents: CalendarEvent[] | null;
  calendarUpdatedAt: number | null;
  registrations: MemberRegistration[] | null;
  registrationsUpdatedAt: number | null;
  ensureCalendarLoaded: () => Promise<void>;
  ensureRegistrationsLoaded: (memberId: string) => Promise<void>;
  refreshCalendarInBackground: () => void;
  refreshRegistrationsInBackground: (memberId: string) => void;
};

const NavRefreshContext = createContext<NavRefreshContextValue | null>(null);

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function eventKey(title: string, startDate: Date): string {
  const t = title.trim().toLowerCase();
  const y = startDate.getFullYear();
  const m = startDate.getMonth();
  const day = startDate.getDate();
  return `${t}|${y}-${m}-${day}`;
}

async function fetchMergedCalendarEvents(): Promise<CalendarEvent[]> {
  const [apiList, icsList] = await Promise.all([
    apiCalendarEvents(),
    fetch("/api/google-calendar-ics").then((r) => r.json()).catch(() => []),
  ]);

  const apiByKey = new Map<string, CalendarEvent>();
  for (const e of apiList) {
    const start = startOfDay(new Date(e.startAt));
    apiByKey.set(eventKey(e.title, start), e);
  }

  const merged: CalendarEvent[] = [];
  const matchedKeys = new Set<string>();
  for (const ics of icsList as CalendarEvent[]) {
    const start = startOfDay(new Date(ics.startAt));
    const key = eventKey(ics.title, start);
    const api = apiByKey.get(key);
    if (api) {
      matchedKeys.add(key);
      merged.push(api);
    } else {
      merged.push(ics);
    }
  }
  for (const api of apiList) {
    const start = startOfDay(new Date(api.startAt));
    const key = eventKey(api.title, start);
    if (!matchedKeys.has(key)) merged.push(api);
  }
  merged.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return merged;
}

export function NavRefreshProvider({ children }: { children: React.ReactNode }) {
  const [calendarEvents, setCalendarEventsState] = useState<CalendarEvent[] | null>(() => {
    const cached = getCalendarEventsCache<CalendarEvent[]>();
    return cached?.value ?? null;
  });
  const [calendarUpdatedAt, setCalendarUpdatedAt] = useState<number | null>(() => {
    const cached = getCalendarEventsCache<CalendarEvent[]>();
    return cached?.updatedAt ?? null;
  });

  const [registrations, setRegistrationsState] = useState<MemberRegistration[] | null>(null);
  const [registrationsUpdatedAt, setRegistrationsUpdatedAt] = useState<number | null>(null);
  const [registrationsMemberId, setRegistrationsMemberId] = useState<string | null>(null);

  // Keep references to the latest state so background refresh won't blank the UI.
  const calendarEventsRef = useRef<CalendarEvent[] | null>(calendarEvents);
  useEffect(() => {
    calendarEventsRef.current = calendarEvents;
  }, [calendarEvents]);

  const registrationsRef = useRef<MemberRegistration[] | null>(registrations);
  useEffect(() => {
    registrationsRef.current = registrations;
  }, [registrations]);

  const safeReplaceCalendarEvents = useCallback(
    (merged: CalendarEvent[]) => {
      const current = calendarEventsRef.current;
      // If the new fetch result is empty but we previously had events,
      // keep the old ones until we have a non-empty update.
      if (merged.length === 0 && current && current.length > 0) return;

      setCalendarEventsCache(merged);
      const next = getCalendarEventsCache<CalendarEvent[]>()!;
      setCalendarEventsState(next.value);
      setCalendarUpdatedAt(next.updatedAt);
    },
    []
  );

  const safeReplaceRegistrations = useCallback(
    (memberId: string, list: MemberRegistration[], forceVisibleUpdate: boolean = false) => {
      const cached = getMemberRegistrationsCache<MemberRegistration[]>(memberId);
      const existingValue = cached?.value ?? (registrationsMemberId === memberId ? registrationsRef.current : null);
      // If the response comes back empty but we already have items, keep the old list.
      if (list.length === 0 && existingValue && existingValue.length > 0) return;

      setMemberRegistrationsCache(memberId, list);
      if (!forceVisibleUpdate && registrationsMemberId !== memberId) return;
      const next = getMemberRegistrationsCache<MemberRegistration[]>(memberId)!;
      setRegistrationsMemberId(memberId);
      setRegistrationsState(next.value);
      setRegistrationsUpdatedAt(next.updatedAt);
    },
    [registrationsMemberId]
  );

  const ensureCalendarLoaded = useCallback(async () => {
    if (calendarEvents && calendarEvents.length > 0) return;
    const cached = getCalendarEventsCache<CalendarEvent[]>();
    if (cached?.value) {
      setCalendarEventsState(cached.value);
      setCalendarUpdatedAt(cached.updatedAt);
      return;
    }
    const merged = await fetchMergedCalendarEvents();
    safeReplaceCalendarEvents(merged);
  }, [calendarEvents, safeReplaceCalendarEvents]);

  const ensureRegistrationsLoaded = useCallback(async (memberId: string) => {
    if (registrationsMemberId === memberId && registrations) return;
    const cached = getMemberRegistrationsCache<MemberRegistration[]>(memberId);
    if (cached?.value) {
      setRegistrationsMemberId(memberId);
      setRegistrationsState(cached.value);
      setRegistrationsUpdatedAt(cached.updatedAt);
      return;
    }
    const list = await apiMemberRegistrations(memberId);
    safeReplaceRegistrations(memberId, list, true);
  }, [registrationsMemberId, registrations, safeReplaceRegistrations]);

  const refreshCalendarInBackground = useCallback(() => {
    // fire-and-forget, but update cache + state if available
    fetchMergedCalendarEvents()
      .then((merged) => {
        safeReplaceCalendarEvents(merged);
      })
      .catch(() => {});
  }, [safeReplaceCalendarEvents]);

  const refreshRegistrationsInBackground = useCallback((memberId: string) => {
    apiMemberRegistrations(memberId)
      .then((list) => {
        safeReplaceRegistrations(memberId, list);
      })
      .catch(() => {});
  }, [safeReplaceRegistrations]);

  const displayCalendarEvents = calendarEvents ?? getCalendarEventsCache<CalendarEvent[]>()?.value ?? null;

  const value = useMemo<NavRefreshContextValue>(() => ({
    calendarEvents,
    displayCalendarEvents,
    calendarUpdatedAt,
    registrations,
    registrationsUpdatedAt,
    ensureCalendarLoaded,
    ensureRegistrationsLoaded,
    refreshCalendarInBackground,
    refreshRegistrationsInBackground,
  }), [
    calendarEvents,
    displayCalendarEvents,
    calendarUpdatedAt,
    registrations,
    registrationsUpdatedAt,
    ensureCalendarLoaded,
    ensureRegistrationsLoaded,
    refreshCalendarInBackground,
    refreshRegistrationsInBackground,
  ]);

  return <NavRefreshContext.Provider value={value}>{children}</NavRefreshContext.Provider>;
}

export function useNavRefresh(): NavRefreshContextValue {
  const ctx = useContext(NavRefreshContext);
  if (!ctx) throw new Error("useNavRefresh must be used within NavRefreshProvider");
  return ctx;
}

