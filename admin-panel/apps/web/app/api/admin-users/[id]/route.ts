import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsJson, corsOptions } from "../../../../lib/cors";
import { normalizeAdminHiddenNavList, parseHiddenNavFromDb } from "../../../../lib/admin-hidden-nav";

const SALT_ROUNDS = 10;

// GET /api/admin-users/:id — get one admin user (ADMIN only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminAuth(req, null);
  if (!result.ok) return withCors(req, result.response);
  const { id } = await params;
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id },
      include: { permissions: { select: { module: true } } },
    });
    if (!admin)
      return corsJson(req, { message: "Admin user not found" }, { status: 404 });
    const viewer = result.admin;
    const includeHiddenNav =
      viewer.id === id && admin.role === "ADMIN";
    return corsJson(req, {
      id: admin.id,
      userName: admin.userName,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      permissions: admin.permissions.map((p: { module: string }) => p.module),
      ...(includeHiddenNav
        ? { hiddenNavResources: parseHiddenNavFromDb(admin.hiddenNavResources) }
        : {}),
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      {
        message: "Failed to fetch admin user",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

// PATCH /api/admin-users/:id — update isActive, permissions, and/or password (ADMIN only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminAuth(req, null);
  if (!result.ok) return withCors(req, result.response);
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const data = body.data ?? body;
    const updates: {
      isActive?: boolean;
      userName?: string;
      passwordHash?: string;
      permissions?: { deleteMany: {}; create: { module: string }[] };
      hiddenNavResources?: unknown;
    } = {};

    if (typeof data.isActive === "boolean") updates.isActive = data.isActive;
    const newUserName = typeof data.userName === "string" ? data.userName.trim() : "";
    if (newUserName.length > 0) {
      const existing = await prisma.adminUser.findFirst({ where: { userName: newUserName } });
      if (existing && existing.id !== id) {
        return corsJson(req, { message: "This user name is already in use" }, { status: 409 });
      }
      updates.userName = newUserName;
    }
    const newPassword = typeof data.newPassword === "string" ? data.newPassword.trim() : "";
    if (newPassword.length > 0) {
      const { validateAdminPassword } = await import("../../../../lib/password-rules");
      const valid = validateAdminPassword(newPassword);
      if (!valid.ok) return corsJson(req, { message: valid.message }, { status: 400 });
      updates.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }
    if (Array.isArray(data.permissions)) {
      const modules = data.permissions.filter(
        (p: string) => ["TOURNAMENTS", "TEAMS", "CALENDAR_EVENTS", "MEMBERS"].includes(p)
      );
      updates.permissions = {
        deleteMany: {},
        create: modules.map((module: string) => ({ module })),
      };
    }

    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) return corsJson(req, { message: "Admin user not found" }, { status: 404 });

    // Only an ADMIN may update their own hidden-nav list, and only when editing their own record.
    if (
      result.admin.id === id &&
      target.role === "ADMIN" &&
      data.hiddenNavResources !== undefined &&
      Array.isArray(data.hiddenNavResources)
    ) {
      updates.hiddenNavResources = normalizeAdminHiddenNavList(data.hiddenNavResources);
    }

    const admin = await prisma.adminUser.update({
      where: { id },
      // TS: Prisma expects `AdminModule` enum; we store/validate module strings and cast
      // to keep runtime behavior while avoiding enum export inconsistencies across prisma builds.
      data: updates as any,
      include: { permissions: { select: { module: true } } },
    });

    const responseBody: Record<string, unknown> = {
      id: admin.id,
      userName: admin.userName,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      permissions: admin.permissions.map((p: { module: string }) => p.module),
    };
    if (admin.role === "ADMIN" && result.admin.id === id) {
      responseBody.hiddenNavResources = parseHiddenNavFromDb(admin.hiddenNavResources);
    }

    return corsJson(req, responseBody);
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2025")
      return corsJson(req, { message: "Admin user not found" }, { status: 404 });
    return corsJson(
      req,
      {
        message: "Failed to update admin user",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
