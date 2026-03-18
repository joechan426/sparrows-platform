import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Respond to CORS preflight (OPTIONS) for /api when ADMIN_ORIGIN is set
 * so the admin panel on a different origin can call the API.
 */
function middleware(request: NextRequest) {
  const adminOrigin = process.env.ADMIN_ORIGIN;
  if (!adminOrigin || request.method !== "OPTIONS") {
    return NextResponse.next();
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

export const config = {
  matcher: "/api/:path*",
};

// Next.js uses named export; Netlify edge bundler expects .default
export { middleware };
export default middleware;
