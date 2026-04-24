import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// POST /api/event-registrations/:id/refund-credit
export async function POST(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CREDITS");
  if (!auth.ok) return withCors(req, auth.response);

  try {
    const registrationId = await getIdFromContext(context);
    if (!registrationId) return corsJson(req, { message: "Missing registration id" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.findUnique({
        where: { id: registrationId },
        include: { event: true },
      });
      if (!reg) return { status: 404 as const, body: { message: "Registration not found" } };
      if (reg.paymentStatus !== "PAID") {
        return { status: 400 as const, body: { message: "Only paid registrations can be refunded to credit." } };
      }
      if (reg.creditRefundedAt) {
        return { status: 409 as const, body: { message: "Credit already refunded for this registration." } };
      }
      const refundCents = reg.amountPaidCents ?? reg.event.priceCents ?? 0;
      if (!Number.isInteger(refundCents) || refundCents <= 0) {
        return { status: 400 as const, body: { message: "Registration has no refundable paid amount." } };
      }

      const mark = await tx.eventRegistration.updateMany({
        where: { id: reg.id, paymentStatus: "PAID", creditRefundedAt: null },
        data: { creditRefundedAt: new Date() },
      });
      if (mark.count !== 1) {
        return { status: 409 as const, body: { message: "Credit refund already processed." } };
      }

      await tx.member.update({
        where: { id: reg.memberId },
        data: { creditCents: { increment: refundCents } },
      });

      await tx.memberCreditLedger.create({
        data: {
          memberId: reg.memberId,
          registrationId: reg.id,
          calendarEventId: reg.calendarEventId,
          deltaCents: refundCents,
          reason: "EVENT_REFUND",
          createdByAdminId: auth.admin.id,
          note: "Single registration credit refund",
        },
      });

      return { status: 200 as const, body: { ok: true, refundedCents: refundCents, registrationId: reg.id } };
    });

    return corsJson(req, result.body, { status: result.status });
  } catch (e: any) {
    return corsJson(req, { message: "Failed to refund registration credit", error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
