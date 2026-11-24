import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import { getFixedAssetImportResult } from "@/lib/fixed-asset-import";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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
    return NextResponse.json(
      await getFixedAssetImportResult(id, organizationId),
    );
  } catch (error) {
    logger.error("Failed to get fixed asset import progress", { error });
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
