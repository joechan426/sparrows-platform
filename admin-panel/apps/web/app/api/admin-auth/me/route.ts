import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "../../../../lib/admin-auth";

// GET /api/admin-auth/me — return current admin (requires Authorization: Bearer <token>)
export async function GET(req: NextRequest) {
  const result = await requireAdminAuth(req, "any");
  if (!result.ok) return result.response;
  return NextResponse.json({
    id: result.admin.id,
    userName: result.admin.userName,
    role: result.admin.role,
    permissions: result.admin.permissions,
  });
}
