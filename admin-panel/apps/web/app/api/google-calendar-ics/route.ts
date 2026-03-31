import { NextResponse } from "next/server";

const GOOGLE_CALENDAR_ICS_URL =
  "https://calendar.google.com/calendar/ical/945081910faa58ca2e3f90dc85e35fa627841dd35b5dbb4a0c3714c13363ab2d%40group.calendar.google.com/public/basic.ics";

export type GoogleICSEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  description: string | null;
  sportType: string;
  eventType: string;
  registrationOpen: false;
};

const DEFAULT_ICS_TIME_ZONE = "Australia/Sydney";

function unfoldLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  for (const raw of lines) {
    if (!raw.length) continue;
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && result.length > 0) {
      result[result.length - 1] += raw.trim();
    } else {
      result.push(raw);
    }
  }
  return result;
}

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

/**
 * Convert a wall-clock date-time in a specific IANA timezone into UTC Date.
 * We iterate a few times to converge around DST transitions.
 */
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
      p.second ?? second,
    );
    guess += targetUTC - observedUTC;
  }
  return new Date(guess);
}

function parseICSDate(key: string, value: string): Date | null {
  const compact = value.replace(/\s/g, "");
  if (key.includes("VALUE=DATE")) {
    const m = compact.match(/^(\d{4})(\d{2})(\d{2})/);
    const year = m?.[1];
    const month = m?.[2];
    const day = m?.[3];
    if (year && month && day) {
      return new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
    }
    return null;
  }
  if (compact.endsWith("Z")) {
    const m = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    const year = m?.[1];
    const month = m?.[2];
    const day = m?.[3];
    const hour = m?.[4];
    const minute = m?.[5];
    const second = m?.[6];
    if (year && month && day && hour && minute && second) {
      return new Date(
        Date.UTC(
          parseInt(year, 10),
          parseInt(month, 10) - 1,
          parseInt(day, 10),
          parseInt(hour, 10),
          parseInt(minute, 10),
          parseInt(second, 10)
        )
      );
    }
    return null;
  }

  const m = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  const day = parseInt(m[3]!, 10);
  const hour = parseInt(m[4]!, 10);
  const minute = parseInt(m[5]!, 10);
  const second = parseInt(m[6]!, 10);
  const tzId = getTZIdFromKey(key) ?? DEFAULT_ICS_TIME_ZONE;
  return zonedDateTimeToUTC(year, month, day, hour, minute, second, tzId);
}

function inferSportType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("pickleball")) return "PICKLEBALL";
  if (t.includes("tennis")) return "TENNIS";
  return "VOLLEYBALL";
}

function inferEventType(title: string): string {
  return title.toLowerCase().includes("cup") ? "SPECIAL_EVENT" : "NORMAL_EVENT";
}

export async function GET() {
  try {
    const res = await fetch(GOOGLE_CALENDAR_ICS_URL, { next: { revalidate: 60 } });
    const text = await res.text();
    const lines = unfoldLines(text);
    const events: GoogleICSEvent[] = [];
    let current: Record<string, string> = {};
    let inEvent = false;

    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        inEvent = true;
        current = {};
        continue;
      }
      if (line === "END:VEVENT") {
        const summary = current["SUMMARY"];
        const startRaw = Object.keys(current).find((k) => k.startsWith("DTSTART"));
        const endRaw = Object.keys(current).find((k) => k.startsWith("DTEND"));
        const startValue = startRaw ? current[startRaw] : undefined;
        const endValue = endRaw ? current[endRaw] : undefined;
        if (summary && startRaw && endRaw && startValue && endValue) {
          const start = parseICSDate(startRaw, startValue);
          const end = parseICSDate(endRaw, endValue);
          if (start && end) {
            events.push({
              id: `ics-${summary}-${start.getTime()}`,
              title: summary,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              location: current["LOCATION"] ?? null,
              description: current["DESCRIPTION"] ?? null,
              sportType: inferSportType(summary),
              eventType: inferEventType(summary),
              registrationOpen: false,
            });
          }
        }
        inEvent = false;
        current = {};
        continue;
      }
      if (inEvent) {
        const colon = line.indexOf(":");
        if (colon !== -1) {
          const key = line.slice(0, colon);
          const value = line.slice(colon + 1);
          current[key] = value;
        }
      }
    }

    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json([], { status: 200 });
  }
}
