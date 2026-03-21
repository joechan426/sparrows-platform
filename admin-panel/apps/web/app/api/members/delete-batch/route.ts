import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../../lib/cors";

/**
 * POST /api/members/delete-batch — admin deletes members (and their event registrations).
 * Body: { memberIds: string[] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "MEMBERS");
  if (!auth.ok) return withCors(req, auth.response);

  try {
    const body = await req.json().catch(() => ({}));
    const memberIds = Array.isArray(body.memberIds)
      ? (body.memberIds as unknown[]).map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (memberIds.length === 0) {
      return withCors(
        req,
        NextResponse.json({ message: "memberIds (non-empty array) is required" }, { status: 400 }),
      );
    }

    const deletedRegs = await prisma.eventRegistration.deleteMany({
      where: { memberId: { in: memberIds } },
    });

    const deletedMembers = await prisma.member.deleteMany({
      where: { id: { in: memberIds } },
    });

    return withCors(
      req,
      NextResponse.json(
        {
          success: true,
          deletedMembers: deletedMembers.count,
          deletedRegistrations: deletedRegs.count,
        },
        { status: 200 },
      ),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return withCors(
      req,
      NextResponse.json({ message: "Delete members failed", error: msg }, { status: 500 }),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
