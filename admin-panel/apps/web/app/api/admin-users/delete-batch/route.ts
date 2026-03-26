import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

/**
 * POST /api/admin-users/delete-batch — ADMIN only. Deletes admin users (permissions cascade).
 * Body: { ids: string[] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "any");
  if (!auth.ok) return withCors(req, auth.response);
  if (auth.admin.role !== "ADMIN") {
    return withCors(req, NextResponse.json({ message: "Only Admin can delete admin users" }, { status: 403 }));
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? (body.ids as unknown[]).map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return withCors(
        req,
        NextResponse.json({ message: "ids (non-empty array) is required" }, { status: 400 }),
      );
    }

    if (ids.includes(auth.admin.id)) {
      return withCors(
        req,
        NextResponse.json({ message: "You cannot delete your own account." }, { status: 400 }),
      );
    }

    const targets = await prisma.adminUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true },
    });

    if (targets.length === 0) {
      return withCors(req, NextResponse.json({ message: "No matching users found" }, { status: 404 }));
    }

    const totalAdmins = await prisma.adminUser.count({ where: { role: "ADMIN" } });
    const deletingAdmins = targets.filter((u: { role: string }) => u.role === "ADMIN").length;
    if (totalAdmins - deletingAdmins < 1) {
      return withCors(
        req,
        NextResponse.json(
          { message: "At least one administrator account must remain." },
          { status: 400 },
        ),
      );
    }

    const result = await prisma.adminUser.deleteMany({
      where: { id: { in: targets.map((t: { id: string }) => t.id) } },
    });

    return withCors(
      req,
      NextResponse.json({ success: true, deleted: result.count }, { status: 200 }),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return withCors(
      req,
      NextResponse.json({ message: "Delete admin users failed", error: msg }, { status: 500 }),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
