import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getStripe } from "../../../../lib/stripe-server";
import { upsertPaidRegistration } from "../../../../lib/paid-registration";

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
    if (session.payment_status === "paid") {
      const calendarEventId = session.metadata?.calendarEventId?.trim() ?? "";
      const email = session.metadata?.email?.trim() ?? "";
      const preferredName = session.metadata?.preferredName?.trim() ?? "";
      const teamName = session.metadata?.teamName?.trim() ?? "";
      if (!calendarEventId || !email || !preferredName) {
        return NextResponse.json({ message: "Missing checkout metadata" }, { status: 400 });
      }
      const amount = session.amount_total ?? 0;
      await upsertPaidRegistration({
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
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as import("stripe").Stripe.Account;
    if (account.id) {
      await prisma.paymentProfile.updateMany({
        where: { stripeConnectedAccountId: account.id },
        data: { stripeConnectChargesEnabled: account.charges_enabled === true },
      });
    }
  }

  return NextResponse.json({ received: true });
}
