import { type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { corsJson, corsOptions } from "../../../../lib/cors";
import { requireAdminAuth } from "../../../../lib/admin-auth";

type CreditLogRow = {
  id: string;
  createdAt: Date;
  memberId: string;
  preferredName: string;
  email: string;
  reason: "EVENT_REFUND" | "REGISTRATION_APPLY" | "MANUAL_ADJUST";
  deltaCents: number;
  note: string | null;
  eventTitle: string | null;
  eventStartAt: Date | null;
  adminUserName: string | null;
  adminRole: "ADMIN" | "SUPER_MANAGER" | "MANAGER" | "COACH" | null;
  beforeCreditCents: number;
  afterCreditCents: number;
};

function clampInt(v: string | null, fallback: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toReasonLabel(reason: CreditLogRow["reason"]) {
  if (reason === "MANUAL_ADJUST") return "MANUAL_UPDATE";
  return "EVENT_UPDATE";
}

function toRemark(row: CreditLogRow) {
  if (row.reason === "MANUAL_ADJUST") {
    const who = row.adminUserName?.trim() || "Unknown";
    const role = row.adminRole ? row.adminRole.replace("_", " ") : "UNKNOWN";
    return `${who} (${role})`;
  }
  if (row.eventTitle) {
    const date = row.eventStartAt ? row.eventStartAt.toISOString() : "No date";
    return `${row.eventTitle} · ${date}`;
  }
  return row.note ?? "";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req, "CREDIT_LOGS");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const start = clampInt(url.searchParams.get("_start"), 0, 0, 50000);
    const end = clampInt(url.searchParams.get("_end"), start + 20, start + 1, start + 200);
    const take = Math.max(1, end - start);
    const qRaw = (url.searchParams.get("q") ?? "").trim();
    const q = qRaw.length > 0 ? qRaw : null;

    const whereSql = q
      ? Prisma.sql`
        WHERE
          m.preferred_name ILIKE ${`%${q}%`}
          OR COALESCE(m.email, '') ILIKE ${`%${q}%`}
          OR COALESCE(l.note, '') ILIKE ${`%${q}%`}
          OR COALESCE(e.title, '') ILIKE ${`%${q}%`}
          OR COALESCE(a.user_name, '') ILIKE ${`%${q}%`}
          OR CAST(l.reason AS TEXT) ILIKE ${`%${q}%`}
      `
      : Prisma.sql``;

    const rows = await prisma.$queryRaw<CreditLogRow[]>`
      WITH base AS (
        SELECT
          l.id,
          l.created_at AS "createdAt",
          l.member_id AS "memberId",
          m.preferred_name AS "preferredName",
          m.email AS "email",
          l.reason AS "reason",
          l.delta_cents AS "deltaCents",
          l.note,
          e.title AS "eventTitle",
          e.start_at AS "eventStartAt",
          a.user_name AS "adminUserName",
          a.role AS "adminRole",
          (
            m.credit_cents
            - COALESCE(
                SUM(l.delta_cents) OVER (
                  PARTITION BY l.member_id
                  ORDER BY l.created_at DESC, l.id DESC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ),
                0
              )
          )::INT AS "afterCreditCents",
          (
            (
              m.credit_cents
              - COALESCE(
                  SUM(l.delta_cents) OVER (
                    PARTITION BY l.member_id
                    ORDER BY l.created_at DESC, l.id DESC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                  ),
                  0
                )
            ) - l.delta_cents
          )::INT AS "beforeCreditCents"
        FROM member_credit_ledger l
        INNER JOIN members m ON m.id = l.member_id
        LEFT JOIN calendar_events e ON e.id = l.calendar_event_id
        LEFT JOIN admin_users a ON a.id = l.created_by_admin_id
        ${whereSql}
      )
      SELECT *
      FROM base
      ORDER BY "createdAt" DESC, id DESC
      OFFSET ${start}
      LIMIT ${take}
    `;

    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM member_credit_ledger l
      INNER JOIN members m ON m.id = l.member_id
      LEFT JOIN calendar_events e ON e.id = l.calendar_event_id
      LEFT JOIN admin_users a ON a.id = l.created_by_admin_id
      ${whereSql}
    `;
    const total = Number(totalRows[0]?.count ?? 0);

    const response = (rows as CreditLogRow[]).map((row: CreditLogRow) => ({
      id: row.id,
      createdAt: row.createdAt,
      preferredName: row.preferredName,
      email: row.email,
      beforeCreditCents: row.beforeCreditCents,
      deltaCents: row.deltaCents,
      afterCreditCents: row.afterCreditCents,
      reason: toReasonLabel(row.reason),
      note: toRemark(row),
    }));

    return corsJson(req, response, {
      status: 200,
      headers: { "X-Total-Count": String(total) },
    });
  } catch (e: unknown) {
    return corsJson(
      req,
      {
        message: "Failed to load credit logs",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}
