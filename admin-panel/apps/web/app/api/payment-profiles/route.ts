import { type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth, canManagePaymentProfiles } from "../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../lib/cors";

function mapProfile(p: {
  id: string;
  nickname: string;
  stripeConnectedAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
  paypalRestClientIdEnc: string | null;
  paypalRestClientSecretEnc: string | null;
}) {
  return {
    id: p.id,
    nickname: p.nickname,
    stripeConnected: Boolean(p.stripeConnectedAccountId),
    stripeChargesEnabled: p.stripeConnectChargesEnabled,
    paypalRestAppConnected: Boolean(p.paypalRestClientIdEnc && p.paypalRestClientSecretEnc),
  };
}

/** GET /api/payment-profiles — nicknames for event payout picker; Super Manager / Admin without calendar module can still list. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (
    !canManagePaymentProfiles(auth.admin) &&
    !auth.admin.permissions.includes("CALENDAR_EVENTS")
  ) {
    return corsJson(req, { message: "No access to payment profiles" }, { status: 403 });
  }
  try {
    const rows = await prisma.paymentProfile.findMany({
      orderBy: { nickname: "asc" },
      select: {
        id: true,
        nickname: true,
        stripeConnectedAccountId: true,
        stripeConnectChargesEnabled: true,
        paypalRestClientIdEnc: true,
        paypalRestClientSecretEnc: true,
      },
    });
    return corsJson(req, rows.map(mapProfile));
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to list payment profiles", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** POST /api/payment-profiles — Super Manager / Admin only; body { nickname }. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (!canManagePaymentProfiles(auth.admin)) {
    return corsJson(req, { message: "Only Super Manager or Admin can create payment profiles" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (!nickname) {
      return corsJson(req, { message: "nickname is required" }, { status: 400 });
    }
    const created = await prisma.paymentProfile.create({
      data: {
        nickname,
        createdByAdminId: auth.admin.id,
      },
      select: {
        id: true,
        nickname: true,
        stripeConnectedAccountId: true,
        stripeConnectChargesEnabled: true,
        paypalRestClientIdEnc: true,
        paypalRestClientSecretEnc: true,
      },
    });
    return corsJson(req, mapProfile(created), { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return corsJson(req, { message: "This payment nickname is already in use" }, { status: 409 });
    }
    return corsJson(
      req,
      { message: "Failed to create payment profile", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
