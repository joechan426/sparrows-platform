import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { capturePayPalOrder, getPayPalAccessTokenWithClientCreds } from "../../../../lib/paypal-server";
import { corsJson, corsOptions } from "../../../../lib/cors";
import { getEventPaymentProfilePayPalRestCreds } from "../../../../lib/paypal-merchant-creds";
import { upsertPaidRegistration } from "../../../../lib/paid-registration";

/**
 * POST /api/paypal/capture
 * Body: { orderId: string } — call after buyer returns from PayPal approve URL.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const calendarEventId =
      typeof body.calendarEventId === "string" ? body.calendarEventId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const preferredName = typeof body.preferredName === "string" ? body.preferredName.trim() : "";
    const teamName =
      typeof body.teamName === "string" && body.teamName.trim().length > 0 ? body.teamName.trim() : null;
    if (!orderId) {
      return corsJson(req, { message: "orderId is required" }, { status: 400 });
    }

    const reg = await prisma.eventRegistration.findFirst({
      where: { paypalOrderId: orderId },
      include: { event: true },
    });
    if (reg?.paymentStatus === "PAID") {
      return corsJson(req, { ok: true, registrationId: reg.id, alreadyCaptured: true });
    }

    const eventIdForCreds = reg?.calendarEventId ?? calendarEventId;
    if (!eventIdForCreds) {
      return corsJson(req, { message: "calendarEventId is required for capture context" }, { status: 400 });
    }
    const creds = await getEventPaymentProfilePayPalRestCreds(eventIdForCreds);
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

    if (reg) {
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
    }

    if (!calendarEventId || !email || !preferredName) {
      return corsJson(
        req,
        { message: "Missing context for creating registration from PayPal capture" },
        { status: 400 },
      );
    }
    const amountPaid = (() => {
      const captureUnit = (result as any)?.purchase_units?.[0]?.payments?.captures?.[0];
      const value = Number(captureUnit?.amount?.value);
      return Number.isFinite(value) ? Math.round(value * 100) : 0;
    })();
    const created = await upsertPaidRegistration({
      context: { calendarEventId, email, preferredName, teamName },
      provider: "PAYPAL",
      amountPaidCents: amountPaid,
      paypalOrderId: orderId,
    });

    return corsJson(req, { ok: true, registrationId: created.id });
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
