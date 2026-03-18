import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import {
  CalendarEventSourceType,
  CalendarEventType,
  SportType,
} from "@prisma/client";

const DEFAULT_GOOGLE_CALENDAR_ICAL_URL =
  "https://calendar.google.com/calendar/ical/945081910faa58ca2e3f90dc85e35fa627841dd35b5dbb4a0c3714c13363ab2d%40group.calendar.google.com/public/basic.ics";

function classifySportType(title: string): SportType {
  const t = title.toLowerCase();
  if (t.includes("pickleball")) return SportType.PICKLEBALL;
  if (t.includes("tennis")) return SportType.TENNIS;
  return SportType.VOLLEYBALL;
}

function classifyEventType(title: string): CalendarEventType {
  const t = title.toLowerCase();
  if (t.includes("cup")) return CalendarEventType.SPECIAL;
  return CalendarEventType.NORMAL;
}

/** Parse ICAL date-time value (e.g. 20260320T100000Z or 20260320T100000) to Date */
function parseIcalDate(value: string): Date | null {
  const s = value.trim().replace(/\s/g, "");
  if (!s) return null;
  const withDashes = s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
  const timePart = s.includes("T") ? s.slice(9) : "";
  const isUtc = timePart.endsWith("Z");
  let iso: string;
  if (timePart && timePart.length >= 6) {
    const h = timePart.slice(0, 2), m = timePart.slice(2, 4), sec = timePart.slice(4, 6).replace(/Z$/, "");
    iso = `${withDashes}T${h}:${m}:${sec}${isUtc ? "Z" : ""}`;
  } else {
    iso = withDashes;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ParsedIcalEvent = {
  uid: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
  location: string | null;
};

/** Minimal iCal parser: unfold lines, split VEVENTs, extract key fields */
function parseIcalToEvents(icsText: string): ParsedIcalEvent[] {
  const unfolded = icsText.replace(/\r\n[\t ]/g, "").replace(/\r\n/g, "\n").replace(/\n[\t ]/g, "");
  const events: ParsedIcalEvent[] = [];
  const re = /\bBEGIN:VEVENT\b[\s\S]*?\bEND:VEVENT\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(unfolded)) !== null) {
    const block = m[0];
    const get = (key: string): string | null => {
      const keyUpper = key.toUpperCase();
      const regex = new RegExp("^" + keyUpper + "(?:;[^:]*)?:(.*)$", "im");
      const lineMatch = block.match(regex);
      const value = lineMatch?.[1];
      if (!value) return null;
      return value.replace(/\\n/g, "\n").trim() || null;
    };
    const uid = get("UID");
    const summary = get("SUMMARY") ?? "";
    const dtStart = get("DTSTART");
    const dtEnd = get("DTEND");
    if (!uid || !dtStart || !dtEnd) continue;
    const start = parseIcalDate(dtStart);
    const end = parseIcalDate(dtEnd);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    events.push({
      uid,
      summary: summary.trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      description: get("DESCRIPTION"),
      location: get("LOCATION"),
    });
  }
  return events;
}

// GET /api/calendar-events/import/preview?url=optional
// Returns list of events from the iCal feed (no DB write) so UI can let user select which to import.
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const feedUrl = url.searchParams.get("url")?.trim() || DEFAULT_GOOGLE_CALENDAR_ICAL_URL;
    const res = await fetch(feedUrl, { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json(
        { message: "Failed to fetch calendar feed", status: res.status },
        { status: 502 },
      );
    }
    const icsText = await res.text();
    let events = parseIcalToEvents(icsText);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    events = events.filter((ev) => new Date(ev.start).getTime() >= startOfToday.getTime());
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return NextResponse.json(events, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { message: "Failed to preview calendar", error: message },
      { status: 500 },
    );
  }
}

// POST /api/calendar-events/import
// Body: { events: Array<{ uid, summary, start, end, description?, location?, sourceEventId? }> }.
// If sourceEventId is provided (e.g. uid|start), use it so each occurrence is a separate record.
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const eventsToImport = Array.isArray(body.events) ? body.events : [];

    if (eventsToImport.length === 0) {
      return NextResponse.json(
        { message: "No events selected. Use GET /api/calendar-events/import to list events, then POST with { events: [...] }." },
        { status: 400 },
      );
    }

    const results: { created: number; updated: number; skipped: number } = {
      created: 0,
      updated: 0,
      skipped: 0,
    };

    for (const ev of eventsToImport) {
      const uid = typeof ev.uid === "string" ? ev.uid.trim() : "";
      const summary = typeof ev.summary === "string" ? ev.summary.trim() : String(ev.summary ?? "").trim();
      const startStr = ev.start != null ? String(ev.start) : "";
      const endStr = ev.end != null ? String(ev.end) : "";
      const start = startStr ? new Date(startStr) : null;
      const end = endStr ? new Date(endStr) : null;

      if (!uid || !summary || !start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        results.skipped += 1;
        continue;
      }

      // Prevent importing duplicates with same title and exact start/end
      const duplicate = await prisma.calendarEvent.findFirst({
        where: {
          title: summary,
          startAt: start,
          endAt: end,
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            message:
              "An event with the same title, start time, and end time already exists. If you still need it, please create the event manually.",
          },
          { status: 400 },
        );
      }

      const sourceEventId =
        typeof ev.sourceEventId === "string" && ev.sourceEventId.trim()
          ? ev.sourceEventId.trim()
          : `${uid}|${startStr}`;

      const description = typeof ev.description === "string" ? ev.description.trim() || null : null;
      const location = typeof ev.location === "string" ? ev.location.trim() || null : null;
      const sportType = classifySportType(summary);
      const eventType = classifyEventType(summary);

      try {
        const existing = await prisma.calendarEvent.findUnique({
          where: {
            sourceEventId_sourceType: {
              sourceEventId,
              sourceType: CalendarEventSourceType.GOOGLE,
            },
          },
        });
        if (existing) {
          await prisma.calendarEvent.update({
            where: { id: existing.id },
            data: {
              title: summary,
              description,
              startAt: start,
              endAt: end,
              location,
              sportType,
              eventType,
            },
          });
          results.updated += 1;
        } else {
          await prisma.calendarEvent.create({
            data: {
              sourceEventId,
              sourceType: CalendarEventSourceType.GOOGLE,
              title: summary,
              description,
              startAt: start,
              endAt: end,
              location,
              sportType,
              eventType,
            },
          });
          results.created += 1;
        }
      } catch {
        results.skipped += 1;
      }
    }

    return NextResponse.json(
      { message: "Import complete", ...results },
      { status: 200 },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { message: "Failed to import calendar events", error: message },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, POST, OPTIONS" },
  });
}
