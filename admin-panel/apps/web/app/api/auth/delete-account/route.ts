import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";

// POST /api/auth/delete-account
// Soft-delete member login identity while preserving historical records.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";

    if (!memberId) {
      return NextResponse.json({ message: "memberId is required" }, { status: 400 });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, email: true, passwordHash: true, appleId: true, googleId: true },
    });

    if (!member) {
      return NextResponse.json({ message: "Member not found" }, { status: 404 });
    }

    const alreadyDeleted =
      member.email == null &&
      member.passwordHash == null &&
      member.appleId == null &&
      member.googleId == null;

    if (alreadyDeleted) {
      return NextResponse.json({ success: true, alreadyDeleted: true }, { status: 200 });
    }

    await prisma.member.update({
      where: { id: memberId },
      data: {
        email: null,
        passwordHash: null,
        appleId: null,
        googleId: null,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Account deletion failed", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
