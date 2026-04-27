/**
 * Admin-only: resources an ADMIN user may hide from their own navigation (sidebar + mobile).
 * Does not change server-side authorization for API calls.
 */
export const ADMIN_SELECTABLE_NAV_RESOURCES = [
  { resource: "tournaments", label: "Tournaments" },
  { resource: "teams", label: "Teams" },
  { resource: "calendar-events", label: "Events" },
  { resource: "members", label: "Members" },
  { resource: "announcements", label: "Announcements" },
  { resource: "payment-profiles", label: "Payment profiles" },
  { resource: "payments", label: "Payments" },
  { resource: "credit-logs", label: "Credit logs" },
  { resource: "admin-users", label: "Admin users" },
] as const;

export type AdminNavResourceName = (typeof ADMIN_SELECTABLE_NAV_RESOURCES)[number]["resource"];

const ALLOWED = new Set<string>(ADMIN_SELECTABLE_NAV_RESOURCES.map((r) => r.resource));

/** Normalize API / form payload to a deduplicated list of allowed resource names. */
export function normalizeAdminHiddenNavList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter((x): x is string => typeof x === "string" && ALLOWED.has(x));
  return [...new Set(out)];
}
