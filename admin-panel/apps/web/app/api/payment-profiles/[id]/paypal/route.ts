import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth, canManagePaymentProfiles } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";
import {
  clearPaymentProfilePayPalRestCreds,
  setPaymentProfilePayPalRestCreds,
} from "../../../../../lib/paypal-merchant-creds";

async function getProfileId(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const p = await context.params;
  return p?.id ? String(p.id) : undefined;
}

/**
 * PATCH /api/payment-profiles/:id/paypal
 * Body: { paypalRestClientId?: string | null, paypalRestClientSecret?: string | null }
 */
export async function PATCH(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (!canManagePaymentProfiles(auth.admin)) {
    return corsJson(req, { message: "Only Super Manager or Admin can set PayPal credentials" }, { status: 403 });
  }

  const paymentProfileId = await getProfileId(context);
  if (!paymentProfileId) return corsJson(req, { message: "Missing payment profile id" }, { status: 400 });

  const exists = await prisma.paymentProfile.findUnique({ where: { id: paymentProfileId }, select: { id: true } });
  if (!exists) return corsJson(req, { message: "Payment profile not found" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const hasClientId = body.paypalRestClientId !== undefined;
    const hasClientSecret = body.paypalRestClientSecret !== undefined;
    if (hasClientId !== hasClientSecret) {
      return corsJson(
        req,
        { message: "paypalRestClientId and paypalRestClientSecret must be provided together" },
        { status: 400 },
      );
    }

    if (hasClientId) {
      if (body.paypalRestClientId === null || body.paypalRestClientSecret === null) {
        await clearPaymentProfilePayPalRestCreds(paymentProfileId);
      } else if (typeof body.paypalRestClientId === "string" && typeof body.paypalRestClientSecret === "string") {
        const clientId = body.paypalRestClientId.trim();
        const clientSecret = body.paypalRestClientSecret.trim();
        if (!clientId || !clientSecret) {
          return corsJson(req, { message: "paypalRestClientId/Secret cannot be empty" }, { status: 400 });
        }
        await setPaymentProfilePayPalRestCreds({ paymentProfileId, clientId, clientSecret });
      } else {
        return corsJson(
          req,
          { message: "paypalRestClientId and paypalRestClientSecret must be string or null" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.paymentProfile.findUnique({
      where: { id: paymentProfileId },
      select: {
        paypalRestClientIdEnc: true,
        paypalRestClientSecretEnc: true,
      },
    });

    return corsJson(req, {
      paypalRestAppConnected: Boolean(updated?.paypalRestClientIdEnc && updated?.paypalRestClientSecretEnc),
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to update PayPal credentials", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
