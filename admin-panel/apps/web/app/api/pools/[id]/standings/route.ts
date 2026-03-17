import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireAdminAuth } from "../../../../../lib/admin-auth";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });
}

async function getIdFromContext(
  context: { params?: Promise<{ id?: string }> | { id?: string } }
): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// GET /api/pools/:id/standings
export async function GET(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const poolId = await getIdFromContext(context);
    if (!poolId) return json({ message: "Missing id" }, { status: 400 });

    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        division: { include: { tournament: true } },
      },
    });
    if (!pool) return json({ message: "Not found" }, { status: 404 });

    const registrations = await prisma.tournamentRegistration.findMany({
      where: { poolId, status: "APPROVED" },
      include: { team: true },
    });

    const matches = await prisma.match.findMany({
      where: { poolId, stage: "POOL" },
      include: {
        sets: true,
      },
    });

    const table: Record<
      string,
      {
        registrationId: string;
        teamName: string;
        wins: number;
        losses: number;
        draws: number;
        setsWon: number;
        setsLost: number;
        pointsWon: number;
        pointsLost: number;
      }
    > = {};

    for (const reg of registrations) {
      table[reg.id] = {
        registrationId: reg.id,
        teamName: reg.team?.name ?? "Unknown",
        wins: 0,
        losses: 0,
        draws: 0,
        setsWon: 0,
        setsLost: 0,
        pointsWon: 0,
        pointsLost: 0,
      };
    }

    function setWinner(setNumber: number, teamAScore: number, teamBScore: number): "A" | "B" | null {
      const a = teamAScore;
      const b = teamBScore;
      if (a < 0 || b < 0) return null;
      const margin = Math.abs(a - b);
      if (setNumber <= 2) {
        if (margin >= 2) return a > b ? "A" : "B";
        return null;
      }
      if (setNumber === 3) {
        if ((a >= 8 || b >= 8) && margin >= 2) return a > b ? "A" : "B";
        return null;
      }
      return null;
    }

    for (const m of matches) {
      if (!table[m.teamARegistrationId] || !table[m.teamBRegistrationId]) continue;
      let aSets = 0;
      let bSets = 0;
      let aPoints = 0;
      let bPoints = 0;

      for (const s of m.sets) {
        aPoints += s.teamAScore;
        bPoints += s.teamBScore;
        const winner = setWinner(s.setNumber, s.teamAScore, s.teamBScore);
        if (winner === "A") aSets++;
        else if (winner === "B") bSets++;
      }

      table[m.teamARegistrationId].setsWon += aSets;
      table[m.teamARegistrationId].setsLost += bSets;
      table[m.teamARegistrationId].pointsWon += aPoints;
      table[m.teamARegistrationId].pointsLost += bPoints;

      table[m.teamBRegistrationId].setsWon += bSets;
      table[m.teamBRegistrationId].setsLost += aSets;
      table[m.teamBRegistrationId].pointsWon += bPoints;
      table[m.teamBRegistrationId].pointsLost += aPoints;

      if (aSets === 0 && bSets === 0) continue;
      if (aSets > bSets) {
        table[m.teamARegistrationId].wins++;
        table[m.teamBRegistrationId].losses++;
      } else if (bSets > aSets) {
        table[m.teamBRegistrationId].wins++;
        table[m.teamARegistrationId].losses++;
      } else {
        table[m.teamARegistrationId].draws++;
        table[m.teamBRegistrationId].draws++;
      }
    }

    const standings = Object.values(table).map((row) => {
      const setsTotal = row.setsWon + row.setsLost;
      const pointsTotal = row.pointsWon + row.pointsLost;
      const setPct = setsTotal > 0 ? row.setsWon / setsTotal : 0;
      const pointsPct = pointsTotal > 0 ? row.pointsWon / pointsTotal : 0;
      return { ...row, setPct, pointsPct };
    });

    standings.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.setPct !== a.setPct) return b.setPct - a.setPct;
      if (b.pointsPct !== a.pointsPct) return b.pointsPct - a.pointsPct;
      return a.teamName.localeCompare(b.teamName);
    });

    return json(standings, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

