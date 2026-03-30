import type { CalendarEvent } from "./api";

/**
 * Short label: approved count vs capacity, or "joining" copy (Neon-backed events only).
 * Shown beside Register even when registration is closed, so members still see turnout.
 */
export function approvedRegistrationHint(event: CalendarEvent): string | null {
  const id = String(event.id ?? "");
  if (id.startsWith("ics-")) return null;
  const approved = event.approvedCount ?? 0;
  if (event.capacity != null) {
    return `${approved} / ${event.capacity}`;
  }
  return approved === 1 ? "1 is joining" : `${approved} are joining`;
}
