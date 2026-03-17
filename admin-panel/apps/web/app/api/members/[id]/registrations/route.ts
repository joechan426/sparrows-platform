import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";

async function getIdFromContext(context: any): Promise<string | undefined> {
  const params = await Promise.resolve(context?.params);
  return params?.id ? String(params.id) : undefined;
}

// GET /api/members/:id/registrations
// Returns event registrations for this member. Used by web app (My Scheduled Events) and admin panel. No admin auth so web app can load own.
export async function GET(req: NextRequest, context: any) {
  try {
    const memberId = await getIdFromContext(context);
    if (!memberId) {
      return NextResponse.json({ message: "Missing member id" }, { status: 400 });
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      include: {
        event: true,
      },
    });

    return NextResponse.json(registrations, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "Failed to list member registrations",
        error: e?.message ?? String(e),
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, HEAD, OPTIONS" },
  });
}
