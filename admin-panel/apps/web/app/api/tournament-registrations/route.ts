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

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);

    const tournamentId = url.searchParams.get("tournamentId");
    const start = Number(url.searchParams.get("_start") ?? "0");
    const end = Number(url.searchParams.get("_end") ?? "25");
    const take =
      Number.isFinite(end - start) && end - start > 0 ? end - start : 25;
    const skip = Number.isFinite(start) && start >= 0 ? start : 0;

    const registrations = await prisma.tournamentRegistration.findMany({
      where: tournamentId ? { tournamentId } : undefined,
      include: {
        team: true,
        tournament: true,
        division: true,
        pool: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });

    return json(registrations);
  } catch (e: any) {
    return json({ message: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();

    const tournamentId = body?.tournamentId ? String(body.tournamentId).trim() : "";
    const teamId = body?.teamId ? String(body.teamId).trim() : "";
    const divisionId = body?.divisionId ? String(body.divisionId).trim() : "";

    if (!tournamentId) return json({ message: "Missing tournamentId" }, { status: 400 });
    if (!teamId) return json({ message: "Missing teamId" }, { status: 400 });
    if (!divisionId) return json({ message: "Missing divisionId" }, { status: 400 });

    const division = await prisma.division.findUnique({
      where: { id: divisionId },
      select: { id: true, tournamentId: true },
    });
    if (!division) return json({ message: "Division not found" }, { status: 400 });
    if (division.tournamentId !== tournamentId) {
      return json({ message: "Division does not belong to this tournament" }, { status: 400 });
    }

    const existing = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId } },
    });
    if (existing) {
      return json({ message: "This team is already registered for this tournament" }, { status: 400 });
    }

    const created = await prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        teamId,
        divisionId,
        status: "PENDING",
      },
      include: {
        team: true,
        tournament: true,
        division: true,
        pool: true,
      },
    });

    return json(created, { status: 201 });
  } catch (e: any) {
    return json({ message: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}