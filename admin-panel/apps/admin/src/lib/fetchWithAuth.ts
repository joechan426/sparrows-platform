/**
 * Fetch that adds Authorization: Bearer <token> for /api requests (except login).
 */

import { getToken } from "./admin-auth";

const originalFetch = typeof window !== "undefined" ? window.fetch : globalThis.fetch;

export function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
  const isApi = url.includes("/api");
  const isLogin = url.includes("/api/admin-auth/login");
  if (isApi && !isLogin) {
    const token = getToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return originalFetch(input, { ...init, headers });
  }
  return originalFetch(input, init);
}
