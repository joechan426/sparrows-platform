import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, corsOptions } from "../../../../../lib/cors";
import { getPaymentPlatformSettings } from "../../../../../lib/payment-platform";
import { getStripe, stripePublishableKey } from "../../../../../lib/stripe-server";
import { upsertPaidRegistration } from "../../../../../lib/paid-registration";

async function getIdFromContext(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const params = await context.params;
  return params?.id ? String(params.id) : undefined;
}

type IntentRequestBody = {
  preferredName?: string;
  email?: string;
  teamName?: string | null;
  useCredit?: boolean;
};

/**
 * POST /api/calendar-events/:id/mobile-stripe-payment-intent
 * Initializes native Stripe PaymentSheet for iOS.
 */
export async function POST(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return corsJson(req, { message: "Missing calendar event id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as IntentRequestBody;
    const preferredName = typeof body.preferredName === "string" ? body.preferredName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const teamName =
      typeof body.teamName === "string" && body.teamName.trim().length > 0 ? body.teamName.trim() : null;
    const useCredit = body.useCredit === true;

    if (!preferredName) {
      return corsJson(req, { message: "preferredName is required" }, { status: 400 });
    }
    if (!email) {
      return corsJson(req, { message: "email is required" }, { status: 400 });
    }

    const settings = await getPaymentPlatformSettings();
    if (!settings.stripeEnabled) {
      return corsJson(req, { message: "Stripe checkout is disabled" }, { status: 400 });
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: calendarEventId },
      include: {
        paymentProfile: {
          select: {
            stripeConnectedAccountId: true,
            stripeConnectChargesEnabled: true,
          },
        },
      },
    });
    if (!event) return corsJson(req, { message: "Event not found" }, { status: 404 });
    if (!event.registrationOpen) {
      return corsJson(req, { message: "Registration is closed for this event" }, { status: 400 });
    }
    if (!event.isPaid || !event.priceCents || event.priceCents <= 0) {
      return corsJson(req, { message: "This event does not require payment" }, { status: 400 });
    }
    if (event.eventType === "SPECIAL" && !teamName) {
      return corsJson(req, { message: "teamName is required for SPECIAL events" }, { status: 400 });
    }
    if (!event.paymentProfile?.stripeConnectedAccountId || !event.paymentProfile?.stripeConnectChargesEnabled) {
      return corsJson(
        req,
        { message: "The event payment recipient has not finished Stripe Connect onboarding." },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return corsJson(req, { message: "Stripe platform is not configured (STRIPE_SECRET_KEY)" }, { status: 503 });
    }
    const publishableKey = stripePublishableKey();
    if (!publishableKey) {
      return corsJson(
        req,
        { message: "Stripe publishable key is missing (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)." },
        { status: 503 },
      );
    }

    const member = await prisma.member.findUnique({ where: { email } });
    if (member) {
      const existing = await prisma.eventRegistration.findUnique({
        where: { memberId_calendarEventId: { memberId: member.id, calendarEventId } },
      });
      if (existing && (existing.paymentStatus === "PAID" || existing.paymentStatus === "WAIVED")) {
        return corsJson(req, { message: "Already registered for this event" }, { status: 409 });
      }
    }

    const availableCredit = useCredit ? Math.max(member?.creditCents ?? 0, 0) : 0;
    const creditApplied = Math.min(availableCredit, event.priceCents);
    const payableCents = Math.max(event.priceCents - creditApplied, 0);

    if (useCredit && payableCents === 0) {
      const registration = await upsertPaidRegistration({
        context: { calendarEventId, email, preferredName, teamName },
        provider: "MANUAL",
        amountPaidCents: 0,
        useCredit: true,
      });
      return corsJson(req, { ok: true, directRegistered: true, registrationId: registration.id });
    }

    const stripeAccount = event.paymentProfile.stripeConnectedAccountId;
    const customer = await stripe.customers.create(
      {
        email,
        name: preferredName,
        metadata: {
          calendarEventId: event.id,
        },
      },
      { stripeAccount },
    );

    const ephemeralKey = await stripe.ephemeralKeys.create(
      {
        customer: customer.id,
      },
      {
        apiVersion: "2024-06-20",
        stripeAccount,
      },
    );

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: payableCents,
        currency: event.currency.toLowerCase(),
        customer: customer.id,
        automatic_payment_methods: { enabled: true },
        metadata: {
          calendarEventId: event.id,
          email,
          preferredName,
          teamName: teamName ?? "",
          useCredit: useCredit ? "1" : "0",
        },
      },
      { stripeAccount },
    );

    if (!ephemeralKey.secret) {
      return corsJson(
        req,
        { message: "Failed to initialize Stripe payment: ephemeral key secret missing." },
        { status: 500 },
      );
    }
    if (!paymentIntent.client_secret) {
      return corsJson(
        req,
        { message: "Failed to initialize Stripe payment: payment intent client secret missing." },
        { status: 500 },
      );
    }

    return corsJson(req, {
      ok: true,
      publishableKey,
      connectedAccountId: stripeAccount,
      paymentIntentId: paymentIntent.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
      customerId: customer.id,
      ephemeralKeySecret: ephemeralKey.secret,
      merchantDisplayName: "Sparrows Volleyball",
      amountCents: payableCents,
      currency: event.currency,
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to initialize mobile Stripe payment", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
