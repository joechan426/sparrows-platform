import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "../../../../lib/admin-auth";
import type { AdminPayload } from "../../../../lib/admin-auth";

function withCors(req: NextRequest, res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Credentials", "false");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  return res;
}

const SHORT_EXPIRY = "7d";
const LONG_EXPIRY = "30d";

// POST /api/admin-auth/login — userName + password, optional rememberMe; returns token and admin profile
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userName = typeof body.userName === "string" ? body.userName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = body.rememberMe === true;

    if (!userName || !password) {
      return withCors(req, NextResponse.json({ message: "User name and password are required" }, { status: 400 }));
    }

    const admin = await prisma.adminUser.findUnique({
      where: { userName },
      include: { permissions: { select: { module: true } } },
    });

    if (!admin || !admin.isActive) {
      return withCors(req, NextResponse.json({ message: "Invalid user name or password" }, { status: 401 }));
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return withCors(req, NextResponse.json({ message: "Invalid user name or password" }, { status: 401 }));
    }

    // `AdminPayload.permissions` is typed as `AdminModule[]` in `lib/admin-auth`.
    // Keep the runtime values as strings, but make TS happy by casting to the expected type.
    const permissions: AdminPayload["permissions"] =
      admin.role === "ADMIN"
        ? (["TOURNAMENTS", "TEAMS", "CALENDAR_EVENTS", "MEMBERS"] as AdminPayload["permissions"])
        : (admin.permissions.map((p: { module: string }) => p.module) as AdminPayload["permissions"]);

    const payload: AdminPayload = {
      id: admin.id,
      userName: admin.userName,
      role: admin.role,
      permissions,
    };

    const token = signToken(payload, rememberMe ? LONG_EXPIRY : SHORT_EXPIRY);

    return withCors(
      req,
      NextResponse.json({
        token,
        admin: { id: admin.id, userName: admin.userName, role: admin.role, permissions },
      })
    );
  } catch (e: unknown) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Login failed", error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      )
    );
  }
}

// Explicit CORS preflight handler.
// Without this, some Netlify/Next runtimes may respond to OPTIONS without
// Access-Control-Allow-* headers, causing the actual POST to fail with TypeError.
export async function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
