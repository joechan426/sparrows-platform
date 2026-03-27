import { prisma } from "./prisma";

export type PaidRegistrationContext = {
  calendarEventId: string;
  preferredName: string;
  email: string;
  teamName?: string | null;
};

export async function upsertPaidRegistration(params: {
  context: PaidRegistrationContext;
  provider: "STRIPE" | "PAYPAL";
  amountPaidCents: number;
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

  return prisma.eventRegistration.upsert({
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
      amountPaidCents: params.amountPaidCents,
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
      amountPaidCents: params.amountPaidCents,
      paymentProvider: params.provider,
      paidAt: params.paidAt ?? new Date(),
      stripeSessionId: params.stripeSessionId ?? undefined,
      stripePaymentIntentId: params.stripePaymentIntentId ?? undefined,
      paypalOrderId: params.paypalOrderId ?? undefined,
    },
  });
}

