/**
 * Employee service layer.
 *
 * Every mutation in the employee module goes through this module so that the
 * following invariants are enforced in exactly one place:
 *
 *  * organization scoping â€” a caller can only ever read or write rows belonging
 *    to its own organization;
 *  * soft delete â€” DELETE archives (`deletedAt`) and never removes the row, so
 *    house allocations, queue history and audit trails keep their referent;
 *  * referential integrity â€” a department, manager or linked user must belong
 *    to the same organization, and an employee cannot be their own manager;
 *  * audit logging â€” every create, update, archive, restore and bulk operation
 *    is recorded, and bulk work is audited inside the same transaction as the
 *    write.
 */

import type { Employee, Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  createAuditLog,
  createAuditLogWithDiff,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} from "@/lib/audit-log";
import { invalidateCacheByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type {
  BulkEmployeeOperation,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "./schemas";

/** Transaction client accepted by helpers that run inside `$transaction`. */
type Tx = Prisma.TransactionClient | PrismaClient;

/** Raised for expected, user-facing failures so routes can map them to 4xx. */
export class EmployeeServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "EMPLOYEE_ERROR") {
    super(message);
    this.name = "EmployeeServiceError";
    this.status = status;
    this.code = code;
  }
}

/** A `Prisma` unique-constraint violation, decoded for user-facing messages. */
function isUniqueViolation(error: unknown): error is {
  code: string;
  meta?: { target?: string[] | string };
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Map a `P2002` constraint name onto a human message. */
function describeUniqueViolation(meta?: {
  target?: string[] | string;
}): string {
  const target = Array.isArray(meta?.target)
    ? meta.target.join(", ")
    : (meta?.target ?? "");

  if (target.includes("nationalId")) {
    return "An employee with that National ID already exists in this organization.";
  }
  if (target.includes("email")) {
    return "An employee with that email already exists in this organization.";
  }
  if (target.includes("employeeNumber")) {
    return "An employee with that employee number already exists in this organization.";
  }
  return "An employee with those details already exists in this organization.";
}

/** Re-throw known Prisma failures as `EmployeeServiceError`, or bubble up. */
function rethrow(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new EmployeeServiceError(
      describeUniqueViolation(error.meta),
      409,
      "DUPLICATE",
    );
  }
  throw error;
}

/** Date-only strings (or `Date`s) become `Date`s; blanks become `null`. */
function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  return value instanceof Date ? value : new Date(String(value));
}

/** Trimmed text or `null`, so an empty form field clears the column. */
function toTextOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Build the Prisma `create` payload, resolving cross-field concerns:
 *  * dates are coerced;
 *  * `disabilityStatus` defaults to `false` (the column is NOT NULL).
 */
function buildCreateData(
  orgId: string,
  input: CreateEmployeeInput,
): Prisma.EmployeeUncheckedCreateInput {
  return {
    organizationId: orgId,
    employeeNumber: input.employeeNumber.trim(),
    firstname: input.firstname.trim(),
    lastname: input.lastname.trim(),
    phone: toTextOrNull(input.phone),
    dateOfBirth: toDateOrNull(input.dateOfBirth),
    gender: input.gender ?? null,
    nationalId: input.nationalId ?? null,
    maritalStatus: input.maritalStatus ?? null,
    disabilityStatus: input.disabilityStatus ?? false,
    address: toTextOrNull(input.address),
    city: toTextOrNull(input.city),
    state: toTextOrNull(input.state),
    country: toTextOrNull(input.country),
    postalCode: toTextOrNull(input.postalCode),
    jobTitle: toTextOrNull(input.jobTitle),
    employmentType: input.employmentType ?? "full_time",
    employmentStatus: input.employmentStatus ?? "active",
    jobGrade: input.jobGrade ?? null,
    familySize: input.familySize ?? null,
    hireDate: toDateOrNull(input.hireDate),
    terminationDate: toDateOrNull(input.terminationDate),
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    userid: input.userid ?? null,
    notes: toTextOrNull(input.notes),
  };
}

