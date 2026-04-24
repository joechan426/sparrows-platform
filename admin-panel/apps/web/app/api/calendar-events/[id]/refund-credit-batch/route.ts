import { type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../../lib/cors";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// POST /api/calendar-events/:id/refund-credit-batch
export async function POST(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "CREDITS");
  if (!auth.ok) return withCors(req, auth.response);

  try {
    const calendarEventId = await getIdFromContext(context);
    if (!calendarEventId) return corsJson(req, { message: "Missing calendar event id" }, { status: 400 });

    const regs = await prisma.eventRegistration.findMany({
      where: { calendarEventId, paymentStatus: "PAID", creditRefundedAt: null },
      select: { id: true, memberId: true, calendarEventId: true, amountPaidCents: true },
    });

    if (regs.length === 0) {
      return corsJson(req, { ok: true, refundedCount: 0, refundedCents: 0 }, { status: 200 });
    }

    const regIds = regs.map((r) => r.id);
    const refundable = regs
      .map((r) => ({ ...r, cents: r.amountPaidCents ?? 0 }))
      .filter((r) => Number.isInteger(r.cents) && r.cents > 0);

    const result = await prisma.$transaction(async (tx) => {
      const mark = await tx.eventRegistration.updateMany({
        where: { id: { in: regIds }, paymentStatus: "PAID", creditRefundedAt: null },
        data: { creditRefundedAt: new Date() },
      });
      if (mark.count === 0) return { refundedCount: 0, refundedCents: 0 };

      let refundedCount = 0;
      let refundedCents = 0;
      for (const row of refundable) {
        const current = await tx.eventRegistration.findUnique({
          where: { id: row.id },
          select: { creditRefundedAt: true },
        });
        if (!current?.creditRefundedAt) continue;

        await tx.member.update({
          where: { id: row.memberId },
          data: { creditCents: { increment: row.cents } },
        });
        await tx.memberCreditLedger.create({
          data: {
            memberId: row.memberId,
            registrationId: row.id,
            calendarEventId: row.calendarEventId,
            deltaCents: row.cents,
            reason: "EVENT_REFUND",
            createdByAdminId: auth.admin.id,
            note: "Batch event credit refund",
          },
        });
        refundedCount += 1;
        refundedCents += row.cents;
      }

      return { refundedCount, refundedCents };
    });

    return corsJson(req, { ok: true, ...result }, { status: 200 });
  } catch (e: any) {
    return corsJson(req, { message: "Failed to refund event credits", error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
