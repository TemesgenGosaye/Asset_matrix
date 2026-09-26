import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { listInspections } from "@/lib/house-queue/views";

// GET /api/house-queue/inspections?status=open|resolved|all&search=...
// Facility handback-inspection worklist. Requires house_queue:view.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("house_queue:view");
    const orgId = await requireOrgId();

    const { searchParams } = req.nextUrl;
    const rawStatus = searchParams.get("status");
    const status: "all" | "open" | "resolved" =
      rawStatus === "open" || rawStatus === "resolved" ? rawStatus : "all";
    const search = searchParams.get("search") ?? undefined;

    const inspections = await listInspections(orgId, { status, search });
    return NextResponse.json({ inspections }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/inspections",
      message: "Failed to fetch inspections",
    });
  }
}

export const dynamic = "force-dynamic";