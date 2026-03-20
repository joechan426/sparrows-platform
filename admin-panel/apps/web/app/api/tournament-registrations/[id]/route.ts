import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";

type AllowedRegistrationStatus = "APPROVED" | "REJECTED";
const ALLOWED_STATUSES: AllowedRegistrationStatus[] = ["APPROVED", "REJECTED"];

function asAllowedStatus(input: unknown): AllowedRegistrationStatus | null {
  if (input == null) return null;
  const v = String(input).toUpperCase().trim();
  if (v === "APPROVED") return "APPROVED";
  if (v === "REJECTED") return "REJECTED";
  return null;
}

async function getIdFromContext(context: { params?: Promise<{ id?: string }> | { id?: string } }): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

/**
 * PATCH /api/tournament-registrations/:id
 * Body: { status?: "APPROVED" | "REJECTED", poolId?: string | null }
 * - status: only APPROVED, REJECTED
 * - poolId: assign to pool (only if registration is APPROVED; pool must be in same division); null to remove from pool
 */
export async function PATCH(req: NextRequest, context: { params?: Promise<{ id?: string }> | { id?: string } }) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const status = asAllowedStatus(body?.status);
    const poolIdParam = body?.poolId;
    const poolId = poolIdParam === undefined ? undefined : poolIdParam === null ? null : String(poolIdParam).trim() || null;
    const divisionIdParam = body?.divisionId;
    const divisionId = divisionIdParam === undefined ? undefined : divisionIdParam ? String(divisionIdParam).trim() : undefined;

    const existing = await prisma.tournamentRegistration.findUnique({
      where: { id },
      include: { division: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "Registration not found" }, { status: 404 });
    }

    const data: { status?: AllowedRegistrationStatus; poolId?: string | null; divisionId?: string } = {};
    if (status !== null) data.status = status;
    if (divisionId !== undefined && divisionId !== existing.divisionId) {
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: { tournamentId: true },
      });
      if (!division) return NextResponse.json({ message: "Division not found" }, { status: 400 });
      if (division.tournamentId !== existing.tournamentId) {
        return NextResponse.json({ message: "Division must belong to this tournament" }, { status: 400 });
      }
      data.divisionId = divisionId;
      data.poolId = null;
    }
    if (poolId !== undefined) {
      if (poolId !== null) {
        if (existing.status !== "APPROVED") {
          return NextResponse.json(
            { message: "Only APPROVED registrations can be assigned to a pool" },
            { status: 400 }
          );
        }
        const pool = await prisma.pool.findUnique({
          where: { id: poolId },
          select: { divisionId: true },
        });
        if (!pool) return NextResponse.json({ message: "Pool not found" }, { status: 400 });
        const effectiveDivisionId = data.divisionId ?? existing.divisionId;
        if (pool.divisionId !== effectiveDivisionId) {
          return NextResponse.json(
            { message: "Pool must belong to the same division as the registration" },
            { status: 400 }
          );
        }
      }
      data.poolId = poolId;
    }

    if (Object.keys(data).length === 0) {
      const current = await prisma.tournamentRegistration.findUnique({
        where: { id },
        include: { team: true, tournament: true, division: true, pool: true },
      });
      return NextResponse.json(current ?? { message: "Not found" }, { status: 200 });
    }

    const updated = await prisma.tournamentRegistration.update({
      where: { id },
      data,
      include: {
        team: true,
        tournament: true,
        division: true,
        pool: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return NextResponse.json({ message: "Failed to update registration", error: message }, { status: 500 });
  }
}
