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
      };
      setAuth(data.token, admin);
      return { success: true, redirectTo: "/" };
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
      return { redirectTo: "/", error: normalizedError };
    }
    return { error: normalizedError };
  },

  getPermissions: async () => {
    const admin = getStoredAdmin();
    if (!admin) return undefined;
    if (admin.role === "ADMIN") {
      return ["TOURNAMENTS", "TEAMS", "CALENDAR_EVENTS", "MEMBERS", "ADMIN_USERS"];
    }
    return admin.permissions;
  },

  getIdentity: async () => {
    const admin = getStoredAdmin();
    if (!admin) return null;
    return { id: admin.id, name: admin.userName };
  },
};

/** Whether the current user can access a Refine resource (by name). */
export function canAccessResource(resourceName: string): boolean {
  if (resourceName === "dashboard") {
    return !!getStoredAdmin();
  }
  if (resourceName === "admin-users") {
    const admin = getStoredAdmin();
    return admin?.role === "ADMIN";
  }
  const module = RESOURCE_TO_MODULE[resourceName];
  if (!module) return false;
  const admin = getStoredAdmin();
  if (!admin) return false;
  if (admin.role === "ADMIN") return true;
  return admin.permissions.includes(module);
}
