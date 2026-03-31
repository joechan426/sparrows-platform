import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req, "ANNOUNCEMENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const { id } = await params;
    const deletedRaw = await prisma.$queryRaw(Prisma.sql`
      DELETE FROM announcements WHERE id = ${id} RETURNING id
    `);
    const deleted = deletedRaw as { id: string }[];
    if (!deleted[0]) {
      return withCors(req, NextResponse.json({ message: "Announcement not found" }, { status: 404 }));
    }
    return withCors(req, NextResponse.json({ success: true, id }, { status: 200 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json({ message: "Failed to delete announcement", error: e?.message ?? String(e) }, { status: 500 }),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
