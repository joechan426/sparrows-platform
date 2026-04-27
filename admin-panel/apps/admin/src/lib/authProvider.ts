import type { AuthProvider } from "@refinedev/core";
import {
  clearAuth,
  setAuth,
  getToken,
  getStoredAdmin,
  RESOURCE_TO_MODULE,
  type AdminUser,
} from "./admin-auth";
import { getApiBase } from "./api-base";
import { navRootResourceName } from "./navResourceRoots";

export const adminAuthProvider: AuthProvider = {
  login: async ({ userName, password, rememberMe }) => {
    const res = await fetch(`${getApiBase()}/admin-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: typeof userName === "string" ? userName.trim() : "",
        password: typeof password === "string" ? password : "",
        rememberMe: rememberMe === true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: { message: data?.message ?? "Login failed", name: "LoginError" },
      };
    }
    if (data.token && data.admin) {
      const admin: AdminUser = {
        id: String(data.admin.id),
        userName: data.admin.userName,
        role: data.admin.role,
        permissions: Array.isArray(data.admin.permissions) ? data.admin.permissions : [],
        hiddenNavResources:
          data.admin.role === "ADMIN" && Array.isArray(data.admin.hiddenNavResources)
            ? data.admin.hiddenNavResources
            : undefined,
      };
      setAuth(data.token, admin);
      return { success: true, redirectTo: getFirstAccessiblePath() };
    }
    return {
      success: false,
      error: { message: "Invalid response", name: "LoginError" },
    };
  },

  logout: async () => {
    clearAuth();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const token = getToken();
    if (!token) {
      return {
        authenticated: false,
        error: { message: "Not authenticated", name: "AuthError" },
        logout: true,
        redirectTo: "/login",
      };
    }
    try {
      const res = await fetch(`${getApiBase()}/admin-auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        return {
          authenticated: false,
          error: { message: "Session expired", name: "AuthError" },
          logout: true,
          redirectTo: "/login",
        };
      }
      if (!res.ok) {
        return {
          authenticated: false,
          error: { message: "Auth check failed", name: "AuthError" },
          logout: true,
          redirectTo: "/login",
        };
      }
      const data = await res.json().catch(() => ({}));
      if (data.id && data.userName) {
        const admin: AdminUser = {
          id: String(data.id),
          userName: data.userName,
          role: data.role ?? "MANAGER",
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          hiddenNavResources:
            data.role === "ADMIN" && Array.isArray(data.hiddenNavResources)
              ? data.hiddenNavResources
              : undefined,
        };
        setAuth(token, admin);
        return { authenticated: true };
      }
    } catch {
      // network error
    }
    clearAuth();
    return {
      authenticated: false,
      error: { message: "Auth check failed", name: "AuthError" },
      logout: true,
      redirectTo: "/login",
    };
  },

  onError: async (error: unknown) => {
    const status = (error as { status?: number })?.status ?? (error as { response?: { status?: number } })?.response?.status;
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Request error");
    if (status === 401) {
      clearAuth();
      return { logout: true, redirectTo: "/login" };
    }
    if (status === 403) {
      return { redirectTo: getFirstAccessiblePath(), error: normalizedError };
    }
    return { error: normalizedError };
  },

  getPermissions: async () => {
    const admin = getStoredAdmin();
    if (!admin) return undefined;
    if (admin.role === "ADMIN") {
      return [
        "TOURNAMENTS",
        "TEAMS",
        "CALENDAR_EVENTS",
        "MEMBERS",
        "ANNOUNCEMENTS",
        "PAYMENT_PROFILES",
        "ADMIN_USERS",
        "PAYMENTS",
        "CREDITS",
        "CREDIT_LOGS",
      ];
    }
    return admin.permissions;
  },

  getIdentity: async () => {
    const admin = getStoredAdmin();
    if (!admin) return null;
    return { id: admin.id, name: admin.userName };
  },
};

const DEFAULT_RESOURCE_PATHS: { resource: string; path: string }[] = [
  { resource: "tournaments", path: "/tournaments" },
  { resource: "teams", path: "/teams" },
  { resource: "calendar-events", path: "/events" },
  { resource: "members", path: "/members" },
  { resource: "announcements", path: "/announcements" },
  { resource: "payment-profiles", path: "/payment-profiles" },
  { resource: "payments", path: "/payments" },
  { resource: "credit-logs", path: "/credit-logs" },
  { resource: "admin-users", path: "/admin-users" },
];

/** First list/show route the current user may open (dashboard is not used). */
export function getFirstAccessiblePath(): string {
  const first = DEFAULT_RESOURCE_PATHS.find((r) => canAccessResource(r.resource));
  if (first) return first.path;
  if (canAccessResource("payment-profiles")) return "/payment-profiles";
  // Profile is always reachable for signed-in users (not gated by module/hidden-nav roots).
  return "/profile";
}

function adminHiddenNavSet(): Set<string> {
  const admin = getStoredAdmin();
  if (!admin || admin.role !== "ADMIN" || !Array.isArray(admin.hiddenNavResources)) return new Set();
  return new Set(admin.hiddenNavResources.filter((x): x is string => typeof x === "string"));
}

/** Whether the current user can access a Refine resource (by name). */
export function canAccessResource(resourceName: string): boolean {
  if (resourceName === "dashboard") return false;

  const admin = getStoredAdmin();
  if (!admin) return false;

  const hidden = adminHiddenNavSet();

  if (resourceName === "admin-users") {
    if (admin.role === "ADMIN") {
      if (hidden.has("admin-users")) return false;
      return true;
    }
    if (!admin.permissions.includes("ADMIN_USERS")) return false;
    return true;
  }

  const module = RESOURCE_TO_MODULE[resourceName];
  if (!module) return false;

  if (admin.role === "ADMIN") {
    const root = navRootResourceName(resourceName);
    if (root && hidden.has(root)) return false;
    return true;
  }
  return admin.permissions.includes(module);
}
