import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";

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

/**
 * GET /api/divisions/:id
 */
export async function GET(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return json({ message: "Missing id" }, { status: 400 });

    const division = await prisma.division.findUnique({
      where: { id },
      include: { tournament: true },
    });
    if (!division) return json({ message: "Not found" }, { status: 404 });

    return json(division, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/divisions/:id
 * Body: { name?, sortOrder? }
 */
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
    const name = body?.name != null ? String(body.name).trim() : undefined;
    const sortOrder = body?.sortOrder != null ? Number(body.sortOrder) : undefined;
    const data: { name?: string; sortOrder?: number } = {};
    if (name !== undefined) data.name = name;
    if (sortOrder !== undefined && Number.isFinite(sortOrder)) data.sortOrder = sortOrder;

    const existing = await prisma.division.findUnique({ where: { id } });
    if (!existing) return json({ message: "Not found" }, { status: 404 });

    if (Object.keys(data).length === 0) return json(existing, { status: 200 });
    const updated = await prisma.division.update({
      where: { id },
      data,
    });

    return json(updated, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/divisions/:id
 * Only allowed if no registrations use this division.
 */
export async function DELETE(
  req: NextRequest,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const id = await getIdFromContext(context);
    if (!id) return json({ message: "Missing id" }, { status: 400 });

    const division = await prisma.division.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    });
    if (!division) return json({ message: "Not found" }, { status: 404 });
    if (division._count.registrations > 0) {
      return json(
        { message: "Cannot delete division that has registrations. Remove or reassign registrations first." },
        { status: 400 }
      );
    }

    await prisma.division.delete({ where: { id } });
    return json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return json({ message, error: message }, { status: 500 });
  }
}
