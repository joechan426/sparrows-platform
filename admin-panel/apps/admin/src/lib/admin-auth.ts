/**
 * Admin panel auth: token and profile in localStorage.
 * API expects Authorization: Bearer <token>.
 */

export const ADMIN_TOKEN_KEY = "sparrows_admin_token";
export const ADMIN_USER_KEY = "sparrows_admin_user";

export type AdminUser = {
  id: string;
  userName: string;
  role: "ADMIN" | "SUPER_MANAGER" | "MANAGER";
  permissions: string[];
  /** ADMIN only: Refine resource roots hidden from this user's navigation (sidebar + mobile). */
  hiddenNavResources?: string[];
};

export function getToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getStoredAdmin(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function setAuth(token: string, admin: AdminUser): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(admin));
}

export function clearAuth(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}

export function hasPermission(permission: string): boolean {
  const admin = getStoredAdmin();
  if (!admin) return false;
  if (admin.role === "ADMIN") return true;
  return admin.permissions.includes(permission);
}

/** Resource name to permission module */
export const RESOURCE_TO_MODULE: Record<string, string> = {
  tournaments: "TOURNAMENTS",
  "tournament-registrations": "TOURNAMENTS",
  divisions: "TOURNAMENTS",
  pools: "TOURNAMENTS",
  teams: "TEAMS",
  "calendar-events": "CALENDAR_EVENTS",
  "event-registrations": "CALENDAR_EVENTS",
  members: "MEMBERS",
  "payment-profiles": "PAYMENT_PROFILES",
  payments: "PAYMENTS",
  "admin-users": "ADMIN_USERS",
};

export function canAccessResource(resource: string): boolean {
  const module = RESOURCE_TO_MODULE[resource];
  if (!module) return false;
  return hasPermission(module);
}
