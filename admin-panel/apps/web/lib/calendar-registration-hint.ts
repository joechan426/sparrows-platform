import type { CalendarEvent } from "./api";

/**
 * Short label when registration is open: approved count vs capacity, or "joining" copy.
 */
export function approvedRegistrationHint(event: CalendarEvent): string | null {
  if (!event.registrationOpen) return null;
  const approved = event.approvedCount ?? 0;
  if (event.capacity != null) {
    return `${approved} / ${event.capacity}`;
  }
  return approved === 1 ? "1 is joining" : `${approved} are joining`;
}
