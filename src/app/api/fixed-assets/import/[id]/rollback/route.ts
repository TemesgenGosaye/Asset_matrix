import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import { rollbackFixedAssetImport } from "@/lib/fixed-asset-import";
import { invalidateFixedAssetAnalytics } from "@/lib/fixed-asset-analytics/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const demoBlock = requireNotDemoMode();
  if (demoBlock) return demoBlock;
  try {
    const user = await requirePermission("asset:edit");
    const ctx = await getOrganizationContext();
    const organizationId = user.organizationId ?? ctx?.organization?.id;
    if (!organizationId || !user.id) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const result = await rollbackFixedAssetImport(id, organizationId, user.id);
    await invalidateFixedAssetAnalytics();
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to roll back fixed asset import", { error });
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Unauthorized"
        ? 401
        : message.startsWith("Forbidden")
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
