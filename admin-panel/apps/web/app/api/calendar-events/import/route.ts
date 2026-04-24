import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

const DEFAULT_GOOGLE_CALENDAR_ICAL_URL =
  "https://calendar.google.com/calendar/ical/945081910faa58ca2e3f90dc85e35fa627841dd35b5dbb4a0c3714c13363ab2d%40group.calendar.google.com/public/basic.ics";

function classifySportType(title: string): "VOLLEYBALL" | "PICKLEBALL" | "TENNIS" {
  const t = title.toLowerCase();
  if (t.includes("pickleball")) return "PICKLEBALL";
  if (t.includes("tennis")) return "TENNIS";
  return "VOLLEYBALL";
}

function classifyEventType(title: string): "NORMAL" | "SPECIAL" {
  const t = title.toLowerCase();
  if (t.includes("cup")) return "SPECIAL";
  return "NORMAL";
}

const DEFAULT_ICS_TIME_ZONE = "Australia/Sydney";

function getTZIdFromKey(key: string): string | null {
  const m = key.match(/TZID=([^;:]+)/i);
  return m?.[1] ?? null;
}

function getFormatterParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const out: Record<string, number> = {};
  for (const p of parts) {
    if (p.type === "literal") continue;
    if (["year", "month", "day", "hour", "minute", "second"].includes(p.type)) {
      out[p.type] = parseInt(p.value, 10);
    }
  }
  return out;
}

function zonedDateTimeToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const targetUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetUTC;
  for (let i = 0; i < 4; i += 1) {
    const p = getFormatterParts(new Date(guess), timeZone);
    const observedUTC = Date.UTC(
      p.year ?? year,
      (p.month ?? month) - 1,
      p.day ?? day,
      p.hour ?? hour,
      p.minute ?? minute,
      p.second ?? second
    );
    guess += targetUTC - observedUTC;
  }
  return new Date(guess);
}

/** Parse ICAL date-time value with property key (supports TZID). */
function parseIcalDate(key: string, value: string): Date | null {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return null;

  if (key.includes("VALUE=DATE")) {
    const m = compact.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return new Date(Date.UTC(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10)));
  }

  if (compact.endsWith("Z")) {
    const m = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (!m) return null;
    return new Date(
      Date.UTC(
        parseInt(m[1]!, 10),
        parseInt(m[2]!, 10) - 1,
        parseInt(m[3]!, 10),
        parseInt(m[4]!, 10),
        parseInt(m[5]!, 10),
        parseInt(m[6]!, 10)
      )
    );
  }

  const m = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const tzId = getTZIdFromKey(key) ?? DEFAULT_ICS_TIME_ZONE;
  return zonedDateTimeToUTC(
    parseInt(m[1]!, 10),
    parseInt(m[2]!, 10),
    parseInt(m[3]!, 10),
    parseInt(m[4]!, 10),
    parseInt(m[5]!, 10),
    parseInt(m[6]!, 10),
    tzId
  );
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
    const getKeyAndValue = (key: string): { key: string; value: string } | null => {
      const keyUpper = key.toUpperCase();
      const regex = new RegExp("^(" + keyUpper + "(?:;[^:]*)?):(.*)$", "im");
      const lineMatch = block.match(regex);
      const fullKey = lineMatch?.[1];
      const value = lineMatch?.[2];
      if (!fullKey || !value) return null;
      return { key: fullKey, value };
    };
    const uid = get("UID");
    const summary = get("SUMMARY") ?? "";
    const dtStart = getKeyAndValue("DTSTART");
    const dtEnd = getKeyAndValue("DTEND");
    if (!uid || !dtStart || !dtEnd) continue;
    const start = parseIcalDate(dtStart.key, dtStart.value);
    const end = parseIcalDate(dtEnd.key, dtEnd.value);
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
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const url = new URL(req.url);
    const feedUrl = url.searchParams.get("url")?.trim() || DEFAULT_GOOGLE_CALENDAR_ICAL_URL;
    const res = await fetch(feedUrl, { next: { revalidate: 0 } });
    if (!res.ok) {
      return withCors(
        req,
        NextResponse.json(
          { message: "Failed to fetch calendar feed", status: res.status },
          { status: 502 }
        )
      );
    }
    const icsText = await res.text();
    let events = parseIcalToEvents(icsText);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    events = events.filter((ev) => new Date(ev.start).getTime() >= startOfToday.getTime());
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return withCors(req, NextResponse.json(events, { status: 200 }));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to preview calendar", error: message },
        { status: 500 }
      )
    );
  }
}

// POST /api/calendar-events/import
// Body: { events: Array<{ uid, summary, start, end, description?, location?, sourceEventId? }> }.
// If sourceEventId is provided (e.g. uid|start), use it so each occurrence is a separate record.
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const body = await req.json().catch(() => ({}));
    const eventsToImport = Array.isArray(body.events) ? body.events : [];

    if (eventsToImport.length === 0) {
      return withCors(
        req,
        NextResponse.json(
          {
            message:
              "No events selected. Use GET /api/calendar-events/import to list events, then POST with { events: [...] }.",
          },
          { status: 400 }
        )
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
        return withCors(
          req,
          NextResponse.json(
            {
              message:
                "An event with the same title, start time, and end time already exists. If you still need it, please create the event manually.",
            },
            { status: 400 }
          )
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
              sourceType: "GOOGLE",
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
              sportType: sportType as any,
              eventType: eventType as any,
            },
          });
          results.updated += 1;
        } else {
          await prisma.calendarEvent.create({
            data: {
              sourceEventId,
              sourceType: "GOOGLE",
              title: summary,
              description,
              startAt: start,
              endAt: end,
              location,
              sportType: sportType as any,
              eventType: eventType as any,
            },
          });
          results.created += 1;
        }
      } catch {
        results.skipped += 1;
      }
    }

    return withCors(
      req,
      NextResponse.json({ message: "Import complete", ...results }, { status: 200 })
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to import calendar events", error: message },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
