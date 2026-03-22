import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { parseHiddenNavFromDb } from "./admin-hidden-nav";

/**
 * Read `hidden_nav_resources` without using Prisma's AdminUser model field.
 * If the column does not exist yet (DB not migrated), returns [] instead of throwing.
 */
export async function fetchHiddenNavResourcesSafe(adminUserId: string): Promise<string[]> {
  try {
    const rows = (await prisma.$queryRaw(
      Prisma.sql`SELECT hidden_nav_resources FROM admin_users WHERE id = ${adminUserId} LIMIT 1`,
    )) as { hidden_nav_resources: unknown }[];
    return parseHiddenNavFromDb(rows[0]?.hidden_nav_resources);
  } catch {
    return [];
  }
}

/** Prisma select shape: all AdminUser scalars used in API except `hiddenNavResources` (legacy DB safe). */
export const adminUserPublicSelect = {
  id: true,
  userName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { module: true } },
} as const;

/** For login: includes passwordHash, no hidden column. */
export const adminUserLoginSelect = {
  id: true,
  userName: true,
  passwordHash: true,
  role: true,
  isActive: true,
  permissions: { select: { module: true } },
} as const;

/**
 * Persists hidden nav preferences without Prisma's `hiddenNavResources` field (works if DB column exists).
 * Returns false when the column is missing or update fails.
 */
export async function persistHiddenNavResourcesSafe(
  adminUserId: string,
  resources: string[],
): Promise<boolean> {
  const json = JSON.stringify(resources);
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE admin_users SET hidden_nav_resources = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      json,
      adminUserId,
    );
    return true;
  } catch {
    return false;
  }
}
