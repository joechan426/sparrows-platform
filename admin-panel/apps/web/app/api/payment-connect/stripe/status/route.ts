import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";
import { getStripe } from "../../../../../lib/stripe-server";

export const dynamic = "force-dynamic";

/** GET /api/payment-connect/stripe/status — live flags from Stripe for current admin */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  const stripe = getStripe();
  if (!stripe) {
    return corsJson(req, { message: "Stripe not configured" }, { status: 503 });
  }

  try {
    const row = await prisma.adminUser.findUnique({
      where: { id: auth.admin.id },
      select: { stripeConnectedAccountId: true, stripeConnectChargesEnabled: true },
    });

    if (!row?.stripeConnectedAccountId) {
      return corsJson(req, {
        connected: false,
        chargesEnabled: false,
        stripeConnectedAccountId: null,
      });
    }

    const acct = await stripe.accounts.retrieve(row.stripeConnectedAccountId);
    const chargesEnabled = acct.charges_enabled === true;
    if (chargesEnabled !== row.stripeConnectChargesEnabled) {
      await prisma.adminUser.update({
        where: { id: auth.admin.id },
        data: { stripeConnectChargesEnabled: chargesEnabled },
      });
    }

    return corsJson(req, {
      connected: true,
      chargesEnabled,
      detailsSubmitted: acct.details_submitted === true,
      stripeConnectedAccountId: row.stripeConnectedAccountId,
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Stripe status error", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
