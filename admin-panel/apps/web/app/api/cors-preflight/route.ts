import { NextResponse, type NextRequest } from "next/server";

/**
 * Handles CORS preflight (OPTIONS) for /api/* when ADMIN_ORIGIN is set.
 * Requests are rewritten here by next.config.js when Access-Control-Request-Method header is present.
 */
export async function OPTIONS(req: NextRequest) {
  const allowOrigin = "*";
  const requestedHeadersRaw = req.headers.get("access-control-request-headers") ?? "";
  const requestedHeaders = requestedHeadersRaw.trim();
  const requestedMethod = req.headers.get("access-control-request-method") ?? "POST";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Credentials": "false",
      "Access-Control-Allow-Methods": requestedMethod,
      "Access-Control-Allow-Headers": requestedHeaders ? requestedHeaders : "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}
