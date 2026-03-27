import { type NextRequest } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../../lib/cors";
import { getStripe } from "../../../../../../lib/stripe-server";
import { createStripeAccountOnboardingLink, createStripeExpressAccount } from "../../../../../../lib/stripe-connect";

export const dynamic = "force-dynamic";

async function getProfileId(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const p = await context.params;
  return p?.id ? String(p.id) : undefined;
}

/** POST /api/payment-profiles/:id/stripe/onboarding */
export async function POST(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "PAYMENT_PROFILES");
  if (!auth.ok) return withCors(req, auth.response);

  const paymentProfileId = await getProfileId(context);
  if (!paymentProfileId) return corsJson(req, { message: "Missing payment profile id" }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) {
    return corsJson(req, { message: "Stripe platform is not configured (STRIPE_SECRET_KEY)" }, { status: 503 });
  }

  try {
    // We must generate Stripe `return_url/refresh_url` pointing back to *this* admin-panel host.
    // Relying on NEXT_PUBLIC_WEB_APP_URL causes onboarding to return to sparrowsweb instead.
    const origin = (req.headers.get("origin") ?? "").trim().replace(/\/+$/, "");
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const forwardedHost = req.headers.get("x-forwarded-host");
    const proto = ((forwardedProto ?? "https").split(",")[0] ?? "https").trim();
    const host = ((forwardedHost ?? req.headers.get("host") ?? "").split(",")[0] ?? "").trim();
    const adminBaseUrl = origin || (host ? `${proto}://${host}` : undefined);

    const profile = await prisma.paymentProfile.findUnique({
      where: { id: paymentProfileId },
      select: { id: true, stripeConnectedAccountId: true },
    });
    if (!profile) return corsJson(req, { message: "Payment profile not found" }, { status: 404 });

    const adminRow = await prisma.adminUser.findUnique({
      where: { id: auth.admin.id },
      select: { email: true },
    });

    let accountId = profile.stripeConnectedAccountId;
    if (!accountId) {
      const acct = await createStripeExpressAccount(stripe, {
        paymentProfileId: profile.id,
        email: adminRow?.email ?? null,
      });
      accountId = acct.id;
      await prisma.paymentProfile.update({
        where: { id: profile.id },
        data: {
          stripeConnectedAccountId: accountId,
          stripeConnectChargesEnabled: acct.charges_enabled === true,
        },
      });
    }

    const url = await createStripeAccountOnboardingLink(stripe, accountId, adminBaseUrl);
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
