import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../lib/cors";
import { getPaymentPlatformSettings, updatePaymentPlatformSettings } from "../../../lib/payment-platform";
import { stripePublishableKey } from "../../../lib/stripe-server";

// GET /api/payment-settings — public: which methods are on + Stripe publishable key (platform Connect; no merchant secrets).
export async function GET(req: NextRequest) {
  try {
    const s = await getPaymentPlatformSettings();
    return corsJson(req, {
      stripeEnabled: s.stripeEnabled,
      paypalEnabled: s.paypalEnabled,
      squareEnabled: s.squareEnabled,
      stripePublishableKey: stripePublishableKey(),
      currencyDefault: "AUD",
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to load payment settings", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// PATCH /api/payment-settings — manager/admin: toggle providers (secrets stay in env).
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const body = await req.json().catch(() => ({}));
    const data: { stripeEnabled?: boolean; paypalEnabled?: boolean; squareEnabled?: boolean } = {};
    if (typeof body.stripeEnabled === "boolean") data.stripeEnabled = body.stripeEnabled;
    if (typeof body.paypalEnabled === "boolean") data.paypalEnabled = body.paypalEnabled;
    if (typeof body.squareEnabled === "boolean") data.squareEnabled = body.squareEnabled;
    if (Object.keys(data).length === 0) {
      return corsJson(req, { message: "No valid fields" }, { status: 400 });
    }
    const updated = await updatePaymentPlatformSettings(data);
    return corsJson(req, updated);
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to update payment settings", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
