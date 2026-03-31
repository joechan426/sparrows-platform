import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../lib/cors";

function normalizeLimit(value: string | null, fallback: number): number {
  const n = Number(value ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(200, Math.floor(n));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const start = Math.max(0, Math.floor(Number(url.searchParams.get("_start") ?? "0") || 0));
    const endParam = Number(url.searchParams.get("_end") ?? "");
    const limit = Number.isFinite(endParam) && endParam > start ? Math.min(200, endParam - start) : normalizeLimit(url.searchParams.get("limit"), 10);

    const [rowsRaw, totalRaw] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        SELECT a.id,
               a.message,
               a.created_at AS "createdAt",
               a.created_by_admin_id AS "createdByAdminId",
               u.user_name AS "createdByUserName"
        FROM announcements a
        LEFT JOIN admin_users u ON u.id = a.created_by_admin_id
        ORDER BY a.created_at DESC
        OFFSET ${start}
        LIMIT ${limit}
      `),
      prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM announcements`),
    ]);
    const rows = rowsRaw as { id: string; message: string; createdAt: Date; createdByAdminId: string | null; createdByUserName: string | null }[];
    const total = totalRaw as { count: bigint }[];

    const payload = rows.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: r.createdAt,
      createdByAdminId: r.createdByAdminId,
      createdByUserName: r.createdByUserName,
    }));
    const totalCount = Number(total[0]?.count ?? 0n);
    return withCors(req, NextResponse.json(payload, { status: 200, headers: { "X-Total-Count": String(totalCount) } }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json({ message: "Failed to list announcements", error: e?.message ?? String(e) }, { status: 500 }),
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "ANNOUNCEMENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return withCors(req, NextResponse.json({ message: "message is required" }, { status: 400 }));
    }
    const id = crypto.randomUUID();
    const insertedRaw = await prisma.$queryRaw(Prisma.sql`
      INSERT INTO announcements (id, message, created_by_admin_id)
      VALUES (${id}, ${message}, ${auth.admin.id})
      RETURNING id,
                message,
                created_at AS "createdAt",
                created_by_admin_id AS "createdByAdminId",
                NULL::text AS "createdByUserName"
    `);
    const inserted = insertedRaw as { id: string; message: string; createdAt: Date; createdByAdminId: string | null; createdByUserName: string | null }[];

    return withCors(req, NextResponse.json(inserted[0] ?? null, { status: 201 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json({ message: "Failed to create announcement", error: e?.message ?? String(e) }, { status: 500 }),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
