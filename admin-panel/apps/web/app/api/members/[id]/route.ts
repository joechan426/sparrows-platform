import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { corsJson, corsOptions } from "../../../../lib/cors";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// GET /api/members/:id — used by web app (member profile) and admin panel. No admin auth so web app can load own member.
export async function GET(req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);
    if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });

    const member = await prisma.member.findUnique({ where: { id } });
    if (!member) return corsJson(req, { message: "Not found" }, { status: 404 });

    const { passwordHash: _, ...safe } = member;
    return corsJson(req, safe, { status: 200 });
  } catch (e: any) {
    return corsJson(
      req,
      { message: "Failed to fetch member", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// PATCH /api/members/:id — used by web app (update own profile) and admin panel. No admin auth so web app can update.
export async function PATCH(req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);
    if (!id) return corsJson(req, { message: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const data: any = {};

    if (typeof body.preferredName === "string") {
      const preferredName = body.preferredName.trim();
      if (!preferredName) {
        return corsJson(
          req,
          { message: "preferredName cannot be empty" },
          { status: 400 },
        );
      }
      data.preferredName = preferredName;
    }

    if (typeof body.email === "string") {
      const email = body.email.trim();
      if (!email) {
        return corsJson(
          req,
          { message: "email cannot be empty" },
          { status: 400 },
        );
      }
      data.email = email;
    }

    if (Object.keys(data).length === 0) {
      return corsJson(
        req,
        { message: "No updatable fields provided" },
        { status: 400 },
      );
    }

    try {
      const updated = await prisma.member.update({
        where: { id },
        data,
      });

      const { passwordHash: __, ...safe } = updated;
      return corsJson(req, safe, { status: 200 });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return corsJson(
          req,
          { message: "Email must be unique" },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e: any) {
    return corsJson(
      req,
      { message: "Failed to update member", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

