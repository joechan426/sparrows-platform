import { type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// POST /api/members/:id/credit-adjust
// Body: { deltaCents: number, note?: string }
export async function POST(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CREDITS");
  if (!auth.ok) return withCors(req, auth.response);

  try {
    const memberId = await getIdFromContext(context);
    if (!memberId) return corsJson(req, { message: "Missing member id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const deltaCents = Number(body.deltaCents);
    const note = typeof body.note === "string" ? body.note.trim() : null;
    if (!Number.isInteger(deltaCents) || deltaCents === 0) {
      return corsJson(req, { message: "deltaCents must be a non-zero integer." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, creditCents: true },
      });
      if (!member) return null;

      const nextCredit = member.creditCents + deltaCents;
      if (nextCredit < 0) {
        throw new Error("Insufficient credit balance for this adjustment.");
      }

      const next = await tx.member.update({
        where: { id: memberId },
        data: { creditCents: nextCredit },
        select: { id: true, creditCents: true },
      });
      await tx.memberCreditLedger.create({
        data: {
          memberId,
          deltaCents,
          reason: "MANUAL_ADJUST",
          createdByAdminId: auth.admin.id,
          note: note || "Manual credit adjustment",
        },
      });
      return next;
    });

    if (!updated) return corsJson(req, { message: "Member not found" }, { status: 404 });
    return corsJson(req, { ok: true, memberId: updated.id, creditCents: updated.creditCents }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = msg.includes("Insufficient credit balance") ? 400 : 500;
    return corsJson(req, { message: "Failed to adjust member credit", error: msg }, { status });
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
