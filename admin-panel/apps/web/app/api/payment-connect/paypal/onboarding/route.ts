import { type NextRequest } from "next/server";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";
import { createPayPalPartnerReferralLink } from "../../../../../lib/paypal-partner";

export const dynamic = "force-dynamic";

/**
 * POST /api/payment-connect/paypal/onboarding
 * Returns PayPal-hosted onboarding URL (Partner Referrals). After completion, set merchant id via
 * PATCH /api/admin-auth/me/payment-connections if PayPal does not auto-sync.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  const url = await createPayPalPartnerReferralLink(auth.admin.id);
  if (!url) {
    return corsJson(
      req,
      {
        message:
          "Could not start PayPal partner onboarding. Use manual merchant id or check PayPal app / Partner status.",
      },
      { status: 502 },
    );
  }

  return corsJson(req, { url, trackingId: auth.admin.id });
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
