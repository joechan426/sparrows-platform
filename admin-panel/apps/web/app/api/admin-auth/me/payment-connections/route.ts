import { type NextRequest } from "next/server";
import { corsJson, corsOptions } from "../../../../../lib/cors";

/**
 * @deprecated Payment credentials are stored on `PaymentProfile` rows.
 * Use PATCH /api/payment-profiles/:id/paypal and Stripe routes under /api/payment-profiles/:id/stripe/*.
 */
export async function PATCH(req: NextRequest) {
  return corsJson(
    req,
    {
      message:
        "Deprecated: configure PayPal on a payment profile via PATCH /api/payment-profiles/:id/paypal (Super Manager or Admin only).",
    },
    { status: 410 },
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
