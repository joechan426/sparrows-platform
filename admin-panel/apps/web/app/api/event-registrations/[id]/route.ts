import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// PATCH /api/event-registrations/:id
// Managers can update registration status to APPROVED, WAITING_LIST, or REJECTED.
export async function PATCH(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) {
      return withCors(req, NextResponse.json({ message: "Missing id" }, { status: 400 }));
    }

    const body = await req.json().catch(() => ({}));
    const statusRaw = typeof body.status === "string" ? body.status.toUpperCase().trim() : "";

    if (!statusRaw) {
      return withCors(
        req,
        NextResponse.json({ message: "status is required" }, { status: 400 })
      );
    }

    type AllowedStatus = "PENDING" | "APPROVED" | "WAITING_LIST" | "REJECTED";
    const allowed: AllowedStatus[] = ["PENDING", "APPROVED", "WAITING_LIST", "REJECTED"];

    const nextStatus = allowed.find((s) => s === statusRaw) ?? null;
    if (!nextStatus) {
      return withCors(
        req,
        NextResponse.json(
          {
            message:
              "Invalid status. Allowed values are PENDING, APPROVED, WAITING_LIST, REJECTED",
          },
          { status: 400 }
        )
      );
    }

    if (nextStatus === "APPROVED") {
      const reg = await prisma.eventRegistration.findUnique({
        where: { id },
        include: { event: true },
      });
      if (!reg)
        return withCors(
          req,
          NextResponse.json({ message: "Registration not found" }, { status: 404 })
        );
      if (reg.event.capacity != null) {
        const currentApproved = await prisma.eventRegistration.count({
          where: {
            calendarEventId: reg.calendarEventId,
            status: "APPROVED",
          },
        });
        const isAlreadyApproved = reg.status === "APPROVED";
        const wouldBeApproved = isAlreadyApproved ? currentApproved : currentApproved + 1;
        if (wouldBeApproved > reg.event.capacity) {
          return withCors(
            req,
            NextResponse.json(
              { message: "Cannot approve: event capacity would be exceeded." },
              { status: 400 }
            )
          );
        }
      }
    }

    const updated = await prisma.eventRegistration.update({
      where: { id },
      data: {
        status: nextStatus as any,
      },
    });

    return withCors(req, NextResponse.json(updated, { status: 200 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to update event registration", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

// DELETE /api/event-registrations/:id
export async function DELETE(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const registrationId = await getIdFromContext(context);
    if (!registrationId) {
      return withCors(
        req,
        NextResponse.json({ message: "Missing id" }, { status: 400 })
      );
    }

    await prisma.eventRegistration.delete({
      where: { id: registrationId },
    });

    return withCors(req, new NextResponse(null, { status: 204 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to delete event registration", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

