import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import { processFixedAssetImportChunk } from "@/lib/fixed-asset-import";
import { invalidateCacheByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Context) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const demoBlock = requireNotDemoMode();
  if (demoBlock) return demoBlock;
  try {
    await requirePermission("import:execute");
    const ctx = await getOrganizationContext();
    const organizationId = ctx?.organization?.id;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 403 },
      );
    }
    const { id } = await context.params;
    const progress = await processFixedAssetImportChunk(id, organizationId);
    if (progress.done) {
      invalidateCacheByPrefix("assets_");
      invalidateCacheByPrefix("asset_count");
    }
    return NextResponse.json(progress);
  } catch (error) {
    logger.error("Failed to process fixed asset import chunk", { error });
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
