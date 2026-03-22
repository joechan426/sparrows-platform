import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";
import { getStripe } from "../../../../../lib/stripe-server";
import { createStripeAccountOnboardingLink, createStripeExpressAccount } from "../../../../../lib/stripe-connect";

export const dynamic = "force-dynamic";

/**
 * POST /api/payment-connect/stripe/onboarding
 * Returns Stripe-hosted URL to connect this admin's Express account (no merchant secret keys stored).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  const stripe = getStripe();
  if (!stripe) {
    return corsJson(req, { message: "Stripe platform is not configured (STRIPE_SECRET_KEY)" }, { status: 503 });
  }

  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: auth.admin.id },
      select: { id: true, email: true, stripeConnectedAccountId: true },
    });
    if (!admin) {
      return corsJson(req, { message: "Admin not found" }, { status: 404 });
    }

    let accountId = admin.stripeConnectedAccountId;
    if (!accountId) {
      const acct = await createStripeExpressAccount(stripe, {
        adminUserId: admin.id,
        email: admin.email,
      });
      accountId = acct.id;
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          stripeConnectedAccountId: accountId,
          stripeConnectChargesEnabled: acct.charges_enabled === true,
        },
      });
    }

    const url = await createStripeAccountOnboardingLink(stripe, accountId);
    if (!url) {
      return corsJson(req, { message: "Could not create Stripe onboarding link" }, { status: 502 });
    }

    return corsJson(req, { url, stripeConnectedAccountId: accountId });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Stripe onboarding error", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
