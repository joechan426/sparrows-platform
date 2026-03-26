import { type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../lib/cors";

function mapProfile(p: {
  id: string;
  nickname: string;
  isActive: boolean;
  stripeConnectedAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
  paypalRestClientIdEnc: string | null;
  paypalRestClientSecretEnc: string | null;
}) {
  return {
    id: p.id,
    nickname: p.nickname,
    isActive: p.isActive,
    stripeConnected: Boolean(p.stripeConnectedAccountId),
    stripeChargesEnabled: p.stripeConnectChargesEnabled,
    paypalRestAppConnected: Boolean(p.paypalRestClientIdEnc && p.paypalRestClientSecretEnc),
  };
}

/**
 * GET /api/payment-profiles
 * - ?forEventPicker=1 — managers: only active profiles (needs CALENDAR_EVENTS).
 * — Full list — needs PAYMENT_PROFILES (or Admin implicit).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forEventPicker = url.searchParams.get("forEventPicker") === "1";

  try {
    if (forEventPicker) {
      const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
      if (!auth.ok) return withCors(req, auth.response);
      const rows = await prisma.paymentProfile.findMany({
        where: { isActive: true },
        orderBy: { nickname: "asc" },
        select: {
          id: true,
          nickname: true,
          isActive: true,
          stripeConnectedAccountId: true,
          stripeConnectChargesEnabled: true,
          paypalRestClientIdEnc: true,
          paypalRestClientSecretEnc: true,
        },
      });
      return corsJson(req, rows.map(mapProfile));
    }

    const auth = await requireAdminAuth(req, "PAYMENT_PROFILES");
    if (!auth.ok) return withCors(req, auth.response);
    const rows = await prisma.paymentProfile.findMany({
      orderBy: { nickname: "asc" },
      select: {
        id: true,
        nickname: true,
        isActive: true,
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

/** POST /api/payment-profiles — body { nickname }. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "PAYMENT_PROFILES");
  if (!auth.ok) return withCors(req, auth.response);
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
        isActive: body.isActive === false ? false : true,
      },
      select: {
        id: true,
        nickname: true,
        isActive: true,
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
