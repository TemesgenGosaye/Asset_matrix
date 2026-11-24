import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  getFixedAssetContext,
  serializeFixedAsset,
} from "@/lib/fixed-asset-api";
import { createAuditLog } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ASSET_INCLUDE = {
  department: true,
  statusType: true,
  location: true,
  assetCategoryType: true,
  manufacturer: true,
  model: true,
  supplier: true,
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await requirePermission("asset:view");
    const context = await getFixedAssetContext(user);
    const { id } = await params;
    const asset = await prisma.asset.findFirst({
      where: { assetid: id, organizationId: context.organizationId },
      include: ASSET_INCLUDE,
    });
    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    return NextResponse.json({ item: serializeFixedAsset(asset) });
  } catch (error) {
    logger.error("Failed to load fixed asset", { error });
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const demoBlock = requireNotDemoMode();
  if (demoBlock) return demoBlock;
  try {
    const user = await requirePermission("asset:edit");
    const context = await getFixedAssetContext(user);
    const { id } = await params;
    const existing = await prisma.asset.findFirst({
      where: { assetid: id, organizationId: context.organizationId },
    });
    if (!existing)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    const textFields = [
      "categoryCode",
      "serialNo",
      "condition1",
      "condition1Raw",
      "location1",
      "location2Raw",
      "condition2Raw",
      "reviewDate2Raw",
      "financeNo1",
      "financeNo2",
      "additionalData",
    ] as const;
    for (const field of textFields) {
      if (typeof body[field] === "string") data[field] = body[field];
    }
    for (const field of ["reviewDate1", "reviewsDate"] as const) {
      if (typeof body[field] === "string" && body[field]) {
        const date = new Date(body[field]);
        if (!Number.isNaN(date.getTime())) data[field] = date;
      }
    }
    if (typeof body.hiddenInSource === "boolean")
      data.hiddenInSource = body.hiddenInSource;

    if (!Object.keys(data).length) {
      return NextResponse.json(
        { error: "No editable fields provided" },
        { status: 400 },
      );
    }

    const updated = await prisma.asset.update({
      where: { assetid: id },
      data,
      include: ASSET_INCLUDE,
    });
    await createAuditLog({
      userId: user.id ?? null,
      action: "asset.register.update",
      entity: "asset",
      entityId: id,
      details: { before: existing, after: updated, fields: Object.keys(data) },
    });
    return NextResponse.json({ item: serializeFixedAsset(updated) });
  } catch (error) {
    logger.error("Failed to update fixed asset", { error });
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
