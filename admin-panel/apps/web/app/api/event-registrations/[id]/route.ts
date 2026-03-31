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
    const attendanceRaw = typeof body.attendance === "string" ? body.attendance.toUpperCase().trim() : "";

    type AllowedStatus = "PENDING" | "APPROVED" | "WAITING_LIST" | "REJECTED";
    const allowed: AllowedStatus[] = ["PENDING", "APPROVED", "WAITING_LIST", "REJECTED"];

    type AllowedAttendance = "DEFAULT" | "PRESENT" | "ABSENT";
    const allowedAttendance: AllowedAttendance[] = ["DEFAULT", "PRESENT", "ABSENT"];

    let nextStatus: AllowedStatus | null = null;
    if (statusRaw) {
      nextStatus = allowed.find((s) => s === statusRaw) ?? null;
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
    }

    let nextAttendance: AllowedAttendance | null = null;
    if (attendanceRaw) {
      nextAttendance = allowedAttendance.find((s) => s === attendanceRaw) ?? null;
      if (!nextAttendance) {
        return withCors(
          req,
          NextResponse.json(
            {
              message:
                "Invalid attendance. Allowed values are DEFAULT, PRESENT, ABSENT",
            },
            { status: 400 }
          )
        );
      }
    }

    const paymentPatch: Record<string, unknown> = {};
    if (body.amountPaidCents !== undefined) {
      if (body.amountPaidCents === null || body.amountPaidCents === "") {
        paymentPatch.amountPaidCents = null;
      } else {
        const cents = Number(body.amountPaidCents);
        if (!Number.isInteger(cents) || cents < 0) {
          return withCors(
            req,
            NextResponse.json(
              { message: "amountPaidCents must be a non-negative integer or null" },
              { status: 400 }
            )
          );
        }
        paymentPatch.amountPaidCents = cents;
      }
    }
    if (typeof body.managerPaymentNote === "string") {
      paymentPatch.managerPaymentNote = body.managerPaymentNote;
    }
    if (typeof body.paymentStatus === "string") {
      const ps = body.paymentStatus.toUpperCase().trim();
      const payAllowed = ["NONE", "AWAITING_PAYMENT", "PAID", "FAILED", "WAIVED"] as const;
      if (!payAllowed.includes(ps as (typeof payAllowed)[number])) {
        return withCors(
          req,
          NextResponse.json(
            { message: "Invalid paymentStatus for manual adjustment" },
            { status: 400 }
          )
        );
      }
      paymentPatch.paymentStatus = ps;
      if (ps === "PAID" && body.paidAt !== undefined) {
        const d = body.paidAt === null ? null : new Date(body.paidAt);
        if (d && Number.isNaN(d.getTime())) {
          return withCors(req, NextResponse.json({ message: "paidAt must be a valid date" }, { status: 400 }));
        }
        paymentPatch.paidAt = d;
      } else if (ps === "PAID" && !body.paidAt) {
        paymentPatch.paidAt = new Date();
      }
      if (ps === "WAIVED" || ps === "NONE" || ps === "AWAITING_PAYMENT" || ps === "FAILED") {
        if (body.paidAt === null) paymentPatch.paidAt = null;
      }
    }

    if (!nextStatus && !nextAttendance && Object.keys(paymentPatch).length === 0) {
      return withCors(
        req,
        NextResponse.json(
          {
            message:
              "Provide status and/or attendance and/or payment fields (amountPaidCents, managerPaymentNote, paymentStatus)",
          },
          { status: 400 }
        )
      );
    }

    const reg = await prisma.eventRegistration.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!reg) {
      return withCors(req, NextResponse.json({ message: "Registration not found" }, { status: 404 }));
    }

    const paidEvent =
      reg.event.isPaid && reg.event.priceCents != null && reg.event.priceCents > 0;
    if (paidEvent && !reg.event.paymentProfileId) {
      return withCors(
        req,
        NextResponse.json(
          { message: "Paid event is missing payment profile (paymentProfileId)" },
          { status: 400 },
        ),
      );
    }

    const effectivePaymentStatus =
      (paymentPatch.paymentStatus as string | undefined) ?? reg.paymentStatus;

    if (nextStatus === "APPROVED") {
      const paidEvent =
        reg.event.isPaid && reg.event.priceCents != null && reg.event.priceCents > 0;
      if (paidEvent && !["PAID", "WAIVED"].includes(effectivePaymentStatus)) {
        return withCors(
          req,
          NextResponse.json(
            {
              message:
                "Cannot approve: payment is not recorded as PAID or WAIVED for this paid event.",
            },
            { status: 400 }
          )
        );
      }
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

    const data: Record<string, unknown> = { ...paymentPatch };
    if (nextStatus) {
      data.status = nextStatus;
    }
    if (nextAttendance) {
      data.attendance = nextAttendance;
    }

    const updated = await prisma.eventRegistration.update({
      where: { id },
      data: data as any,
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

