import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";
import { TournamentType } from "@prisma/client";

function asTournamentType(input: unknown): TournamentType | undefined {
  if (input == null) return undefined;
  const v = String(input).toUpperCase().trim();
  if (v === "CUP") return TournamentType.CUP;
  if (v === "LEAGUE") return TournamentType.LEAGUE;
  return undefined;
}

// GET /api/tournaments?_start=0&_end=25
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const search = url.searchParams;

    const start = Number(search.get("_start") ?? "0");
    const end = Number(search.get("_end") ?? "25");

    const skip = Number.isFinite(start) && start > 0 ? start : 0;
    const takeRaw = Number.isFinite(end) ? end - skip : 25;
    const take = takeRaw > 0 ? takeRaw : 25;

    const [items, total] = await Promise.all([
      prisma.tournament.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.tournament.count(),
    ]);

    return NextResponse.json(items, {
      status: 200,
      headers: {
        "X-Total-Count": String(total),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to list tournaments", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// POST /api/tournaments
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "TOURNAMENTS");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));

    const created = await prisma.tournament.create({
      data: {
        name: body.name ?? body.title ?? "Untitled tournament",
        type: asTournamentType(body.type) ?? TournamentType.CUP,
        location: body.location,
        notes: body.notes,
        org: {
          // For now, bind to the first organization; in a real app this
          // should come from auth / request context.
          connect: {
            id: body.orgId,
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Failed to create tournament", error: e?.message ?? String(e) },
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

