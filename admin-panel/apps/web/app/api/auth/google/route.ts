import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { OAuth2Client } from "google-auth-library";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";

// POST /api/auth/google — verify Google idToken, find or create member
export async function POST(req: NextRequest) {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        {
          message:
            "Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in environment.",
        },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const idToken =
      typeof body.idToken === "string"
        ? body.idToken.trim()
        : typeof body.id_token === "string"
          ? body.id_token.trim()
          : "";

    if (!idToken) {
      return NextResponse.json(
        { message: "idToken is required" },
        { status: 400 },
      );
    }

    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return NextResponse.json(
        { message: "Invalid Google token" },
        { status: 401 },
      );
    }

    const googleId = payload.sub;
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : null;
    const name =
      [payload.given_name, payload.family_name].filter(Boolean).join(" ") ||
      payload.name ||
      "Member";

    let member = await prisma.member.findUnique({
      where: { googleId },
    });

    if (member) {
      const { passwordHash: _, ...safe } = member;
      return NextResponse.json(safe, { status: 200 });
    }

    if (email) {
      member = await prisma.member.findUnique({
        where: { email },
      });
      if (member) {
        await prisma.member.update({
          where: { id: member.id },
          data: { googleId },
        });
        const updated = await prisma.member.findUnique({
          where: { id: member.id },
        });
        if (updated) {
          const { passwordHash: __, ...safe } = updated;
          return NextResponse.json(safe, { status: 200 });
        }
      }
    }

    const finalEmail = email ?? `google.${googleId}@placeholder.local`;

    const created = await prisma.member.create({
      data: {
        email: finalEmail,
        preferredName: name.trim() || "Member",
        googleId,
      },
    });

    const { passwordHash: __, ...safe } = created;
    return NextResponse.json(safe, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "Google sign-in failed",
        error: e?.message ?? String(e),
      },
      { status: 401 },
    );
  }
}
