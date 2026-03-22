/**
 * Map Refine resource names to top-level nav roots (matches sidebar roots / admin hide list).
 */
export const NAV_ROOT_BY_RESOURCE: Record<string, string> = {
  tournaments: "tournaments",
  "tournament-registrations": "tournaments",
  divisions: "tournaments",
  pools: "tournaments",
  teams: "teams",
  "calendar-events": "calendar-events",
  "event-registrations": "calendar-events",
  members: "members",
  "admin-users": "admin-users",
};

export function navRootResourceName(resourceName: string): string | null {
  return NAV_ROOT_BY_RESOURCE[resourceName] ?? null;
}
