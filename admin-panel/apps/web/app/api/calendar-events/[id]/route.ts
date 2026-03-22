import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";
import { getPaymentPlatformSettings } from "../../../../lib/payment-platform";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

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

// GET /api/calendar-events/:id — used by web app and admin panel. No admin auth so web app can load event.
export async function GET(req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);
    if (!id) return withCors(req, NextResponse.json({ message: "Missing id" }, { status: 400 }));

    const raw = await prisma.calendarEvent.findUnique({
      where: { id },
      include: {
        registrations: {
          where: { status: "APPROVED" },
          select: { id: true },
        },
        paymentAccountAdmin: {
          select: {
            stripeConnectedAccountId: true,
            stripeConnectChargesEnabled: true,
            paypalMerchantId: true,
          },
        },
      },
    });
    if (!raw) return withCors(req, NextResponse.json({ message: "Not found" }, { status: 404 }));

    const { registrations, paymentAccountAdmin, ...event } = raw;
    const settings = await getPaymentPlatformSettings();
    const stripeCheckoutAvailable = Boolean(
      settings.stripeEnabled &&
        paymentAccountAdmin?.stripeConnectedAccountId &&
        paymentAccountAdmin.stripeConnectChargesEnabled,
    );
    const paypalCheckoutAvailable = Boolean(
      settings.paypalEnabled && paymentAccountAdmin?.paypalMerchantId,
    );

    return withCors(
      req,
      NextResponse.json(
        {
          ...event,
          approvedCount: registrations.length,
          stripeCheckoutAvailable,
          paypalCheckoutAvailable,
        },
        { status: 200 }
      )
    );
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to fetch calendar event", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

// PATCH /api/calendar-events/:id
// Managers can update basic fields and toggle registrationOpen.
export async function PATCH(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) return withCors(req, NextResponse.json({ message: "Missing id" }, { status: 400 }));

    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      return withCors(req, NextResponse.json({ message: "Event not found" }, { status: 404 }));
    }

    const body = await req.json().catch(() => ({}));

    const data: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return withCors(
          req,
          NextResponse.json(
          { message: "title cannot be empty" },
          { status: 400 },
          )
        );
      }
      data.title = title;
      // Prisma enums can differ in TS exports between prisma builds,
      // so cast to allow writing these controlled string values.
      data.sportType = classifySportType(title) as any;
      data.eventType = classifyEventType(title) as any;
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
        return withCors(
          req,
          NextResponse.json(
            { message: "capacity must be a non-negative integer or null" },
            { status: 400 }
          )
        );
      }
      data.capacity = cap;
    }

    if (body.startAt != null) {
      const startAt = new Date(body.startAt);
      if (Number.isNaN(startAt.getTime())) {
        return withCors(
          req,
          NextResponse.json(
            { message: "startAt must be a valid date" },
            { status: 400 }
          )
        );
      }
      data.startAt = startAt;
    }

    if (body.endAt != null) {
      const endAt = new Date(body.endAt);
      if (Number.isNaN(endAt.getTime())) {
        return withCors(
          req,
          NextResponse.json(
            { message: "endAt must be a valid date" },
            { status: 400 }
          )
        );
      }
      data.endAt = endAt;
    }

    if (typeof body.isPaid === "boolean") {
      data.isPaid = body.isPaid;
    }

    if (body.priceCents !== undefined) {
      if (body.priceCents === null || body.priceCents === "") {
        data.priceCents = null;
      } else {
        const cents = Number(body.priceCents);
        if (!Number.isInteger(cents) || cents < 0) {
          return withCors(
            req,
            NextResponse.json(
              { message: "priceCents must be a non-negative integer or null" },
              { status: 400 }
            )
          );
        }
        data.priceCents = cents;
      }
    }

    if (typeof body.currency === "string") {
      const cur = body.currency.trim().toUpperCase();
      if (cur.length !== 3) {
        return withCors(
          req,
          NextResponse.json({ message: "currency must be a 3-letter ISO code" }, { status: 400 })
        );
      }
      data.currency = cur;
    }

    if (body.paymentAccountAdminId !== undefined) {
      if (body.paymentAccountAdminId === null || body.paymentAccountAdminId === "") {
        data.paymentAccountAdminId = null;
      } else {
        const pid = String(body.paymentAccountAdminId);
        const adm = await prisma.adminUser.findUnique({ where: { id: pid }, select: { id: true } });
        if (!adm) {
          return withCors(req, NextResponse.json({ message: "paymentAccountAdminId admin not found" }, { status: 400 }));
        }
        data.paymentAccountAdminId = pid;
      }
    }

    const mergedIsPaid = typeof data.isPaid === "boolean" ? (data.isPaid as boolean) : existing.isPaid;
    const mergedPrice =
      data.priceCents !== undefined ? (data.priceCents as number | null) : existing.priceCents;
    let mergedRecipient =
      data.paymentAccountAdminId !== undefined
        ? (data.paymentAccountAdminId as string | null)
        : existing.paymentAccountAdminId;

    if (mergedIsPaid && mergedPrice != null && mergedPrice > 0) {
      if (body.paymentAccountAdminId === null || body.paymentAccountAdminId === "") {
        return withCors(
          req,
          NextResponse.json(
            { message: "Cannot clear payment recipient while the event is paid with a price." },
            { status: 400 }
          )
        );
      }
      if (!mergedRecipient) {
        data.paymentAccountAdminId = auth.admin.id;
        mergedRecipient = auth.admin.id;
      }
    }

    if (Object.keys(data).length === 0) {
      if (existing.isPaid && existing.priceCents != null && existing.priceCents > 0 && !existing.paymentAccountAdminId) {
        const fixed = await prisma.calendarEvent.update({
          where: { id },
          data: { paymentAccountAdminId: auth.admin.id },
        });
        return withCors(req, NextResponse.json(fixed, { status: 200 }));
      }
      return withCors(
        req,
        NextResponse.json(
          { message: "No updatable fields provided" },
          { status: 400 }
        )
      );
    }

    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: data as any,
    });

    let out = updated;
    if (
      updated.isPaid &&
      updated.priceCents != null &&
      updated.priceCents > 0 &&
      !updated.paymentAccountAdminId
    ) {
      out = await prisma.calendarEvent.update({
        where: { id },
        data: { paymentAccountAdminId: auth.admin.id },
      });
    }

    return withCors(req, NextResponse.json(out, { status: 200 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to update calendar event", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

// DELETE /api/calendar-events/:id
export async function DELETE(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) return withCors(req, NextResponse.json({ message: "Missing id" }, { status: 400 }));

    await prisma.calendarEvent.delete({
      where: { id },
    });

    return withCors(req, NextResponse.json({ ok: true }, { status: 200 }));
  } catch (e: any) {
    if (e?.code === "P2025") {
      return withCors(req, NextResponse.json({ message: "Event not found" }, { status: 404 }));
    }
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to delete calendar event", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

