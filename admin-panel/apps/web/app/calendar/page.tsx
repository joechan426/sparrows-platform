"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { CalendarEvent, MemberRegistration } from "@/lib/api";
import { EventDetail } from "@/components/event-detail";
import { useNavRefresh } from "@/lib/nav-refresh-context";

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
  const router = useRouter();
  const { member } = useAuth();
  const {
    calendarEvents,
    ensureCalendarLoaded,
    registrations,
    ensureRegistrationsLoaded,
  } = useNavRefresh();
  const [loading, setLoading] = useState(() => !calendarEvents);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [sportFilter, setSportFilter] = useState<SportFilter>("volleyball");
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    if (calendarEvents) {
      setLoading(false);
      return;
    }
    ensureCalendarLoaded()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load events"))
      .finally(() => setLoading(false));
  }, []);

  // When the user first lands on Calendar (home), prefetch the other heavy pages.
  useEffect(() => {
    router.prefetch("/profile");
    router.prefetch("/ongoing");
  }, [router]);

  useEffect(() => {
    if (!member?.id) return;
    ensureRegistrationsLoaded(member.id).catch(() => {});
  }, [member?.id]);

  const registrationsSafe = registrations ?? [];

  const eventsWithDates = useMemo(() => {
    const events = calendarEvents ?? [];
    return events.map((e) => ({
      ...e,
      startDate: startOfDay(new Date(e.startAt)),
      endDate: new Date(e.endAt),
    }));
  }, [calendarEvents]);

  const now = useMemo(() => new Date(), []);
  const upcomingEvents = useMemo(
    () =>
      (calendarEvents ?? [])
        .filter((e) => new Date(e.endAt) >= now)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [calendarEvents]
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
      .filter((e) => !isSpecial(e))
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

  function selectDate(d: Date) {
    setSelectedDate(startOfDay(d));
  }
  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1));
  }
  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1));
  }

  if (loading) return <div className="page-loading">Loading calendar…</div>;
  if (error) return <div className="page-content page-error">{error}</div>;

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
            filteredEventsForSelectedDate.map((event) => {
              const myReg = registrationsSafe.find((r) => r.event?.id === event.id);
              return (
                <div key={event.id} className="card-event calendar-event-row">
                  <div className="calendar-event-info">
                    <div className="calendar-event-title">{event.title}</div>
                    <div className="calendar-event-meta">
                      {formatTime(event.startAt)}
                      {event.sportType && ` · ${event.sportType}`}
                      {" · Registration "}
                      {event.registrationOpen ? "Open" : "Closed"}
                    </div>
                  </div>
                  {myReg ? (
                    <span className={`pill ${statusClass(myReg.status)}`}>{statusText(myReg.status)}</span>
                  ) : (
                    <button
                      type="button"
                      className={`btn-register ${!event.registrationOpen ? "btn-register-disabled" : ""}`}
                      onClick={() => setSelectedEvent(event)}
                      disabled={!event.registrationOpen}
                    >
                      Register
                    </button>
                  )}
                </div>
              );
            })
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
            {upcomingCup.map((event) => {
              const myReg = registrationsSafe.find((r) => r.event?.id === event.id);
              return (
                <li key={event.id} className="what-next-item">
                  <div className="what-next-item-info">
                    <div className="what-next-item-title">{event.title}</div>
                    <div className="what-next-item-meta">
                      {formatDate(event.startAt)} · {formatTime(event.startAt)}
                      {event.location && ` · ${event.location}`}
                    </div>
                  </div>
                  {myReg ? (
                    <span className={`pill ${statusClass(myReg.status)}`}>{statusText(myReg.status)}</span>
                  ) : (
                    <button
                      type="button"
                      className={`btn-register ${!event.registrationOpen ? "btn-register-disabled" : ""}`}
                      onClick={() => setSelectedEvent(event)}
                      disabled={!event.registrationOpen}
                    >
                      Register
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          member={member}
          onClose={() => setSelectedEvent(null)}
          onRegistered={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
