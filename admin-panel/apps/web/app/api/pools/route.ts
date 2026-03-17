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
 * GET /api/pools?divisionId=...
 * List pools for a division (optional filter).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const divisionId = url.searchParams.get("divisionId");
    const start = Number(url.searchParams.get("_start") ?? "0");
    const end = Number(url.searchParams.get("_end") ?? "25");
    const take =
      Number.isFinite(end - start) && end - start > 0 ? end - start : 25;
    const skip = Number.isFinite(start) && start >= 0 ? start : 0;

    const pools = await prisma.pool.findMany({
      where: divisionId ? { divisionId } : undefined,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      skip,
      take,
    });

    return json(pools);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

/**
 * POST /api/pools
 * Body: { divisionId, name, sortOrder? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const divisionId = body?.divisionId ? String(body.divisionId).trim() : "";
    const name = body?.name != null ? String(body.name).trim() : "";
    const sortOrder = Number(body?.sortOrder);
    const sortOrderVal = Number.isFinite(sortOrder) ? sortOrder : 0;

    if (!divisionId) return json({ message: "Missing divisionId" }, { status: 400 });
    if (!name) return json({ message: "Missing name" }, { status: 400 });

    const division = await prisma.division.findUnique({ where: { id: divisionId } });
    if (!division) return json({ message: "Division not found" }, { status: 400 });

    const created = await prisma.pool.create({
      data: {
        divisionId,
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
