import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const MSF_PID_PREFIX = "1-06";

export interface PidGenerationResult {
  pid: string;
  assetTypeCode: string;
  departmentCode: string;
  sequence: number;
}

/**
 * Format a Metahara Sugar Asset PID given its components:
 * 1-06-{ASSET_TYPE_CODE}-{DEPARTMENT_CODE}-{SEQUENCE}
 */
export function formatPid(
  assetTypeCode: string,
  departmentCode: string,
  sequence: number,
): string {
  const seqStr = String(sequence).padStart(3, "0");
  return `${MSF_PID_PREFIX}-${assetTypeCode.trim()}-${departmentCode.trim()}-${seqStr}`;
}

/**
 * Extract the highest existing integer sequence from serialnumber strings
 * matching the prefix "1-06-{assetTypeCode}-{departmentCode}-".
 */
export function extractMaxExistingSequence(
  serials: Array<{ serialnumber: string }>,
  assetTypeCode: string,
  departmentCode: string,
): number {
  const escapedType = assetTypeCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedDept = departmentCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^${MSF_PID_PREFIX}-${escapedType}-${escapedDept}-(\\d+)$`,
  );

  let maxSeq = 0;
  for (const item of serials) {
    if (!item.serialnumber) continue;
    const match = item.serialnumber.trim().match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  return maxSeq;
}

/**
 * Server-side preview of the next PID for a given Asset Type and Department.
 * This is a read-only peek that does NOT advance the sequence counter.
 */
export async function previewNextPid({
  categoryId,
  departmentId,
  orgId,
}: {
  categoryId: string;
  departmentId: string;
  orgId?: string | null;
}): Promise<PidGenerationResult> {
  if (!categoryId) {
    throw new Error("Asset Type is required to generate a PID.");
  }
  if (!departmentId) {
    throw new Error("Department is required to generate a PID.");
  }

  // 1. Fetch official Asset Type
  const category = await prisma.assetCategoryType.findFirst({
    where: {
      assetcategorytypeid: categoryId,
      ...(orgId
        ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
        : {}),
    },
    select: {
      assetcategorytypeid: true,
      assetTypeCode: true,
      assetcategorytypename: true,
    },
  });

  if (!category) {
    throw new Error("Selected Asset Type does not exist or is not accessible.");
  }

  // Enforce structured database column assetTypeCode
  const assetTypeCode = category.assetTypeCode?.trim();
  if (!assetTypeCode) {
    throw new Error(
      `Asset Type "${category.assetcategorytypename}" does not have an official code in the database.`,
    );
  }

  // 2. Fetch official Department
  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      ...(orgId ? { organizationId: orgId } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  });

  if (!department) {
    throw new Error("Selected Department does not exist in this organization.");
  }
  if (!department.isActive) {
    throw new Error("Selected Department is inactive.");
  }

  // Enforce structured database column departmentCode
  const departmentCode = department.code?.trim();
  if (!departmentCode) {
    throw new Error(
      `Department "${department.name}" does not have an official code in the database.`,
    );
  }

  // 3. Check existing assets with this prefix to account for gaps/historical records
  const prefix = `${MSF_PID_PREFIX}-${assetTypeCode}-${departmentCode}-`;
  const existingAssets = await prisma.asset.findMany({
    where: {
      serialnumber: { startsWith: prefix },
    },
    select: { serialnumber: true },
  });

  const maxExisting = extractMaxExistingSequence(
    existingAssets,
    assetTypeCode,
    departmentCode,
  );

  // 4. Check sequence tracker table
  const seqRecord = await prisma.assetPidSequence.findUnique({
    where: {
      assetTypeCode_departmentCode: {
        assetTypeCode,
        departmentCode,
      },
    },
    select: { lastSequence: true },
  });

  const lastTracked = seqRecord?.lastSequence ?? 0;
  const nextSequence = Math.max(lastTracked, maxExisting) + 1;
  const pid = formatPid(assetTypeCode, departmentCode, nextSequence);

  return {
    pid,
    assetTypeCode,
    departmentCode,
    sequence: nextSequence,
  };
}

/**
 * Server-side atomic PID generator executed inside a database transaction.
 *
 * Concurrency & Collision Safety:
 * Uses PostgreSQL row-level locks via `INSERT ... ON CONFLICT ("assetTypeCode", "departmentCode")
 * DO UPDATE SET ... RETURNING "lastSequence"`.
 * Concurrent transactions on the same (assetTypeCode, departmentCode) pair are serialized
 * by PostgreSQL at the row level, preventing race conditions and ensuring distinct sequences.
 */
export async function generateNextPidAtomic(
  tx: Prisma.TransactionClient,
  {
    categoryId,
    departmentId,
    orgId,
  }: {
    categoryId: string;
    departmentId: string;
    orgId?: string | null;
  },
): Promise<PidGenerationResult> {
  if (!categoryId) {
    throw new Error("Asset Type is required to generate a PID.");
  }
  if (!departmentId) {
    throw new Error("Department is required to generate a PID.");
  }

  // 1. Validate Asset Type record
  const category = await tx.assetCategoryType.findFirst({
    where: {
      assetcategorytypeid: categoryId,
      ...(orgId
        ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
        : {}),
    },
    select: {
      assetcategorytypeid: true,
      assetTypeCode: true,
      assetcategorytypename: true,
    },
  });

  if (!category) {
    throw new Error("Selected Asset Type does not exist or is not accessible.");
  }

  const assetTypeCode = category.assetTypeCode?.trim();
  if (!assetTypeCode) {
    throw new Error(
      `Asset Type "${category.assetcategorytypename}" does not have an official code in the database.`,
    );
  }

  // 2. Validate Department record
  const department = await tx.department.findFirst({
    where: {
      id: departmentId,
      ...(orgId ? { organizationId: orgId } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  });

  if (!department) {
    throw new Error("Selected Department does not exist in this organization.");
  }
  if (!department.isActive) {
    throw new Error("Selected Department is inactive.");
  }

  const departmentCode = department.code?.trim();
  if (!departmentCode) {
    throw new Error(
      `Department "${department.name}" does not have an official code in the database.`,
    );
  }

  // 3. Scan existing assets in DB to ensure gaps/historical PIDs are respected
  const prefix = `${MSF_PID_PREFIX}-${assetTypeCode}-${departmentCode}-`;
  const existingAssets = await tx.asset.findMany({
    where: {
      serialnumber: { startsWith: prefix },
    },
    select: { serialnumber: true },
  });

  const maxExisting = extractMaxExistingSequence(
    existingAssets,
    assetTypeCode,
    departmentCode,
  );

  // 4. Atomic upsert with row-level locking on (assetTypeCode, departmentCode)
  const result = await tx.$queryRawUnsafe<Array<{ lastSequence: number }>>(
    `
    INSERT INTO public."asset_pid_sequences" ("id", "assetTypeCode", "departmentCode", "lastSequence", "updatedAt")
    VALUES (gen_random_uuid(), $1, $2, GREATEST(1, $3 + 1), NOW())
    ON CONFLICT ("assetTypeCode", "departmentCode")
    DO UPDATE SET
      "lastSequence" = GREATEST(public."asset_pid_sequences"."lastSequence" + 1, $3 + 1),
      "updatedAt" = NOW()
    RETURNING "lastSequence";
    `,
    assetTypeCode,
    departmentCode,
    maxExisting,
  );

  const nextSequence = result[0]?.lastSequence ?? (maxExisting + 1);
  const pid = formatPid(assetTypeCode, departmentCode, nextSequence);

  // 5. Verify format
  if (!/^1-06-[0-9.]+-([0-9.]+|[A-Za-z0-9]+)-\d{3,}$/.test(pid)) {
    throw new Error(`Generated PID "${pid}" does not match required format.`);
  }

  return {
    pid,
    assetTypeCode,
    departmentCode,
    sequence: nextSequence,
  };
}
