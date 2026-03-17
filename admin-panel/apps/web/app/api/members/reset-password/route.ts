import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// POST /api/members/reset-password — admin resets password for one or more members
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "MEMBERS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const memberIds = Array.isArray(body.memberIds)
      ? (body.memberIds as unknown[]).map((id) => String(id).trim()).filter(Boolean)
      : [];
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (memberIds.length === 0 || !newPassword) {
      return NextResponse.json(
        { message: "memberIds (array) and newPassword are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.member.updateMany({
      where: { id: { in: memberIds } },
      data: { passwordHash },
    });

    return NextResponse.json(
      { success: true, updated: memberIds.length },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { message: "Reset password failed", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
