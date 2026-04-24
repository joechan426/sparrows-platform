import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth, getOptionalAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";
import { upsertPaidRegistration } from "../../../../../lib/paid-registration";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// GET /api/calendar-events/:id/registrations
export async function GET(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return withCors(
        req,
        NextResponse.json({ message: "Missing calendar event id" }, { status: 400 })
      );
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { calendarEventId },
      orderBy: { createdAt: "asc" },
      include: {
        member: true,
        event: true,
      },
    });

    return withCors(req, NextResponse.json(registrations, { status: 200 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        {
          message: "Failed to list event registrations",
          error: e?.message ?? String(e),
        },
        { status: 500 }
      )
    );
  }
}

// POST /api/calendar-events/:id/registrations
// Creates a registration for a member for the given event, enforcing:
// - one registration per member per event
// - SPECIAL event requires teamName
// - registration allowed only when registrationOpen = true
export async function POST(req: NextRequest, context: any) {
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return withCors(
        req,
        NextResponse.json({ message: "Missing calendar event id" }, { status: 400 })
      );
    }

    const body = await req.json().catch(() => ({}));

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const preferredName =
      typeof body.preferredName === "string" ? body.preferredName.trim() : "";
    const teamName =
      typeof body.teamName === "string" && body.teamName.trim().length > 0
        ? body.teamName.trim()
        : null;
    const useCredit = body.useCredit === true;

    if (!preferredName) {
      return withCors(
        req,
        NextResponse.json({ message: "preferredName is required" }, { status: 400 })
      );
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: calendarEventId },
    });

    if (!event) {
      return withCors(req, NextResponse.json({ message: "Event not found" }, { status: 404 }));
    }

    if (!event.registrationOpen) {
      return withCors(
        req,
        NextResponse.json(
          { message: "Registration is currently closed for this event" },
          { status: 400 }
        )
      );
    }

    const isSpecial = event.eventType === "SPECIAL";

    if (isSpecial && !teamName) {
      return withCors(
        req,
        NextResponse.json(
          { message: "teamName is required for SPECIAL events" },
          { status: 400 }
        )
      );
    }

    const requiresPayment =
      Boolean(event.isPaid && event.priceCents != null && event.priceCents > 0);

    if (requiresPayment) {
      if (useCredit && email) {
        const memberForCredit = await prisma.member.findUnique({
          where: { email },
          select: { creditCents: true },
        });
        const price = event.priceCents ?? 0;
        if ((memberForCredit?.creditCents ?? 0) >= price && price > 0) {
          const paid = await upsertPaidRegistration({
            context: { calendarEventId, email, preferredName, teamName },
            provider: "MANUAL",
            amountPaidCents: 0,
            useCredit: true,
          });
          return withCors(req, NextResponse.json(paid, { status: 201 }));
        }
      }
      const admin = await getOptionalAdminAuth(req, "CALENDAR_EVENTS");
      if (!admin) {
        return corsJson(
          req,
          {
            code: "PAYMENT_REQUIRED",
            message: "This event requires payment. Use checkout or register with manager access.",
            amountCents: event.priceCents,
            currency: event.currency,
          },
          { status: 402 }
        );
      }

      const waived = body.paymentWaived === true;
      const recorded =
        body.recordedPaidCents !== undefined && body.recordedPaidCents !== null && body.recordedPaidCents !== ""
          ? Number(body.recordedPaidCents)
          : null;

      if (!waived) {
        if (recorded === null || Number.isNaN(recorded)) {
          return withCors(
            req,
            NextResponse.json(
              {
                message:
                  "For paid events, set paymentWaived: true or recordedPaidCents (non-negative integer).",
              },
              { status: 400 }
            )
          );
        }
        if (!Number.isInteger(recorded) || recorded < 0) {
          return withCors(
            req,
            NextResponse.json({ message: "recordedPaidCents must be a non-negative integer" }, { status: 400 })
          );
        }
      }
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

    const paidExtras = requiresPayment
      ? (() => {
          const waived = body.paymentWaived === true;
          const recorded =
            body.recordedPaidCents !== undefined && body.recordedPaidCents !== null && body.recordedPaidCents !== ""
              ? Number(body.recordedPaidCents)
              : null;
          if (waived) {
            return {
              paymentStatus: "WAIVED" as const,
              amountDueCents: event.priceCents,
              amountPaidCents: null as number | null,
              paymentProvider: "MANUAL" as const,
              paidAt: null as Date | null,
            };
          }
          return {
            paymentStatus: "PAID" as const,
            amountDueCents: event.priceCents,
            amountPaidCents: recorded ?? 0,
            paymentProvider: "MANUAL" as const,
            paidAt: new Date(),
          };
        })()
      : {};

    try {
      const registration = await prisma.eventRegistration.create({
        data: {
          memberId: member.id,
          calendarEventId,
          teamName: teamName ?? undefined,
          status: "PENDING",
          ...paidExtras,
        },
      });

      return withCors(req, NextResponse.json(registration, { status: 201 }));
    } catch (e: any) {
      if (e?.code === "P2002") {
        return withCors(
          req,
          NextResponse.json(
            { message: "Member is already registered for this event" },
            { status: 409 }
          )
        );
      }
      throw e;
    }
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to create event registration", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

