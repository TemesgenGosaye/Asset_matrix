import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import { generateFixedAssetImportReport } from "@/lib/fixed-asset-import";
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
    const report = await generateFixedAssetImportReport(id, organizationId);
    return new NextResponse(new Uint8Array(report), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="fixed-asset-import-${id}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error("Failed to generate fixed asset import report", { error });
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
