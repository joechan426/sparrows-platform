import { type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth, canManagePaymentProfiles } from "../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../lib/cors";

async function getId(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const p = await context.params;
  return p?.id ? String(p.id) : undefined;
}

/** PATCH /api/payment-profiles/:id — Super Manager / Admin; body { nickname? } */
export async function PATCH(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (!canManagePaymentProfiles(auth.admin)) {
    return corsJson(req, { message: "Only Super Manager or Admin can update payment profiles" }, { status: 403 });
  }
  const id = await getId(context);
  if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (!nickname) {
      return corsJson(req, { message: "nickname is required" }, { status: 400 });
    }
    const updated = await prisma.paymentProfile.update({
      where: { id },
      data: { nickname },
      select: { id: true, nickname: true },
    });
    return corsJson(req, updated);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2025") {
      return corsJson(req, { message: "Payment profile not found" }, { status: 404 });
    }
    if ((e as { code?: string }).code === "P2002") {
      return corsJson(req, { message: "This payment nickname is already in use" }, { status: 409 });
    }
    return corsJson(
      req,
      { message: "Failed to update payment profile", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
