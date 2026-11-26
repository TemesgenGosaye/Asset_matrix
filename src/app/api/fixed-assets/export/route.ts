import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  MASTER_LIST_COLUMNS,
  buildFixedAssetOrderBy,
  buildFixedAssetWhere,
  excelDateToCell,
} from "@/lib/fixed-asset-register";
import {
  CANONICAL_ASSET_COLUMNS,
  getCanonicalAssetValue,
} from "@/lib/asset-columns";
import {
  getFixedAssetContext,
  parseFixedAssetParams,
} from "@/lib/fixed-asset-api";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("fixedAssetRegister")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await requirePermission("asset:view");
    const context = await getFixedAssetContext(user);
    const params = parseFixedAssetParams(request.nextUrl.searchParams);
    params.page = 1;
    params.pageSize = 25_000;
    const where = buildFixedAssetWhere(
      params,
      context.organizationId,
      context.isAdmin,
      context.assignedAssetIds,
      context.availableStatusIds,
    );
    const ids = request.nextUrl.searchParams
      .get("ids")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids?.length) where.assetid = { in: ids };
    const orderBy = buildFixedAssetOrderBy(params);
    const assets = await prisma.asset.findMany({
      where,
      orderBy,
      include: {
        department: true,
        statusType: true,
        condition1Status: true,
        location: true,
        location1Rel: true,
        assetCategoryType: true,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Master List");
    sheet.addRow([...MASTER_LIST_COLUMNS]);
    sheet.getRow(1).font = { bold: true };

    assets.forEach((asset) => {
      sheet.addRow(
        CANONICAL_ASSET_COLUMNS.map((column) => {
          const value = getCanonicalAssetValue(asset, column.key);
          if (value instanceof Date) return excelDateToCell(value);
          if (typeof value === "boolean") return value ? "Yes" : "";
          return value ?? "";
        }),
      );
    });

    MASTER_LIST_COLUMNS.forEach((column, index) => {
      const widths: Record<string, number> = {
        "S/N0": 12,
        Description: 44,
        "Property No": 20,
        Dept: 18,
        "Finance No": 20,
      };
      sheet.getColumn(index + 1).width = widths[column] ?? 16;
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: MASTER_LIST_COLUMNS.length },
    };

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="fixed-assets-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error("Failed to export fixed assets", { error });
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
