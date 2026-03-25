import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";
import { clearAdminPayPalRestCreds, setAdminPayPalRestCreds } from "../../../../../lib/paypal-merchant-creds";

/**
 * PATCH /api/admin-auth/me/payment-connections
 * Body: {
 *  paypalMerchantId?: string | null,
 *  paypalRestClientId?: string | null,
 *  paypalRestClientSecret?: string | null
 * }
 * Stripe is only linked via hosted onboarding (no manual secret keys).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};

  if (body.paypalMerchantId !== undefined) {
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
    patch.paypalMerchantId = paypalMerchantId;
  }

  const hasClientId = body.paypalRestClientId !== undefined;
  const hasClientSecret = body.paypalRestClientSecret !== undefined;
  if (hasClientId || hasClientSecret) {
    if (!hasClientId || !hasClientSecret) {
      return corsJson(
        req,
        { message: "paypalRestClientId and paypalRestClientSecret must be provided together" },
        { status: 400 },
      );
    }
    if (body.paypalRestClientId === null || body.paypalRestClientSecret === null) {
      await clearAdminPayPalRestCreds(auth.admin.id);
    } else if (typeof body.paypalRestClientId === "string" && typeof body.paypalRestClientSecret === "string") {
      const clientId = body.paypalRestClientId.trim();
      const clientSecret = body.paypalRestClientSecret.trim();
      if (!clientId || !clientSecret) {
        return corsJson(req, { message: "paypalRestClientId/Secret cannot be empty" }, { status: 400 });
      }
      // Will encrypt at rest. Requires PAYPAL_CREDENTIALS_ENCRYPTION_KEY in env.
      await setAdminPayPalRestCreds({ adminId: auth.admin.id, clientId, clientSecret });
    } else {
      return corsJson(
        req,
        { message: "paypalRestClientId and paypalRestClientSecret must be string or null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(patch).length > 0) {
    await prisma.adminUser.update({
      where: { id: auth.admin.id },
      data: patch as any,
    });
  }

  const updated = await prisma.adminUser.findUnique({
    where: { id: auth.admin.id },
    select: {
      paypalMerchantId: true,
      paypalRestClientIdEnc: true,
      paypalRestClientSecretEnc: true,
      stripeConnectedAccountId: true,
      stripeConnectChargesEnabled: true,
    },
  });

  return corsJson(req, {
    ok: true,
    paymentConnections: {
      stripeConnectedAccountId: updated?.stripeConnectedAccountId ?? null,
      stripeConnectChargesEnabled: updated?.stripeConnectChargesEnabled ?? false,
      paypalMerchantId: updated?.paypalMerchantId ?? null,
      paypalRestAppConnected: Boolean(updated?.paypalRestClientIdEnc && updated?.paypalRestClientSecretEnc),
    },
  });
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
