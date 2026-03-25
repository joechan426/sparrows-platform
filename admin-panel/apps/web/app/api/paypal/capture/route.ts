import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { capturePayPalOrder, getPayPalAccessTokenWithClientCreds } from "../../../../lib/paypal-server";
import { corsJson, corsOptions } from "../../../../lib/cors";
import { getEventRecipientPayPalRestCreds } from "../../../../lib/paypal-merchant-creds";

/**
 * POST /api/paypal/capture
 * Body: { orderId: string } — call after buyer returns from PayPal approve URL.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) {
      return corsJson(req, { message: "orderId is required" }, { status: 400 });
    }

    const reg = await prisma.eventRegistration.findFirst({
      where: { paypalOrderId: orderId },
      include: { event: true },
    });
    if (!reg) {
      return corsJson(req, { message: "Registration not found for this order" }, { status: 404 });
    }

    if (reg.paymentStatus === "PAID") {
      return corsJson(req, { ok: true, registrationId: reg.id, alreadyCaptured: true });
    }

    const creds = await getEventRecipientPayPalRestCreds(reg.calendarEventId);
    if (!creds) {
      return corsJson(
        req,
        { message: "PayPal credentials missing for event recipient" },
        { status: 400 },
      );
    }
    const token = await getPayPalAccessTokenWithClientCreds(creds);
    if (!token) {
      return corsJson(req, { message: "PayPal credentials invalid for event recipient" }, { status: 503 });
    }

    const result = await capturePayPalOrder(token, orderId);
    if (!result || result.status !== "COMPLETED") {
      return corsJson(req, { message: "PayPal capture failed", details: result }, { status: 400 });
    }

    const amountPaid = reg.event.priceCents ?? reg.amountDueCents ?? 0;
    await prisma.eventRegistration.update({
      where: { id: reg.id },
      data: {
        paymentStatus: "PAID",
        amountPaidCents: amountPaid,
        paymentProvider: "PAYPAL",
        paidAt: new Date(),
      },
    });

    return corsJson(req, { ok: true, registrationId: reg.id });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Capture error", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
