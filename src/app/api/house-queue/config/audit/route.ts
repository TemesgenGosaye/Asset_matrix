import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { getConfigAudit } from "@/lib/house-queue/config/service";

// GET /api/house-queue/config/audit?versionId=<uuid>&limit=<n>
// Field-level config audit trail, newest first. Optionally scoped to a
// single config version.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("house_queue:manage");
    const orgId = await requireOrgId();

    const versionId = req.nextUrl.searchParams.get("versionId") ?? undefined;
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    const entries = await getConfigAudit(orgId, {
      versionId,
      ...(Number.isFinite(limit) ? { limit } : {}),
    });

    return NextResponse.json({
      entries: entries.map((e) => ({
        ...e,
        changedAt: e.changedAt.toISOString(),
      })),
    });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/config/audit",
      message: "Failed to load the configuration audit trail",
    });
  }
}

export const dynamic = "force-dynamic";
