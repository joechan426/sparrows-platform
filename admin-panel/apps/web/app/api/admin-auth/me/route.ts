import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "../../../../lib/admin-auth";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Credentials", "false");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  return res;
}

// GET /api/admin-auth/me — return current admin (requires Authorization: Bearer <token>)
export async function GET(req: NextRequest) {
  const result = await requireAdminAuth(req, "any");
  if (!result.ok) return withCors(result.response);
  return withCors(
    NextResponse.json({
      id: result.admin.id,
      userName: result.admin.userName,
      role: result.admin.role,
      permissions: result.admin.permissions,
    })
  );
}
