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

/**
 * GET /api/divisions?tournamentId=...
 * List divisions for a tournament (optional filter).
 */
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

    const divisions = await prisma.division.findMany({
      where: tournamentId ? { tournamentId } : undefined,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      skip,
      take,
    });

    return json(divisions);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

/**
 * POST /api/divisions
 * Body: { tournamentId, name, sortOrder? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const tournamentId = body?.tournamentId ? String(body.tournamentId).trim() : "";
    const name = body?.name != null ? String(body.name).trim() : "";
    const sortOrder = Number(body?.sortOrder);
    const sortOrderVal = Number.isFinite(sortOrder) ? sortOrder : 0;

    if (!tournamentId) return json({ message: "Missing tournamentId" }, { status: 400 });
    if (!name) return json({ message: "Missing name" }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return json({ message: "Tournament not found" }, { status: 400 });

    const created = await prisma.division.create({
      data: {
        tournamentId,
        name,
        sortOrder: sortOrderVal,
      },
    });

    return json(created, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}
