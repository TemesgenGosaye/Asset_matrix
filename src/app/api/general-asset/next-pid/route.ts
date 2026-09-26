import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getOrganizationContext } from "@/lib/organization-context";
import { generateNextPID } from "@/lib/general-asset";

export const dynamic = "force-dynamic";

// GET /api/general-asset/next-pid?itemType=Machinery%20%26%20Equipment
export async function GET(req: NextRequest) {
  try {
    await requirePermission("general_asset:create");

    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 },
      );
    }

    const itemType = req.nextUrl.searchParams.get("itemType")?.trim();
    if (!itemType) {
      return NextResponse.json(
        { error: "itemType query parameter is required" },
        { status: 400 },
      );
    }

    const pid = await generateNextPID(orgId, itemType);
    return NextResponse.json({ pid }, { status: 200 });
  } catch (e) {
    logger.error("GET /api/general-asset/next-pid error", { error: e });
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to generate next PID" },
      { status: 500 },
    );
  }
}