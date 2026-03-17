import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";

// GET /api/members?_start=0&_end=25&q=search (optional q: filter by name or email)
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "MEMBERS");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const search = url.searchParams;

    const start = Number(search.get("_start") ?? "0");
    const end = Number(search.get("_end") ?? "25");
    let q = (search.get("q") ?? search.get("filter[q]") ?? "").trim();
    if (!q && search.get("filter[0][field]") === "q") {
      q = (search.get("filter[0][value]") ?? "").trim();
    }

    const skip = Number.isFinite(start) && start > 0 ? start : 0;
    const takeRaw = Number.isFinite(end) ? end - skip : 25;
    const take = takeRaw > 0 ? takeRaw : 25;

    const where = q
      ? {
          OR: [
            { preferredName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const [rawItems, total] = await Promise.all([
      prisma.member.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.member.count({ where }),
    ]);

    const items = rawItems.map(({ passwordHash: _, ...m }) => m);

    return NextResponse.json(items, {
      status: 200,
      headers: {
        "X-Total-Count": String(total),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to list members", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// POST /api/members
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "MEMBERS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const preferredName =
      typeof body.preferredName === "string" ? body.preferredName.trim() : "";

    if (!email || !preferredName) {
      return NextResponse.json(
        { message: "preferredName and email are required" },
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

    const created = await prisma.member.create({
      data: {
        email,
        preferredName,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to create member", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, HEAD, OPTIONS, POST",
    },
  });
}

