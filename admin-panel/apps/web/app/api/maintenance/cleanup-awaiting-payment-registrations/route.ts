import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

const DEFAULT_MIN_AGE_HOURS = 168; // 7 days
const MIN_ALLOWED_AGE_HOURS = 24;

function parseMinAgeHours(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_MIN_AGE_HOURS;
  return Math.min(Math.max(Math.floor(n), MIN_ALLOWED_AGE_HOURS), 24 * 365);
}

/**
 * POST /api/maintenance/cleanup-awaiting-payment-registrations
 * Removes stale event registrations left in AWAITING_PAYMENT (e.g. legacy checkout flow)
 * that are older than minAgeHours (default 7 days, minimum 24 hours).
 *
 * Body: { minAgeHours?: number, dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);

  try {
    const body = await req.json().catch(() => ({}));
    const minAgeHours = parseMinAgeHours(body.minAgeHours);
    const dryRun = body.dryRun === true;
    const cutoff = new Date(Date.now() - minAgeHours * 60 * 60 * 1000);

    const where = {
      paymentStatus: "AWAITING_PAYMENT" as const,
      createdAt: { lt: cutoff },
    };

    if (dryRun) {
      const wouldDelete = await prisma.eventRegistration.count({ where });
      return withCors(
        req,
        NextResponse.json(
          {
            dryRun: true,
            minAgeHours,
            cutoff: cutoff.toISOString(),
            wouldDelete,
          },
          { status: 200 },
        ),
      );
    }

    const result = await prisma.eventRegistration.deleteMany({ where });

    return withCors(
      req,
      NextResponse.json(
        {
          success: true,
          deletedCount: result.count,
          minAgeHours,
          cutoff: cutoff.toISOString(),
        },
        { status: 200 },
      ),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return withCors(
      req,
      NextResponse.json({ message: "Cleanup failed", error: msg }, { status: 500 }),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
