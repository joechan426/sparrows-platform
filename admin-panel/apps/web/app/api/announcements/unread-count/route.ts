import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { withCors, corsOptions } from "../../../../lib/cors";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sinceRaw = url.searchParams.get("since");
    if (!sinceRaw) {
      return withCors(req, NextResponse.json({ count: 0 }, { status: 200 }));
    }
    const since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) {
      return withCors(req, NextResponse.json({ message: "Invalid since date" }, { status: 400 }));
    }

    const rowsRaw = await prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM announcements
      WHERE created_at > ${since}
    `);
    const rows = rowsRaw as { count: bigint }[];
    return withCors(req, NextResponse.json({ count: Number(rows[0]?.count ?? 0n) }, { status: 200 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json({ message: "Failed to count unread announcements", error: e?.message ?? String(e) }, { status: 500 }),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
