/**
 * Rent service layer.
 *
 * Every mutation in the Pay Rent module goes through this module so that the
 * following invariants are enforced in exactly one place:
 *
 *  * organization scoping - a caller can only read or write rows belonging to
 *    its own organization;
 *  * atomicity - creating a renter writes the renter, its phones AND its whole
 *    schedule in one transaction, and a payment writes the receipt, the
 *    installment and the sequence counter in one transaction, so a crash can
 *    never leave a half-settled lease;
 *  * idempotent payment - a month is settled with a CONDITIONAL update
 *    (`WHERE status = 'UNPAID'`). Two concurrent double-clicks produce exactly
 *    one success and one 409, never two receipts for one month;
 *  * chronological payment order - only the earliest unpaid month may be settled,
 *    which is checked inside the same locked transaction;
 *  * nothing is hard-deleted - renters archive, installments void, payments are
 *    voided-but-kept so receipt numbers are never re-issued;
 *  * money never becomes a float - every amount is a `Prisma.Decimal`;
 *  * audit logging - every create, update, payment, void, terminate, archive and
 *    restore is recorded, inside the mutation's transaction.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  createAuditLog,
  createAuditLogWithDiff,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} from "@/lib/audit-log";
import { toDecimal, toMoneyString, formatEtb } from "./money";
import {
  formatDateOnly,
  generateRentSchedule,
  leaseEndDate,
  parseDateOnly,
  todayUtc,
} from "./schedule";
import type {
  ArchiveRenterInput,
  CreateRenterInput,
  RecordPaymentInput,
  TerminateLeaseInput,
  UpdateRenterInput,
  VoidPaymentInput,
} from "./schemas";
import type { InstallmentAggregate } from "./queries";

type Tx = Prisma.TransactionClient | typeof prisma;

/** A field-level validation problem, rendered against the offending input. */
export interface RentFieldIssue {
  field: string;
  message: string;
}

/** Raised for expected, user-facing failures so routes can map them to 4xx. */
export class RentServiceError extends Error {
  readonly status: number;
  readonly code: string;
  /** Present on 422s so the form can highlight the field rather than a banner. */
  readonly details?: RentFieldIssue[];

