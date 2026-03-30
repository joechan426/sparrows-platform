"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { CalendarEvent, MemberRegistration } from "@/lib/api";
import dynamic from "next/dynamic";
import { useNavRefresh } from "@/lib/nav-refresh-context";
import { approvedRegistrationHint } from "@/lib/calendar-registration-hint";

const EventDetail = dynamic(
  () => import("@/components/event-detail").then((m) => m.EventDetail),
  { ssr: false },
);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type SportFilter = "volleyball" | "pickleball" | "tennis";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
}
function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString(undefined, { timeStyle: "short" });
}

function isSpecial(event: CalendarEvent): boolean {
  const t = (event.eventType ?? "").toUpperCase();
  const title = (event.title ?? "").toLowerCase();
  return t === "SPECIAL" || t === "SPECIAL_EVENT" || title.includes("cup");
}

function statusClass(s: string): string {
  const u = s.toUpperCase();
  if (u === "APPROVED") return "pill-approved";
  if (u === "REJECTED") return "pill-rejected";
  if (u === "WAITING_LIST") return "pill-waiting";
  return "pill-pending";
}
function statusText(s: string): string {
  return s.toUpperCase() === "WAITING_LIST" ? "Waiting list" : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function JoinHint({ event }: { event: CalendarEvent }) {
  const hint = approvedRegistrationHint(event);
  if (!hint) return null;
  return (
    <span className="calendar-approved-hint" aria-label={`Approved participants: ${hint}`}>
      {hint}
    </span>
  );
}

type CalendarListRowVariant = "day" | "next";

function CalendarListEventRow({
  event,
  variant,
  registrationsSafe,
  optimisticPendingEventIds,
  isAdminPanelEvent,
  onOpenDetail,
}: {
  event: CalendarEvent;
  variant: CalendarListRowVariant;
  registrationsSafe: MemberRegistration[];
  optimisticPendingEventIds: Set<string>;
  isAdminPanelEvent: (e: CalendarEvent) => boolean;
  onOpenDetail: (ev: CalendarEvent, infoOnly: boolean) => void;
}) {
  const myReg = registrationsSafe.find((r) => r.event?.id === event.id);
  const optimisticPending = optimisticPendingEventIds.has(event.id);
  const canRegister = isAdminPanelEvent(event);
  const effectiveStatus = myReg?.status ?? (optimisticPending ? "PENDING" : undefined);

  const openInfo = () => onOpenDetail(event, !event.registrationOpen);

  return (
    <div
      className={`card-event calendar-event-row calendar-event-row-v2${variant === "next" ? " calendar-event-row-next" : ""}`}
    >
      <button
        type="button"
        className="calendar-event-time-slot"
        onClick={openInfo}
        aria-label={`Event time: ${formatTime(event.startAt)}`}
      >
        <span className="calendar-event-time-col">
          <span className="calendar-event-time-main">{formatTime(event.startAt)}</span>
          {variant === "next" && (
            <span className="calendar-event-time-sub">{formatDate(event.startAt)}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="calendar-event-title-block"
        onClick={openInfo}
        aria-label={`Event details: ${event.title}`}
      >
        <span className="calendar-event-title-line">{event.title}</span>
        <span className="calendar-event-meta-line">
          {event.sportType && `${event.sportType} · `}
          Registration {event.registrationOpen ? "Open" : "Closed"}
          {variant === "next" && event.location ? ` · ${event.location}` : ""}
        </span>
      </button>
      <div className="calendar-event-actions-col">
        {effectiveStatus ? (
          <>
            <span className={`pill ${statusClass(effectiveStatus)}`}>{statusText(effectiveStatus)}</span>
            <JoinHint event={event} />
          </>
        ) : canRegister ? (
          <>
            <button
              type="button"
              className={`btn-register ${!event.registrationOpen ? "btn-register-disabled" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(event, false);
              }}
              disabled={!event.registrationOpen}
            >
              Register
            </button>
            <JoinHint event={event} />
          </>
        ) : (
          <span className="calendar-event-actions-spacer" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function matchesFilter(event: CalendarEvent, filter: SportFilter): boolean {
  const sport = (event.sportType ?? "").toUpperCase();
  const title = (event.title ?? "").toLowerCase();
  const isPickleball = sport === "PICKLEBALL" || title.includes("pickleball");
  const isTennis = sport === "TENNIS" || title.includes("tennis");
  switch (filter) {
    case "pickleball":
      return isPickleball;
    case "tennis":
      return isTennis;
    case "volleyball":
      return sport === "VOLLEYBALL" || (!isPickleball && !isTennis);
    default:
      return true;
  }
}

type DayCell = { date: Date; isCurrentMonth: boolean };

function eventKey(title: string, startDate: Date): string {
  const t = title.trim().toLowerCase();
  const y = startDate.getFullYear();
  const m = startDate.getMonth();
  const day = startDate.getDate();
  return `${t}|${y}-${m}-${day}`;
}

function daysInMonthGrid(month: Date): DayCell[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const firstWeekday = start.getDay();
  const mondayFirst = (firstWeekday + 6) % 7;
  const days: DayCell[] = [];
  for (let i = 0; i < mondayFirst; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - (mondayFirst - i));
    days.push({ date: d, isCurrentMonth: false });
  }
  for (let d = 1; d <= end.getDate(); d++) {
    days.push({ date: new Date(month.getFullYear(), month.getMonth(), d), isCurrentMonth: true });
  }
  const remainder = 7 - (days.length % 7);
  if (remainder < 7) {
    const last = days[days.length - 1]?.date ?? end;
    for (let i = 1; i <= remainder; i++) {
      const next = new Date(last);
      next.setDate(next.getDate() + i);
      days.push({ date: next, isCurrentMonth: false });
    }
  }
  return days;
}

export default function CalendarPage() {
  const CALENDAR_STATE_KEY = "web_calendar_ui_state_v1";
  const router = useRouter();
  const { member } = useAuth();
  const {
    displayCalendarEvents,
    ensureCalendarLoaded,
    registrations,
    ensureRegistrationsLoaded,
    refreshRegistrationsInBackground,
    refreshCalendarInBackground,
  } = useNavRefresh();
  const [error, setError] = useState("");
  const [eventDetail, setEventDetail] = useState<{ event: CalendarEvent; infoOnly: boolean } | null>(null);
  const [sportFilter, setSportFilter] = useState<SportFilter>(() => {
    if (typeof window === "undefined") return "volleyball";
    try {
      const raw = window.sessionStorage.getItem(CALENDAR_STATE_KEY);
      if (!raw) return "volleyball";
      const parsed = JSON.parse(raw) as { sportFilter?: SportFilter };
      return parsed.sportFilter ?? "volleyball";
    } catch {
      return "volleyball";
    }
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (typeof window === "undefined") return new Date();
    try {
      const raw = window.sessionStorage.getItem(CALENDAR_STATE_KEY);
      if (!raw) return new Date();
      const parsed = JSON.parse(raw) as { currentMonth?: string };
      return parsed.currentMonth ? new Date(parsed.currentMonth) : new Date();
    } catch {
      return new Date();
    }
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window === "undefined") return startOfDay(new Date());
    try {
      const raw = window.sessionStorage.getItem(CALENDAR_STATE_KEY);
      if (!raw) return startOfDay(new Date());
      const parsed = JSON.parse(raw) as { selectedDate?: string };
      return parsed.selectedDate ? startOfDay(new Date(parsed.selectedDate)) : startOfDay(new Date());
    } catch {
      return startOfDay(new Date());
    }
  });
  const [lastVisibleEvents, setLastVisibleEvents] = useState<CalendarEvent[]>(() => displayCalendarEvents ?? []);
  const [optimisticPendingEventIds, setOptimisticPendingEventIds] = useState<Set<string>>(
    () => new Set()
  );

  const isAdminPanelEvent = (e: CalendarEvent) => !String(e.id ?? "").startsWith("ics-");

  useEffect(() => {
    if (displayCalendarEvents && displayCalendarEvents.length > 0) return;
    ensureCalendarLoaded().catch((err) => setError(err instanceof Error ? err.message : "Failed to load events"));
  }, [displayCalendarEvents, ensureCalendarLoaded]);

  useEffect(() => {
    if (displayCalendarEvents && displayCalendarEvents.length > 0) {
      setLastVisibleEvents(displayCalendarEvents);
    }
  }, [displayCalendarEvents]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      CALENDAR_STATE_KEY,
      JSON.stringify({
        sportFilter,
        currentMonth: currentMonth.toISOString(),
        selectedDate: selectedDate.toISOString(),
      })
    );
  }, [sportFilter, currentMonth, selectedDate]);

  // When the user first lands on Calendar (home), prefetch the other heavy pages.
  useEffect(() => {
    router.prefetch("/profile");
    router.prefetch("/ongoing");
  }, [router]);

  useEffect(() => {
    if (!member?.id) return;
    ensureRegistrationsLoaded(member.id).catch(() => {});
  }, [member?.id]);

  // Keep event registration status in sync with admin-panel changes.
  // Polling is only active while this tab is visible to avoid unnecessary traffic.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!member?.id) return;

    const memberId = member.id;
    const REFRESH_REG_MS = 15000;
    const REFRESH_CAL_MS = 30000;

    let lastCalRefreshAt = 0;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      // registrations status changes should be fast (~15s)
      refreshRegistrationsInBackground(memberId);

      // registrationOpen changes can be a bit slower (~30s)
      const now = Date.now();
      if (now - lastCalRefreshAt >= REFRESH_CAL_MS) {
        lastCalRefreshAt = now;
        refreshCalendarInBackground();
      }
    };

    // Refresh immediately when landing on the page.
    maybeRefresh();

    const intervalId = window.setInterval(maybeRefresh, REFRESH_REG_MS);
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [member?.id, refreshRegistrationsInBackground]);

  const registrationsSafe = registrations ?? [];

  const eventsWithDates = useMemo(() => {
    const events = (displayCalendarEvents && displayCalendarEvents.length > 0)
      ? displayCalendarEvents
      : lastVisibleEvents;
    return events.map((e) => ({
      ...e,
      startDate: startOfDay(new Date(e.startAt)),
      endDate: new Date(e.endAt),
    }));
  }, [displayCalendarEvents, lastVisibleEvents]);

  const now = useMemo(() => new Date(), []);
  const upcomingEvents = useMemo(
    () =>
      (((displayCalendarEvents && displayCalendarEvents.length > 0) ? displayCalendarEvents : lastVisibleEvents) ?? [])
        .filter((e) => new Date(e.endAt) >= now)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [displayCalendarEvents, lastVisibleEvents]
  );
  const upcomingCup = useMemo(() => upcomingEvents.filter((e) => isSpecial(e)), [upcomingEvents]);

  const dayStart = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const dayEnd = useMemo(() => endOfDay(selectedDate), [selectedDate]);

  const filteredEventsForSelectedDate = useMemo(() => {
    return eventsWithDates
      .filter(
        (e) =>
          e.startDate < dayEnd &&
          e.endDate >= dayStart &&
          matchesFilter(e, sportFilter)
      )
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [eventsWithDates, dayStart, dayEnd, sportFilter]);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const filteredEventCount = useMemo(() => {
    const map = new Map<string, number>();
    const daysInMonth = monthEnd.getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const dayStart = startOfDay(d);
      const dayEnd = endOfDay(d);
      let count = 0;
      for (const e of eventsWithDates) {
        if (!matchesFilter(e, sportFilter)) continue;
        if (e.startDate < dayEnd && e.endDate >= dayStart) count++;
      }
      if (count > 0) map.set(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, count);
    }
    return map;
  }, [eventsWithDates, sportFilter, monthStart, monthEnd]);

  const monthGrid = useMemo(() => daysInMonthGrid(currentMonth), [currentMonth]);
  const monthTitle = useMemo(
    () => currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [currentMonth]
  );
  const selectedDateTitle = useMemo(
    () => selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    [selectedDate]
  );

  const today = useMemo(() => startOfDay(now), [now]);
  const isInitialLoading = !error && (!displayCalendarEvents || displayCalendarEvents.length === 0) && lastVisibleEvents.length === 0;

  function selectDate(d: Date) {
    setSelectedDate(startOfDay(d));
  }
  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1));
  }
  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1));
  }

  if (error) return <div className="page-content page-error">{error}</div>;
  if (isInitialLoading) {
    return (
      <div className="page-loading">
        <p>Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="page-content calendar-page">
      <h1 className="page-title">Calendar</h1>

      {/* Sport filters — same as app, with outline logos */}
      <div className="sport-filters">
        {(["volleyball", "pickleball", "tennis"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`sport-filter-btn ${sportFilter === f ? "active" : ""}`}
            onClick={() => setSportFilter(f)}
          >
            <img
              src={f === "volleyball" ? "/images/volleyball_outline.svg" : f === "pickleball" ? "/images/pickleball_outline.svg" : "/images/tennis_outline.svg"}
              alt=""
              className="sport-filter-icon"
            />
            <span className="sport-filter-label">{f.charAt(0).toUpperCase() + f.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* Month header */}
      <div className="calendar-month-header">
        <button type="button" className="calendar-month-nav" onClick={prevMonth} aria-label="Previous month">
          ‹
        </button>
        <span className="calendar-month-title">{monthTitle}</span>
        <button type="button" className="calendar-month-nav" onClick={nextMonth} aria-label="Next month">
          ›
        </button>
      </div>

      {/* Weekday header */}
      <div className="calendar-weekday-header">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      {/* Month grid */}
      <div className="calendar-grid">
        {monthGrid.map((cell, i) => {
          const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}-${i}`;
          const isToday = sameDay(cell.date, today);
          const isSelected = sameDay(cell.date, selectedDate);
          const count = cell.isCurrentMonth ? filteredEventCount.get(`${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`) ?? 0 : 0;
          const hasEvents = count > 0;
          const className = [
            "calendar-day-cell",
            isToday && "today",
            isSelected && "selected",
            hasEvents && "has-events",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={key}
              type="button"
              className={className}
              onClick={() => selectDate(cell.date)}
              style={!cell.isCurrentMonth ? { opacity: 0.45 } : undefined}
            >
              <span className="calendar-day-num">{cell.date.getDate()}</span>
              {hasEvents && <span className="calendar-day-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <span className="calendar-legend-item">
          <span className="calendar-legend-sq today" /> = Today
        </span>
        <span className="calendar-legend-item">
          <span className="calendar-legend-sq selected" /> = Selected date
        </span>
      </div>

      {/* Events on selected date */}
      <section className="calendar-section">
        <h2 className="calendar-section-title">Events on {selectedDateTitle}</h2>
        <div className="calendar-events-list">
          {filteredEventsForSelectedDate.length === 0 ? (
            <p className="calendar-empty">No matching events on {selectedDateTitle}.</p>
          ) : (
            filteredEventsForSelectedDate.map((event) => (
              <CalendarListEventRow
                key={event.id}
                event={event}
                variant="day"
                registrationsSafe={registrationsSafe}
                optimisticPendingEventIds={optimisticPendingEventIds}
                isAdminPanelEvent={isAdminPanelEvent}
                onOpenDetail={(ev, infoOnly) => setEventDetail({ event: ev, infoOnly })}
              />
            ))
          )}
        </div>
      </section>

      {/* What happens NEXT */}
      <section className="what-next-block what-next-section">
        <h2 className="what-next-title">
          <span className="what-next-icon">✨</span> What happens NEXT
        </h2>
        {upcomingCup.length === 0 ? (
          <p className="what-next-empty">Hold tight! The next event is on the way.</p>
        ) : (
          <ul className="what-next-list">
            {upcomingCup.map((event) => (
              <li key={event.id} className="what-next-item what-next-item-v2">
                <CalendarListEventRow
                  event={event}
                  variant="next"
                  registrationsSafe={registrationsSafe}
                  optimisticPendingEventIds={optimisticPendingEventIds}
                  isAdminPanelEvent={isAdminPanelEvent}
                  onOpenDetail={(ev, infoOnly) => setEventDetail({ event: ev, infoOnly })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {eventDetail && (
        <EventDetail
          event={eventDetail.event}
          member={member}
          infoOnly={eventDetail.infoOnly}
          onClose={() => setEventDetail(null)}
          onRegistered={(eventId) => {
            // Optimistic UI: show Pending immediately after a successful registration.
            setOptimisticPendingEventIds((prev) => {
              const next = new Set(prev);
              next.add(eventId);
              return next;
            });
            if (member?.id) {
              refreshRegistrationsInBackground(member.id);
            }
          }}
        />
      )}
    </div>
  );
}
