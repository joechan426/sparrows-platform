import { prisma } from "./prisma";

export type PaidRegistrationContext = {
  calendarEventId: string;
  preferredName: string;
  email: string;
  teamName?: string | null;
};

export async function upsertPaidRegistration(params: {
  context: PaidRegistrationContext;
  provider: "STRIPE" | "PAYPAL" | "MANUAL";
  amountPaidCents: number;
  useCredit?: boolean;
  paidAt?: Date;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  paypalOrderId?: string | null;
}) {
  const { context } = params;
  const email = context.email.trim().toLowerCase();
  const preferredName = context.preferredName.trim();
  const teamName =
    context.teamName != null && String(context.teamName).trim().length > 0
      ? String(context.teamName).trim()
      : null;

  if (!context.calendarEventId || !email || !preferredName) {
    throw new Error("Missing paid registration context");
  }

  const event = await prisma.calendarEvent.findUnique({
    where: { id: context.calendarEventId },
  });
  if (!event) throw new Error("Event not found");

  const isSpecial = event.eventType === "SPECIAL";
  if (isSpecial && !teamName) throw new Error("teamName is required for SPECIAL events");
  if (!event.isPaid || !event.priceCents || event.priceCents <= 0) {
    throw new Error("This event does not require payment");
  }

  let member = await prisma.member.findUnique({ where: { email } });
  if (!member) {
    member = await prisma.member.create({
      data: { email, preferredName },
    });
  } else if (member.preferredName !== preferredName) {
    member = await prisma.member.update({
      where: { id: member.id },
      data: { preferredName },
    });
  }

  const existing = await prisma.eventRegistration.findUnique({
    where: {
      memberId_calendarEventId: {
        memberId: member.id,
        calendarEventId: event.id,
      },
    },
  });

  if (existing && (existing.paymentStatus === "PAID" || existing.paymentStatus === "WAIVED")) {
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    let creditAppliedCents = 0;
    if (params.useCredit === true) {
      const freshMember = await tx.member.findUnique({
        where: { id: member.id },
        select: { creditCents: true },
      });
      const price = event.priceCents ?? 0;
      const remainingAfterExternal = Math.max(price - params.amountPaidCents, 0);
      const available = freshMember?.creditCents ?? 0;
      creditAppliedCents = Math.min(available, remainingAfterExternal);
      if (creditAppliedCents > 0) {
        const debited = await tx.member.updateMany({
          where: { id: member.id, creditCents: { gte: creditAppliedCents } },
          data: { creditCents: { decrement: creditAppliedCents } },
        });
        if (debited.count === 1) {
          await tx.memberCreditLedger.create({
            data: {
              memberId: member.id,
              calendarEventId: event.id,
              deltaCents: -creditAppliedCents,
              reason: "REGISTRATION_APPLY",
              note: `Applied credit to paid registration (${params.provider})`,
            },
          });
        } else {
          creditAppliedCents = 0;
        }
      }
    }

    const totalPaid = params.amountPaidCents + creditAppliedCents;
    return tx.eventRegistration.upsert({
      where: {
        memberId_calendarEventId: {
          memberId: member.id,
          calendarEventId: event.id,
        },
      },
      create: {
        memberId: member.id,
        calendarEventId: event.id,
        teamName: teamName ?? undefined,
        status: "PENDING",
        paymentStatus: "PAID",
        amountDueCents: event.priceCents,
        amountPaidCents: totalPaid,
        creditAppliedCents: creditAppliedCents > 0 ? creditAppliedCents : null,
        paymentProvider: params.provider,
        paidAt: params.paidAt ?? new Date(),
        stripeSessionId: params.stripeSessionId ?? null,
        stripePaymentIntentId: params.stripePaymentIntentId ?? null,
        paypalOrderId: params.paypalOrderId ?? null,
      },
      update: {
        teamName: teamName ?? undefined,
        status: "PENDING",
        paymentStatus: "PAID",
        amountDueCents: event.priceCents,
        amountPaidCents: totalPaid,
        creditAppliedCents: creditAppliedCents > 0 ? creditAppliedCents : null,
        paymentProvider: params.provider,
        paidAt: params.paidAt ?? new Date(),
        stripeSessionId: params.stripeSessionId ?? undefined,
        stripePaymentIntentId: params.stripePaymentIntentId ?? undefined,
        paypalOrderId: params.paypalOrderId ?? undefined,
      },
    });
  });
}

