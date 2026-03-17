/**
 * API base URL for admin panel. Same-origin when empty (dev proxy or same host).
 * For production: set VITE_API_URL to the web app origin (e.g. https://sparrows-web.netlify.app).
 */
export function getApiBase(): string {
  const base = import.meta.env.VITE_API_URL;
  if (base && typeof base === "string") {
    return base.replace(/\/$/, "") + "/api";
  }
  return "/api";
}

/** Full URL for an API path (path should start with /, e.g. "/members/123"). */
export function apiUrl(path: string): string {
  return getApiBase() + (path.startsWith("/") ? path : "/" + path);
}
