import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// POST /api/auth/register — create member with name, email, password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const preferredName =
      typeof body.preferredName === "string" ? body.preferredName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !preferredName || !password) {
      return NextResponse.json(
        { message: "preferredName, email and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const existing = await prisma.member.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Member with this email already exists", id: existing.id },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const created = await prisma.member.create({
      data: {
        email,
        preferredName,
        passwordHash,
      },
    });

    const { passwordHash: _, ...member } = created;
    return NextResponse.json(member, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Registration failed", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
