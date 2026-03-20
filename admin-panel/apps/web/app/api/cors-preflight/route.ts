import { NextResponse } from "next/server";

/**
 * Handles CORS preflight (OPTIONS) for /api/* when ADMIN_ORIGIN is set.
 * Requests are rewritten here by next.config.js when Access-Control-Request-Method header is present.
 */
export async function OPTIONS() {
  const adminOriginRaw = process.env.ADMIN_ORIGIN;
  const adminOrigin =
    typeof adminOriginRaw === "string" ? adminOriginRaw.trim().replace(/\/$/, "") : undefined;
  const allowOrigin = adminOrigin || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      // If we fall back to '*' we must NOT claim credentials.
      "Access-Control-Allow-Credentials": adminOrigin ? "true" : "false",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
