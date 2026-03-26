const ALLOWED = new Set([
  "tournaments",
  "teams",
  "calendar-events",
  "members",
  "payment-profiles",
  "admin-users",
]);

export function normalizeAdminHiddenNavList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter((x): x is string => typeof x === "string" && ALLOWED.has(x));
  return [...new Set(out)];
}

export function parseHiddenNavFromDb(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return normalizeAdminHiddenNavList(value);
  return [];
}
