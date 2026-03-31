import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";
import { getPaymentPlatformSettings } from "../../../../lib/payment-platform";
import { centsToPriceDollars, dollarsToCents, parsePriceDollarsInput } from "../../../../lib/price-input";

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
          select: { status: true },
        },
        paymentProfile: {
          select: {
            id: true,
            nickname: true,
            stripeConnectedAccountId: true,
            stripeConnectChargesEnabled: true,
            paypalRestClientIdEnc: true,
            paypalRestClientSecretEnc: true,
          },
        },
      },
    });
    if (!raw) return withCors(req, NextResponse.json({ message: "Not found" }, { status: 404 }));

    const { registrations, paymentProfile, ...event } = raw;
    const approvedCount = registrations.filter((r: { status: string }) => r.status === "APPROVED").length;
    const waitlistedCount = registrations.filter((r: { status: string }) => r.status === "WAITING_LIST").length;
    const pendingCount = registrations.filter((r: { status: string }) => r.status === "PENDING").length;
    const settings = await getPaymentPlatformSettings();
    const stripeCheckoutAvailable = Boolean(
      settings.stripeEnabled &&
        paymentProfile?.stripeConnectedAccountId &&
        paymentProfile.stripeConnectChargesEnabled,
    );
    const paypalCheckoutAvailable = Boolean(
      settings.paypalEnabled &&
        paymentProfile?.paypalRestClientIdEnc &&
        paymentProfile?.paypalRestClientSecretEnc,
    );

    const paymentProfilePublic = paymentProfile
      ? { id: paymentProfile.id, nickname: paymentProfile.nickname }
      : null;

    return withCors(
      req,
      NextResponse.json(
        {
          ...event,
          priceDollars: centsToPriceDollars(event.priceCents),
          paymentProfile: paymentProfilePublic,
          approvedCount,
          waitlistedCount,
          pendingCount,
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

    if (body.priceDollars !== undefined) {
      if (body.priceDollars === null || body.priceDollars === "") {
        data.priceCents = null;
      } else {
        const d = parsePriceDollarsInput(body.priceDollars);
        if (d === null) {
          return withCors(
            req,
            NextResponse.json({ message: "priceDollars must be a non-negative number or null" }, { status: 400 }),
          );
        }
        data.priceCents = dollarsToCents(d);
      }
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

    if (body.paymentProfileId !== undefined) {
      if (body.paymentProfileId === null || body.paymentProfileId === "") {
        data.paymentProfileId = null;
      } else {
        const pid = String(body.paymentProfileId);
        const prof = await prisma.paymentProfile.findUnique({
          where: { id: pid },
          select: {
            id: true,
            stripeConnectChargesEnabled: true,
            paypalRestClientIdEnc: true,
            paypalRestClientSecretEnc: true,
          },
        });
        if (!prof) {
          return withCors(req, NextResponse.json({ message: "paymentProfileId not found" }, { status: 400 }));
        }
        const paymentMethodReady =
          prof.stripeConnectChargesEnabled === true ||
          Boolean(prof.paypalRestClientIdEnc && prof.paypalRestClientSecretEnc);
        if (!paymentMethodReady) {
          return withCors(
            req,
            NextResponse.json(
              {
                message:
                  "Selected payment profile is not ready. Stripe or PayPal must be configured and ready before using this profile for paid events.",
              },
              { status: 400 },
            ),
          );
        }
        data.paymentProfileId = pid;
      }
    }

    const mergedIsPaid = typeof data.isPaid === "boolean" ? (data.isPaid as boolean) : existing.isPaid;
    const mergedPrice =
      data.priceCents !== undefined ? (data.priceCents as number | null) : existing.priceCents;
    const mergedProfileId =
      data.paymentProfileId !== undefined
        ? (data.paymentProfileId as string | null)
        : existing.paymentProfileId;

    if (mergedIsPaid && mergedPrice != null && mergedPrice > 0) {
      if (body.paymentProfileId === null || body.paymentProfileId === "") {
        return withCors(
          req,
          NextResponse.json(
            { message: "Cannot clear payment profile while the event is paid with a price." },
            { status: 400 },
          ),
        );
      }
      if (!mergedProfileId) {
        return withCors(
          req,
          NextResponse.json(
            { message: "Select a payment profile for paid events that have a price." },
            { status: 400 },
          ),
        );
      }
      if (mergedProfileId) {
        const prof = await prisma.paymentProfile.findUnique({
          where: { id: mergedProfileId },
          select: {
            stripeConnectChargesEnabled: true,
            paypalRestClientIdEnc: true,
            paypalRestClientSecretEnc: true,
          },
        });
        const paymentMethodReady = Boolean(
          prof &&
            (prof.stripeConnectChargesEnabled === true ||
              (prof.paypalRestClientIdEnc && prof.paypalRestClientSecretEnc)),
        );
        if (!paymentMethodReady) {
          return withCors(
            req,
            NextResponse.json(
              {
                message:
                  "Selected payment profile is not ready. Stripe or PayPal must be configured and ready before using this profile for paid events.",
              },
              { status: 400 },
            ),
          );
        }
      }
    }

    if (Object.keys(data).length === 0) {
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

    return withCors(req, NextResponse.json(updated, { status: 200 }));
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

