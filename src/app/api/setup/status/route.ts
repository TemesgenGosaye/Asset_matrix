import { NextResponse } from "next/server";

/**
 * GET /api/setup/status
 *
 * Setup is disabled. The application always starts at /login.
 */
export async function GET() {
  return NextResponse.json({ needsSetup: false });
}

export const dynamic = "force-dynamic";
