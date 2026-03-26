import { type NextRequest } from "next/server";
import { corsJson, corsOptions } from "../../../../../lib/cors";

/** @deprecated Use GET /api/payment-profiles/:id/stripe/status */
export async function GET(req: NextRequest) {
  return corsJson(
    req,
    {
      message:
        "Deprecated: use GET /api/payment-profiles/:paymentProfileId/stripe/status (Super Manager or Admin only).",
    },
    { status: 410 },
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
