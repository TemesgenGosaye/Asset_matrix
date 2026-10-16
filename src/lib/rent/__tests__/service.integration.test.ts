// MUST be the first import: it populates process.env.DATABASE_URL before the
// Prisma singleton (and the pg.Pool it builds) is evaluated.
import "../../../../tests/setup/test-env";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import {
  archiveRenter,
  createRenter,
  recordPayment,
  restoreRenter,
  terminateLease,
  updateRenter,
  voidPayment,
} from "../service";
import {
  getRentSummary,
  getRenterWithSchedule,
  listRenters,
  loadInstallmentAggregates,
} from "../queries";
import {
  createRenterSchema,
  rentListQuerySchema,
  updateRenterSchema,
  voidPaymentSchema,
} from "../schemas";
import type { CreateRenterInput } from "../schemas";

/**
 * End-to-end integration tests for the Pay Rent module, against a REAL
 * PostgreSQL database.
 *
 * These are not mocked: every assertion reads back what the service actually
 * wrote, which is the only way to prove the transactional guarantees (schedule
 * generation in the same transaction, the conditional-update double-pay guard,
 * the composite receipt uniqueness, the CHECK constraints).
 *
 * ISOLATION: each suite creates its own organization and deletes only its own
 * rows afterwards. The shared development database is never truncated.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

// A date well in the past, so generated schedules are immediately overdue and the
// derived-overdue logic is actually exercised.
const PAST_START = "2020-01-31";

let organizationId: string;
let actorId: string | null = null;
let stamp: string;

/**
 * Digits-only per-suite suffix.
 *
 * National IDs are validated as digits only (the module's centralised rule), so
 * the unique-per-run suffix must be numeric too - a hex/base36 suffix would be
 * rejected by the very schema under test.
 */
