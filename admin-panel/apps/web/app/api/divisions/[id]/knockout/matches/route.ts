import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin-auth";

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

// GET /api/divisions/:id/knockout/matches — list knockout matches for the division
export async function GET(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const divisionId = await getIdFromContext(context);
    if (!divisionId) return json({ message: "Missing id" }, { status: 400 });

    const division = await prisma.division.findUnique({
      where: { id: divisionId },
    });
    if (!division) return json({ message: "Not found" }, { status: 404 });

    const matches = await prisma.match.findMany({
      where: { divisionId, stage: "KNOCKOUT" },
      include: {
        teamARegistration: { include: { team: true } },
        teamBRegistration: { include: { team: true } },
        dutyRegistration: { include: { team: true } },
        sets: true,
      },
      orderBy: [{ seedA: "asc" }, { seedB: "asc" }],
    });

    return json(matches, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}
