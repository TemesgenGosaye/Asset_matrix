import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { generateNextHID } from "@/lib/household";

// GET /api/household/next-hid
export async function GET(req: NextRequest) {
  try {
    await requireApiAuth();
    const orgId = await requireOrgId();

    const nextHid = await generateNextHID(orgId);

    return NextResponse.json({ nextHid }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/household/next-hid",
      message: "Failed to generate next HID",
    });
  }
}

export const dynamic = "force-dynamic";