import { type NextRequest } from "next/server";
import { corsJson, corsOptions } from "../../../../../lib/cors";

/** @deprecated Use POST /api/payment-profiles/:id/stripe/disconnect */
export async function POST(req: NextRequest) {
  return corsJson(
    req,
    {
      message:
        "Deprecated: use POST /api/payment-profiles/:paymentProfileId/stripe/disconnect (Super Manager or Admin only).",
    },
    { status: 410 },
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
