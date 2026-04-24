import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, corsOptions } from "../../../../../lib/cors";
import { getPaymentPlatformSettings, getCheckoutPublicBaseUrl } from "../../../../../lib/payment-platform";
import { getStripe } from "../../../../../lib/stripe-server";
import { createPayPalOrder, getPayPalAccessTokenWithClientCreds } from "../../../../../lib/paypal-server";
import { getEventPaymentProfilePayPalRestCreds } from "../../../../../lib/paypal-merchant-creds";
import { upsertPaidRegistration } from "../../../../../lib/paid-registration";

async function getIdFromContext(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const params = await context.params;
  return params?.id ? String(params.id) : undefined;
}

function formatMoney(cents: number, currency: string): string {
  return (cents / 100).toFixed(2);
}

/**
 * POST /api/calendar-events/:id/checkout
 * Body: { provider: "stripe" | "paypal", preferredName, email?, teamName? }
 * Funds go to the event's payment recipient admin (Stripe Connect / PayPal seller).
 */
export async function POST(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) {
      return corsJson(req, { message: "Missing calendar event id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const provider = typeof body.provider === "string" ? body.provider.toLowerCase() : "";
    const preferredName =
      typeof body.preferredName === "string" ? body.preferredName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const teamName =
      typeof body.teamName === "string" && body.teamName.trim().length > 0
        ? body.teamName.trim()
        : null;
    const useCredit = body.useCredit === true;

    // When called by the iOS app, we want the web return pages to deep-link back into the app.
    const appReturn =
      body.appReturn === true ||
      body.returnToApp === true ||
      body.return_to_app === true ||
      body.app === true;

    if (!preferredName) {
      return corsJson(req, { message: "preferredName is required" }, { status: 400 });
    }
    if (provider !== "stripe" && provider !== "paypal") {
      return corsJson(req, { message: "provider must be stripe or paypal" }, { status: 400 });
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: calendarEventId },
      include: {
        paymentProfile: {
          select: {
            id: true,
            stripeConnectedAccountId: true,
            stripeConnectChargesEnabled: true,
            paypalMerchantId: true,
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

    if (!event.paymentProfileId || !event.paymentProfile) {
      return corsJson(
        req,
        {
          message:
            "This paid event has no payment profile. A manager must select a payment account in the event settings.",
        },
        { status: 400 },
      );
    }

    const recipient = event.paymentProfile;

    const isSpecial = event.eventType === "SPECIAL";
    if (isSpecial && !teamName) {
      return corsJson(req, { message: "teamName is required for SPECIAL events" }, { status: 400 });
    }

    const settings = await getPaymentPlatformSettings();
    if (provider === "stripe" && !settings.stripeEnabled) {
      return corsJson(req, { message: "Stripe checkout is disabled" }, { status: 400 });
    }
    if (provider === "paypal" && !settings.paypalEnabled) {
      return corsJson(req, { message: "PayPal checkout is disabled" }, { status: 400 });
    }

    if (provider === "stripe") {
      if (!recipient.stripeConnectedAccountId || !recipient.stripeConnectChargesEnabled) {
        return corsJson(
          req,
          {
            message:
              "The event payment recipient has not finished Stripe Connect onboarding (charges not enabled).",
          },
          { status: 400 },
        );
      }
    }

    if (provider === "paypal") {
      const creds = await getEventPaymentProfilePayPalRestCreds(event.id);
      if (!creds) {
        return corsJson(
          req,
          {
            message:
              "The event payment recipient has no PayPal REST app credentials. Set paypalRestClientId/paypalRestClientSecret in admin settings.",
          },
          { status: 400 },
        );
      }
    }

    if (!email) {
      return corsJson(req, { message: "email is required for paid registration" }, { status: 400 });
    }

    const member = await prisma.member.findUnique({ where: { email } });
    if (member) {
      const existing = await prisma.eventRegistration.findUnique({
        where: {
          memberId_calendarEventId: { memberId: member.id, calendarEventId },
        },
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

    const base = getCheckoutPublicBaseUrl();
    const appQuery = appReturn ? "&app=1" : "";
    const encodedEmail = encodeURIComponent(email);
    const encodedName = encodeURIComponent(preferredName);
    const encodedTeam = encodeURIComponent(teamName ?? "");
    const successStripe = `${base}/calendar/checkout-return?provider=stripe&e=${encodedEmail}&n=${encodedName}&t=${encodedTeam}${appQuery}`;
    const cancelStripe = `${base}/calendar/checkout-return?canceled=1${appQuery}`;
    const successPaypal = `${base}/calendar/paypal-return?eventId=${encodeURIComponent(calendarEventId)}&e=${encodedEmail}&n=${encodedName}&t=${encodedTeam}${appQuery}`;
    const cancelPaypal = `${base}/calendar/paypal-return?canceled=1${appQuery}`;

    if (provider === "stripe") {
      const stripe = getStripe();
      if (!stripe) {
        return corsJson(req, { message: "Stripe platform is not configured (STRIPE_SECRET_KEY)" }, { status: 503 });
      }
      const stripeAccount = recipient.stripeConnectedAccountId!;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          metadata: {
            calendarEventId: event.id,
            email,
            preferredName,
            teamName: teamName ?? "",
            useCredit: useCredit ? "1" : "0",
          },
          line_items: [
            {
              price_data: {
                currency: event.currency.toLowerCase(),
                unit_amount: payableCents,
                product_data: { name: event.title },
              },
              quantity: 1,
            },
          ],
          success_url: `${successStripe}&session_id={CHECKOUT_SESSION_ID}&acct=${encodeURIComponent(stripeAccount)}`,
          cancel_url: cancelStripe,
        },
        { stripeAccount },
      );
      if (!session.url) {
        return corsJson(req, { message: "Stripe did not return a URL" }, { status: 500 });
      }
      return corsJson(req, { url: session.url });
    }

    const creds = await getEventPaymentProfilePayPalRestCreds(event.id);
    if (!creds) {
      return corsJson(
        req,
        { message: "PayPal credentials missing for event recipient" },
        { status: 400 },
      );
    }
    const token = await getPayPalAccessTokenWithClientCreds(creds);
    if (!token) {
      return corsJson(req, { message: "PayPal credentials invalid for event recipient" }, { status: 503 });
    }
    const orderResult = await createPayPalOrder({
      accessToken: token,
      clientId: creds.clientId,
      currencyCode: event.currency,
      value: formatMoney(payableCents, event.currency),
      customId: `${calendarEventId}:${email.toLowerCase()}:${useCredit ? "1" : "0"}`,
      returnUrl: successPaypal,
      cancelUrl: cancelPaypal,
      // Not a partner payee flow: merchant's own REST app receives the funds.
    });
    if (!orderResult.ok) {
      return corsJson(
        req,
        {
          message: "Failed to create PayPal order",
          paypalHttpStatus: orderResult.httpStatus,
          paypalDetails: orderResult.paypalError,
        },
        { status: 502 },
      );
    }
    return corsJson(req, {
      url: orderResult.approveUrl,
      orderId: orderResult.id,
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Checkout failed", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
