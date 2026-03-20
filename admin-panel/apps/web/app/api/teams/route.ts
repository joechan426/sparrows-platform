import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../lib/cors";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TEAMS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const url = new URL(req.url);

    const start = Number(url.searchParams.get("_start") ?? "0");
    const end = Number(url.searchParams.get("_end") ?? "25");
    const take =
      Number.isFinite(end - start) && end - start > 0 ? end - start : 25;
    const skip = Number.isFinite(start) && start >= 0 ? start : 0;

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!org) return withCors(req, json([]));

    const teams = await prisma.team.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });

    return withCors(req, json(teams));
  } catch (e: any) {
    return withCors(req, json({ message: e?.message ?? "Internal Server Error" }, { status: 500 }));
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TEAMS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const body = await req.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return withCors(req, json({ message: "Missing name" }, { status: 400 }));

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!org) return withCors(req, json({ message: "Missing organization" }, { status: 400 }));

    const created = await prisma.team.create({
      data: {
        name,
        orgId: org.id,
      },
    });

    return withCors(req, json(created, { status: 201 }));
  } catch (e: any) {
    return withCors(req, json({ message: e?.message ?? "Internal Server Error" }, { status: 500 }));
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}