  constructor(
    message: string,
    status = 400,
    code = "RENT_ERROR",
    issue?: RentFieldIssue,
  ) {
    super(message);
    this.name = "RentServiceError";
    this.status = status;
    this.code = code;
    if (issue) this.details = [issue];
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Decode a `P2002` into a message the finance desk can act on. */
function describeUniqueViolation(meta?: {
  target?: string[] | string;
}): string {
  const target = Array.isArray(meta?.target)
    ? meta.target.join(", ")
    : (meta?.target ?? "");
  if (target.includes("nationalId")) {
    return "A renter with that National ID already exists in this organization.";
  }
  if (target.includes("receiptNumber")) {
    return "That receipt number has already been issued. Please retry.";
  }
  if (target.includes("monthNumber")) {
    return "That month is already on the schedule.";
  }
  if (target.includes("phone")) {
    return "That phone number is already listed for this renter.";
  }
  if (target.includes("isPrimary") || target.includes("primary")) {
    // Previously fell through to the generic message, which told the operator a
    // renter "already exists" when the real cause was two phones marked primary.
    return "Exactly one phone number must be marked as primary.";
  }
  return "A renter with those details already exists in this organization.";
}

/**
 * Re-throw known Prisma failures as `RentServiceError`.
 *
 * The partial unique index `rent_renters_active_national_id_key` is the
 * authoritative duplicate-National-ID guard: a concurrent double registration
 * loses on the index, and this converts that loss into a clean 409.
 */
function rethrow(error: unknown): never {
  if (isUniqueViolation(error)) {
    const meta = (error as { meta?: { target?: string[] | string } }).meta;
    throw new RentServiceError(describeUniqueViolation(meta), 409, "DUPLICATE");
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Load a renter by id, scoped to the organization. */
export async function findRenter(
  db: Tx,
  organizationId: string,
  id: string,
  options: { includeArchived?: boolean } = {},
): Promise<Prisma.RentRenterGetPayload<Record<string, never>>> {
  const renter = await db.rentRenter.findFirst({
    where: {
      id,
      organizationId,
      ...(options.includeArchived ? {} : { deletedAt: null }),
    },
  });
  if (!renter) {
    throw new RentServiceError("Renter not found.", 404, "NOT_FOUND");
  }
  return renter;
}

/**
 * Assert a National ID is free among LIVE renters.
 *
 * The partial unique index is the real guarantee; this check exists so the user
 * gets "already registered" instead of a raw constraint error, and so the
 * archived renter keeps its ID without blocking a new registration.
 */
async function assertNationalIdAvailable(
  db: Tx,
  organizationId: string,
  nationalId: string,
  excludeId?: string,
): Promise<void> {
  const clash = await db.rentRenter.findFirst({
    where: {
      organizationId,
      nationalId,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new RentServiceError(
      "A renter with that National ID already exists in this organization.",
      409,
      "DUPLICATE_NATIONAL_ID",
    );
  }
}

/**
 * Count payments on a lease - the gate for schedule edits.
 *
 * Counts voided receipts too, deliberately. `rent_payments_installmentId_fkey`
 * is ON DELETE RESTRICT with no partial predicate, so a voided receipt still
 * blocks `deleteMany` on the installments. Ignoring voided rows here would let
 * the schedule-regeneration path enter its transaction and then fail on P2003.
 */
async function countPayments(db: Tx, renterId: string): Promise<number> {
  return db.rentPayment.count({ where: { renterId } });
}

/** Reject any mutation on a lease that has been terminated. */
function assertLeaseOpen(status: string): void {
  if (status === "Terminated") {
    throw new RentServiceError(
      "This lease has been terminated and can no longer be changed.",
      409,
      "LEASE_TERMINATED",
    );
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Register a renter and generate their entire rent schedule.
 *
 * ONE transaction writes: the renter row, its phone rows, every monthly
 * installment, the audit entry, and (later, on payment) the receipt sequence. A
 * renter without a complete schedule is never observable, so the detail view can
 * always open starting from the rent start date.
 */
export async function createRenter(params: {
  organizationId: string;
  actorId: string | null;
  input: CreateRenterInput;
  db?: Tx;
}): Promise<{ id: string }> {
  const { organizationId, actorId, input, db = prisma } = params;

  await assertNationalIdAvailable(db, organizationId, input.nationalId);

  const startDate = parseDateOnly(input.startDate);
  if (!startDate) {
    throw new RentServiceError(
      "Enter a real start date.",
      400,
      "INVALID_START_DATE",
    );
  }

  const endDate = leaseEndDate(startDate, input.termMonths);
  const schedule = generateRentSchedule({
    startDate,
    termMonths: input.termMonths,
    monthlyPrice: input.monthlyPrice,
  });

  try {
    return await db.$transaction(async (tx) => {
      const renter = await tx.rentRenter.create({
        data: {
          organizationId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          gender: input.gender,
          nationalId: input.nationalId,
          rentType: input.rentType,
          rentTypeDetail: input.rentTypeDetail ?? null,
          monthlyPrice: input.monthlyPrice,
          startDate,
          termMonths: input.termMonths,
          endDate,
          createdById: actorId,
          phones: {
            // Exactly one primary: `normalizePhoneList` already resolved which
            // row the user ticked, so no positional fallback here - adding
            // `|| index === 0` marks two rows primary whenever the user picks
            // the 2nd or 3rd, which the partial unique index rejects.
            create: input.phones.values.map((phone) => ({
              organizationId,
              phone,
              isPrimary: phone === input.phones.primary,
            })),
          },
        },
      });

      // One bulk INSERT for the whole term - not a loop, so a 120-month lease is
      // a single round trip inside the transaction.
      await tx.rentInstallment.createMany({
        data: schedule.map((entry) => ({
          organizationId,
          renterId: renter.id,
          monthNumber: entry.monthNumber,
          dueDate: entry.dueDate,
          amountDue: entry.amountDue,
          createdById: actorId,
        })),
      });

      await createAuditLog({
        userId: actorId,
        action: AUDIT_ACTIONS.CREATE,
        entity: AUDIT_ENTITIES.RENT_RENTER,
        entityId: renter.id,
        details: {
          firstName: renter.firstName,
          lastName: renter.lastName,
          gender: renter.gender,
          // National ID is personal data: never written to the log.
          nationalIdMasked: true,
          rentType: renter.rentType,
          monthlyPrice: toMoneyString(renter.monthlyPrice),
          startDate: formatDateOnly(renter.startDate),
          termMonths: renter.termMonths,
          scheduleRows: schedule.length,
          phoneCount: input.phones.values.length,
        },
        tx,
      });

      return { id: renter.id };
    });
  } catch (error) {
    rethrow(error);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update a renter.
 *
 * Three rules live here rather than in the route:
 *   * personal fields (name, gender, phones, rent type) are freely editable;
 *   * a new `monthlyPrice` rewrites ONLY the months that are still UNPAID - a
 *     paid or voided month's amount is money that was already invoiced and is
 *     never silently restated;
 *   * changing `startDate` / `termMonths` once ANY payment exists requires the
 *     caller's elevated permission AND a reason; the schedule is then
 *     regenerated from the new anchor, preserving month 1..n where they still
 *     line up is NOT attempted - the service refuses to regenerate over settled
 *     months and tells the operator to terminate instead.
 */
export async function updateRenter(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  input: UpdateRenterInput;
  canOverrideTerms: boolean;
  db?: Tx;
}): Promise<{
  id: string;
  scheduleRegenerated: boolean;
  priceChanged: boolean;
}> {
  const {
    organizationId,
    actorId,
    id,
    input,
    canOverrideTerms,
    db = prisma,
  } = params;

  const existing = await findRenter(db, organizationId, id, {
    includeArchived: true,
  });
  assertLeaseOpen(existing.status);

  if (input.nationalId && input.nationalId !== existing.nationalId) {
    await assertNationalIdAvailable(db, organizationId, input.nationalId, id);
  }

  const scheduleTouched =
    input.startDate !== undefined || input.termMonths !== undefined;
  const priceChanged =
    input.monthlyPrice !== undefined &&
    !toDecimal(input.monthlyPrice).equals(toDecimal(existing.monthlyPrice));

  const payments = scheduleTouched ? await countPayments(db, id) : 0;

  if (scheduleTouched && payments > 0 && !canOverrideTerms) {
    throw new RentServiceError(
      "The start date or lease term cannot be changed after a payment has been recorded. Terminate the lease and register a new renter, or ask an administrator to override.",
      403,
      "TERMS_LOCKED",
    );
  }
  if (scheduleTouched && payments > 0 && !input.reason?.trim()) {
    throw new RentServiceError(
      "A reason is required to change the rent schedule after payments exist.",
      400,
      "REASON_REQUIRED",
    );
  }

  const nextStartDate =
    input.startDate !== undefined
      ? parseDateOnly(input.startDate)!
      : existing.startDate;
  const nextTermMonths = input.termMonths ?? existing.termMonths;
  const scheduleChanged =
    scheduleTouched &&
    (nextStartDate.getTime() !== existing.startDate.getTime() ||
      nextTermMonths !== existing.termMonths);

  // Regenerating the schedule while money has been recorded against it would
  // rewrite history. Even with the elevated permission we refuse when the paid
  // months would stop matching the new anchor, because that silently re-dates a
  // receipt. The operator must terminate and re-register.
  if (scheduleChanged && payments > 0) {
    throw new RentServiceError(
      "The schedule cannot be regenerated once payments exist because it would re-date issued receipts. Terminate this lease and register a new renter.",
      409,
      "SCHEDULE_FROZEN",
    );
  }

  return db.$transaction(async (tx) => {
    const data: Prisma.RentRenterUncheckedUpdateInput = {
      updatedById: actorId,
    };

    if (input.firstName !== undefined) data.firstName = input.firstName.trim();
    if (input.lastName !== undefined) data.lastName = input.lastName.trim();
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.nationalId !== undefined) data.nationalId = input.nationalId;
    if (input.rentType !== undefined) data.rentType = input.rentType;

    // `rent_renters_rent_type_detail_check` requires a description whenever the
    // type IS 'Other' - including when the request leaves `rentType` untouched.
    // Zod cannot see the stored type on a partial document, so check it here and
    // report a field error rather than letting the CHECK surface as an opaque
    // 422 CONSTRAINT_VIOLATION.
    const nextRentType = input.rentType ?? existing.rentType;
    const nextDetail =
      input.rentTypeDetail !== undefined
        ? input.rentTypeDetail
        : existing.rentTypeDetail;

    if (nextRentType === "Other" && !nextDetail?.trim()) {
      throw new RentServiceError(
        "Describe the rent type when 'Other' is selected.",
        422,
        "RENT_TYPE_DETAIL_REQUIRED",
        {
          field: "rentTypeDetail",
          message: "Describe the rent type when 'Other' is selected",
        },
      );
    }

    if (input.rentTypeDetail !== undefined)
      data.rentTypeDetail = input.rentTypeDetail;
    if (input.monthlyPrice !== undefined)
      data.monthlyPrice = input.monthlyPrice;
    if (scheduleChanged) {
      data.startDate = nextStartDate;
      data.termMonths = nextTermMonths;
      data.endDate = leaseEndDate(nextStartDate, nextTermMonths);
    }

    const updated = await tx.rentRenter.update({ where: { id }, data });

    // Phones are replaced wholesale: the set is tiny, the primary flag is
    // derived server-side, and a diff would be more code than the write.
    if (input.phones) {
      // The partial unique index allows only one primary row per renter, so the
      // old rows must go before the new primary is written.
      await tx.rentRenterPhone.deleteMany({ where: { renterId: id } });
      await tx.rentRenterPhone.createMany({
        data: input.phones.values.map((phone) => ({
          organizationId,
          renterId: id,
          phone,
          isPrimary: phone === input.phones!.primary,
        })),
      });
    }

    if (scheduleChanged) {
      // Safe: only reachable when payments === 0, asserted above.
      await tx.rentInstallment.deleteMany({ where: { renterId: id } });
      const schedule = generateRentSchedule({
        startDate: nextStartDate,
        termMonths: nextTermMonths,
        monthlyPrice: input.monthlyPrice ?? updated.monthlyPrice,
      });
      await tx.rentInstallment.createMany({
        data: schedule.map((entry) => ({
          organizationId,
          renterId: id,
          monthNumber: entry.monthNumber,
          dueDate: entry.dueDate,
          amountDue: entry.amountDue,
          createdById: actorId,
        })),
      });
    } else if (priceChanged) {
      // ONLY the unsettled months. A PAID month keeps the price the renter was
      // invoiced, and a VOIDED month is dead history.
      await tx.rentInstallment.updateMany({
        where: { renterId: id, organizationId, status: "UNPAID" },
        data: { amountDue: input.monthlyPrice, updatedById: actorId },
      });
    }

    await createAuditLogWithDiff({
      userId: actorId,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.RENT_RENTER,
      entityId: id,
      before: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        gender: existing.gender,
        rentType: existing.rentType,
        rentTypeDetail: existing.rentTypeDetail,
        monthlyPrice: toMoneyString(existing.monthlyPrice),
        startDate: formatDateOnly(existing.startDate),
        termMonths: existing.termMonths,
      },
      after: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        gender: updated.gender,
        rentType: updated.rentType,
        rentTypeDetail: updated.rentTypeDetail,
        monthlyPrice: toMoneyString(updated.monthlyPrice),
        startDate: formatDateOnly(updated.startDate),
        termMonths: updated.termMonths,
      },
      details: {
        priceChanged,
        scheduleRegenerated: scheduleChanged,
        unpaidMonthsRepriced:
          priceChanged && !scheduleChanged ? "UNPAID only" : null,
        reason: input.reason?.trim() ?? null,
      },
      tx,
    });

    return { id, scheduleRegenerated: scheduleChanged, priceChanged };
  });
}

// ---------------------------------------------------------------------------
// Archive / restore
// ---------------------------------------------------------------------------

/**
 * Archive a renter (soft delete).
 *
 * There is deliberately NO hard delete in this module: a renter with payment
 * history is a financial record, and the FKs into the ledger are RESTRICT so the
 * database refuses a hard delete anyway.
 */
export async function archiveRenter(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  input: ArchiveRenterInput;
  db?: Tx;
}): Promise<{ archivedAt: Date }> {
  const { organizationId, actorId, id, input, db = prisma } = params;

  const existing = await findRenter(db, organizationId, id);
  const archivedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.rentRenter.update({
      where: { id },
      data: {
        deletedAt: archivedAt,
        archivedReason: input.reason ?? null,
        updatedById: actorId,
      },
    });

    await createAuditLog({
      userId: actorId,
      action: AUDIT_ACTIONS.DELETE,
      entity: AUDIT_ENTITIES.RENT_RENTER,
      entityId: id,
      details: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        archivedAt: archivedAt.toISOString(),
        reason: input.reason ?? null,
        softDelete: true,
      },
      tx,
    });
  });

  return { archivedAt };
}

/** Return an archived renter to the live register. */
export async function restoreRenter(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  input: { reason?: string | null };
  db?: Tx;
}): Promise<void> {
  const { organizationId, actorId, id, input, db = prisma } = params;

  const existing = await findRenter(db, organizationId, id, {
    includeArchived: true,
  });
  if (!existing.deletedAt) {
    throw new RentServiceError(
      "This renter is not archived.",
      400,
      "NOT_ARCHIVED",
    );
  }

  // A restore must not collide with a live renter that took the freed National ID.
  await assertNationalIdAvailable(db, organizationId, existing.nationalId, id);

  await db.$transaction(async (tx) => {
    await tx.rentRenter.update({
      where: { id },
      data: {
        deletedAt: null,
        archivedReason: null,
        updatedById: actorId,
      },
    });

    await createAuditLog({
      userId: actorId,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.RENT_RENTER,
      entityId: id,
      details: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        restored: true,
        reason: input.reason ?? null,
      },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Terminate
// ---------------------------------------------------------------------------

/**
 * Terminate a lease.
 *
 * Every month that is still UNPAID on/after the effective date becomes VOIDED
 * (with the termination reason recorded on the row), the lease becomes
 * `Terminated`, and paid months are left exactly as they are. Nothing is
 * deleted, so the treasury's record of what was collected survives.
 */
export async function terminateLease(params: {
  organizationId: string;
  actorId: string | null;
  id: string;
  input: TerminateLeaseInput;
  db?: Tx;
}): Promise<{ voidedMonths: number }> {
  const { organizationId, actorId, id, input, db = prisma } = params;

  const existing = await findRenter(db, organizationId, id);
  if (existing.status === "Terminated") {
    throw new RentServiceError(
      "This lease is already terminated.",
      409,
      "ALREADY_TERMINATED",
    );
  }

  const effective =
    (input.effectiveDate ? parseDateOnly(input.effectiveDate) : null) ??
    todayUtc();
  const reason = input.reason.trim();
  const terminatedAt = new Date();

  const voidedMonths = await db.$transaction(async (tx) => {
    // Serialize against a concurrent payment on the same lease.
    await tx.$queryRaw`SELECT "id" FROM "public"."rent_renters" WHERE "id" = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const result = await tx.rentInstallment.updateMany({
      where: {
        renterId: id,
        organizationId,
        status: "UNPAID",
        dueDate: { gte: effective },
      },
      data: {
        status: "VOIDED",
        voidedAt: terminatedAt,
        voidedById: actorId,
        voidReason: reason,
        updatedById: actorId,
      },
    });

    await tx.rentRenter.update({
      where: { id },
      data: {
        status: "Terminated",
        terminatedAt,
        terminatedById: actorId,
        terminationReason: reason,
        updatedById: actorId,
      },
    });

    await createAuditLog({
      userId: actorId,
      action: AUDIT_ACTIONS.TERMINATE,
      entity: AUDIT_ENTITIES.RENT_RENTER,
      entityId: id,
      details: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        reason,
        effectiveDate: formatDateOnly(effective),
        voidedMonths: result.count,
        terminatedAt: terminatedAt.toISOString(),
      },
      tx,
    });

    return result.count;
  });

  return { voidedMonths };
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

/**
 * Allocate the next receipt number for an organization.
 *
 * A single atomic `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` on the counter
 * row. Two concurrent payments for the SAME organization therefore serialise on
 * that row and receive consecutive numbers; two payments for different
 * organizations never touch the same row. No advisory lock, no table lock, no
 * read-then-write race.
 *
 * Must be called inside the payment transaction so a rolled-back payment also
 * rolls back the number it consumed.
 */
export async function nextReceiptNumber(
  db: Tx,
  organizationId: string,
  paidOn: Date,
): Promise<string> {
  const year = paidOn.getUTCFullYear();

  const rows = await db.$queryRaw<{ lastValue: number }[]>(Prisma.sql`
    INSERT INTO "public"."rent_receipt_sequences" ("organizationId", "year", "lastValue", "createdAt", "updatedAt")
    VALUES (${organizationId}, ${year}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("organizationId", "year")
    DO UPDATE SET "lastValue" = "rent_receipt_sequences"."lastValue" + 1,
                  "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue" AS "lastValue"
  `);

  const value = rows[0]?.lastValue ?? 1;
  return `RENT-${year}-${String(value).padStart(6, "0")}`;
}

/**
 * Record a payment against one month.
 *
 * ATOMIC AND IDEMPOTENT. The month is settled with a conditional UPDATE whose
 * `WHERE` still requires `status = 'UNPAID'`. Under PostgreSQL READ COMMITTED a
 * second concurrent transaction blocks on the row lock, then re-evaluates the
 * predicate after the first commits, matches no row and gets `count: 0` - which
 * becomes a 409 here. That is what makes a double-click or a retried request
 * safe: exactly one receipt is ever issued for a month.
 *
 * CHRONOLOGICAL ORDER: inside the same locked transaction we read the earliest
 * UNPAID month and require it to be the one being settled, so an advance payment
 * for month 12 is rejected while month 3 is still outstanding.
 */
export async function recordPayment(params: {
  organizationId: string;
  actorId: string | null;
  renterId: string;
  input: RecordPaymentInput;
  db?: Tx;
}): Promise<{
  paymentId: string;
  installmentId: string;
  receiptNumber: string;
  monthNumber: number;
}> {
  const { organizationId, actorId, renterId, input, db = prisma } = params;

  const renter = await findRenter(db, organizationId, renterId);
  assertLeaseOpen(renter.status);

  const paidOn =
    (input.paidOn ? parseDateOnly(input.paidOn) : null) ?? todayUtc();

  return db.$transaction(async (tx) => {
    // Serialize every payment against this lease, so the "earliest unpaid month"
    // check below cannot be passed by two requests at once.
    await tx.$queryRaw`SELECT "id" FROM "public"."rent_renters" WHERE "id" = ${renterId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    // Re-read under the lock. A terminate that commits while this request waits
    // would otherwise be undone by the "mark Completed" step below, and the
    // termination CHECK constraint would roll the whole payment back.
    const lockedRenter = await tx.rentRenter.findFirst({
      where: { id: renterId, organizationId },
      select: { status: true },
    });
    if (!lockedRenter) {
      throw new RentServiceError("Renter not found.", 404, "NOT_FOUND");
    }
    if (lockedRenter.status === "Terminated") {
      throw new RentServiceError(
        "This lease has been terminated and can no longer be changed.",
        409,
        "LEASE_TERMINATED",
      );
    }

    // 1. Locate the month being settled.
    const installment = await tx.rentInstallment.findFirst({
      where: {
        renterId,
        organizationId,
        ...(input.installmentId
          ? { id: input.installmentId }
          : { monthNumber: input.monthNumber! }),
      },
    });
    if (!installment) {
      throw new RentServiceError(
        "That month is not on this lease.",
        404,
        "INSTALLMENT_NOT_FOUND",
      );
    }
    if (installment.status === "VOIDED") {
      throw new RentServiceError(
        `Month ${installment.monthNumber} was voided and can no longer be paid.`,
        409,
        "INSTALLMENT_VOIDED",
      );
    }

    // 2. Chronological-order guard: only the earliest unpaid month may settle.
    const earliest = await tx.rentInstallment.findFirst({
      where: { renterId, organizationId, status: "UNPAID" },
      orderBy: { monthNumber: "asc" },
      select: { id: true, monthNumber: true },
    });
    if (earliest && earliest.id !== installment.id) {
      throw new RentServiceError(
        `Month ${earliest.monthNumber} must be settled before month ${installment.monthNumber}.`,
        409,
        "OUT_OF_ORDER",
      );
    }

    // 3. Allocate the receipt number (atomic, see nextReceiptNumber).
    const receiptNumber = await nextReceiptNumber(tx, organizationId, paidOn);

    // A month is settled IN FULL or not at all. Accepting less would mark it
    // PAID while every "collected" aggregate (which sums installment.amountDue)
    // reported the full invoice - silently forgiving the shortfall, which can
    // then never be collected again because the month is no longer UNPAID.
    const amountDue = toDecimal(installment.amountDue);
    const amount = toDecimal(input.amount ?? installment.amountDue);
    if (!amount.equals(amountDue)) {
      throw new RentServiceError(
        `Month ${installment.monthNumber} must be settled at its full invoiced amount of ${formatEtb(amountDue)}. Partial payments are not recorded.`,
        400,
        "AMOUNT_MISMATCH",
      );
    }

    // 4. CONDITIONAL UPDATE - the idempotency guard. A concurrent second
    //    payment for this month matches no row and returns count 0.
    const settled = await tx.rentInstallment.updateMany({
      where: {
        id: installment.id,
        organizationId,
        status: "UNPAID",
      },
      data: {
        status: "PAID",
        paidAt: paidOn,
        paidById: actorId,
        receiptNumber,
        paymentMethod: input.method,
        referenceNumber: input.referenceNumber ?? null,
        note: input.note ?? null,
        updatedById: actorId,
      },
    });

    if (settled.count === 0) {
      throw new RentServiceError(
        `Month ${installment.monthNumber} has already been paid. Refresh and try again.`,
        409,
        "ALREADY_PAID",
      );
    }

    // 5. Append the receipt. The partial unique index
    //    `rent_payments_active_installment_key` is the second line of defence.
    const payment = await tx.rentPayment.create({
      data: {
        organizationId,
        renterId,
        installmentId: installment.id,
        receiptNumber,
        amount,
        paidOn,
        method: input.method,
        referenceNumber: input.referenceNumber ?? null,
        note: input.note ?? null,
        createdById: actorId,
      },
    });

    // 6. Close the lease out once nothing is left to collect.
    const remaining = await tx.rentInstallment.count({
      where: { renterId, organizationId, status: "UNPAID" },
    });
    if (remaining === 0 && lockedRenter.status === "Active") {
      await tx.rentRenter.update({
        where: { id: renterId },
        data: { status: "Completed", updatedById: actorId },
      });
    }

    await createAuditLog({
      userId: actorId,
      action: AUDIT_ACTIONS.PAY,
      entity: AUDIT_ENTITIES.RENT_PAYMENT,
      entityId: payment.id,
      details: {
        renterId,
        firstName: renter.firstName,
        lastName: renter.lastName,
        monthNumber: installment.monthNumber,
        dueDate: formatDateOnly(installment.dueDate),
        amount: toMoneyString(amount),
        receiptNumber,
        method: input.method,
        paidOn: formatDateOnly(paidOn),
        referenceNumber: input.referenceNumber ?? null,
        note: input.note ?? null,
        leaseCompleted: remaining === 0,
      },
      tx,
    });

    return {
      paymentId: payment.id,
      installmentId: installment.id,
      receiptNumber,
      monthNumber: installment.monthNumber,
    };
  });
}

/**
 * Void a payment, returning the month to UNPAID.
 *
 * Nothing is deleted: the receipt keeps its number, gains `voidedAt` /
 * `voidedById` / `voidReason`, and the installment is reopened. A month whose
 * payment is voided becomes the earliest unpaid month again, so the renter can
 * legitimately re-pay it with a fresh receipt.
 */
export async function voidPayment(params: {
  organizationId: string;
  actorId: string | null;
  paymentId: string;
  input: VoidPaymentInput;
  db?: Tx;
}): Promise<{
  renterId: string;
  installmentId: string;
  receiptNumber: string;
}> {
  const { organizationId, actorId, paymentId, input, db = prisma } = params;
  const reason = input.reason.trim();

  const payment = await db.rentPayment.findFirst({
    where: { id: paymentId, organizationId },
    include: { renter: true, installment: true },
  });
  if (!payment) {
    throw new RentServiceError("Payment not found.", 404, "NOT_FOUND");
  }
  if (payment.voidedAt) {
    throw new RentServiceError(
      "That payment has already been voided.",
      409,
      "ALREADY_VOIDED",
    );
  }

  // A terminated lease collects nothing, so reopening a month on one would create
  // a balance that can never be settled (`recordPayment` refuses it with
  // LEASE_TERMINATED) yet still counts as outstanding forever. Refuse instead.
  if (payment.renter.status === "Terminated") {
    throw new RentServiceError(
      "This lease has been terminated, so its payments cannot be voided. Terminating a lease already marks every unpaid month void.",
      409,
      "LEASE_TERMINATED",
    );
  }

  const voidedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "public"."rent_renters" WHERE "id" = ${payment.renterId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    // Re-read under the lock: a concurrent terminate may have closed the lease
    // between the read above and acquiring it.
    const locked = await tx.rentRenter.findFirst({
      where: { id: payment.renterId, organizationId },
      select: { status: true },
    });
    if (locked?.status === "Terminated") {
      throw new RentServiceError(
        "This lease has been terminated, so its payments cannot be voided.",
        409,
        "LEASE_TERMINATED",
      );
    }

    // CONDITIONAL UPDATE - a concurrent second void matches no row.
    const voided = await tx.rentPayment.updateMany({
      where: { id: paymentId, organizationId, voidedAt: null },
      data: {
        voidedAt,
        voidedById: actorId,
        voidReason: reason,
        updatedById: actorId,
      },
    });
    if (voided.count === 0) {
      throw new RentServiceError(
        "That payment has already been voided.",
        409,
        "ALREADY_VOIDED",
      );
    }

    await tx.rentInstallment.updateMany({
      where: { id: payment.installmentId, status: "PAID" },
      data: {
        status: "UNPAID",
        paidAt: null,
        paidById: null,
        receiptNumber: null,
        paymentMethod: null,
        referenceNumber: null,
        note: null,
        updatedById: actorId,
      },
    });

    // Reopening a month puts the lease back into Active.
    if (locked?.status === "Completed") {
      await tx.rentRenter.update({
        where: { id: payment.renterId },
        data: { status: "Active", updatedById: actorId },
      });
    }

    await createAuditLog({
      userId: actorId,
      action: AUDIT_ACTIONS.VOID,
      entity: AUDIT_ENTITIES.RENT_PAYMENT,
      entityId: paymentId,
      details: {
        renterId: payment.renterId,
        firstName: payment.renter.firstName,
        lastName: payment.renter.lastName,
        receiptNumber: payment.receiptNumber,
        monthNumber: payment.installment.monthNumber,
        amount: toMoneyString(payment.amount),
        method: payment.method,
        paidOn: formatDateOnly(payment.paidOn),
        reason,
        voidedAt: voidedAt.toISOString(),
      },
      tx,
    });
  });

  return {
    renterId: payment.renterId,
    installmentId: payment.installmentId,
    receiptNumber: payment.receiptNumber,
  };
}

// ---------------------------------------------------------------------------
// Recompute lease status
// ---------------------------------------------------------------------------

/**
 * Recompute and persist the lease's `Completed` flag.
 *
 * Called after mutations that can change "is anything still outstanding?".
 * Kept separate so the read path can stay purely derived and this stays the one
 * place that writes the flag.
 */
export async function refreshLeaseStatus(params: {
  organizationId: string;
  renterId: string;
  aggregate: InstallmentAggregate;
  db?: Tx;
}): Promise<void> {
  const { organizationId, renterId, aggregate, db = prisma } = params;

  const renter = await db.rentRenter.findFirst({
    where: { id: renterId, organizationId },
    select: { status: true },
  });
  if (!renter || renter.status === "Terminated") return;

  const nothingOutstanding =
    aggregate.totalMonths > 0 && aggregate.outstanding.isZero();
  const next: "Active" | "Completed" = nothingOutstanding
    ? "Completed"
    : "Active";
  if (renter.status === next) return;

  await db.rentRenter.update({
    where: { id: renterId },
    data: { status: next },
  });
}
