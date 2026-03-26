import { type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../lib/cors";

async function getId(context: { params?: Promise<{ id: string }> }): Promise<string | undefined> {
  const p = await context.params;
  return p?.id ? String(p.id) : undefined;
}

/** PATCH /api/payment-profiles/:id — body { nickname?, isActive? } */
export async function PATCH(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "PAYMENT_PROFILES");
  if (!auth.ok) return withCors(req, auth.response);
  const id = await getId(context);
  if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const data: { nickname?: string; isActive?: boolean } = {};

    if (typeof body.nickname === "string") {
      const nickname = body.nickname.trim();
      if (!nickname) {
        return corsJson(req, { message: "nickname cannot be empty" }, { status: 400 });
      }
      data.nickname = nickname;
    }
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }

    if (Object.keys(data).length === 0) {
      return corsJson(req, { message: "Provide nickname and/or isActive" }, { status: 400 });
    }

    const updated = await prisma.paymentProfile.update({
      where: { id },
      data,
      select: { id: true, nickname: true, isActive: true },
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

/** DELETE /api/payment-profiles/:id — blocked if any event references this profile. */
export async function DELETE(req: NextRequest, context: { params?: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "PAYMENT_PROFILES");
  if (!auth.ok) return withCors(req, auth.response);
  const id = await getId(context);
  if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });
  try {
    const inUse = await prisma.calendarEvent.count({
      where: { paymentProfileId: id },
    });
    if (inUse > 0) {
      return corsJson(
        req,
        {
          message: `Cannot delete: ${inUse} event(s) still use this payment profile. Change or clear them first.`,
        },
        { status: 409 },
      );
    }
    await prisma.paymentProfile.delete({ where: { id } });
    return corsJson(req, { ok: true });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2025") {
      return corsJson(req, { message: "Payment profile not found" }, { status: 404 });
    }
    return corsJson(
      req,
      { message: "Failed to delete payment profile", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