/** Build the Prisma `update` payload from a partial document. */
function buildUpdateData(
  input: UpdateEmployeeInput,
): Prisma.EmployeeUncheckedUpdateInput {
  const data: Record<string, unknown> = {};

  const setIfPresent = (key: string, value: unknown) => {
    if (
      Object.prototype.hasOwnProperty.call(input, key) &&
      value !== undefined
    ) {
      data[key] = value;
    }
  };

  if (input.employeeNumber !== undefined) {
    setIfPresent("employeeNumber", input.employeeNumber.trim());
  }
  if (input.firstname !== undefined) {
    setIfPresent("firstname", input.firstname.trim());
  }
  if (input.lastname !== undefined) {
    setIfPresent("lastname", input.lastname.trim());
  }

  for (const key of [
    "phone",
    "address",
    "city",
    "state",
    "country",
    "postalCode",
    "jobTitle",
    "notes",
  ] as const) {
    if (input[key] !== undefined) setIfPresent(key, toTextOrNull(input[key]));
  }

  for (const key of ["dateOfBirth", "hireDate", "terminationDate"] as const) {
    if (input[key] !== undefined) setIfPresent(key, toDateOrNull(input[key]));
  }

  for (const key of [
    "gender",
    "maritalStatus",
    "nationalId",
    "jobGrade",
    "familySize",
    "departmentId",
    "managerId",
    "userid",
  ] as const) {
    if (input[key] !== undefined) setIfPresent(key, input[key] ?? null);
  }

  for (const key of [
    "employmentType",
    "employmentStatus",
    "disabilityStatus",
  ] as const) {
    if (input[key] !== undefined) setIfPresent(key, input[key]);
  }

  return data as Prisma.EmployeeUncheckedUpdateInput;
}

/**
 * Verify that every foreign key we are about to write points at a row in the
 * same organization. Failing loudly here produces a clear 400 instead of a
 * foreign-key violation or, worse, a cross-tenant link.
 */
