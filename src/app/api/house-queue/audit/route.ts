import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { listAuditForEmployee } from "@/lib/house-queue/service";

// GET /api/house-queue/audit?employeeId=<uuid>
// Returns the audit trail for one employee's house-queue thread.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("house_queue:audit");

    const orgId = await requireOrgId();
    const employeeId = req.nextUrl.searchParams.get("employeeId");

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId query parameter is required" },
        { status: 400 },
      );
    }

    const logs = await listAuditForEmployee(orgId, employeeId);

    return NextResponse.json({ logs }, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/audit",
      message: "Failed to load the audit trail",
    });
  }
}