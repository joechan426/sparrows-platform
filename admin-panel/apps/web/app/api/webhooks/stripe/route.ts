import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getStripe } from "../../../../lib/stripe-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe
 * Configure endpoint in Stripe Dashboard; set STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ message: "Stripe webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ message: "Missing stripe-signature" }, { status: 400 });
  }

  const raw = await req.text();
  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "Invalid signature", error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as import("stripe").Stripe.Checkout.Session;
    const registrationId = session.metadata?.registrationId;
    if (registrationId && session.payment_status === "paid") {
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
    }
  }

  return NextResponse.json({ received: true });
}
