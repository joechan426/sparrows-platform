import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { MatchStatus } from "@prisma/client";

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

// GET /api/matches/:id
export async function GET(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return json({ message: "Missing id" }, { status: 400 });

    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        teamARegistration: { include: { team: true } },
        teamBRegistration: { include: { team: true } },
        dutyRegistration: { include: { team: true } },
        sets: true,
      },
    });
    if (!match) return json({ message: "Not found" }, { status: 404 });

    return json(match, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

// PATCH /api/matches/:id
// Body: { courtName?, scheduledAt?, dutyRegistrationId?, sets?: [{ id?, setNumber, teamAScore, teamBScore }] }
export async function PATCH(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return json({ message: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const setsInput: { id?: string; setNumber: number; teamAScore: number; teamBScore: number }[] =
      Array.isArray(body?.sets) ? body.sets : [];

    for (const s of setsInput) {
      const a = Number(s.teamAScore) ?? 0;
      const b = Number(s.teamBScore) ?? 0;
      if (a < 0 || b < 0) {
        return json({ message: "Scores cannot be negative." }, { status: 400 });
      }
    }

    function setWinner(setNumber: number, teamAScore: number, teamBScore: number): "A" | "B" | null {
      const a = teamAScore;
      const b = teamBScore;
      if (a < 0 || b < 0) return null;
      const margin = Math.abs(a - b);
      if (setNumber <= 2) return margin >= 2 ? (a > b ? "A" : "B") : null;
      if (setNumber === 3) return (a >= 8 || b >= 8) && margin >= 2 ? (a > b ? "A" : "B") : null;
      return null;
    }

    const set1 = setsInput.find((s) => s.setNumber === 1);
    const set2 = setsInput.find((s) => s.setNumber === 2);
    const set3 = setsInput.find((s) => s.setNumber === 3);
    if (set1 && set2 && set3) {
      const w1 = setWinner(1, Number(set1.teamAScore) || 0, Number(set1.teamBScore) || 0);
      const w2 = setWinner(2, Number(set2.teamAScore) || 0, Number(set2.teamBScore) || 0);
      const hasSet3Scores = (Number(set3.teamAScore) || 0) > 0 || (Number(set3.teamBScore) || 0) > 0;
      if (w1 && w2 && w1 === w2 && hasSet3Scores) {
        return json(
          { message: "Set 3 cannot have scores when one team has already won Set 1 and Set 2." },
          { status: 400 }
        );
      }
    }

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) return json({ message: "Not found" }, { status: 404 });

    const data: {
      courtName?: string | null;
      scheduledAt?: Date | null;
      dutyRegistrationId?: string | null;
      status?: MatchStatus;
    } = {};

    if (body.courtName !== undefined) {
      data.courtName = body.courtName === null ? null : String(body.courtName);
    }
    if (body.scheduledAt !== undefined) {
      data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }
    if (body.dutyRegistrationId !== undefined) {
      data.dutyRegistrationId = body.dutyRegistrationId
        ? String(body.dutyRegistrationId)
        : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (setsInput.length > 0) {
        await tx.matchSet.deleteMany({ where: { matchId: id } });
        for (const s of setsInput) {
          const setNumber = Number(s.setNumber) || 0;
          if (setNumber <= 0) continue;
          await tx.matchSet.create({
            data: {
              matchId: id,
              setNumber,
              teamAScore: Number(s.teamAScore) || 0,
              teamBScore: Number(s.teamBScore) || 0,
            },
          });
        }
        data.status = MatchStatus.COMPLETED;
      }

      const updatedMatch = await tx.match.update({
        where: { id },
        data,
        include: {
          teamARegistration: { include: { team: true } },
          teamBRegistration: { include: { team: true } },
          dutyRegistration: { include: { team: true } },
          sets: true,
        },
      });

      return updatedMatch;
    });

    return json(updated, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message: "Failed to update match", error: message }, { status: 500 });
  }
}

