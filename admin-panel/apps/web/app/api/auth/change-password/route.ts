import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// POST /api/auth/change-password — member changes own password (current + new)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!memberId || !currentPassword || !newPassword) {
      return NextResponse.json(
        { message: "memberId, currentPassword and newPassword are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "New password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member || !member.passwordHash) {
      return NextResponse.json(
        { message: "Invalid request or account has no password" },
        { status: 401 },
      );
    }

    const ok = await bcrypt.compare(currentPassword, member.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { message: "Current password is incorrect" },
        { status: 401 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.member.update({
      where: { id: memberId },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Change password failed", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
