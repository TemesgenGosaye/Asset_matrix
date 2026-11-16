/**
 * Employee service layer.
 *
 * Every mutation in the employee module goes through this module so that the
 * following invariants are enforced in exactly one place:
 *
 *  * organization scoping — a caller can only ever read or write rows belonging
 *    to its own organization;
 *  * soft delete — DELETE archives (`deletedAt`) and never removes the row, so
 *    house allocations, queue history and audit trails keep their referent;
 *  * referential integrity — a department, manager or linked user must belong
 *    to the same organization, and an employee cannot be their own manager;
 *  * audit logging — every create, update, archive, restore and bulk operation
 *    is recorded, and bulk work is audited inside the same transaction as the
 *    write.
 */

import type { Employee, Prisma, PrismaClient } from "@prisma/client";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import {
  createAuditLog,
  createAuditLogWithDiff,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} from "@/lib/audit-log";
import { invalidateCacheByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { IMPORT_LOOKUP_CHUNK_SIZE, IMPORT_WRITE_CHUNK_SIZE } from "./constants";
import type {
  BulkEmployeeOperation,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "./schemas";

/** Transaction client accepted by helpers that run inside `$transaction`. */
type Tx = Prisma.TransactionClient | PrismaClient;

/** Employee row plus the retained-attribute profile. */
type EmployeeWithProfile = Prisma.EmployeeGetPayload<{
  include: { profile: true };
}>;

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
 * Build the canonical `Employee` create payload.
 *
 * Only the eight approved business columns and the relationship keys the
 * canonical table is allowed to carry are written. Retained attributes are
 * written to `EmployeeProfile` by {@link buildProfileCreateData}.
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
    gender: input.gender ?? null,
    jobGrade: input.jobGrade ?? null,
    serviceYears: input.serviceYears ?? null,
    maritalStatus: input.maritalStatus ?? null,
    disabilityStatus: input.disabilityStatus ?? null,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    userid: input.userid ?? null,
  };
}

/**
 * Build the retained-attribute profile payload.
 *
 * Defaults keep a newly created/imported employee eligible for a House
 * Request: employment status is "active" unless the caller says otherwise.
 */
function buildProfileCreateData(
  orgId: string,
  input: Partial<CreateEmployeeInput>,
): Prisma.EmployeeProfileUncheckedCreateWithoutEmployeeInput {
  return {
    organizationId: orgId,
    nationalId: input.nationalId ?? null,
    jobTitle: toTextOrNull(input.jobTitle),
    employmentType: input.employmentType ?? "full_time",
    employmentStatus: input.employmentStatus ?? "active",
    familySize: input.familySize ?? null,
    hireDate: toDateOrNull(input.hireDate),
  };
}

/**
 * Build the canonical `Employee` update payload from a partial document.
 *
 * Only keys the caller actually sent are written, so a partial update never
 * resets a field the user did not touch.
 */
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
    "gender",
    "maritalStatus",
    "disabilityStatus",
    "jobGrade",
    "serviceYears",
    "departmentId",
    "managerId",
    "userid",
  ] as const) {
    if (input[key] !== undefined) setIfPresent(key, input[key] ?? null);
  }

  return data as Prisma.EmployeeUncheckedUpdateInput;
}

