import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, corsOptions } from "../../../../../lib/cors";
import { getPaymentPlatformSettings, getCheckoutPublicBaseUrl } from "../../../../../lib/payment-platform";
import { getStripe } from "../../../../../lib/stripe-server";
import { createPayPalOrder, getPayPalAccessToken } from "../../../../../lib/paypal-server";

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

    if (!preferredName) {
      return corsJson(req, { message: "preferredName is required" }, { status: 400 });
    }
    if (provider !== "stripe" && provider !== "paypal") {
      return corsJson(req, { message: "provider must be stripe or paypal" }, { status: 400 });
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: calendarEventId },
      include: {
        paymentAccountAdmin: {
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

    if (!event.paymentAccountAdminId || !event.paymentAccountAdmin) {
      return corsJson(
        req,
        {
          message:
            "This paid event has no payment recipient. A manager must assign a recipient admin in the event settings.",
        },
        { status: 400 },
      );
    }

    const recipient = event.paymentAccountAdmin;

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
      if (!recipient.paypalMerchantId) {
        return corsJson(
          req,
          {
            message:
              "The event payment recipient has no PayPal merchant id. Complete PayPal onboarding or paste merchant id in admin settings.",
          },
          { status: 400 },
        );
      }
    }

    let member;
    if (email) {
      member = await prisma.member.findUnique({ where: { email } });
      if (!member) {
        member = await prisma.member.create({
          data: { email, preferredName },
        });
      } else if (preferredName && preferredName !== member.preferredName) {
        member = await prisma.member.update({
          where: { id: member.id },
          data: { preferredName },
        });
      }
    } else {
      return corsJson(req, { message: "email is required for paid registration" }, { status: 400 });
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: {
        memberId_calendarEventId: { memberId: member.id, calendarEventId },
      },
    });
    if (existing) {
      if (existing.paymentStatus === "PAID" || existing.paymentStatus === "WAIVED") {
        return corsJson(req, { message: "Already registered for this event" }, { status: 409 });
      }
    }

    const registration = await prisma.eventRegistration.upsert({
      where: {
        memberId_calendarEventId: { memberId: member.id, calendarEventId },
      },
      create: {
        memberId: member.id,
        calendarEventId,
        teamName: teamName ?? undefined,
        status: "PENDING",
        paymentStatus: "AWAITING_PAYMENT",
        amountDueCents: event.priceCents,
        amountPaidCents: null,
      },
      update: {
        teamName: teamName ?? undefined,
        paymentStatus: "AWAITING_PAYMENT",
        amountDueCents: event.priceCents,
        paymentProvider: null,
        stripeSessionId: null,
        paypalOrderId: null,
        stripePaymentIntentId: null,
      },
    });

    const base = getCheckoutPublicBaseUrl();
    const successStripe = `${base}/calendar/checkout-return?provider=stripe`;
    const cancelStripe = `${base}/calendar/checkout-return?canceled=1`;
    const successPaypal = `${base}/calendar/paypal-return`;
    const cancelPaypal = `${base}/calendar/paypal-return?canceled=1`;

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
            registrationId: registration.id,
            calendarEventId: event.id,
          },
          line_items: [
            {
              price_data: {
                currency: event.currency.toLowerCase(),
                unit_amount: event.priceCents,
                product_data: { name: event.title },
              },
              quantity: 1,
            },
          ],
          success_url: `${successStripe}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelStripe,
        },
        { stripeAccount },
      );
      await prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { stripeSessionId: session.id, paymentProvider: "STRIPE" },
      });
      if (!session.url) {
        return corsJson(req, { message: "Stripe did not return a URL" }, { status: 500 });
      }
      return corsJson(req, { url: session.url, registrationId: registration.id });
    }

    const token = await getPayPalAccessToken();
    if (!token) {
      return corsJson(req, { message: "PayPal platform is not configured" }, { status: 503 });
    }
    const order = await createPayPalOrder({
      accessToken: token,
      currencyCode: event.currency,
      value: formatMoney(event.priceCents, event.currency),
      customId: registration.id,
      returnUrl: successPaypal,
      cancelUrl: cancelPaypal,
      payeeMerchantId: recipient.paypalMerchantId!,
    });
    if (!order) {
      return corsJson(req, { message: "Failed to create PayPal order" }, { status: 502 });
    }
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { paypalOrderId: order.id, paymentProvider: "PAYPAL" },
    });
    return corsJson(req, { url: order.approveUrl, orderId: order.id, registrationId: registration.id });
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
