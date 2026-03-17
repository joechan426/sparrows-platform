import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import JwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";

const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

const jwksClient = JwksClient({
  jwksUri: APPLE_KEYS_URL,
  cache: true,
  rateLimit: true,
});

function getAppleSigningKey(
  header: jwt.JwtHeader,
  callback: (err: Error | null, key?: string) => void,
) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// POST /api/auth/apple — verify Apple identityToken, find or create member
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const identityToken =
      typeof body.identityToken === "string"
        ? body.identityToken.trim()
        : typeof body.id_token === "string"
          ? body.id_token.trim()
          : "";

    if (!identityToken) {
      return NextResponse.json(
        { message: "identityToken is required" },
        { status: 400 },
      );
    }

    const decoded = await new Promise<jwt.JwtPayload>((resolve, reject) => {
      jwt.verify(
        identityToken,
        getAppleSigningKey,
        {
          algorithms: ["RS256"],
          issuer: APPLE_ISSUER,
        },
        (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded as jwt.JwtPayload);
        },
      );
    });

    const appleId = decoded.sub;
    const emailFromApple =
      typeof decoded.email === "string" ? decoded.email : null;
    const nameFromApple =
      typeof decoded.email === "string"
        ? decoded.email.split("@")[0]
        : "Member";

    if (!appleId) {
      return NextResponse.json(
        { message: "Invalid Apple token" },
        { status: 401 },
      );
    }

    let member = await prisma.member.findUnique({
      where: { appleId },
    });

    if (member) {
      const { passwordHash: _, ...safe } = member;
      return NextResponse.json(safe, { status: 200 });
    }

    if (emailFromApple) {
      member = await prisma.member.findUnique({
        where: { email: emailFromApple },
      });
      if (member) {
        await prisma.member.update({
          where: { id: member.id },
          data: { appleId },
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

    const email = emailFromApple ?? `apple.${appleId}@placeholder.local`;
    const preferredName =
      typeof decoded.name === "object" &&
      decoded.name !== null &&
      typeof (decoded.name as { firstName?: string }).firstName === "string"
        ? (decoded.name as { firstName?: string; lastName?: string })
            .firstName +
          " " +
          ((decoded.name as { lastName?: string }).lastName ?? "")
        : nameFromApple;

    const created = await prisma.member.create({
      data: {
        email,
        preferredName: preferredName.trim() || "Member",
        appleId,
      },
    });

    const { passwordHash: __, ...safe } = created;
    return NextResponse.json(safe, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "Apple sign-in failed",
        error: e?.message ?? String(e),
      },
      { status: 401 },
    );
  }
}
