import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { CalendarEventType, SportType } from "@prisma/client";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

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

// GET /api/calendar-events/:id — used by web app and admin panel. No admin auth so web app can load event.
export async function GET(req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) return NextResponse.json({ message: "Not found" }, { status: 404 });

    return NextResponse.json(event, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to fetch calendar event", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// PATCH /api/calendar-events/:id
// Managers can update basic fields and toggle registrationOpen.
export async function PATCH(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const data: any = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json(
          { message: "title cannot be empty" },
          { status: 400 },
        );
      }
      data.title = title;
      data.sportType = classifySportType(title);
      data.eventType = classifyEventType(title);
    }

    if (typeof body.description === "string") {
      data.description = body.description;
    }

    if (typeof body.location === "string") {
      data.location = body.location;
    }

    if (typeof body.registrationOpen === "boolean") {
      data.registrationOpen = body.registrationOpen;
    }

    if (body.capacity !== undefined) {
      const cap = body.capacity === null || body.capacity === "" ? null : Number(body.capacity);
      if (cap !== null && (!Number.isInteger(cap) || cap < 0)) {
        return NextResponse.json(
          { message: "capacity must be a non-negative integer or null" },
          { status: 400 },
        );
      }
      data.capacity = cap;
    }

    if (body.startAt != null) {
      const startAt = new Date(body.startAt);
      if (Number.isNaN(startAt.getTime())) {
        return NextResponse.json(
          { message: "startAt must be a valid date" },
          { status: 400 },
        );
      }
      data.startAt = startAt;
    }

    if (body.endAt != null) {
      const endAt = new Date(body.endAt);
      if (Number.isNaN(endAt.getTime())) {
        return NextResponse.json(
          { message: "endAt must be a valid date" },
          { status: 400 },
        );
      }
      data.endAt = endAt;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const updated = await prisma.calendarEvent.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to update calendar event", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// DELETE /api/calendar-events/:id
export async function DELETE(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    await prisma.calendarEvent.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ message: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(
      { message: "Failed to delete calendar event", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, HEAD, OPTIONS, PATCH, DELETE" },
  });
}

