import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import type { AdminModule } from "@prisma/client";

const SALT_ROUNDS = 10;

// GET /api/admin-users/:id — get one admin user (ADMIN only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminAuth(req, null);
  if (!result.ok) return result.response;
  const { id } = await params;
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id },
      include: { permissions: { select: { module: true } } },
    });
    if (!admin) return NextResponse.json({ message: "Admin user not found" }, { status: 404 });
    return NextResponse.json({
      id: admin.id,
      userName: admin.userName,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      permissions: admin.permissions.map((p) => p.module),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { message: "Failed to fetch admin user", error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// PATCH /api/admin-users/:id — update isActive, permissions, and/or password (ADMIN only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminAuth(req, null);
  if (!result.ok) return result.response;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const data = body.data ?? body;
    const updates: {
      isActive?: boolean;
      userName?: string;
      passwordHash?: string;
      permissions?: { deleteMany: {}; create: { module: AdminModule }[] };
    } = {};

    if (typeof data.isActive === "boolean") updates.isActive = data.isActive;
    const newUserName = typeof data.userName === "string" ? data.userName.trim() : "";
    if (newUserName.length > 0) {
      const existing = await prisma.adminUser.findFirst({ where: { userName: newUserName } });
      if (existing && existing.id !== id) {
        return NextResponse.json({ message: "This user name is already in use" }, { status: 409 });
      }
      updates.userName = newUserName;
    }
    const newPassword = typeof data.newPassword === "string" ? data.newPassword.trim() : "";
    if (newPassword.length > 0) {
      const { validateAdminPassword } = await import("../../../../lib/password-rules");
      const valid = validateAdminPassword(newPassword);
      if (!valid.ok) return NextResponse.json({ message: valid.message }, { status: 400 });
      updates.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }
    if (Array.isArray(data.permissions)) {
      const modules = data.permissions.filter((p: string) =>
        ["TOURNAMENTS", "TEAMS", "CALENDAR_EVENTS", "MEMBERS"].includes(p)
      ) as AdminModule[];
      updates.permissions = {
        deleteMany: {},
        create: modules.map((module) => ({ module })),
      };
    }

    const admin = await prisma.adminUser.update({
      where: { id },
      data: updates,
      include: { permissions: { select: { module: true } } },
    });

    return NextResponse.json({
      id: admin.id,
      userName: admin.userName,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      permissions: admin.permissions.map((p) => p.module),
    });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2025") return NextResponse.json({ message: "Admin user not found" }, { status: 404 });
    return NextResponse.json(
      { message: "Failed to update admin user", error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
