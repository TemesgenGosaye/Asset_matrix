import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/organization-context";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_OPTIONS = 5000;

function normalize(val: string | null | undefined): string {
  if (!val) return "";
  return val.trim().replace(/\s+/g, " ").toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[bn][an];
}

export interface MasterOption {
  id: string;
  name: string;
  code?: string | null;
  color?: string | null;
  usageCount: number;
  departmentUsageCount?: number;
  isLegacy?: boolean;
  isCurrent?: boolean;
}

function sortOptions(items: MasterOption[]): MasterOption[] {
  return items.sort((a, b) => {
    const deptDelta =
      (b.departmentUsageCount ?? 0) - (a.departmentUsageCount ?? 0);
    if (deptDelta !== 0) return deptDelta;
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return a.name.localeCompare(b.name);
  });
}

export async function GET(req: NextRequest) {
  try {
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") || "location";
    const q = (searchParams.get("q") || "").trim();
    const departmentId = searchParams.get("departmentId") || null;
    const currentId = searchParams.get("currentId") || null;
    const currentValue = searchParams.get("currentValue") || null;
    const requestedLimit = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_OPTIONS)
      : 50;

    const qFilter = q
      ? { contains: q, mode: "insensitive" as const }
      : undefined;
    const normalizedQuery = normalize(q);
    const normalizedFilter = normalizedQuery
      ? { contains: normalizedQuery, mode: "insensitive" as const }
      : undefined;
    const orgScope = {
      OR: [{ organizationId: orgId }, { organizationId: null }],
    };

    let items: MasterOption[] = [];

    if (type === "location" || type === "location1" || type === "location2") {
      const where: Prisma.locationWhereInput = {
        ...orgScope,
        isActive: true,
        ...(q
          ? {
              OR: [
                { locationname: qFilter },
                { normalizedName: normalizedFilter },
              ],
            }
          : {}),
      };
      const candidates = await prisma.location.findMany({
        where,
        select: {
          locationid: true,
          locationname: true,
          usageCount: true,
        },
        orderBy: [{ usageCount: "desc" }, { locationname: "asc" }],
        take: MAX_OPTIONS,
      });
      const usageByDepartment = new Map<string, number>();
      if (departmentId && candidates.length) {
        const ids = candidates.map((item) => item.locationid);
        if (type === "location1") {
          const grouped = await prisma.asset.groupBy({
            by: ["location1Id"],
            where: {
              organizationId: orgId,
              departmentId,
              location1Id: { in: ids },
            },
            _count: { _all: true },
          });
          for (const row of grouped) {
            if (row.location1Id) {
              usageByDepartment.set(row.location1Id, row._count._all);
            }
          }
        } else {
          const grouped = await prisma.asset.groupBy({
            by: ["locationid"],
            where: {
              organizationId: orgId,
              departmentId,
              locationid: { in: ids },
            },
            _count: { _all: true },
          });
          for (const row of grouped) {
            if (row.locationid) {
              usageByDepartment.set(row.locationid, row._count._all);
            }
          }
        }
      }
      items = sortOptions(
        candidates.map((item) => ({
          id: item.locationid,
          name: item.locationname || "Unnamed location",
          usageCount: item.usageCount,
          departmentUsageCount: usageByDepartment.get(item.locationid) ?? 0,
        })),
      ).slice(0, limit);
    } else if (type === "category") {
      const where: Prisma.assetCategoryTypeWhereInput = {
        ...orgScope,
        isActive: true,
        ...(q
          ? {
              OR: [
                { assetcategorytypename: qFilter },
                { assetTypeCode: qFilter },
                { normalizedName: normalizedFilter },
              ],
            }
          : {}),
      };
      const candidates = await prisma.assetCategoryType.findMany({
        where,
        select: {
          assetcategorytypeid: true,
          assetcategorytypename: true,
          assetTypeCode: true,
          usageCount: true,
        },
        orderBy: [{ usageCount: "desc" }, { assetcategorytypename: "asc" }],
        take: MAX_OPTIONS,
      });
      const usageByDepartment = new Map<string, number>();
      if (departmentId && candidates.length) {
        const grouped = await prisma.asset.groupBy({
          by: ["assetcategorytypeid"],
          where: {
            organizationId: orgId,
            departmentId,
            assetcategorytypeid: {
              in: candidates.map((item) => item.assetcategorytypeid),
            },
          },
          _count: { _all: true },
        });
        for (const row of grouped) {
          if (row.assetcategorytypeid) {
            usageByDepartment.set(row.assetcategorytypeid, row._count._all);
          }
        }
      }
      items = sortOptions(
        candidates.map((item) => ({
          id: item.assetcategorytypeid,
          name: item.assetcategorytypename,
          code: item.assetTypeCode,
          usageCount: item.usageCount,
          departmentUsageCount:
            usageByDepartment.get(item.assetcategorytypeid) ?? 0,
        })),
      ).slice(0, limit);
    } else if (type === "department") {
      const where: Prisma.DepartmentWhereInput = {
        organizationId: orgId,
        isActive: true,
        ...(q ? { OR: [{ name: qFilter }, { code: qFilter }] } : {}),
      };
      const candidates = await prisma.department.findMany({
        where,
        select: { id: true, name: true, code: true, sortOrder: true },
        orderBy: [{ sortOrder: "desc" }, { name: "asc" }],
        take: limit,
      });
      items = candidates.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        usageCount: item.sortOrder,
      }));
    } else if (type === "assetName") {
      const candidates = await prisma.asset.groupBy({
        by: ["assetname"],
        where: {
          organizationId: orgId,
          ...(q ? { assetname: qFilter } : {}),
        },
        _count: { _all: true },
        orderBy: { assetname: "asc" },
        take: limit,
      });
      items = sortOptions(
        candidates.map((item) => ({
          id: item.assetname,
          name: item.assetname,
          usageCount: item._count._all,
        })),
      );
    } else if (type === "status") {
      const where: Prisma.statusTypeWhereInput = {
        ...orgScope,
        isActive: true,
        ...(q
          ? {
              OR: [
                { statustypename: qFilter },
                { normalizedName: normalizedFilter },
              ],
            }
          : {}),
      };
      const candidates = await prisma.statusType.findMany({
        where,
        select: {
          statustypeid: true,
          statustypename: true,
          color: true,
          usageCount: true,
        },
        orderBy: [{ usageCount: "desc" }, { statustypename: "asc" }],
        take: limit,
      });
      items = candidates.map((item) => ({
        id: item.statustypeid,
        name: item.statustypename,
        color: item.color,
        usageCount: item.usageCount,
      }));
    }

    if (currentId && !items.some((item) => item.id === currentId)) {
      if (type.startsWith("location")) {
        const current = await prisma.location.findFirst({
          where: { locationid: currentId, ...orgScope },
          select: {
            locationid: true,
            locationname: true,
            usageCount: true,
            isActive: true,
          },
        });
        if (current) {
          items.unshift({
            id: current.locationid,
            name: current.locationname || "Current Location",
            usageCount: current.usageCount,
            isCurrent: true,
          });
        }
      } else if (type === "category") {
        const current = await prisma.assetCategoryType.findFirst({
          where: { assetcategorytypeid: currentId, ...orgScope },
          select: {
            assetcategorytypeid: true,
            assetcategorytypename: true,
            assetTypeCode: true,
            usageCount: true,
            isActive: true,
          },
        });
        if (current) {
          items.unshift({
            id: current.assetcategorytypeid,
            name: current.assetcategorytypename,
            code: current.assetTypeCode,
            usageCount: current.usageCount,
            isCurrent: true,
          });
        }
      } else if (type === "department") {
        const current = await prisma.department.findFirst({
          where: { id: currentId, organizationId: orgId },
          select: { id: true, name: true, code: true, sortOrder: true },
        });
        if (current) {
          items.unshift({
            id: current.id,
            name: current.name,
            code: current.code,
            usageCount: current.sortOrder,
            isCurrent: true,
          });
        }
      } else if (type === "assetName") {
        items.unshift({
          id: currentId,
          name: currentId,
          usageCount: 0,
          isCurrent: true,
        });
      } else if (type === "status") {
        const current = await prisma.statusType.findFirst({
          where: { statustypeid: currentId, ...orgScope },
          select: {
            statustypeid: true,
            statustypename: true,
            color: true,
            usageCount: true,
            isActive: true,
          },
        });
        if (current) {
          items.unshift({
            id: current.statustypeid,
            name: current.statustypename,
            color: current.color,
            usageCount: current.usageCount,
            isCurrent: true,
          });
        }
      }
    }

    if (
      currentValue &&
      !currentId &&
      !items.some(
        (item) => item.name.toLowerCase() === currentValue.toLowerCase(),
      )
    ) {
      items.unshift({
        id: `legacy:${currentValue}`,
        name: currentValue,
        usageCount: 0,
        isLegacy: true,
      });
    }

    return NextResponse.json({ items });
  } catch (error) {
    logger.error("Failed to fetch master options", { error });
    return NextResponse.json(
      {
        error: "Failed to load options",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("asset:create");
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, name, force } = body;
    const trimmed = (name || "").trim().replace(/\s+/g, " ");

    if (!trimmed) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const norm = normalize(trimmed);

    if (!force) {
      if (type === "location" || type === "location1" || type === "location2") {
        const candidates = await prisma.location.findMany({
          where: { organizationId: orgId },
          select: {
            locationid: true,
            locationname: true,
            normalizedName: true,
          },
        });

        const exact = candidates.find((item) => item.normalizedName === norm);
        if (exact) {
          return NextResponse.json(
            {
              warning: `An option with the same name already exists: "${exact.locationname}".`,
              existingItem: { id: exact.locationid, name: exact.locationname },
              duplicate: true,
            },
            { status: 409 },
          );
        }

        const near = candidates.find(
          (item) =>
            item.normalizedName && levenshtein(item.normalizedName, norm) <= 2,
        );
        if (near) {
          return NextResponse.json(
            {
              warning: `Similar option already exists: "${near.locationname}". Are you sure you want to add "${trimmed}"?`,
              nearMatch: { id: near.locationid, name: near.locationname },
              requiresConfirmation: true,
            },
            { status: 409 },
          );
        }
      } else if (type === "category") {
        const candidates = await prisma.assetCategoryType.findMany({
          where: { organizationId: orgId },
          select: {
            assetcategorytypeid: true,
            assetcategorytypename: true,
            normalizedName: true,
          },
        });
        const exact = candidates.find((item) => item.normalizedName === norm);
        if (exact) {
          return NextResponse.json(
            {
              warning: `Category code "${exact.assetcategorytypename}" already exists.`,
              existingItem: {
                id: exact.assetcategorytypeid,
                name: exact.assetcategorytypename,
              },
              duplicate: true,
            },
            { status: 409 },
          );
        }
      }
    }

    let createdItem: MasterOption;

    if (type === "location" || type === "location1" || type === "location2") {
      const created = await prisma.location.create({
        data: {
          locationname: trimmed,
          normalizedName: norm,
          organizationId: orgId,
          isActive: true,
          usageCount: 1,
          creation_date: new Date(),
          change_date: new Date(),
        },
      });

      await createAuditLog({
        userId: user.id ?? null,
        action: "location.create",
        entity: "location",
        entityId: created.locationid,
        details: { name: trimmed, normalizedName: norm },
      });

      createdItem = {
        id: created.locationid,
        name: created.locationname || trimmed,
        usageCount: 1,
      };
    } else if (type === "category") {
      const created = await prisma.assetCategoryType.create({
        data: {
          assetcategorytypename: trimmed,
          assetTypeCode: trimmed,
          normalizedName: norm,
          organizationId: orgId,
          isActive: true,
          usageCount: 1,
        },
      });

      await createAuditLog({
        userId: user.id ?? null,
        action: "assetCategory.create",
        entity: "assetCategory",
        entityId: created.assetcategorytypeid,
        details: { code: trimmed },
      });

      createdItem = {
        id: created.assetcategorytypeid,
        name: created.assetcategorytypename,
        code: created.assetTypeCode,
        usageCount: 1,
      };
    } else {
      return NextResponse.json(
        { error: "Unsupported master type" },
        { status: 400 },
      );
    }

    return NextResponse.json({ item: createdItem }, { status: 201 });
  } catch (error) {
    logger.error("Failed to add new master option", { error });
    return NextResponse.json(
      {
        error: "Failed to add option",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
