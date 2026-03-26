import { type NextRequest } from "next/server";
import { corsJson, corsOptions } from "../../../../../lib/cors";

export const dynamic = "force-dynamic";

/** @deprecated PayPal REST credentials are set per payment profile. */
export async function POST(req: NextRequest) {
  return corsJson(
    req,
    {
      message:
        "Deprecated: set PayPal REST app credentials with PATCH /api/payment-profiles/:paymentProfileId/paypal (Super Manager or Admin only).",
    },
    { status: 410 },
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
