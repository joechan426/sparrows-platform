import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
  });
}
