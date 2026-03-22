import { type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getStripe } from "../../../../lib/stripe-server";
import { corsJson, corsOptions } from "../../../../lib/cors";

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

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return corsJson(req, { message: "Payment not completed yet" }, { status: 400 });
    }

    const registrationId = session.metadata?.registrationId;
    if (!registrationId) {
      return corsJson(req, { message: "Session has no registration metadata" }, { status: 400 });
    }

    const amount = session.amount_total ?? 0;
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId },
      data: {
        paymentStatus: "PAID",
        amountPaidCents: amount,
        paymentProvider: "STRIPE",
        paidAt: new Date(),
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
      },
    });

    return corsJson(req, { ok: true, registrationId });
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
