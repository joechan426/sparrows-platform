import { NextRequest, NextResponse } from "next/server";

// Centralized CORS helper for admin-panel -> web API.
// Keep it simple: allow all origins, disallow credentials.
export function withCors(req: NextRequest, res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Credentials", "false");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  );
  return res;
}

export function corsJson(
  req: NextRequest,
  body: unknown,
  init?: ResponseInit
) {
  return withCors(req, NextResponse.json(body, init));
}

export function corsOptions(req: NextRequest) {
  // Browser sends:
  // - Origin
  // - Access-Control-Request-Method
  // - Access-Control-Request-Headers
  // We still respond with allow headers/methods for simplicity.
  return withCors(
    req,
    new NextResponse(null, {
      status: 204,
    })
  );
}

