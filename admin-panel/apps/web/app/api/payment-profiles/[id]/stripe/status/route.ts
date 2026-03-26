import { type NextRequest } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { requireAdminAuth, canManagePaymentProfiles } from "../../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../../lib/cors";
import { getStripe } from "../../../../../../lib/stripe-server";

export const dynamic = "force-dynamic";

async function getProfileId(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const p = await context.params;
  return p?.id ? String(p.id) : undefined;
}

/** GET /api/payment-profiles/:id/stripe/status */
export async function GET(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (!canManagePaymentProfiles(auth.admin)) {
    return corsJson(req, { message: "Only Super Manager or Admin can view Stripe status" }, { status: 403 });
  }

  const paymentProfileId = await getProfileId(context);
  if (!paymentProfileId) return corsJson(req, { message: "Missing payment profile id" }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) {
    return corsJson(req, { message: "Stripe is not configured" }, { status: 503 });
  }

  try {
    const row = await prisma.paymentProfile.findUnique({
      where: { id: paymentProfileId },
      select: { stripeConnectedAccountId: true, stripeConnectChargesEnabled: true },
    });
    if (!row) return corsJson(req, { message: "Payment profile not found" }, { status: 404 });

    if (!row.stripeConnectedAccountId) {
      return corsJson(req, {
        stripeConnectedAccountId: null,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
    }

    const acct = await stripe.accounts.retrieve(row.stripeConnectedAccountId);
    const chargesEnabled = acct.charges_enabled === true;
    if (chargesEnabled !== row.stripeConnectChargesEnabled) {
      await prisma.paymentProfile.update({
        where: { id: paymentProfileId },
        data: { stripeConnectChargesEnabled: chargesEnabled },
      });
    }

    return corsJson(req, {
      stripeConnectedAccountId: row.stripeConnectedAccountId,
      chargesEnabled,
      detailsSubmitted: acct.details_submitted === true,
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
