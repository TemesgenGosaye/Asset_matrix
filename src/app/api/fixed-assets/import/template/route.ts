import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { generateFixedAssetTemplate } from "@/lib/fixed-asset-import";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await requirePermission("import:execute");
    const buffer = await generateFixedAssetTemplate();
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="fixed-asset-master-list-template.xlsx"',
      },
    });
  } catch (error) {
    logger.error("Failed to generate fixed asset template", { error });
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Unauthorized"
        ? 401
        : message.startsWith("Forbidden")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
