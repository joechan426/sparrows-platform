import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { CalendarEventType, EventRegistrationStatus } from "@prisma/client";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// GET /api/calendar-events/:id/registrations
export async function GET(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return NextResponse.json({ message: "Missing calendar event id" }, { status: 400 });
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { calendarEventId },
      orderBy: { createdAt: "asc" },
      include: {
        member: true,
        event: true,
      },
    });

    return NextResponse.json(registrations, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "Failed to list event registrations",
        error: e?.message ?? String(e),
      },
      { status: 500 },
    );
  }
}

// POST /api/calendar-events/:id/registrations
// Creates a registration for a member for the given event, enforcing:
// - one registration per member per event
// - SPECIAL event requires teamName
// - registration allowed only when registrationOpen = true
export async function POST(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return auth.response;
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return NextResponse.json({ message: "Missing calendar event id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const preferredName =
      typeof body.preferredName === "string" ? body.preferredName.trim() : "";
    const teamName =
      typeof body.teamName === "string" && body.teamName.trim().length > 0
        ? body.teamName.trim()
        : null;

    if (!preferredName) {
      return NextResponse.json(
        { message: "preferredName is required" },
        { status: 400 },
      );
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: calendarEventId },
    });

    if (!event) {
      return NextResponse.json({ message: "Event not found" }, { status: 404 });
    }

    if (!event.registrationOpen) {
      return NextResponse.json(
        { message: "Registration is currently closed for this event" },
        { status: 400 },
      );
    }

    const isSpecial = event.eventType === CalendarEventType.SPECIAL;

    if (isSpecial && !teamName) {
      return NextResponse.json(
        { message: "teamName is required for SPECIAL events" },
        { status: 400 },
      );
    }

    let member;
    if (email) {
      member = await prisma.member.findUnique({
        where: { email },
      });

      if (!member) {
        member = await prisma.member.create({
          data: {
            email,
            preferredName,
          },
        });
      } else if (preferredName && preferredName !== member.preferredName) {
        member = await prisma.member.update({
          where: { id: member.id },
          data: { preferredName },
        });
      }
    } else {
      const syntheticEmail = `manual+${calendarEventId}+${Date.now()}+${Math.random()
        .toString(36)
        .slice(2)}@manual.local`;
      member = await prisma.member.create({
        data: {
          email: syntheticEmail,
          preferredName,
        },
      });
    }

    try {
      const registration = await prisma.eventRegistration.create({
        data: {
          memberId: member.id,
          calendarEventId,
          teamName: teamName ?? undefined,
          status: EventRegistrationStatus.PENDING,
        },
      });

      return NextResponse.json(registration, { status: 201 });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return NextResponse.json(
          { message: "Member is already registered for this event" },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to create event registration", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, HEAD, OPTIONS, POST" },
  });
}

