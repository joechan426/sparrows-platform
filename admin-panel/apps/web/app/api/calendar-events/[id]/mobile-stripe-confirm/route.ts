import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, corsOptions } from "../../../../../lib/cors";
import { getStripe } from "../../../../../lib/stripe-server";
import { upsertPaidRegistration } from "../../../../../lib/paid-registration";

async function getIdFromContext(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const params = await context.params;
  return params?.id ? String(params.id) : undefined;
}

/**
 * POST /api/calendar-events/:id/mobile-stripe-confirm
 * Body: { paymentIntentId: string }
 * Verifies a native PaymentSheet payment and upserts paid registration.
 */
export async function POST(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return corsJson(req, { message: "Missing calendar event id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
    if (!paymentIntentId) {
      return corsJson(req, { message: "paymentIntentId is required" }, { status: 400 });
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: calendarEventId },
      include: {
        paymentProfile: {
          select: {
            stripeConnectedAccountId: true,
          },
        },
      },
    });
    if (!event) return corsJson(req, { message: "Event not found" }, { status: 404 });
    const stripeAccount = event.paymentProfile?.stripeConnectedAccountId;
    if (!stripeAccount) {
      return corsJson(req, { message: "Stripe payment profile is missing for this event" }, { status: 400 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return corsJson(req, { message: "Stripe is not configured" }, { status: 503 });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { stripeAccount });
    if (paymentIntent.status !== "succeeded") {
      return corsJson(
        req,
        { message: `Payment not completed yet (status: ${paymentIntent.status})` },
        { status: 409 },
      );
    }

    const metadata = paymentIntent.metadata ?? {};
    const email = typeof metadata.email === "string" ? metadata.email.trim() : "";
    const preferredName = typeof metadata.preferredName === "string" ? metadata.preferredName.trim() : "";
    const metaEventId =
      typeof metadata.calendarEventId === "string" ? metadata.calendarEventId.trim() : calendarEventId;
    const teamName =
      typeof metadata.teamName === "string" && metadata.teamName.trim().length > 0
        ? metadata.teamName.trim()
        : null;
    const useCredit = metadata.useCredit === "1";

    if (!email || !preferredName || !metaEventId) {
      return corsJson(req, { message: "Payment metadata is incomplete" }, { status: 400 });
    }
    if (metaEventId !== calendarEventId) {
      return corsJson(req, { message: "Payment does not belong to this event" }, { status: 400 });
    }

    const registration = await upsertPaidRegistration({
      context: { calendarEventId, email, preferredName, teamName },
      provider: "STRIPE",
      amountPaidCents: paymentIntent.amount_received || paymentIntent.amount || 0,
      useCredit,
      stripePaymentIntentId: paymentIntent.id,
    });

    return corsJson(req, { ok: true, registrationId: registration.id });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to confirm mobile Stripe payment", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
