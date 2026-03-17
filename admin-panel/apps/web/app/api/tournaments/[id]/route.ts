import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { TournamentType } from "@prisma/client";

function asTournamentType(input: unknown): TournamentType | undefined {
  if (input == null) return undefined;
  const v = String(input).toUpperCase().trim();
  if (v === "CUP") return TournamentType.CUP;
  if (v === "LEAGUE") return TournamentType.LEAGUE;
  return undefined;
}

async function getIdFromContext(context: any): Promise<string | undefined> {
  // Some Next.js versions pass `params` as a Promise.
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// GET /api/tournaments/:id
export async function GET(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return NextResponse.json({ message: "Not found" }, { status: 404 });

    return NextResponse.json(tournament, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to fetch tournament", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

// PATCH /api/tournaments/:id
export async function PATCH(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        name: body.name ?? body.title,
        type: asTournamentType(body.type),
        location: body.location,
        notes: body.notes,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to update tournament", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

// DELETE /api/tournaments/:id
export async function DELETE(_req: Request, context: any) {
  try {
    const id = await getIdFromContext(context);
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    await prisma.tournament.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to delete tournament", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, HEAD, OPTIONS, PATCH, DELETE" },
  });
}