function makeStamp(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/** Parse a schema-valid payload into the service's input type. */
function buildInput(overrides: Partial<Record<string, unknown>> = {}) {
  const raw = {
    firstName: "Selam",
    lastName: "Bekele",
    gender: "female",
    nationalId: `${stamp}01`,
    phones: [{ phone: "0912345678", isPrimary: true }],
    rentType: "Shop",
    rentTypeDetail: "",
    monthlyPrice: "1500.00",
    startDate: PAST_START,
    termMonths: 12,
    ...overrides,
  };
  const parsed = createRenterSchema.parse(raw);
  return parsed as CreateRenterInput;
}

/**
 * Build a properly-defaulted list query through the real schema.
 *
 * Going through `rentListQuerySchema` instead of hand-writing an object literal
 * means the pagination defaults (and any future required field) come from the
 * same place production uses, so these tests exercise the actual contract.
 */
function listQuery(overrides: Record<string, string> = {}) {
  return rentListQuerySchema.parse(overrides);
}

/**
 * Suite bootstrap.
 *
 * Declared at module scope (not inside a describe) so EVERY suite below gets a
 * fresh per-run suffix and shares one throwaway organization. A `describe` that
 * contains only a hook does not apply that hook to its siblings.
 *
 * A real `user` row is created because `rent_installments_paid_requires_receipt_check`
 * insists a PAID month records WHO collected it - which is the behaviour we want
 * in production, so the tests are written to satisfy it rather than to bypass it.
 */
beforeEach(async () => {
  stamp = makeStamp();
  if (!organizationId) {
    const suffix = `${Date.now()}-${stamp}`;
    const org = await prisma.organization.create({
      data: {
        name: `rent-integration-${suffix}`,
        slug: `rent-integration-${suffix}`,
      },
      select: { id: true },
    });
    organizationId = org.id;

    const user = await prisma.user.create({
      data: {
        username: `rent-cashier-${stamp}`,
        firstname: "Rent",
        lastname: "Cashier",
        email: `rent-cashier-${stamp}@example.invalid`,
        isadmin: false,
        canrequest: true,
        organizationId,
        creation_date: new Date(),
        mfaBackupCodes: [],
      },
      select: { userid: true },
    });
    actorId = user.userid;
  }
});

afterAll(async () => {
  if (!organizationId) return;
  // Order matters: children first (the FKs are ON DELETE RESTRICT).
  await prisma.rentPayment.deleteMany({ where: { organizationId } });
  await prisma.rentInstallment.deleteMany({ where: { organizationId } });
  await prisma.rentRenterPhone.deleteMany({ where: { organizationId } });
  await prisma.rentRenter.deleteMany({ where: { organizationId } });
  await prisma.rentReceiptSequence.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

// ---------------------------------------------------------------------------
// Create -> schedule generation
// ---------------------------------------------------------------------------

describeDb("createRenter", () => {
  it("persists every field and generates the full schedule in one transaction", async () => {
    const input = buildInput({ termMonths: 12, monthlyPrice: "2500.50" });

    const { id } = await createRenter({
      organizationId,
      actorId,
      input,
    });

    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    expect(detail).not.toBeNull();
    const renter = detail!.renter;
    expect(renter.firstName).toBe("Selam");
    expect(renter.lastName).toBe("Bekele");
    expect(renter.gender).toBe("female");
    expect(renter.nationalId).toBe(input.nationalId);
    expect(renter.rentType).toBe("Shop");
    expect(renter.monthlyPrice).toBe("2500.50");
    expect(renter.startDate).toBe("2020-01-31");
    expect(renter.termMonths).toBe(12);

    // The schedule is generated, in full, starting at the rent start date.
    expect(detail!.installments).toHaveLength(12);
    expect(detail!.installments[0].monthNumber).toBe(1);
    expect(detail!.installments[0].dueDate).toBe("2020-01-31");
    expect(detail!.installments[11].monthNumber).toBe(12);
    expect(detail!.installments[11].dueDate).toBe("2020-12-31");

    // Month-end clamping happened in the database too.
    expect(detail!.installments[1].dueDate).toBe("2020-02-29"); // leap year
    expect(detail!.installments[2].dueDate).toBe("2020-03-31");

    // Every row snapshots the price exactly.
    for (const row of detail!.installments) {
      expect(row.amountDue).toBe("2500.50");
      expect(row.status).toBe("UNPAID");
    }

    // Phones persisted, normalised to E.164, with exactly one primary.
    const stored = await prisma.rentRenterPhone.findMany({
      where: { renterId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].phone).toBe("+251912345678");
    expect(stored[0].isPrimary).toBe(true);
  });

  it("marks exactly one primary when it is NOT the first phone", async () => {
    // The service used `phone === primary || index === 0`, so ticking the second
    // row as primary marked the FIRST row too. The partial unique index
    // `rent_renter_phones_primary_key` then rejected the write and the operator
    // saw a misleading "a renter with those details already exists" on a
    // perfectly valid form. Every other test put the primary on row 0, so none
    // of them could catch it.
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({
        termMonths: 2,
        phones: [
          { phone: "0912345678", isPrimary: false },
          { phone: "0712345678", isPrimary: true },
        ],
      }),
    });

    const stored = await prisma.rentRenterPhone.findMany({
      where: { renterId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(stored).toHaveLength(2);
    expect(stored.filter((p) => p.isPrimary)).toHaveLength(1);
    expect(stored.find((p) => p.isPrimary)?.phone).toBe("+251712345678");
  });

  it("rejects a duplicate National ID among live renters with a 409", async () => {
    const input = buildInput();
    await createRenter({ organizationId, actorId, input });

    // Two distinct codes can produce this 409, depending on which layer catches
    // it: DUPLICATE_NATIONAL_ID from the friendly pre-check, or DUPLICATE when
    // the partial unique index wins the race. Both are 409 CONFLICT.
    await expect(
      createRenter({ organizationId, actorId, input: buildInput() }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("lets the partial unique index be the final arbiter on a concurrent insert", async () => {
    // Bypasses the friendly pre-check to prove the DATABASE constraint holds on
    // its own: two rows, one National ID, one survives.
    const nationalId = `${stamp}77`;
    const base = {
      organizationId,
      firstName: "Race",
      lastName: "Condition",
      gender: "male" as const,
      nationalId,
      rentType: "Shop" as const,
      monthlyPrice: new Prisma.Decimal(100),
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      termMonths: 2,
      endDate: new Date("2026-02-28T00:00:00.000Z"),
    };

    await prisma.rentRenter.create({ data: base });
    await expect(
      prisma.rentRenter.create({ data: base }),
    ).rejects.toMatchObject({
      code: "P2002",
    });

    const rows = await prisma.rentRenter.count({ where: { nationalId } });
    expect(rows).toBe(1);
  });

  it("rejects a name outside 2..50 characters", async () => {
    expect(() => buildInput({ firstName: "A" })).toThrow();
    expect(() => buildInput({ lastName: "x".repeat(51) })).toThrow();
  });

  it("rejects a term outside 1..120, mirroring the database CHECK", async () => {
    expect(() => buildInput({ termMonths: 0 })).toThrow();
    expect(() => buildInput({ termMonths: 121 })).toThrow();

    // And the database itself refuses it even if the schema were bypassed.
    await expect(
      prisma.rentRenter.create({
        data: {
          organizationId,
          firstName: "Db",
          lastName: "Check",
          gender: "male",
          nationalId: `${stamp}chk`,
          rentType: "Shop",
          monthlyPrice: new Prisma.Decimal(100),
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          termMonths: 500,
          endDate: new Date("2027-01-01T00:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a non-positive price at the database layer", async () => {
    await expect(
      prisma.rentRenter.create({
        data: {
          organizationId,
          firstName: "Db",
          lastName: "Check",
          gender: "male",
          nationalId: `${stamp}prc`,
          rentType: "Shop",
          monthlyPrice: new Prisma.Decimal(0),
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          termMonths: 12,
          endDate: new Date("2027-01-01T00:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a National ID containing non-digits at the database layer", async () => {
    await expect(
      prisma.rentRenter.create({
        data: {
          organizationId,
          firstName: "Db",
          lastName: "Check",
          gender: "male",
          nationalId: "ABC-1234",
          rentType: "Shop",
          monthlyPrice: new Prisma.Decimal(100),
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          termMonths: 12,
          endDate: new Date("2027-01-01T00:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("requires a description when the rent type is Other", async () => {
    // Zod enforces it...
    expect(() =>
      buildInput({ rentType: "Other", rentTypeDetail: "" }),
    ).toThrow();
    // ...and so does the database CHECK.
    await expect(
      prisma.rentRenter.create({
        data: {
          organizationId,
          firstName: "Db",
          lastName: "Check",
          gender: "male",
          nationalId: `${stamp}oth`,
          rentType: "Other",
          monthlyPrice: new Prisma.Decimal(100),
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          termMonths: 12,
          endDate: new Date("2027-01-01T00:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("stores 'Other' when a description is supplied", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ rentType: "Other", rentTypeDetail: "Restaurant" }),
    });
    const row = await prisma.rentRenter.findUnique({ where: { id } });
    expect(row?.rentType).toBe("Other");
    expect(row?.rentTypeDetail).toBe("Restaurant");
  });

  it("refuses a phone that is not a valid Ethiopian mobile", () => {
    expect(() =>
      buildInput({ phones: [{ phone: "12345", isPrimary: true }] }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Payment -> totals
// ---------------------------------------------------------------------------

describeDb("recordPayment", () => {
  it("settles the month, issues a receipt and moves the totals", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 12, monthlyPrice: "1000.00" }),
    });

    const before = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(before!.renter.totals.monthsPaid).toBe(0);
    expect(before!.renter.totals.totalPaid).toBe("0.00");
    expect(before!.renter.totals.outstanding).toBe("12000.00");

    const result = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: {
        installmentId: before!.installments[0].id,
        method: "Cash",
        referenceNumber: "FT-9911",
      },
    });

    expect(result.receiptNumber).toMatch(/^RENT-\d{4}-\d{6}$/);
    expect(result.monthNumber).toBe(1);

    const after = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    // Totals moved by exactly one month, to the cent.
    expect(after!.renter.totals.monthsPaid).toBe(1);
    expect(after!.renter.totals.totalPaid).toBe("1000.00");
    expect(after!.renter.totals.outstanding).toBe("11000.00");
    expect(after!.renter.totals.totalContractValue).toBe("12000.00");

    // The month is stamped, and the receipt was appended (not overwritten).
    const month1 = after!.installments[0];
    expect(month1.status).toBe("PAID");
    expect(month1.receiptNumber).toBe(result.receiptNumber);
    expect(month1.paymentMethod).toBe("Cash");
    expect(month1.referenceNumber).toBe("FT-9911");
    expect(month1.payments).toHaveLength(1);
    expect(month1.payments[0].amount).toBe("1000.00");
  });

  it("rejects paying a later month while an earlier one is unpaid", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 12 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    await expect(
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: { installmentId: detail!.installments[2].id, method: "Cash" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "OUT_OF_ORDER" });
  });

  it("allows an advance payment once the earlier months are settled", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 12 }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    for (const index of [0, 1]) {
      await recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: {
          installmentId: detail!.installments[index].id,
          method: "Cash",
        },
      });
    }

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const result = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: {
        installmentId: detail!.installments[2].id,
        method: "BankTransfer",
      },
    });
    expect(result.monthNumber).toBe(3);

    const after = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(after!.renter.totals.monthsPaid).toBe(3);
  });

  // THE concurrency requirement: a double-click must never double-pay.
  it("serialises concurrent payments for the same month: one success, one conflict", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 12 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const target = detail!.installments[0].id;

    const attempts = await Promise.allSettled([
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: { installmentId: target, method: "Cash" },
      }),
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: { installmentId: target, method: "Cash" },
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
    });

    // Exactly ONE receipt exists for that month, and the totals moved once.
    const payments = await prisma.rentPayment.count({
      where: { installmentId: target, voidedAt: null },
    });
    expect(payments).toBe(1);

    const after = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(after!.renter.totals.monthsPaid).toBe(1);
    expect(after!.renter.totals.totalPaid).toBe("1500.00");
  });

  it("rejects a repeated payment for an already-paid month", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 12 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const target = detail!.installments[0].id;

    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: target, method: "Cash" },
    });

    await expect(
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: { installmentId: target, method: "Cash" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("marks the lease Completed when the last month is settled", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2, monthlyPrice: "500" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });
    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[1].id, method: "Cash" },
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.status).toBe("Completed");
    expect(detail!.renter.displayStatus).toBe("Completed");
    expect(detail!.renter.totals.outstanding).toBe("0.00");
    expect(detail!.renter.totals.nextDueDate).toBeNull();
  });

  it("rejects a month that does not belong to the lease", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 4 }),
    });
    await expect(
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: { monthNumber: 99, method: "Cash" },
      }),
    ).rejects.toMatchObject({ status: 404, code: "INSTALLMENT_NOT_FOUND" });
  });

  it("refuses any amount other than the exact amount invoiced", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 4, monthlyPrice: "100" }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const first = detail!.installments[0];

    // Over the invoice.
    await expect(
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: {
          installmentId: first.id,
          method: "Cash",
          // The schema's money type yields a Decimal, never a string.
          amount: new Prisma.Decimal("500"),
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "AMOUNT_MISMATCH" });

    // Under the invoice. This is the dangerous direction: accepting it would
    // mark the month PAID while every "collected" aggregate (which sums
    // installment.amountDue) reported the full 100, silently forgiving the
    // shortfall and making it uncollectable.
    await expect(
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: {
          installmentId: first.id,
          method: "Cash",
          amount: new Prisma.Decimal("40"),
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "AMOUNT_MISMATCH" });

    // Neither attempt may have touched the month or minted a receipt.
    const after = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(after!.installments[0].status).toBe("UNPAID");
    expect(after!.installments[0].receiptNumber).toBeNull();
    expect(after!.renter.totals.totalPaid).toBe("0.00");

    // Stating the exact figure is accepted.
    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: {
        installmentId: first.id,
        method: "Cash",
        amount: new Prisma.Decimal("100"),
      },
    });
    expect(paid.receiptNumber).toMatch(/^RENT-\d{4}-\d{6}$/);
  });

  it("refuses to pay a renter in another organization", async () => {
    const other = await prisma.organization.create({
      data: {
        name: `rent-other-${Date.now()}`,
        slug: `rent-other-${Date.now()}-${stamp}`,
      },
      select: { id: true },
    });

    try {
      const { id } = await createRenter({
        organizationId: other.id,
        actorId,
        input: buildInput({ termMonths: 2, nationalId: `${stamp}11` }),
      });
      await expect(
        recordPayment({
          organizationId, // the WRONG org
          actorId,
          renterId: id,
          input: { monthNumber: 1, method: "Cash" },
        }),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await prisma.rentPayment.deleteMany({
        where: { organizationId: other.id },
      });
      await prisma.rentInstallment.deleteMany({
        where: { organizationId: other.id },
      });
      await prisma.rentRenterPhone.deleteMany({
        where: { organizationId: other.id },
      });
      await prisma.rentReceiptSequence.deleteMany({
        where: { organizationId: other.id },
      });
      await prisma.organization.deleteMany({ where: { id: other.id } });
    }
  });
});

// ---------------------------------------------------------------------------
// Void
// ---------------------------------------------------------------------------

describeDb("voidPayment", () => {
  it("reopens the month, keeps the receipt and restores the outstanding total", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 3, monthlyPrice: "800.00" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.totals.totalPaid).toBe("800.00");

    const result = await voidPayment({
      organizationId,
      actorId,
      paymentId: paid.paymentId,
      input: { reason: "Entered against the wrong month" },
    });

    expect(result.receiptNumber).toBe(paid.receiptNumber);

    const after = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(after!.renter.totals.monthsPaid).toBe(0);
    expect(after!.renter.totals.totalPaid).toBe("0.00");
    expect(after!.renter.totals.outstanding).toBe("2400.00");
    expect(after!.installments[0].status).toBe("UNPAID");
    expect(after!.installments[0].receiptNumber).toBeNull();

    // NOTHING is deleted: the voided receipt still exists, with a reason.
    const receipt = await prisma.rentPayment.findUnique({
      where: { id: paid.paymentId },
    });
    expect(receipt).not.toBeNull();
    expect(receipt?.voidedAt).not.toBeNull();
    expect(receipt?.voidReason).toBe("Entered against the wrong month");
    expect(receipt?.receiptNumber).toBe(paid.receiptNumber);
  });

  it("lets the reopened month be re-paid with a NEW receipt number", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2, monthlyPrice: "400" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    const first = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });
    await voidPayment({
      organizationId,
      actorId,
      paymentId: first.paymentId,
      input: { reason: "Reversed" },
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const second = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: {
        installmentId: detail!.installments[0].id,
        method: "BankTransfer",
      },
    });

    // The old number is never re-issued.
    expect(second.receiptNumber).not.toBe(first.receiptNumber);
    expect(Number(second.receiptNumber.slice(-6))).toBeGreaterThan(
      Number(first.receiptNumber.slice(-6)),
    );
  });

  it("rejects voiding the same payment twice", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    await voidPayment({
      organizationId,
      actorId,
      paymentId: paid.paymentId,
      input: { reason: "First" },
    });

    await expect(
      voidPayment({
        organizationId,
        actorId,
        paymentId: paid.paymentId,
        input: { reason: "Second" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_VOIDED" });
  });

  it("reopens a Completed lease", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 1, monthlyPrice: "250" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.status).toBe("Completed");

    await voidPayment({
      organizationId,
      actorId,
      paymentId: paid.paymentId,
      input: { reason: "Reversed" },
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.status).toBe("Active");
    expect(detail!.renter.totals.outstanding).toBe("250.00");
  });

  it("refuses to void on a terminated lease, so no dead month reopens", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 4, monthlyPrice: "600" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    // Terminate with an effective date AFTER month 1, so month 1 stays PAID.
    await terminateLease({
      organizationId,
      actorId,
      id,
      input: { reason: "Premises vacated", effectiveDate: "2026-12-01" },
    });

    // Reopening month 1 now would leave an UNPAID month on a terminated lease:
    // recordPayment refuses it forever, yet outstanding would count it - a
    // balance that can never be collected but is reported in perpetuity.
    await expect(
      voidPayment({
        organizationId,
        actorId,
        paymentId: paid.paymentId,
        input: { reason: "Reversed" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "LEASE_TERMINATED" });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.installments[0].status).toBe("PAID");
    expect(detail!.renter.status).toBe("Terminated");
  });

  it("requires a reason before voiding", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    // Zod rejects a blank reason before it can reach the service.
    expect(() => voidPaymentSchema.parse({ reason: "" })).toThrow();

    // And if the service were called directly, the database CHECK would refuse it.
    await expect(
      prisma.rentPayment.update({
        where: { id: paid.paymentId },
        data: { voidedAt: new Date(), voidReason: "   " },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Price change
// ---------------------------------------------------------------------------

describeDb("updateRenter price change", () => {
  it("reprices only UNPAID months and never a settled one", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 6, monthlyPrice: "1000.00" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    // Settle month 1 so there is a "paid" month to protect.
    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    const parsed = updateRenterSchema.parse({
      monthlyPrice: "1200.00",
      reason: "Annual tariff review",
    });

    await updateRenter({
      organizationId,
      actorId,
      id,
      input: parsed,
      canOverrideTerms: false,
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    // Month 1 keeps the price it was invoiced at.
    expect(detail!.installments[0].amountDue).toBe("1000.00");
    expect(detail!.renter.totals.totalPaid).toBe("1000.00");

    // Every unpaid month picked up the new price.
    for (let i = 1; i < 6; i += 1) {
      expect(detail!.installments[i].amountDue).toBe("1200.00");
    }

    // Totals are computed, not denormalised, so they moved accordingly.
    expect(detail!.renter.monthlyPrice).toBe("1200.00");
    expect(detail!.renter.totals.totalContractValue).toBe("7200.00"); // 1200 x 6
    expect(detail!.renter.totals.outstanding).toBe("6000.00"); // 5 x 1200
  });

  it("leaves personal fields freely editable", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 3 }),
    });

    const parsed = updateRenterSchema.parse({
      firstName: "Selamawit",
      lastName: "Bekele",
      gender: "male",
      phones: [
        { phone: "0712345678", isPrimary: true },
        { phone: "+251 91 555 4433", isPrimary: false },
      ],
      rentType: "Grocery",
    });

    await updateRenter({
      organizationId,
      actorId,
      id,
      input: parsed,
      canOverrideTerms: false,
    });

    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.firstName).toBe("Selamawit");
    expect(detail!.renter.gender).toBe("male");
    expect(detail!.renter.rentType).toBe("Grocery");
    expect(detail!.renter.phones).toHaveLength(2);
    expect(detail!.renter.phones.filter((p) => p.isPrimary)).toHaveLength(1);
  });

  it("refuses to clear the description of an existing 'Other' lease", async () => {
    // `rentTypeDetail`'s transform normalises an omitted field to `null`, so Zod
    // cannot tell "not sent" from "explicitly cleared" and the `Other` rule
    // cannot fire there. The service checks the STORED type instead and returns a
    // field-level error, rather than letting the database CHECK surface as an
    // opaque 422 CONSTRAINT_VIOLATION.
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({
        termMonths: 2,
        rentType: "Other",
        rentTypeDetail: "Kiosk at the gate",
      }),
    });

    await expect(
      updateRenter({
        organizationId,
        actorId,
        id,
        input: updateRenterSchema.parse({ rentTypeDetail: null }),
        canOverrideTerms: false,
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "RENT_TYPE_DETAIL_REQUIRED",
    });

    // Moving off 'Other' in the same request is fine.
    await updateRenter({
      organizationId,
      actorId,
      id,
      input: updateRenterSchema.parse({
        rentType: "Shop",
        rentTypeDetail: null,
      }),
      canOverrideTerms: false,
    });

    const after = await prisma.rentRenter.findUnique({ where: { id } });
    expect(after?.rentType).toBe("Shop");
    expect(after?.rentTypeDetail).toBeNull();
  });

  it("keeps one primary when an edit moves the primary to another row", async () => {
    // Same defect as the create case, on the update path: `deleteMany` +
    // `createMany` inside the transaction, so a double primary rolled the whole
    // edit back and the save simply failed.
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });

    await updateRenter({
      organizationId,
      actorId,
      id,
      input: updateRenterSchema.parse({
        phones: [
          { phone: "0912345678", isPrimary: false },
          { phone: "0712345678", isPrimary: true },
        ],
      }),
      canOverrideTerms: false,
    });

    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.phones.filter((p) => p.isPrimary)).toHaveLength(1);
    expect(detail!.renter.phones.find((p) => p.isPrimary)?.phone).toBe(
      "+251712345678",
    );
  });

  it("blocks a start-date change once payments exist, without the elevated grant", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 6 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    const parsed = updateRenterSchema.parse({
      startDate: "2020-02-01",
      reason: "Data correction",
    });

    await expect(
      updateRenter({
        organizationId,
        actorId,
        id,
        input: parsed,
        canOverrideTerms: false,
      }),
    ).rejects.toMatchObject({ status: 403, code: "TERMS_LOCKED" });
  });

  it("regenerates the schedule when the term changes and nothing is paid", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 3, monthlyPrice: "700" }),
    });

    const parsed = updateRenterSchema.parse({ termMonths: 6 });
    const result = await updateRenter({
      organizationId,
      actorId,
      id,
      input: parsed,
      canOverrideTerms: false,
    });
    expect(result.scheduleRegenerated).toBe(true);

    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.installments).toHaveLength(6);
    expect(detail!.renter.termMonths).toBe(6);
    expect(detail!.renter.endDate).toBe("2020-06-30");
  });

  it("rejects a duplicate National ID introduced by an edit", async () => {
    await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({
        termMonths: 2,
        firstName: "Other",
        lastName: "Renter",
        nationalId: `${stamp}02`,
      }),
    });

    await expect(
      updateRenter({
        organizationId,
        actorId,
        id,
        input: updateRenterSchema.parse({ nationalId: `${stamp}01` }),
        canOverrideTerms: false,
      }),
    ).rejects.toMatchObject({ status: 409, code: "DUPLICATE_NATIONAL_ID" });
  });
});

