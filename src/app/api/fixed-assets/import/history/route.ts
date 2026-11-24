import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizationContext } from "@/lib/organization-context";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await requirePermission("asset:view");
    const ctx = await getOrganizationContext();
    const organizationId = user.organizationId ?? ctx?.organization?.id;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 403 },
      );
    }
    const take = Math.min(
      Number(request.nextUrl.searchParams.get("take") ?? "50") || 50,
      200,
    );
    const jobs = await prisma.importJob.findMany({
      where: { entityType: "fixed_asset_register", organizationId },
      orderBy: { createdAt: "desc" },
      take,
      include: { _count: { select: { rows: true } } },
    });
    return NextResponse.json({
      items: jobs.map((job) => ({
        id: job.id,
        fileName: job.fileName,
        fileSize: job.fileSize,
        status: job.status,
        mode: job.mode,
        totalRows: job.totalRows,
        successCount: job.successCount,
        errorCount: job.errorCount,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        finishedAt: job.finishedAt,
        rowCount: job._count.rows,
      })),
    });
  } catch (error) {
    logger.error("Failed to list fixed asset imports", { error });
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
