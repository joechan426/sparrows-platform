import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAdminAuth } from "../../../lib/admin-auth";
import { withCors, corsOptions } from "../../../lib/cors";
import { dollarsToCents, parsePriceDollarsInput } from "../../../lib/price-input";

function classifySportType(title: string): "VOLLEYBALL" | "PICKLEBALL" | "TENNIS" {
  const t = title.toLowerCase();
  if (t.includes("pickleball")) return "PICKLEBALL";
  if (t.includes("tennis")) return "TENNIS";
  return "VOLLEYBALL";
}

function classifyEventType(title: string): "NORMAL" | "SPECIAL" {
  const t = title.toLowerCase();
  if (t.includes("cup")) return "SPECIAL";
  return "NORMAL";
}

function asSourceType(input: unknown): "GOOGLE" | "MANUAL" {
  const v = String(input ?? "").toUpperCase().trim();
  if (v === "GOOGLE") return "GOOGLE";
  return "MANUAL";
}

// GET /api/calendar-events?_start=0&_end=25 — used by web app (event list) and admin panel. No admin auth so web app can list.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams;

    const start = Number(search.get("_start") ?? "0");
    const end = Number(search.get("_end") ?? "25");

    const skip = Number.isFinite(start) && start > 0 ? start : 0;
    const takeRaw = Number.isFinite(end) ? end - skip : 25;
    const take = takeRaw > 0 ? takeRaw : 25;

    const [rawItems, total] = await Promise.all([
      prisma.calendarEvent.findMany({
        skip,
        take,
        orderBy: { startAt: "asc" },
        include: {
          registrations: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      }),
      prisma.calendarEvent.count(),
    ]);

    const items = rawItems.map(
      ({
        registrations,
        ...e
      }: {
        registrations: { id: string }[];
        [key: string]: unknown;
      }) => ({
        ...e,
        approvedCount: registrations.length,
      })
    );

    return withCors(
      req,
      NextResponse.json(items, {
        status: 200,
        headers: { "X-Total-Count": String(total) },
      })
    );
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to list calendar events", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

// POST /api/calendar-events
// Manual creation (sourceType MANUAL, sourceEventId optional) or upsert by sourceEventId + sourceType.
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CALENDAR_EVENTS");
  if (!auth.ok) return withCors(req, auth.response);
  try {
    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : "";
    let sourceEventId =
      typeof body.sourceEventId === "string"
        ? body.sourceEventId.trim()
        : "";
    const startAt = body.startAt ? new Date(body.startAt) : undefined;
    const endAt = body.endAt ? new Date(body.endAt) : undefined;
    const sourceType = asSourceType(body.sourceType);

    if (!title || !startAt || !endAt) {
      return withCors(
        req,
        NextResponse.json(
        { message: "title, startAt, and endAt are required" },
        { status: 400 },
        )
      );
    }

    if (sourceType === "MANUAL" && !sourceEventId) {
      const { randomUUID } = await import("crypto");
      sourceEventId = `manual-${randomUUID()}`;
    }
    if (!sourceEventId) {
      return withCors(
        req,
        NextResponse.json(
        { message: "sourceEventId is required for non-manual events" },
        { status: 400 },
        )
      );
    }

    const sportType = classifySportType(title);
    const eventType = classifyEventType(title);
    const description = typeof body.description === "string" ? body.description : null;
    const location = typeof body.location === "string" ? body.location : null;
    const capacity =
      body.capacity === undefined
        ? undefined
        : body.capacity === null || body.capacity === ""
          ? null
          : Number(body.capacity);
    if (capacity !== undefined && capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
      return NextResponse.json(
        { message: "capacity must be a non-negative integer or null" },
        { status: 400 },
      );
    }

    const existing = await prisma.calendarEvent.findUnique({
      where: {
        sourceEventId_sourceType: { sourceEventId, sourceType },
      },
    });

    const isPaid = typeof body.isPaid === "boolean" ? body.isPaid : undefined;
    let priceCents: number | null | undefined;
    if (body.priceDollars !== undefined) {
      if (body.priceDollars === null || body.priceDollars === "") {
        priceCents = null;
      } else {
        const d = parsePriceDollarsInput(body.priceDollars);
        if (d === null) {
          return withCors(
            req,
            NextResponse.json({ message: "priceDollars must be a non-negative number or null" }, { status: 400 }),
          );
        }
        priceCents = dollarsToCents(d);
      }
    }
    if (body.priceCents !== undefined) {
      if (body.priceCents === null || body.priceCents === "") {
        priceCents = null;
      } else {
        const cents = Number(body.priceCents);
        if (!Number.isInteger(cents) || cents < 0) {
          return withCors(
            req,
            NextResponse.json({ message: "priceCents must be a non-negative integer or null" }, { status: 400 })
          );
        }
        priceCents = cents;
      }
    }

    let currency: string | undefined;
    if (typeof body.currency === "string") {
      const cur = body.currency.trim().toUpperCase();
      if (cur.length !== 3) {
        return withCors(
          req,
          NextResponse.json({ message: "currency must be a 3-letter ISO code" }, { status: 400 })
        );
      }
      currency = cur;
    }

    let paymentProfileId: string | null | undefined;
    if (body.paymentProfileId !== undefined) {
      if (body.paymentProfileId === null || body.paymentProfileId === "") {
        paymentProfileId = null;
      } else {
        const pid = String(body.paymentProfileId);
        const prof = await prisma.paymentProfile.findUnique({ where: { id: pid }, select: { id: true } });
        if (!prof) {
          return withCors(
            req,
            NextResponse.json({ message: "paymentProfileId not found" }, { status: 400 })
          );
        }
        paymentProfileId = pid;
      }
    }

    const nextIsPaid = isPaid !== undefined ? isPaid : existing?.isPaid ?? false;
    const nextPrice = priceCents !== undefined ? priceCents : existing?.priceCents ?? null;
    const nextProfileId =
      paymentProfileId !== undefined ? paymentProfileId : existing?.paymentProfileId ?? null;

    if (nextIsPaid && nextPrice != null && nextPrice > 0) {
      if (paymentProfileId === null || paymentProfileId === "") {
        return withCors(
          req,
          NextResponse.json(
            { message: "Cannot clear payment profile while the event is paid with a price." },
            { status: 400 }
          )
        );
      }
      if (!nextProfileId) {
        return withCors(
          req,
          NextResponse.json(
            { message: "Select a payment profile for paid events that have a price." },
            { status: 400 }
          )
        );
      }
    }

    const paymentPatch: Record<string, unknown> = {};
    if (isPaid !== undefined) paymentPatch.isPaid = isPaid;
    if (priceCents !== undefined) paymentPatch.priceCents = priceCents;
    if (currency !== undefined) paymentPatch.currency = currency;
    if (paymentProfileId !== undefined) paymentPatch.paymentProfileId = paymentProfileId;

    const created = await prisma.calendarEvent.upsert({
      where: {
        sourceEventId_sourceType: {
          sourceEventId,
          sourceType,
        },
      },
      create: {
        sourceEventId,
        title,
        description,
        startAt,
        endAt,
        location,
        sourceType: sourceType as any,
        sportType: sportType as any,
        eventType: eventType as any,
        capacity: capacity ?? undefined,
        ...paymentPatch,
      },
      update: {
        title,
        description,
        startAt,
        endAt,
        location,
        sportType: sportType as any,
        eventType: eventType as any,
        capacity: capacity ?? undefined,
        ...paymentPatch,
      },
    });

    return withCors(req, NextResponse.json(created, { status: 201 }));
  } catch (e: any) {
    return withCors(
      req,
      NextResponse.json(
        { message: "Failed to create or update calendar event", error: e?.message ?? String(e) },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

