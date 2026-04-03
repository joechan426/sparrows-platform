import type { CalendarEvent } from "./api";

export type CalendarRegistrationHint =
  | { kind: "none" }
  | { kind: "joined"; count: number }
  | { kind: "capacity"; approved: number; capacity: number };

/**
 * Neon-backed calendar rows: unlimited events show "N Joined"; capped events show approved/capacity (no "Joined" label).
 */
export function calendarRegistrationHint(event: CalendarEvent): CalendarRegistrationHint {
  const id = String(event.id ?? "");
  if (id.startsWith("ics-")) return { kind: "none" };
  const approved = event.approvedCount ?? 0;
  const cap = event.capacity;
  if (cap != null && cap > 0) {
    return { kind: "capacity", approved, capacity: cap };
  }
  if (approved <= 0) return { kind: "none" };
  return { kind: "joined", count: approved };
}

/** Plain string for simple inline use (e.g. legacy). Prefer {@link calendarRegistrationHint} for styling. */
export function approvedRegistrationHint(event: CalendarEvent): string | null {
  const h = calendarRegistrationHint(event);
  if (h.kind === "none") return null;
  if (h.kind === "joined") return `${h.count} Joined`;
  return `${h.approved} / ${h.capacity}`;
}
