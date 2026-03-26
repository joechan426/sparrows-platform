import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "../../../../lib/admin-auth";
import { fetchHiddenNavResourcesSafe } from "../../../../lib/fetch-hidden-nav-safe";

function withCors(req: NextRequest, res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Credentials", "false");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  return res;
}

// GET /api/admin-auth/me — return current admin (requires Authorization: Bearer <token>)
export async function GET(req: NextRequest) {
  const result = await requireAdminAuth(req, "any");
  if (!result.ok) return withCors(req, result.response);
  const hiddenNavResources =
    result.admin.role === "ADMIN" ? await fetchHiddenNavResourcesSafe(result.admin.id) : [];
  return withCors(
    req,
    NextResponse.json({
      id: result.admin.id,
      userName: result.admin.userName,
      role: result.admin.role,
      permissions: result.admin.permissions,
      hiddenNavResources,
    })
  );
}

// Explicit CORS preflight handler.
// Needed because browser will send OPTIONS before GET when Authorization header is present.
export async function OPTIONS(req: NextRequest) {
  return withCors(
    req,
    new NextResponse(null, {
      status: 204,
    })
  );
}
