import { type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../lib/cors";

function parseMonthParam(raw: string | null): "all" | { y: number; m: number } {
  if (!raw || raw === "all" || raw.trim() === "") return "all";
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) return "all";
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(y) || month < 1 || month > 12) return "all";
  return { y, m: month };
}

/**
 * GET /api/payments/paid-registrations?month=YYYY-MM|all
 * Paid event registrations (paymentStatus = PAID). Admin role only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (auth.admin.role !== "ADMIN") {
    return corsJson(req, { message: "Forbidden" }, { status: 403 });
  }

  try {
    const monthParam = parseMonthParam(req.nextUrl.searchParams.get("month"));

    const range =
      monthParam === "all"
        ? null
        : {
            start: new Date(Date.UTC(monthParam.y, monthParam.m - 1, 1, 0, 0, 0, 0)),
            end: new Date(Date.UTC(monthParam.y, monthParam.m, 1, 0, 0, 0, 0)),
          };

    const dateFilter = range
      ? {
          OR: [
            { paidAt: { gte: range.start, lt: range.end } },
            { paidAt: null, createdAt: { gte: range.start, lt: range.end } },
          ],
        }
      : {};

    const rows = await prisma.eventRegistration.findMany({
      where: {
        paymentStatus: "PAID",
        ...dateFilter,
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: {
        member: { select: { id: true, preferredName: true, email: true } },
        event: { select: { id: true, title: true, currency: true } },
      },
    });

    const payload = rows.map((r: (typeof rows)[number]) => ({
      id: r.id,
      memberId: r.memberId,
      memberPreferredName: r.member.preferredName,
      memberEmail: r.member.email,
      eventId: r.calendarEventId,
      eventTitle: r.event.title,
      currency: r.event.currency,
      amountPaidCents: r.amountPaidCents ?? 0,
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return corsJson(req, { data: payload, month: monthParam === "all" ? "all" : `${monthParam.y}-${String(monthParam.m).padStart(2, "0")}` });
  } catch (e: unknown) {
    return corsJson(
      req,
      { message: "Failed to load paid registrations", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
