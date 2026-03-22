import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";

/**
 * POST /api/payment-connect/stripe/disconnect
 * Clears local link to Stripe Connect only (does not delete the Stripe account).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  await prisma.adminUser.update({
    where: { id: auth.admin.id },
    data: {
      stripeConnectedAccountId: null,
      stripeConnectChargesEnabled: false,
    },
  });

  return corsJson(req, { ok: true });
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
