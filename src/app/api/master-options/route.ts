import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/organization-context";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function normalize(val: string | null | undefined): string {
  if (!val) return "";
  return val.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compute simple Levenshtein distance for near-duplicate warnings.
 */
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
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
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
  usageCount: number;
  departmentUsageCount?: number;
  isLegacy?: boolean;
}

// GET /api/master-options
export async function GET(req: NextRequest) {
  try {
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") || "location"; // location1, location2, location, department, category, status
    const q = (searchParams.get("q") || "").trim();
    const departmentId = searchParams.get("departmentId") || null;
    const currentId = searchParams.get("currentId") || null;
    const currentValue = searchParams.get("currentValue") || null;
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const normQ = normalize(q);

    let items: MasterOption[] = [];

    if (type === "location" || type === "location1" || type === "location2") {
      // Find matching active locations
      let whereClause = `l."organizationId" = '${orgId}' AND l."isActive" = true`;
      if (normQ) {
        whereClause += ` AND (l."normalizedName" ILIKE '%${normQ.replace(/'/g, "''")}%' OR l.locationname ILIKE '%${q.replace(/'/g, "''")}%')`;
      }

      // If departmentId is provided, rank by usage in that department
      let deptJoin = "";
      let deptSelect = "0 as dept_usage";
      if (departmentId) {
        const locCol = type === "location1" ? `"location1Id"` : "locationid";
        deptJoin = `
          LEFT JOIN (
            SELECT ${locCol} as loc_id, COUNT(*) as d_cnt
            FROM asset
            WHERE "departmentId" = '${departmentId}' AND ${locCol} IS NOT NULL
            GROUP BY ${locCol}
          ) dept_usage_sub ON dept_usage_sub.loc_id = l.locationid
        `;
        deptSelect = "COALESCE(dept_usage_sub.d_cnt, 0) as dept_usage";
      }

      const query = `
        SELECT 
          l.locationid as id,
          l.locationname as name,
          l."usageCount" as usage_count,
          ${deptSelect}
        FROM location l
        ${deptJoin}
        WHERE ${whereClause}
        ORDER BY dept_usage DESC, l."usageCount" DESC, l.locationname ASC
        LIMIT ${limit};
      `;

      const res = await prisma.$queryRawUnsafe<any[]>(query);
      items = res.map((r) => ({
        id: r.id,
        name: r.name || "Unnamed location",
        usageCount: Number(r.usage_count || 0),
        departmentUsageCount: Number(r.dept_usage || 0),
      }));

    } else if (type === "category") {
      let whereClause = `c."organizationId" = '${orgId}' AND c."isActive" = true`;
      if (normQ) {
        whereClause += ` AND (c."normalizedName" ILIKE '%${normQ.replace(/'/g, "''")}%' OR c."assetTypeCode" ILIKE '%${q.replace(/'/g, "''")}%' OR c.assetcategorytypename ILIKE '%${q.replace(/'/g, "''")}%')`;
      }

      let deptJoin = "";
      let deptSelect = "0 as dept_usage";
      if (departmentId) {
        deptJoin = `
          LEFT JOIN (
            SELECT assetcategorytypeid as cat_id, COUNT(*) as d_cnt
            FROM asset
            WHERE "departmentId" = '${departmentId}' AND assetcategorytypeid IS NOT NULL
            GROUP BY assetcategorytypeid
          ) dept_sub ON dept_sub.cat_id = c.assetcategorytypeid
        `;
        deptSelect = "COALESCE(dept_sub.d_cnt, 0) as dept_usage";
      }

      const query = `
        SELECT 
          c.assetcategorytypeid as id,
          c.assetcategorytypename as name,
          c."assetTypeCode" as code,
          c."usageCount" as usage_count,
          ${deptSelect}
        FROM "assetCategoryType" c
        ${deptJoin}
        WHERE ${whereClause}
        ORDER BY dept_usage DESC, c."usageCount" DESC, c.assetcategorytypename ASC
        LIMIT ${limit};
      `;

      const res = await prisma.$queryRawUnsafe<any[]>(query);
      items = res.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        usageCount: Number(r.usage_count || 0),
        departmentUsageCount: Number(r.dept_usage || 0),
      }));

    } else if (type === "department") {
      let whereClause = `d."organizationId" = '${orgId}' AND d."isActive" = true`;
      if (normQ) {
        whereClause += ` AND (LOWER(d.name) ILIKE '%${normQ.replace(/'/g, "''")}%' OR LOWER(COALESCE(d.code, '')) ILIKE '%${normQ.replace(/'/g, "''")}%')`;
      }

      const query = `
        SELECT 
          d.id as id,
          d.name as name,
          d.code as code,
          COALESCE(d."sortOrder", 0) as usage_count
        FROM departments d
        WHERE ${whereClause}
        ORDER BY usage_count DESC, d.name ASC
        LIMIT ${limit};
      `;

      const res = await prisma.$queryRawUnsafe<any[]>(query);
      items = res.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        usageCount: Number(r.usage_count || 0),
      }));

    } else if (type === "status") {
      let whereClause = `(s."organizationId" = '${orgId}' OR s."organizationId" IS NULL) AND s."isActive" = true`;
      if (normQ) {
        whereClause += ` AND (s."normalizedName" ILIKE '%${normQ.replace(/'/g, "''")}%' OR s.statustypename ILIKE '%${q.replace(/'/g, "''")}%')`;
      }

      const query = `
        SELECT 
          s.statustypeid as id,
          s.statustypename as name,
          s."usageCount" as usage_count
        FROM "statusType" s
        WHERE ${whereClause}
        ORDER BY s."usageCount" DESC, s.statustypename ASC
        LIMIT ${limit};
      `;

      const res = await prisma.$queryRawUnsafe<any[]>(query);
      items = res.map((r) => ({
        id: r.id,
        name: r.name,
        usageCount: Number(r.usage_count || 0),
      }));
    }

    // Handle current item preservation (Rule 7: Legacy values)
    if (currentId && !items.some((item) => item.id === currentId)) {
      if (type.startsWith("location")) {
        const cur = await prisma.location.findUnique({
          where: { locationid: currentId },
          select: { locationid: true, locationname: true, usageCount: true },
        });
        if (cur) {
          items.unshift({
            id: cur.locationid,
            name: cur.locationname || "Current Location",
            usageCount: cur.usageCount,
          });
        }
      } else if (type === "category") {
        const cur = await prisma.assetCategoryType.findUnique({
          where: { assetcategorytypeid: currentId },
          select: { assetcategorytypeid: true, assetcategorytypename: true, assetTypeCode: true, usageCount: true },
        });
        if (cur) {
          items.unshift({
            id: cur.assetcategorytypeid,
            name: cur.assetcategorytypename,
            code: cur.assetTypeCode,
            usageCount: cur.usageCount,
          });
        }
      } else if (type === "department") {
        const cur = await prisma.department.findUnique({
          where: { id: currentId },
          select: { id: true, name: true, code: true, sortOrder: true },
        });
        if (cur) {
          items.unshift({
            id: cur.id,
            name: cur.name,
            code: cur.code,
            usageCount: cur.sortOrder || 0,
          });
        }
      } else if (type === "status") {
        const cur = await prisma.statusType.findUnique({
          where: { statustypeid: currentId },
          select: { statustypeid: true, statustypename: true, usageCount: true },
        });
        if (cur) {
          items.unshift({
            id: cur.statustypeid,
            name: cur.statustypename,
            usageCount: cur.usageCount,
          });
        }
      }
    }

    // If current raw text value has no matched master ID, add it as a legacy value
    if (currentValue && !currentId && !items.some((i) => i.name.toLowerCase() === currentValue.toLowerCase())) {
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
      { error: "Failed to load options", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

// POST /api/master-options (Add new option with near-duplicate warning & audit logging)
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

    // 1. Check for exact or near duplicate
    if (!force) {
      if (type === "location" || type === "location1" || type === "location2") {
        const candidates = await prisma.location.findMany({
          where: { organizationId: orgId },
          select: { locationid: true, locationname: true, normalizedName: true },
        });

        // Exact match check
        const exact = candidates.find((c) => c.normalizedName === norm);
        if (exact) {
          return NextResponse.json({
            warning: `An option with the same name already exists: "${exact.locationname}".`,
            existingItem: { id: exact.locationid, name: exact.locationname },
            duplicate: true,
          }, { status: 409 });
        }

        // Near duplicate check (Levenshtein distance <= 2)
        const near = candidates.find(
          (c) => c.normalizedName && levenshtein(c.normalizedName, norm) <= 2
        );
        if (near) {
          return NextResponse.json({
            warning: `Similar option already exists: "${near.locationname}". Are you sure you want to add "${trimmed}"?`,
            nearMatch: { id: near.locationid, name: near.locationname },
            requiresConfirmation: true,
          }, { status: 409 });
        }
      } else if (type === "category") {
        const candidates = await prisma.assetCategoryType.findMany({
          where: { organizationId: orgId },
          select: { assetcategorytypeid: true, assetcategorytypename: true, normalizedName: true },
        });
        const exact = candidates.find((c) => c.normalizedName === norm);
        if (exact) {
          return NextResponse.json({
            warning: `Category code "${exact.assetcategorytypename}" already exists.`,
            existingItem: { id: exact.assetcategorytypeid, name: exact.assetcategorytypename },
            duplicate: true,
          }, { status: 409 });
        }
      }
    }

    // 2. Insert into target master
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
      return NextResponse.json({ error: "Unsupported master type" }, { status: 400 });
    }

    return NextResponse.json({ item: createdItem }, { status: 201 });
  } catch (error) {
    logger.error("Failed to add new master option", { error });
    return NextResponse.json(
      { error: "Failed to add option", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
