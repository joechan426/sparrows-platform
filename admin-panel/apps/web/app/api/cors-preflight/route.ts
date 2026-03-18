import { NextResponse } from "next/server";

/**
 * Handles CORS preflight (OPTIONS) for /api/* when ADMIN_ORIGIN is set.
 * Requests are rewritten here by next.config.js when Access-Control-Request-Method header is present.
 */
export async function OPTIONS() {
  const adminOrigin = process.env.ADMIN_ORIGIN;
  if (!adminOrigin) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": adminOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
