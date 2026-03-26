import { type NextRequest } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { requireAdminAuth, canManagePaymentProfiles } from "../../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../../lib/cors";

async function getProfileId(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const p = await context.params;
  return p?.id ? String(p.id) : undefined;
}

/** POST /api/payment-profiles/:id/stripe/disconnect */
export async function POST(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (!canManagePaymentProfiles(auth.admin)) {
    return corsJson(req, { message: "Only Super Manager or Admin can disconnect Stripe" }, { status: 403 });
  }

  const paymentProfileId = await getProfileId(context);
  if (!paymentProfileId) return corsJson(req, { message: "Missing payment profile id" }, { status: 400 });

  try {
    await prisma.paymentProfile.update({
      where: { id: paymentProfileId },
      data: {
        stripeConnectedAccountId: null,
        stripeConnectChargesEnabled: false,
      },
    });
    return corsJson(req, { ok: true });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2025") {
      return corsJson(req, { message: "Payment profile not found" }, { status: 404 });
    }
    return corsJson(
      req,
      { message: "Failed to disconnect Stripe", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