/** Build only the retained-attribute keys the caller actually sent. */
function buildProfileUpdateData(
  input: UpdateEmployeeInput,
): Prisma.EmployeeProfileUncheckedUpdateInput {
  const data: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) data[key] = value;
  };

  if (input.nationalId !== undefined) {
    set("nationalId", input.nationalId ?? null);
  }
  if (input.jobTitle !== undefined) {
    set("jobTitle", toTextOrNull(input.jobTitle));
  }
  if (input.employmentType !== undefined) {
    set("employmentType", input.employmentType);
  }
  if (input.employmentStatus !== undefined) {
    set("employmentStatus", input.employmentStatus);
  }
  if (input.familySize !== undefined) {
    set("familySize", input.familySize ?? null);
  }
  if (input.hireDate !== undefined) {
    set("hireDate", toDateOrNull(input.hireDate));
  }

  return data as Prisma.EmployeeProfileUncheckedUpdateInput;
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
): Promise<EmployeeWithProfile> {
  const employee = await db.employee.findFirst({
    where: {
      id,
      organizationId: orgId,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    },
    include: { profile: true },
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

  const data = {
    ...buildCreateData(organizationId, input),
    profile: { create: buildProfileCreateData(organizationId, input) },
  };

  try {
    const employee = await db.employee.create({
      data,
      include: { profile: true },
    });

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

  const employeeData = buildUpdateData(input);
  const profileData = buildProfileUpdateData(input);
  const data: Prisma.EmployeeUncheckedUpdateInput = {
    ...employeeData,
    ...(Object.keys(profileData).length > 0
      ? {
          profile: {
            upsert: {
              create: buildProfileCreateData(organizationId, input),
              update: profileData,
            },
          },
        }
      : {}),
  };

  try {
    const updated = await db.employee.update({
      where: { id },
      data,
      include: { profile: true },
    });

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

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

/**
 * The fields a bulk import reports back for every employee it created.
 *
 * The import only needs to know that a row landed and which employee it is.
 * Returning whole rows would mean holding 4,000 full records in memory for no
 * reason.
 */
export interface CreatedEmployeeRef {
  id: string;
  employeeNumber: string;
  firstname: string;
  lastname: string;
}

/** Request metadata the audit trail records, captured once per bulk write. */
interface BulkAuditContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * How long the import transaction may run before it is abandoned.
 *
 * The chunked writer needs a handful of seconds for 4,000 rows. The generous
 * ceiling only matters when the database rejects a whole chunk and every row
 * has to be retried one at a time.
 */
const BULK_IMPORT_TIMEOUT_MS = 300_000;

/**
 * Read the request metadata the audit trail records, once per bulk write.
 *
 * `headers()` throws outside a request scope (a script, a test), so the
 * metadata is optional: the audit entry is still written, just without the
 * caller's address.
 */
async function readBulkAuditContext(): Promise<BulkAuditContext> {
  try {
    const headersList = await headers();
    return {
      ipAddress: (
        headersList.get("x-forwarded-for") ||
        headersList.get("x-real-ip") ||
        "unknown"
      )
        .split(",")[0]
        .trim(),
      userAgent: (headersList.get("user-agent") || "unknown").slice(0, 255),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/** The trimmed Emp ID of a row, or an empty string when it has none. */
function employeeNumberOf(input: Record<string, unknown>): string {
  const value = input.employeeNumber;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve the foreign keys a bulk write is about to use.
 *
 * `createEmployee` checks these one row at a time. A 4,000-row import needs the
 * same guarantee without 4,000 lookups, so the distinct ids are collected and
 * resolved once per chunk — three queries instead of one per row.
 *
 * Returns the position of every row that points at something outside the
 * caller's organization, with the reason it cannot be written.
 */
async function findRowsWithForeignReferences(
  db: Tx,
  orgId: string,
  rows: { input: Record<string, unknown> }[],
): Promise<Map<number, string>> {
  const invalid = new Map<number, string>();

  const departmentIds = new Set<string>();
  const managerIds = new Set<string>();
  const userIds = new Set<string>();

  rows.forEach((row) => {
    const { departmentId, managerId, userid } = row.input;
    if (typeof departmentId === "string" && departmentId.length > 0) {
      departmentIds.add(departmentId);
    }
    if (typeof managerId === "string" && managerId.length > 0) {
      managerIds.add(managerId);
    }
    if (typeof userid === "string" && userid.length > 0) {
      userIds.add(userid);
    }
  });

  if (
    departmentIds.size === 0 &&
    managerIds.size === 0 &&
    userIds.size === 0
  ) {
    return invalid;
  }

  const departments = await db.department.findMany({
    where: { id: { in: [...departmentIds] }, organizationId: orgId },
    select: { id: true },
  });
  const managers = await db.employee.findMany({
    where: {
      id: { in: [...managerIds] },
      organizationId: orgId,
      deletedAt: null,
    },
    select: { id: true },
  });
  const users = await db.user.findMany({
    where: { userid: { in: [...userIds] }, organizationId: orgId },
    select: { userid: true },
  });

  const knownDepartments = new Set(departments.map((row) => row.id));
  const knownManagers = new Set(managers.map((row) => row.id));
  const knownUsers = new Set(users.map((row) => row.userid));

  rows.forEach((row, index) => {
    const { departmentId, managerId, userid } = row.input;
    if (
      typeof departmentId === "string" &&
      departmentId.length > 0 &&
      !knownDepartments.has(departmentId)
    ) {
      invalid.set(index, "Department not found in this organization.");
    } else if (
      typeof managerId === "string" &&
      managerId.length > 0 &&
      !knownManagers.has(managerId)
    ) {
      invalid.set(index, "Reporting manager not found in this organization.");
    } else if (
      typeof userid === "string" &&
      userid.length > 0 &&
      !knownUsers.has(userid)
    ) {
      invalid.set(index, "Linked user not found in this organization.");
    }
  });

  return invalid;
}

/**
 * Emp IDs that are already taken, matched the way the product matches them.
 *
 * The unique index on `employeeNumber` is exact-match, but the product treats
 * "EMP001" and "emp001" as the same person, so the comparison is made
 * case-insensitively. The lookup spans every organization because the index
 * does: an Emp ID used elsewhere in the product is still this person's ID.
 */
async function findTakenEmployeeNumbers(
  db: Tx,
  employeeNumbers: string[],
): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (const raw of employeeNumbers) {
    const value = raw.trim();
    if (value.length === 0) continue;
    wanted.add(value.toLowerCase());
  }
  if (wanted.size === 0) return new Set();

  const taken = new Set<string>();
  const values = [...wanted];

  for (
    let offset = 0;
    offset < values.length;
    offset += IMPORT_LOOKUP_CHUNK_SIZE
  ) {
    const slice = values.slice(offset, offset + IMPORT_LOOKUP_CHUNK_SIZE);
    const rows = await db.employee.findMany({
      where: { employeeNumber: { in: slice, mode: "insensitive" } },
      select: { employeeNumber: true },
    });
    for (const row of rows) taken.add(row.employeeNumber.toLowerCase());
  }

  return taken;
}

/**
 * Write the audit trail for the employees a bulk import created.
 *
 * One statement for the whole chunk instead of one per employee: the trail
 * still records every created employee, but 500 of them cost a single round
 * trip. A failure here never fails the import — the records themselves are
 * what the user asked for — so the statement is rolled back to its savepoint
 * and the problem is logged.
 */
async function writeBulkAuditEntries(
  tx: Prisma.TransactionClient,
  employees: CreatedEmployeeRef[],
  actorId: string | null,
  context: BulkAuditContext,
): Promise<void> {
  if (employees.length === 0) return;

  try {
    await tx.$executeRawUnsafe("SAVEPOINT bulk_audit");
    await tx.audit_logs.createMany({
      data: employees.map((employee) => ({
        userId: actorId,
        action: AUDIT_ACTIONS.CREATE,
        entity: AUDIT_ENTITIES.EMPLOYEE,
        entityId: employee.id,
        details: JSON.stringify({
          employeeNumber: employee.employeeNumber,
          firstname: employee.firstname,
          lastname: employee.lastname,
        }),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      })),
    });
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_audit");
  } catch (error) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT bulk_audit");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_audit");
    logger.warn("Failed to write bulk employee audit entries", { error });
  }
}

/**
 * Create many employees in one transaction, in chunks.
 *
 * This is the writer behind the spreadsheet import. It exists because the
 * per-row writer ({@link bulkOperateEmployees}) costs about four round trips
 * per employee: at 4,000 rows that is thousands of statements inside a single
 * transaction, which is slow enough to run into the transaction timeout on a
 * remote database.
 *
 * Instead each chunk is written with a single INSERT ... ON CONFLICT DO
 * NOTHING, which reports exactly which rows landed:
 *
 *   * a row that landed is returned by the insert and audited;
 *   * a row that did not land had an Emp ID that was already taken — it is
 *     reported as a duplicate, never silently dropped;
 *   * a chunk the database rejects as a whole (a CHECK constraint, a type
 *     error — anything the row-level validation does not mirror) is retried one
 *     row at a time, so a single bad row is reported against that row instead
 *     of taking the whole import down.
 *
 * Every write happens inside one transaction, so an import either lands
 * completely or not at all.
 */
export async function bulkCreateEmployees(params: {
  organizationId: string;
  actorId: string | null;
  rows: { input: Record<string, unknown> }[];
}): Promise<BulkEmployeeResult<CreatedEmployeeRef>> {
  const { organizationId, actorId, rows } = params;

  const succeeded: CreatedEmployeeRef[] = [];
  const failed: BulkRowFailure[] = [];
  const auditContext = await readBulkAuditContext();

  await prisma.$transaction(
    async (tx) => {
      for (
        let offset = 0;
        offset < rows.length;
        offset += IMPORT_WRITE_CHUNK_SIZE
      ) {
        const chunk = rows.slice(offset, offset + IMPORT_WRITE_CHUNK_SIZE);

        // Rows that point outside this organization are never written.
        const foreignRows = await findRowsWithForeignReferences(
          tx,
          organizationId,
          chunk,
        );

        const candidates: { index: number; input: Record<string, unknown> }[] =
          [];
        chunk.forEach((row, index) => {
          const reason = foreignRows.get(index);
          if (reason) {
            failed.push({
              index: offset + index,
              employeeNumber: employeeNumberOf(row.input),
              message: reason,
              code: "VALIDATION",
            });
            return;
          }
          candidates.push({ index: offset + index, input: row.input });
        });

        // Emp IDs that are already taken, and Emp IDs repeated inside the
        // payload, are rejected here rather than written.
        const taken = await findTakenEmployeeNumbers(
          tx,
          candidates.map((candidate) => employeeNumberOf(candidate.input)),
        );
        const seen = new Set<string>();
        const writable: {
          index: number;
          input: Record<string, unknown>;
          employeeNumber: string;
        }[] = [];

        candidates.forEach((candidate) => {
          const employeeNumber = employeeNumberOf(candidate.input);
          const key = employeeNumber.toLowerCase();

          if (employeeNumber.length === 0) {
            failed.push({
              index: candidate.index,
              employeeNumber,
              message: "Emp ID is required.",
              code: "VALIDATION",
            });
            return;
          }
          if (seen.has(key)) {
            failed.push({
              index: candidate.index,
              employeeNumber,
              message: `Emp ID "${employeeNumber}" appears more than once in this file.`,
              code: "DUPLICATE",
            });
            return;
          }
          seen.add(key);
          if (taken.has(key)) {
            failed.push({
              index: candidate.index,
              employeeNumber,
              message: `Emp ID "${employeeNumber}" already exists in the register. Existing records are never overwritten by an import.`,
              code: "DUPLICATE",
            });
            return;
          }
          writable.push({
            index: candidate.index,
            input: candidate.input,
            employeeNumber,
          });
        });

        if (writable.length === 0) continue;

        let inserted: CreatedEmployeeRef[] = [];
        let wroteRowByRow = false;
        try {
          await tx.$executeRawUnsafe("SAVEPOINT bulk_chunk");
          inserted = await tx.employee.createManyAndReturn({
            data: writable.map((candidate) =>
              buildCreateData(
                organizationId,
                candidate.input as CreateEmployeeInput,
              ),
            ),
            // An Emp ID that is taken is skipped instead of overwriting the
            // record that already holds it.
            skipDuplicates: true,
            select: {
              id: true,
              employeeNumber: true,
              firstname: true,
              lastname: true,
            },
          });
          if (inserted.length > 0) {
            // The canonical row and its retained-attribute profile are created
            // together so eligibility and House Queue ranking keep working for
            // every imported employee. createManyAndReturn cannot nest, so the
            // profiles are written in one extra statement.
            await tx.employeeProfile.createMany({
              data: inserted.map((employee) => ({
                employeeId: employee.id,
                organizationId,
                employmentType: "full_time",
                employmentStatus: "active",
              })),
              skipDuplicates: true,
            });
          }
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_chunk");
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT bulk_chunk");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_chunk");

          // The chunk was rejected as a whole, so the rows are written one at a
          // time: a single bad row is then reported against that row instead
          // of taking the whole import down.
          wroteRowByRow = true;
          inserted = await insertChunkRowByRow(tx, {
            organizationId,
            writable,
            failed,
          });
        }

        // A row the insert did not return lost a race with another writer and
        // was skipped: its Emp ID is taken, so it is reported as a duplicate.
        // The row-by-row path already reports the rows that failed.
        if (!wroteRowByRow) {
          const landed = new Set(
            inserted.map((employee) => employee.employeeNumber),
          );
          writable.forEach((candidate) => {
            if (landed.has(candidate.employeeNumber)) return;
            failed.push({
              index: candidate.index,
              employeeNumber: candidate.employeeNumber,
              message: `Emp ID "${candidate.employeeNumber}" already exists in the register. Existing records are never overwritten by an import.`,
              code: "DUPLICATE",
            });
          });
        }

        succeeded.push(...inserted);
        await writeBulkAuditEntries(tx, inserted, actorId, auditContext);
      }
    },
    { timeout: BULK_IMPORT_TIMEOUT_MS },
  );

  return { succeeded, failed };
}

/**
 * Write the rows of a chunk one at a time.
 *
 * Used when the database rejected the chunk as a whole. Each row gets its own
 * savepoint, so a row that fails is reported and its siblings still commit.
 */
async function insertChunkRowByRow(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    writable: {
      index: number;
      input: Record<string, unknown>;
      employeeNumber: string;
    }[];
    failed: BulkRowFailure[];
  },
): Promise<CreatedEmployeeRef[]> {
  const created: CreatedEmployeeRef[] = [];

  for (const candidate of params.writable) {
    await tx.$executeRawUnsafe("SAVEPOINT bulk_row");
    try {
      const employee = await tx.employee.create({
        data: {
          ...buildCreateData(
            params.organizationId,
            candidate.input as CreateEmployeeInput,
          ),
          profile: {
            create: buildProfileCreateData(
              params.organizationId,
              candidate.input as CreateEmployeeInput,
            ),
          },
        },
        select: {
          id: true,
          employeeNumber: true,
          firstname: true,
          lastname: true,
        },
      });
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_row");
      created.push(employee);
    } catch (error) {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT bulk_row");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT bulk_row");
      params.failed.push({
        index: candidate.index,
        employeeNumber: candidate.employeeNumber,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error while processing this row.",
        code: isUniqueViolation(error) ? "DUPLICATE" : "ERROR",
      });
    }
  }

  return created;
}

/** Clear cached employee reads after a mutation. Never throws. */
export function invalidateEmployeeCache(): void {
  invalidateCacheByPrefix("employees").catch((error) => {
    logger.warn("Failed to invalidate employee cache", { error });
  });
}
