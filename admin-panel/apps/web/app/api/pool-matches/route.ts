import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });
}

// GET /api/pool-matches?poolId=...
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const poolId = url.searchParams.get("poolId");
    if (!poolId) return json({ message: "Missing poolId" }, { status: 400 });

    const matches = await prisma.match.findMany({
      where: { poolId, stage: "POOL" },
      include: {
        teamARegistration: { include: { team: true } },
        teamBRegistration: { include: { team: true } },
        dutyRegistration: { include: { team: true } },
        sets: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return json(matches);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

// POST /api/pool-matches/generate { poolId }
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const poolId = body?.poolId ? String(body.poolId).trim() : "";
    if (!poolId) return json({ message: "Missing poolId" }, { status: 400 });

    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      include: { division: { include: { tournament: true } } },
    });
    if (!pool) return json({ message: "Pool not found" }, { status: 400 });

    const existingMatches = await prisma.match.count({
      where: { poolId, stage: "POOL" },
    });
    if (existingMatches > 0) {
      return json(
        { message: "Matches already exist for this pool. Regeneration is not supported yet." },
        { status: 400 }
      );
    }

    const registrations = await prisma.tournamentRegistration.findMany({
      where: { poolId, status: "APPROVED" },
      include: { team: true },
      orderBy: { createdAt: "asc" },
    });

    if (registrations.length < 2) {
      return json({ message: "At least 2 teams are required to generate matches." }, { status: 400 });
    }

    const pairs: { aId: string; bId: string }[] = [];
    for (let i = 0; i < registrations.length; i++) {
      const regA = registrations[i];
      if (!regA) continue;
      for (let j = i + 1; j < registrations.length; j++) {
        const regB = registrations[j];
        if (!regB) continue;
        pairs.push({ aId: regA.id, bId: regB.id });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const createdMatches = [];
      for (const pair of pairs) {
        const match = await tx.match.create({
          data: {
            tournamentId: pool.division.tournamentId,
            divisionId: pool.divisionId,
            poolId: pool.id,
            stage: "POOL",
            teamARegistrationId: pair.aId,
            teamBRegistrationId: pair.bId,
            status: "SCHEDULED",
          },
        });
        createdMatches.push(match);
      }
      return createdMatches;
    });

    return json({ createdCount: created.length }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

