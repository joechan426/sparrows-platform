import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

// POST /api/auth/login — email + password, returns member (no passwordHash)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { message: "email and password are required" },
        { status: 400 },
      );
    }

    const member = await prisma.member.findUnique({
      where: { email },
    });

    if (!member || !member.passwordHash) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    const ok = await bcrypt.compare(password, member.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    const { passwordHash: _, ...safe } = member;
    return NextResponse.json(safe, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Login failed", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
