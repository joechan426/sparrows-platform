/**
 * Admin panel authentication and authorization.
 * Use requireAdminAuth() in API routes to protect them.
 */

import { type NextRequest, NextResponse } from "next/server";
import jwt, { type Secret } from "jsonwebtoken";
import { prisma } from "./prisma";

const JWT_SECRET: Secret = process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_EXPIRY = "7d";

// Avoid relying on `@prisma/client` enum exports at type level.
// Prisma enum exports can differ depending on the prisma build/edge/client generation.
export type AdminRole = "ADMIN" | "SUPER_MANAGER" | "MANAGER" | "COACH";
export type AdminModule =
  | "TOURNAMENTS"
  | "TEAMS"
  | "CALENDAR_EVENTS"
  | "MEMBERS"
  | "ANNOUNCEMENTS"
  | "PAYMENT_PROFILES"
  | "ADMIN_USERS"
  | "PAYMENTS";

export const ADMIN_IMPLICIT_MODULES: AdminModule[] = [
  "TOURNAMENTS",
  "TEAMS",
  "CALENDAR_EVENTS",
  "MEMBERS",
  "ANNOUNCEMENTS",
  "PAYMENT_PROFILES",
  "ADMIN_USERS",
  "PAYMENTS",
];

export type AdminPayload = {
  id: string;
  userName: string;
  role: AdminRole;
  permissions: AdminModule[];
};

export type AuthResult = { ok: true; admin: AdminPayload } | { ok: false; response: NextResponse };

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export function verifyToken(token: string): AdminPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; userName: string; role: AdminRole; permissions?: AdminModule[] };
    if (!decoded?.id || !decoded?.userName || !decoded?.role) return null;
    const permissions = Array.isArray(decoded.permissions) ? decoded.permissions : [];
    return { id: decoded.id, userName: decoded.userName, role: decoded.role, permissions };
  } catch {
    return null;
  }
}

export function signToken(payload: AdminPayload, expiresIn: string = JWT_EXPIRY): string {
  const options = { expiresIn: expiresIn as any } as jwt.SignOptions;
  return jwt.sign(
    { id: payload.id, userName: payload.userName, role: payload.role, permissions: payload.permissions },
    JWT_SECRET,
    options,
  );
}

/** Returns 401 JSON response for unauthorized */
function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ message }, { status: 401 });
}

/** Returns 403 JSON response for forbidden (no permission) */
function forbidden(message = "Forbidden") {
  return NextResponse.json({ message }, { status: 403 });
}

/**
 * Require admin authentication. Optionally require a specific module permission.
 * - If module is "any": any authenticated active admin (e.g. profile, delete-batch prelude).
 * - If module is a module name: ADMIN has access via implicit modules; other roles need that module in DB permissions.
 */
export async function requireAdminAuth(
  req: NextRequest,
  module: AdminModule | "any"
): Promise<AuthResult> {
  const token = getBearerToken(req);
  if (!token) return { ok: false, response: unauthorized("Missing or invalid authorization") };

  const payload = verifyToken(token);
  if (!payload) return { ok: false, response: unauthorized("Invalid or expired token") };

  const admin = await prisma.adminUser.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      userName: true,
      role: true,
      isActive: true,
      permissions: { select: { module: true } },
    },
  });
  if (!admin || !admin.isActive) return { ok: false, response: unauthorized("Account inactive or not found") };

  const permissions: AdminModule[] =
    admin.role === "ADMIN"
      ? [...ADMIN_IMPLICIT_MODULES]
      : admin.permissions.map((p: { module: AdminModule }) => p.module);
  const adminPayload: AdminPayload = { id: admin.id, userName: admin.userName, role: admin.role, permissions };

  if (module === "any") return { ok: true, admin: adminPayload };
  if (!permissions.includes(module)) return { ok: false, response: forbidden("No access to this section") };
  return { ok: true, admin: adminPayload };
}

/**
 * Same permission rules as requireAdminAuth, but returns null if there is no/invalid token.
 * Use for routes that behave differently for public vs manager (e.g. paid event registration).
 */
export async function getOptionalAdminAuth(
  req: NextRequest,
  module: AdminModule
): Promise<AdminPayload | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const admin = await prisma.adminUser.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      userName: true,
      role: true,
      isActive: true,
      permissions: { select: { module: true } },
    },
  });
  if (!admin || !admin.isActive) return null;

  const permissions: AdminModule[] =
    admin.role === "ADMIN"
      ? [...ADMIN_IMPLICIT_MODULES]
      : admin.permissions.map((p: { module: AdminModule }) => p.module);
  const adminPayload: AdminPayload = { id: admin.id, userName: admin.userName, role: admin.role, permissions };

  if (!permissions.includes(module)) return null;
  return adminPayload;
}