// ---------------------------------------------------------------------------
// Terminate
// ---------------------------------------------------------------------------

describeDb("terminateLease", () => {
  it("voids the remaining unpaid months and keeps the paid ones", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 6, monthlyPrice: "300" }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });

    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const remainingUnpaid = detail!.installments.filter(
      (i) => i.status === "UNPAID",
    ).length;

    const result = await terminateLease({
      organizationId,
      actorId,
      id,
      input: {
        reason: "Shop demolished for expansion",
        // Explicit: this lease starts in 2020, so a default "from today"
        // effective date would correctly void NOTHING.
        effectiveDate: "2020-01-01",
      },
    });

    expect(result.voidedMonths).toBe(remainingUnpaid);

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.status).toBe("Terminated");
    expect(detail!.renter.terminationReason).toBe(
      "Shop demolished for expansion",
    );
    expect(detail!.renter.terminatedAt).not.toBeNull();

    // The paid month is untouched; every unpaid month is voided with a reason.
    expect(detail!.installments[0].status).toBe("PAID");
    expect(detail!.installments[0].receiptNumber).not.toBeNull();
    for (const row of detail!.installments.slice(1)) {
      expect(row.status).toBe("VOIDED");
      expect(row.voidedAt).not.toBeNull();
      expect(row.voidReason).toBe("Shop demolished for expansion");
    }

    // Voided months leave the outstanding balance.
    expect(detail!.renter.totals.outstanding).toBe("0.00");
    expect(detail!.renter.totals.totalPaid).toBe("300.00");
  });

  it("refuses further payments and edits once terminated", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 3 }),
    });
    await terminateLease({
      organizationId,
      actorId,
      id,
      input: { reason: "Done" },
    });

    await expect(
      recordPayment({
        organizationId,
        actorId,
        renterId: id,
        input: { monthNumber: 1, method: "Cash" },
      }),
    ).rejects.toMatchObject({ code: "LEASE_TERMINATED" });

    await expect(
      updateRenter({
        organizationId,
        actorId,
        id,
        input: updateRenterSchema.parse({ firstName: "Nope" }),
        canOverrideTerms: true,
      }),
    ).rejects.toMatchObject({ code: "LEASE_TERMINATED" });
  });

  it("still refuses a schedule change after every payment has been voided", async () => {
    // `countPayments` deliberately counts voided receipts too, because
    // `rent_payments_installmentId_fkey` is ON DELETE RESTRICT with no partial
    // predicate: a voided receipt still blocks the `deleteMany` that schedule
    // regeneration performs. Counting only live payments let the service enter
    // the transaction and then fail on P2003 -> an unhelpful 409 REFERENCED.
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 4 }),
    });
    let detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const paid = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });
    await voidPayment({
      organizationId,
      actorId,
      paymentId: paid.paymentId,
      input: { reason: "Reversed in error" },
    });

    const payments = await prisma.rentPayment.count({
      where: { renterId: id, voidedAt: null },
    });
    expect(payments).toBe(0); // no LIVE payments remain

    await expect(
      updateRenter({
        organizationId,
        actorId,
        id,
        input: updateRenterSchema.parse({ termMonths: 8, reason: "Trying" }),
        canOverrideTerms: true,
      }),
    ).rejects.toMatchObject({ status: 409, code: "SCHEDULE_FROZEN" });

    detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.installments).toHaveLength(4);
    expect(detail!.renter.termMonths).toBe(4);
  });

  it("refuses to terminate twice", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });
    await terminateLease({
      organizationId,
      actorId,
      id,
      input: { reason: "First" },
    });
    await expect(
      terminateLease({
        organizationId,
        actorId,
        id,
        input: { reason: "Second" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_TERMINATED" });
  });

  it("keeps months that are unpaid but already past the effective date", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({
        termMonths: 24,
        startDate: "2026-01-01",
        monthlyPrice: "100",
      }),
    });

    // Effective from the far future, so nothing is voided yet.
    const result = await terminateLease({
      organizationId,
      actorId,
      id,
      input: { reason: "Notice served", effectiveDate: "2030-01-01" },
    });

    expect(result.voidedMonths).toBe(0);
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(detail!.renter.status).toBe("Terminated");
    expect(detail!.installments.every((i) => i.status === "UNPAID")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Archive / restore
// ---------------------------------------------------------------------------

describeDb("archiveRenter / restoreRenter", () => {
  it("soft-deletes, hides from the live list, then restores", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 3 }),
    });

    // Hidden from the live list, visible in the archive list. Search by lastName,
    // NOT by the UUID: `buildRenterWhere` only matches firstName/lastName/
    // nationalId/phone, so searching an id returns an empty set whether or not
    // the soft delete works - the old assertion could never fail.
    const lastName = `Archived${stamp}`;
    await updateRenter({
      organizationId,
      actorId,
      id,
      input: updateRenterSchema.parse({ lastName }),
      canOverrideTerms: false,
    });
    await archiveRenter({
      organizationId,
      actorId,
      id,
      input: { reason: "Left the premises" },
    });

    const live = await listRenters({
      organizationId,
      query: listQuery({ search: lastName }),
      canSeeSensitive: true,
    });
    expect(live.data.some((r) => r.id === id)).toBe(false);

    const archived = await listRenters({
      organizationId,
      query: listQuery({ search: lastName, onlyArchived: "true" }),
      canSeeSensitive: true,
    });
    expect(archived.data.some((r) => r.id === id)).toBe(true);

    // The row still exists throughout - nothing is hard-deleted.
    const row = await prisma.rentRenter.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.archivedReason).toBe("Left the premises");

    await restoreRenter({
      organizationId,
      actorId,
      id,
      input: { reason: "Correction" },
    });

    const restored = await prisma.rentRenter.findUnique({ where: { id } });
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.archivedReason).toBeNull();
  });

  it("frees the National ID while archived, then blocks reuse on restore", async () => {
    const nationalId = `${stamp}98`;
    const first = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2, nationalId }),
    });
    await archiveRenter({
      organizationId,
      actorId,
      id: first.id,
      input: { reason: null },
    });

    // The partial unique index only covers live rows, so the ID is reusable.
    const second = await createRenter({
      organizationId,
      actorId,
      input: buildInput({
        termMonths: 2,
        nationalId,
        firstName: "Second",
        lastName: "Holder",
      }),
    });

    // Restoring would collide, so it is refused with a clear conflict.
    await expect(
      restoreRenter({ organizationId, actorId, id: first.id, input: {} }),
    ).rejects.toMatchObject({ status: 409 });
    expect(second.id).not.toBe(first.id);
  });

  it("refuses a hard delete of a renter with payment history", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    // ON DELETE RESTRICT on rent_installments.renterId must refuse this.
    await expect(prisma.rentRenter.delete({ where: { id } })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Read layer
// ---------------------------------------------------------------------------

describeDb("read layer", () => {
  it("derives months paid, outstanding and next due by aggregation", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 4, monthlyPrice: "1000" }),
    });
    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: { installmentId: detail!.installments[0].id, method: "Cash" },
    });

    const aggregates = await loadInstallmentAggregates(prisma, organizationId, [
      id,
    ]);
    const agg = aggregates.get(id)!;

    expect(agg.totalMonths).toBe(4);
    expect(agg.monthsPaid).toBe(1);
    expect(agg.outstanding.toFixed(2)).toBe("3000.00");
    expect(agg.totalPaid.toFixed(2)).toBe("1000.00");
    // With a 2020 start every unpaid month is past due.
    expect(agg.overdueMonths).toBe(3);
    expect(agg.nextDueDate).not.toBeNull();
  });

  it("masks the National ID for a caller without the sensitive permission", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });

    const masked = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: false,
    });
    expect(masked!.renter.nationalIdMasked).toBe(true);
    expect(masked!.renter.nationalId).toMatch(/^\*+\d{4}$/);
    expect(masked!.renter.nationalId).not.toContain(String(stamp).slice(0, 3));

    const unmasked = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    expect(unmasked!.renter.nationalIdMasked).toBe(false);
    expect(unmasked!.renter.nationalId).toContain(stamp);
  });

  it("paginates and sorts without loading everything", async () => {
    const result = await listRenters({
      organizationId,
      query: listQuery({ pageSize: "2" }),
      canSeeSensitive: true,
    });
    expect(result.data.length).toBeLessThanOrEqual(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.total).toBeGreaterThan(0);
    expect(result.data[0].srNo).toBe(1);
  });

  it("computes the summary from real aggregates", async () => {
    const summary = await getRentSummary(organizationId);
    expect(summary.totalRenters).toBeGreaterThan(0);
    expect(summary.totalCollected).toMatch(/^\d+\.\d{2}$/);
    expect(summary.totalContractValue).toMatch(/^\d+\.\d{2}$/);
    expect(summary.overdueRenters).toBeGreaterThan(0);
  });

  /**
   * Regression: the summary used to LEFT JOIN renters to installments in a single
   * query, so `COUNT(*)` counted SCHEDULE ROWS rather than renters and
   * `SUM(monthlyPrice * termMonths)` was multiplied by the lease term. With one
   * renter on a 24-month lease it reported 24 renters instead of 1.
   *
   * Asserted against SQL ground truth rather than a hard-coded number, so it
   * holds no matter what the surrounding tests leave behind.
   */
  it("counts renters, not schedule rows (no join fan-out)", async () => {
    // A dedicated organization so the ground truth is exact.
    const suffix = `${Date.now()}-${stamp}`;
    const org = await prisma.organization.create({
      data: { name: `rent-summary-${suffix}`, slug: `rent-summary-${suffix}` },
      select: { id: true },
    });

    try {
      const created: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        const { id } = await createRenter({
          organizationId: org.id,
          actorId,
          input: buildInput({
            termMonths: 12,
            monthlyPrice: "100.00",
            firstName: "Summary",
            lastName: `Renter${i}`,
            nationalId: `${stamp}${i}1`,
          }),
        });
        created.push(id);
      }

      // Settle one month on the first renter only.
      const detail = await getRenterWithSchedule({
        organizationId: org.id,
        id: created[0],
        canSeeSensitive: true,
      });
      await recordPayment({
        organizationId: org.id,
        actorId,
        renterId: created[0],
        input: { installmentId: detail!.installments[0].id, method: "Cash" },
      });

      const summary = await getRentSummary(org.id);

      // 2 renters x 12 months = 24 schedule rows. The old query would say 24.
      expect(summary.totalRenters).toBe(2);
      expect(summary.activeLeases).toBe(2);

      // 2 x (100.00 x 12) = 2400.00 - NOT multiplied by the term again.
      expect(summary.totalContractValue).toBe("2400.00");
      expect(summary.totalCollected).toBe("100.00");
      // 23 unpaid months x 100.00
      expect(summary.totalOutstanding).toBe("2300.00");
      expect(summary.overdueRenters).toBe(2);
      expect(summary.overdueMonths).toBe(23);
    } finally {
      await prisma.rentPayment.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.rentInstallment.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.rentRenterPhone.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.rentRenter.deleteMany({ where: { organizationId: org.id } });
      await prisma.rentReceiptSequence.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it("excludes archived leases from every money total", async () => {
    // The summary previously filtered `deletedAt IS NULL` on the COUNTs and on
    // contract value, but summed `collected` / `outstanding` / `overdueMonths`
    // unfiltered - so `overdueRenters` and `overdueMonths` contradicted each
    // other and collected no longer reconciled against contract value.
    const suffix = `${Date.now()}-${stamp}`;
    const org = await prisma.organization.create({
      data: {
        name: `rent-archived-sum-${suffix}`,
        slug: `rent-archived-sum-${suffix}`,
      },
      select: { id: true },
    });

    try {
      const live = await createRenter({
        organizationId: org.id,
        actorId,
        input: buildInput({
          termMonths: 3,
          monthlyPrice: "100.00",
          firstName: "Live",
          lastName: "Renter",
          nationalId: `${stamp}71`,
        }),
      });
      const archived = await createRenter({
        organizationId: org.id,
        actorId,
        input: buildInput({
          termMonths: 3,
          monthlyPrice: "100.00",
          firstName: "Archived",
          lastName: "Renter",
          nationalId: `${stamp}72`,
        }),
      });

      const liveDetail = await getRenterWithSchedule({
        organizationId: org.id,
        id: live.id,
        canSeeSensitive: true,
      });
      await recordPayment({
        organizationId: org.id,
        actorId,
        renterId: live.id,
        input: {
          installmentId: liveDetail!.installments[0].id,
          method: "Cash",
        },
      });

      await archiveRenter({
        organizationId: org.id,
        actorId,
        id: archived.id,
        input: { reason: "Left the premises" },
      });

      const summary = await getRentSummary(org.id);

      // 2 renters exist; 1 is archived.
      expect(summary.totalRenters).toBe(1);
      expect(summary.archivedRenters).toBe(1);

      // Only the LIVE lease contributes money and contract value.
      expect(summary.totalContractValue).toBe("300.00");
      expect(summary.totalCollected).toBe("100.00");
      expect(summary.totalOutstanding).toBe("200.00");
      // 2 unpaid months on the live lease, 3 on the archived one. The archived
      // 3 must NOT be counted.
      expect(summary.overdueMonths).toBe(2);
      // Both leases have an overdue month, but only the live one is reported.
      expect(summary.overdueRenters).toBe(1);
    } finally {
      await prisma.rentPayment.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.rentInstallment.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.rentRenterPhone.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.rentRenter.deleteMany({ where: { organizationId: org.id } });
      await prisma.rentReceiptSequence.deleteMany({
        where: { organizationId: org.id },
      });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it("does not offer National ID search to a caller who may not read it", async () => {
    // The mask reveals the last four digits, so a `contains` filter on
    // nationalId let a `rent:view` caller walk prefixes and rebuild the value
    // they were denied.
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ termMonths: 2 }),
    });

    const denied = await listRenters({
      organizationId,
      query: listQuery({ search: stamp }),
      canSeeSensitive: false,
    });
    expect(denied.data.some((r) => r.id === id)).toBe(false);

    const allowed = await listRenters({
      organizationId,
      query: listQuery({ search: stamp }),
      canSeeSensitive: true,
    });
    expect(allowed.data.some((r) => r.id === id)).toBe(true);
  });

  it("returns an empty register (not an error) when nothing exists", async () => {
    const empty = await prisma.organization.create({
      data: {
        name: `rent-empty-${Date.now()}`,
        slug: `rent-empty-${Date.now()}-${stamp}`,
      },
      select: { id: true },
    });

    try {
      const list = await listRenters({
        organizationId: empty.id,
        query: listQuery(),
        canSeeSensitive: true,
      });
      expect(list.data).toHaveLength(0);
      expect(list.total).toBe(0);
      expect(list.totalPages).toBe(0);

      const summary = await getRentSummary(empty.id);
      expect(summary.totalRenters).toBe(0);
      expect(summary.totalCollected).toBe("0.00");
    } finally {
      await prisma.organization.deleteMany({ where: { id: empty.id } });
    }
  });
});
