/**
 * Paid event amounts: UI uses dollars; DB and Stripe use integer minor units (e.g. AUD cents).
 */

export function parsePriceDollarsInput(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v.trim().replace(/,/g, "")) : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

export function centsToPriceDollars(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return Math.round(cents) / 100;
}
