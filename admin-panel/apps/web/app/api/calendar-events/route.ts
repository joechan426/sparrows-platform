import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";

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

function asSourceType(input: unknown): "GOOGLE" | "MANUAL" {
  const v = String(input ?? "").toUpperCase().trim();
  if (v === "GOOGLE") return "GOOGLE";
  return "MANUAL";
}

// GET /api/calendar-events?_start=0&_end=25 — used by web app (event list) and admin panel. No admin auth so web app can list.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams;

    const start = Number(search.get("_start") ?? "0");
    const end = Number(search.get("_end") ?? "25");

    const skip = Number.isFinite(start) && start > 0 ? start : 0;
    const takeRaw = Number.isFinite(end) ? end - skip : 25;
    const take = takeRaw > 0 ? takeRaw : 25;

    const [rawItems, total] = await Promise.all([
      prisma.calendarEvent.findMany({
        skip,
        take,
        orderBy: { startAt: "asc" },
        include: {
          registrations: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      }),
      prisma.calendarEvent.count(),
    ]);

    const items = rawItems.map(
      ({
        registrations,
        ...e
      }: {
        registrations: { id: string }[];
        [key: string]: unknown;
      }) => ({
        ...e,
        approvedCount: registrations.length,
      })
    );

    return NextResponse.json(items, {
      status: 200,
      headers: {
        "X-Total-Count": String(total),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to list calendar events", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// POST /api/calendar-events
// Manual creation (sourceType MANUAL, sourceEventId optional) or upsert by sourceEventId + sourceType.
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : "";
    let sourceEventId =
      typeof body.sourceEventId === "string"
        ? body.sourceEventId.trim()
        : "";
    const startAt = body.startAt ? new Date(body.startAt) : undefined;
    const endAt = body.endAt ? new Date(body.endAt) : undefined;
    const sourceType = asSourceType(body.sourceType);

    if (!title || !startAt || !endAt) {
      return NextResponse.json(
        { message: "title, startAt, and endAt are required" },
        { status: 400 },
      );
    }

    if (sourceType === "MANUAL" && !sourceEventId) {
      const { randomUUID } = await import("crypto");
      sourceEventId = `manual-${randomUUID()}`;
    }
    if (!sourceEventId) {
      return NextResponse.json(
        { message: "sourceEventId is required for non-manual events" },
        { status: 400 },
      );
    }

    const sportType = classifySportType(title);
    const eventType = classifyEventType(title);
    const description = typeof body.description === "string" ? body.description : null;
    const location = typeof body.location === "string" ? body.location : null;
    const capacity =
      body.capacity === undefined
        ? undefined
        : body.capacity === null || body.capacity === ""
          ? null
          : Number(body.capacity);
    if (capacity !== undefined && capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
      return NextResponse.json(
        { message: "capacity must be a non-negative integer or null" },
        { status: 400 },
      );
    }

    const created = await prisma.calendarEvent.upsert({
      where: {
        sourceEventId_sourceType: {
          sourceEventId,
          sourceType,
        },
      },
      create: {
        sourceEventId,
        title,
        description,
        startAt,
        endAt,
        location,
        sourceType: sourceType as any,
        sportType: sportType as any,
        eventType: eventType as any,
        capacity: capacity ?? undefined,
      },
      update: {
        title,
        description,
        startAt,
        endAt,
        location,
        sportType: sportType as any,
        eventType: eventType as any,
        capacity: capacity ?? undefined,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to create or update calendar event", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, HEAD, OPTIONS, POST",
    },
  });
}

