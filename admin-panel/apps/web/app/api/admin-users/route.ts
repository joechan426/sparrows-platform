import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import bcrypt from "bcryptjs";
import { requireAdminAuth } from "../../../lib/admin-auth";

const SALT_ROUNDS = 10;

// GET /api/admin-users — list all admin users (ADMIN only)
export async function GET(req: NextRequest) {
  const result = await requireAdminAuth(req, null);
  if (!result.ok) return result.response;
  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: "desc" },
      include: { permissions: { select: { module: true } } },
    });
    const list = users.map(
      (u: {
        id: string;
        userName: string;
        role: "ADMIN" | "MANAGER";
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        permissions: { module: string }[];
      }) => ({
      id: u.id,
      userName: u.userName,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      permissions: u.permissions.map((p: { module: string }) => p.module),
    })
    );
    return NextResponse.json(list, {
      headers: { "X-Total-Count": String(list.length) },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { message: "Failed to list admin users", error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// POST /api/admin-users — create admin/manager (ADMIN only)
export async function POST(req: NextRequest) {
  const result = await requireAdminAuth(req, null);
  if (!result.ok) return result.response;
  try {
    const body = await req.json().catch(() => ({}));
    const userName = typeof body.userName === "string" ? body.userName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role: "MANAGER" | "ADMIN" = body.role === "MANAGER" || body.role === "ADMIN" ? body.role : "MANAGER";
    const permissions: ("TOURNAMENTS" | "TEAMS" | "CALENDAR_EVENTS" | "MEMBERS")[] = Array.isArray(body.permissions)
      ? body.permissions.filter((p: string) => ["TOURNAMENTS", "TEAMS", "CALENDAR_EVENTS", "MEMBERS"].includes(p))
      : [];

    if (!userName || !password) {
      return NextResponse.json({ message: "User name and password are required" }, { status: 400 });
    }
    const { validateAdminPassword } = await import("../../../lib/password-rules");
    const valid = validateAdminPassword(password);
    if (!valid.ok) return NextResponse.json({ message: valid.message }, { status: 400 });

    const existing = await prisma.adminUser.findUnique({ where: { userName } });
    if (existing) {
      return NextResponse.json({ message: "An admin user with this user name already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = await prisma.adminUser.create({
      data: {
        userName,
        passwordHash,
        role,
        permissions: {
          create: permissions.map((module) => ({ module })),
        },
      },
      include: { permissions: { select: { module: true } } },
    });

    return NextResponse.json({
      id: admin.id,
      userName: admin.userName,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      permissions: admin.permissions.map((p: { module: string }) => p.module),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { message: "Failed to create admin user", error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
