import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../lib/cors";

function asTournamentType(input: unknown): "CUP" | "LEAGUE" | undefined {
  if (input == null) return undefined;
  const v = String(input).toUpperCase().trim();
  if (v === "CUP") return "CUP";
  if (v === "LEAGUE") return "LEAGUE";
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
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return corsJson(req, { message: "Not found" }, { status: 404 });

    return corsJson(req, tournament, { status: 200 });
  } catch (e: any) {
    return corsJson(
      req,
      { message: "Failed to fetch tournament", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

// PATCH /api/tournaments/:id
export async function PATCH(req: NextRequest, context: any) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        name: body.name ?? body.title,
        type: asTournamentType(body.type) as any,
        location: body.location,
        notes: body.notes,
      },
    });

    return corsJson(req, updated, { status: 200 });
  } catch (e: any) {
    return corsJson(
      req,
      { message: "Failed to update tournament", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

// DELETE /api/tournaments/:id
export async function DELETE(req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);
    // DELETE is typically called without cross-origin credentials; still respond with CORS.
    if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });

    await prisma.tournament.delete({ where: { id } });
    return corsJson(req, { ok: true }, { status: 200 });
  } catch (e: any) {
    return corsJson(
      req,
      { message: "Failed to delete tournament", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}