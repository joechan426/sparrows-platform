import { type NextRequest } from "next/server";
import { getStripe } from "../../../../lib/stripe-server";
import { corsJson, corsOptions } from "../../../../lib/cors";
import { upsertPaidRegistration } from "../../../../lib/paid-registration";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/verify-checkout
 * Idempotent: marks registration PAID from Checkout session (backup if webhook is delayed).
 * Body: { sessionId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return corsJson(req, { message: "sessionId is required" }, { status: 400 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return corsJson(req, { message: "Stripe is not configured" }, { status: 503 });
    }

    const connectedAccountId =
      typeof body.connectedAccountId === "string" && body.connectedAccountId.trim().length > 0
        ? body.connectedAccountId.trim()
        : undefined;
    let session: import("stripe").Stripe.Checkout.Session;
    try {
      session = connectedAccountId
        ? await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: connectedAccountId })
        : await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    }
    if (session.payment_status !== "paid") {
      return corsJson(req, { message: "Payment not completed yet" }, { status: 400 });
    }

    const calendarEventId = session.metadata?.calendarEventId?.trim() ?? "";
    const email = session.metadata?.email?.trim() ?? "";
    const preferredName = session.metadata?.preferredName?.trim() ?? "";
    const teamName = session.metadata?.teamName?.trim() ?? "";
    if (!calendarEventId || !email || !preferredName) {
      return corsJson(req, { message: "Session metadata is incomplete" }, { status: 400 });
    }

    const amount = session.amount_total ?? 0;
    const registration = await upsertPaidRegistration({
      context: {
        calendarEventId,
        email,
        preferredName,
        teamName: teamName || null,
      },
      provider: "STRIPE",
      amountPaidCents: amount,
      stripeSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    });

    return corsJson(req, { ok: true, registrationId: registration.id });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Verify failed", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
