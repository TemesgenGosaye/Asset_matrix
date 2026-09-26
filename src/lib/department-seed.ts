import prisma from "./prisma";
import { OFFICIAL_DEPARTMENTS } from "./department-master";
import { logger } from "./logger";

export interface DepartmentSeedResult {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
}

/**
 * Idempotently load the official Metahara department master book into the
 * given organization. Parents are written first so hierarchy linking works;
 * every row is matched on the (code, organizationId) unique key.
 */
export async function seedOfficialDepartments(
  organizationId: string,
): Promise<DepartmentSeedResult> {
  if (!organizationId) {
    throw new Error("Organization ID required to seed departments");
  }

  const result: DepartmentSeedResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    total: OFFICIAL_DEPARTMENTS.length,
  };

  // Resolve each official department's parent row (by parent code) as we insert
  // in master-book order (parents always precede children in OFFICIAL_DEPARTMENTS).
  const codeToId = new Map<string, string>();

  for (const dept of OFFICIAL_DEPARTMENTS) {
    const parentId = dept.parentCode ? codeToId.get(dept.parentCode) ?? null : null;

    const existing = await prisma.department.findUnique({
      where: {
        code_organizationId: { code: dept.code, organizationId },
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        sortOrder: true,
        isActive: true,
      },
    });

    codeToId.set(dept.code, existing?.id ?? "pending");

    const data = {
      name: dept.name,
      parentId,
      sortOrder: dept.sortOrder,
      isActive: true,
    };

    if (existing) {
      if (
        existing.name === dept.name &&
        existing.parentId === parentId &&
        existing.sortOrder === dept.sortOrder &&
        existing.isActive === true
      ) {
        result.unchanged += 1;
        codeToId.set(dept.code, existing.id);
        continue;
      }
      await prisma.department.update({ where: { id: existing.id }, data });
      codeToId.set(dept.code, existing.id);
      result.updated += 1;
    } else {
      const created = await prisma.department.create({
        data: {
          code: dept.code,
          name: dept.name,
          parentId,
          sortOrder: dept.sortOrder,
          isActive: true,
          organizationId,
        },
        select: { id: true },
      });
      codeToId.set(dept.code, created.id);
      result.created += 1;
    }
  }

  // Re-point any rows whose parent wasn't resolvable on first pass.
  for (const dept of OFFICIAL_DEPARTMENTS) {
    if (!dept.parentCode) continue;
    const parentId = codeToId.get(dept.parentCode) || null;
    await prisma.department.updateMany({
      where: { code: dept.code, organizationId },
      data: { parentId },
    });
  }

  logger.info("Seeded official departments", {
    organizationId,
    result,
  });
  return result;
}

/**
 * True when the organization already has at least one department row.
 */
export async function hasDepartments(organizationId: string): Promise<boolean> {
  const count = await prisma.department.count({ where: { organizationId } });
  return count > 0;
}