async function assertReferencesBelongToOrg(
  db: Tx,
  orgId: string,
  refs: {
    departmentId?: string | null;
    managerId?: string | null;
    userid?: string | null;
  },
  options: { selfEmployeeId?: string } = {},
): Promise<void> {
  const { departmentId, managerId, userid } = refs;

  if (departmentId) {
    const dept = await db.department.findFirst({
      where: { id: departmentId, organizationId: orgId },
      select: { id: true },
    });
    if (!dept) {
      throw new EmployeeServiceError(
        "Department not found in this organization.",
        400,
        "INVALID_DEPARTMENT",
      );
    }
  }

  if (managerId) {
    if (options.selfEmployeeId && managerId === options.selfEmployeeId) {
      throw new EmployeeServiceError(
        "An employee cannot be their own reporting manager.",
        400,
        "SELF_MANAGER",
      );
    }
    const manager = await db.employee.findFirst({
      where: { id: managerId, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!manager) {
      throw new EmployeeServiceError(
        "Reporting manager not found in this organization.",
        400,
        "INVALID_MANAGER",
      );
    }
  }

  if (userid) {
    const user = await db.user.findFirst({
      where: { userid, organizationId: orgId },
      select: { userid: true },
    });
    if (!user) {
      throw new EmployeeServiceError(
        "Linked user not found in this organization.",
        400,
        "INVALID_USER",
      );
    }
  }
}

/** Load an employee by id, scoped to the organization. */
async function findEmployee(
  db: Tx,
  orgId: string,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Prisma.EmployeeGetPayload<Record<string, never>>> {
  const employee = await db.employee.findFirst({
    where: {
      id,
      organizationId: orgId,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    },
  });

  if (!employee) {
    throw new EmployeeServiceError("Employee not found.", 404, "NOT_FOUND");
  }
  return employee;
}

/** Drop the internal denormalised columns from an audit-log payload. */
function auditSnapshot(employee: {
  id: string;
  organizationId: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}): Record<string, unknown> {
  const { organizationId: _org, ...rest } = employee;
  return rest;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateEmployeeResult<T> {
  employee: T;
}

export async function createEmployee<T = Employee>(params: {
  organizationId: string;
  actorId: string | null;
  input: CreateEmployeeInput;
  db?: Tx;
}): Promise<CreateEmployeeResult<T>> {
  const { organizationId, actorId, input, db = prisma } = params;

  await assertReferencesBelongToOrg(db, organizationId, input);

  const data = buildCreateData(organizationId, input);

  try {
    const employee = await db.employee.create({ data });

    await createAuditLog({
      userId: actorId,
      action: AUDIT_ACTIONS.CREATE,
      entity: AUDIT_ENTITIES.EMPLOYEE,
      entityId: employee.id,
      details: {
        employeeNumber: employee.employeeNumber,
        firstname: employee.firstname,
        lastname: employee.lastname,
      },
      tx: db,
    });

    return { employee: employee as T };
  } catch (error) {
    rethrow(error);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateEmployee<T = Employee>(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  input: UpdateEmployeeInput;
  db?: Tx;
}): Promise<T> {
  const { organizationId, actorId, id, input, db = prisma } = params;

  const existing = await findEmployee(db, organizationId, id, {
    includeDeleted: true,
  });

  await assertReferencesBelongToOrg(
    db,
    organizationId,
    {
      departmentId: input.departmentId,
      managerId: input.managerId,
      userid: input.userid,
    },
    { selfEmployeeId: id },
  );

  const data = buildUpdateData(input);

  try {
    const updated = await db.employee.update({ where: { id }, data });

    await createAuditLogWithDiff({
      userId: actorId,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.EMPLOYEE,
      entityId: id,
      before: auditSnapshot(existing),
      after: auditSnapshot(updated),
      tx: db,
    });

    return updated as T;
  } catch (error) {
    rethrow(error);
  }
}

// ---------------------------------------------------------------------------
// Soft delete / restore
// ---------------------------------------------------------------------------

/** Count live direct reports, used to guard against archiving a manager. */
async function countDirectReports(
  db: Tx,
  organizationId: string,
  id: string,
): Promise<number> {
  return db.employee.count({
    where: { organizationId, managerId: id, deletedAt: null },
  });
}

export interface ArchiveEmployeeResult<T> {
  employee: T;
  archivedAt: Date;
}

export async function archiveEmployee<T = Employee>(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  db?: Tx;
}): Promise<ArchiveEmployeeResult<T>> {
  const { organizationId, actorId, id, db = prisma } = params;

  const existing = await findEmployee(db, organizationId, id);

  const reports = await countDirectReports(db, organizationId, id);
  if (reports > 0) {
    throw new EmployeeServiceError(
      `Cannot archive: this employee is the reporting manager of ${reports} other employee(s). Reassign their direct reports first.`,
      409,
      "HAS_REPORTS",
    );
  }

  const archivedAt = new Date();
  const employee = await db.employee.update({
    where: { id },
    data: { deletedAt: archivedAt },
  });

  await createAuditLog({
    userId: actorId,
    action: AUDIT_ACTIONS.DELETE,
    entity: AUDIT_ENTITIES.EMPLOYEE,
    entityId: id,
    details: {
      employeeNumber: existing.employeeNumber,
      firstname: existing.firstname,
      lastname: existing.lastname,
      archivedAt: archivedAt.toISOString(),
      softDelete: true,
    },
    tx: db,
  });

  return { employee: employee as T, archivedAt };
}

export async function restoreEmployee<T = Employee>(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  db?: Tx;
}): Promise<T> {
  const { organizationId, actorId, id, db = prisma } = params;

  const existing = await findEmployee(db, organizationId, id, {
    includeDeleted: true,
  });

  if (!existing.deletedAt) {
    throw new EmployeeServiceError(
      "This employee is not archived.",
      400,
      "NOT_ARCHIVED",
    );
  }

  const employee = await db.employee.update({
    where: { id },
    data: { deletedAt: null },
  });

  await createAuditLogWithDiff({
    userId: actorId,
    action: AUDIT_ACTIONS.UPDATE,
    entity: AUDIT_ENTITIES.EMPLOYEE,
    entityId: id,
    before: auditSnapshot(existing),
    after: auditSnapshot(employee),
    details: { restored: true },
    tx: db,
  });

  return employee as T;
}

/** Permanently remove an archived employee. Admin-only escape hatch. */
export async function purgeEmployee(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  db?: Tx;
}): Promise<void> {
  const { organizationId, actorId, id, db = prisma } = params;

  const existing = await findEmployee(db, organizationId, id, {
    includeDeleted: true,
  });

  if (!existing.deletedAt) {
    throw new EmployeeServiceError(
      "Archive the employee before permanently deleting them.",
      400,
      "NOT_ARCHIVED",
    );
  }

  await db.employee.delete({ where: { id } });

  await createAuditLog({
    userId: actorId,
    action: AUDIT_ACTIONS.DELETE,
    entity: AUDIT_ENTITIES.EMPLOYEE,
    entityId: id,
    details: {
      employeeNumber: existing.employeeNumber,
      firstname: existing.firstname,
      lastname: existing.lastname,
      purged: true,
    },
    tx: db,
  });
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

export interface BulkRowFailure {
  /** Position in the submitted `rows` array, for the UI to highlight. */
  index: number;
  employeeNumber?: string;
  message: string;
  code: string;
}

export interface BulkEmployeeResult<T> {
  succeeded: T[];
  failed: BulkRowFailure[];
}

/**
 * Apply a bulk create / update / archive / restore.
 *
 * Each row runs in its own savepoint so one bad row does not roll back the
 * rest, and the caller receives a per-row success/failure report. Every row that
 * writes also emits an audit entry inside the same transaction.
 */
export async function bulkOperateEmployees<T = Employee>(params: {
  organizationId: string;
  actorId: string | null;
  operation: BulkEmployeeOperation;
  rows: { id?: string; input: Record<string, unknown> }[];
  db?: Tx;
}): Promise<BulkEmployeeResult<T>> {
  const { organizationId, actorId, operation, rows, db = prisma } = params;

  const succeeded: T[] = [];
  const failed: BulkRowFailure[] = [];

  await db.$transaction(
    async (tx) => {
      for (const [index, row] of rows.entries()) {
        const employeeNumber =
          typeof row.input.employeeNumber === "string"
            ? row.input.employeeNumber
            : undefined;

        // Savepoint: isolates failures so siblings still commit.
        await tx.$executeRawUnsafe("SAVEPOINT bulk_row");
        try {
          switch (operation) {
            case "create": {
              const { employee } = await createEmployee({
                organizationId,
                actorId,
                input: row.input as CreateEmployeeInput,
                db: tx,
              });
              succeeded.push(employee as T);
              break;
            }
            case "update": {
              succeeded.push(
                (await updateEmployee({
                  organizationId,
                  actorId,
                  id: row.id!,
                  input: row.input as UpdateEmployeeInput,
                  db: tx,
                })) as T,
              );
              break;
            }
            case "delete": {
              const { employee } = await archiveEmployee({
                organizationId,
                actorId,
                id: row.id!,
                db: tx,
              });
              succeeded.push(employee as T);
              break;
            }
            case "restore": {
              succeeded.push(
                (await restoreEmployee({
                  organizationId,
                  actorId,
                  id: row.id!,
                  db: tx,
                })) as T,
              );
              break;
            }
          }
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_row");
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT bulk_row");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_row");

          failed.push({
            index,
            employeeNumber,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error while processing this row.",
            code:
              error instanceof EmployeeServiceError
                ? error.code
                : isUniqueViolation(error)
                  ? "DUPLICATE"
                  : "ERROR",
          });
        }
      }
    },
    { timeout: 60_000 },
  );

  return { succeeded, failed };
}

/** Clear cached employee reads after a mutation. Never throws. */
export function invalidateEmployeeCache(): void {
  invalidateCacheByPrefix("employees").catch((error) => {
    logger.warn("Failed to invalidate employee cache", { error });
  });
}
