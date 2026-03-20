import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

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

// GET /api/teams/:id
export async function GET(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TEAMS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) return withCors(req, json({ message: "Missing id" }, { status: 400 }));

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return withCors(req, json({ message: "Not found" }, { status: 404 }));

    return withCors(req, json(team, { status: 200 }));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return withCors(
      req,
      json({ message: "Failed to fetch team", error: message }, { status: 500 })
    );
  }
}

// PATCH /api/teams/:id — update team name
export async function PATCH(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TEAMS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const id = await getIdFromContext(context);
    if (!id) return withCors(req, json({ message: "Missing id" }, { status: 400 }));

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    if (name === undefined) return withCors(req, json({ message: "Missing name" }, { status: 400 }));

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return withCors(req, json({ message: "Not found" }, { status: 404 }));

    const updated = await prisma.team.update({
      where: { id },
      data: { name },
    });

    return withCors(req, json(updated, { status: 200 }));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return withCors(
      req,
      json({ message: "Failed to update team", error: message }, { status: 500 })
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
