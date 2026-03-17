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

function parseICSDate(key: string, value: string): Date | null {
  if (key.includes("VALUE=DATE")) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    return null;
  }
  if (value.endsWith("Z")) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (m)
      return new Date(
        Date.UTC(
          parseInt(m[1], 10),
          parseInt(m[2], 10) - 1,
          parseInt(m[3], 10),
          parseInt(m[4], 10),
          parseInt(m[5], 10),
          parseInt(m[6], 10)
        )
      );
    return null;
  }
  const date = new Date(value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6"));
  return isNaN(date.getTime()) ? null : date;
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
        if (summary && startRaw && endRaw) {
          const start = parseICSDate(startRaw, current[startRaw]);
          const end = parseICSDate(endRaw, current[endRaw]);
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
