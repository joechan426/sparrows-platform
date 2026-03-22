import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";

/**
 * PATCH /api/admin-auth/me/payment-connections
 * Body: { paypalMerchantId?: string | null }
 * Stripe is only linked via hosted onboarding (no manual secret keys).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  const body = await req.json().catch(() => ({}));

  if (body.paypalMerchantId === undefined) {
    return corsJson(req, { message: "paypalMerchantId is required (string or null)" }, { status: 400 });
  }

  let paypalMerchantId: string | null;
  if (body.paypalMerchantId === null || body.paypalMerchantId === "") {
    paypalMerchantId = null;
  } else if (typeof body.paypalMerchantId === "string") {
    const trimmed = body.paypalMerchantId.trim();
    if (!trimmed) {
      paypalMerchantId = null;
    } else if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return corsJson(req, { message: "paypalMerchantId looks invalid" }, { status: 400 });
    } else {
      paypalMerchantId = trimmed;
    }
  } else {
    return corsJson(req, { message: "paypalMerchantId must be a string or null" }, { status: 400 });
  }

  const updated = await prisma.adminUser.update({
    where: { id: auth.admin.id },
    data: { paypalMerchantId },
    select: {
      paypalMerchantId: true,
      stripeConnectedAccountId: true,
      stripeConnectChargesEnabled: true,
    },
  });

  return corsJson(req, { ok: true, paymentConnections: updated });
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
