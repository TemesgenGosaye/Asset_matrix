// MUST be the first import: it populates process.env.DATABASE_URL before the
// Prisma singleton (and the pg.Pool it builds) is evaluated.
import "../../../../tests/setup/test-env";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Audit assertions for the Pay Rent module.
 *
 * WHY THE AUDIT HELPER IS MOCKED: `createAuditLog` reads `headers()` from
 * `next/headers`, which throws outside a Next.js request scope and makes the
 * helper deliberately swallow the write. Asserting on `audit_logs` rows from a
 * bare script would therefore prove nothing. Mocking the helper instead tests the
 * part that actually matters and that a mock CAN prove: WHICH entry is written,
 * with WHICH action, entity, actor and details - and, critically, that personal
 * data (National ID, phone) never reaches the log in the clear.
 *
 * The database writes themselves are covered by service.integration.test.ts.
 */

/**
 * `vi.hoisted` is required: `vi.mock` is hoisted above every other statement, so
 * a plain `const` would not be initialised when the factory runs.
 */
const { createAuditLog, createAuditLogWithDiff } = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createAuditLogWithDiff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-log")>();
  return {
    ...actual,
    createAuditLog,
    createAuditLogWithDiff,
  };
});

import prisma from "@/lib/prisma";
import {
  archiveRenter,
  createRenter,
  recordPayment,
  terminateLease,
  updateRenter,
  voidPayment,
} from "../service";
import { getRenterWithSchedule } from "../queries";
import {
  archiveRenterSchema,
  createRenterSchema,
  updateRenterSchema,
  voidPaymentSchema,
} from "../schemas";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

let organizationId: string;
let actorId: string | null = null;
let stamp: string;

function makeStamp(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

function buildInput(overrides: Partial<Record<string, unknown>> = {}) {
  return createRenterSchema.parse({
    firstName: "Selam",
    lastName: "Bekele",
    gender: "female",
    nationalId: `${stamp}01`,
    phones: [{ phone: "0912345678", isPrimary: true }],
    rentType: "Shop",
    rentTypeDetail: "",
    monthlyPrice: "1500.00",
    startDate: "2020-01-31",
    termMonths: 4,
    ...overrides,
  });
}

/** Find the single audit call matching an action + entity. */
function callFor(action: string, entity: string) {
  const found = createAuditLog.mock.calls.find(
    ([arg]) => arg?.action === action && arg?.entity === entity,
  );
  expect(
    found,
    `expected a ${action} audit entry for ${entity}, saw: ${JSON.stringify(
      createAuditLog.mock.calls.map(([a]) => `${a.action}/${a.entity}`),
    )}`,
  ).toBeTruthy();
  return found![0] as {
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    details?: Record<string, unknown>;
    tx?: unknown;
  };
}

beforeEach(async () => {
  createAuditLog.mockClear();
  createAuditLogWithDiff.mockClear();

  stamp = makeStamp();
  if (!organizationId) {
    const suffix = `${Date.now()}-${stamp}`;
    const org = await prisma.organization.create({
      data: { name: `rent-audit-${suffix}`, slug: `rent-audit-${suffix}` },
      select: { id: true },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        username: `rent-auditor-${stamp}`,
        firstname: "Rent",
        lastname: "Auditor",
        email: `rent-auditor-${stamp}@example.invalid`,
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
  await prisma.rentPayment.deleteMany({ where: { organizationId } });
  await prisma.rentInstallment.deleteMany({ where: { organizationId } });
  await prisma.rentRenterPhone.deleteMany({ where: { organizationId } });
  await prisma.rentRenter.deleteMany({ where: { organizationId } });
  await prisma.rentReceiptSequence.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

describeDb("Pay Rent audit trail", () => {
  it("logs CREATE with the terms and the generated schedule size", async () => {
    const input = buildInput();
    const { id } = await createRenter({ organizationId, actorId, input });

    const entry = callFor("CREATE", "rent_renter");
    expect(entry.entityId).toBe(id);
    expect(entry.userId).toBe(actorId);
    expect(entry.details).toMatchObject({
      firstName: "Selam",
      lastName: "Bekele",
      gender: "female",
      rentType: "Shop",
      monthlyPrice: "1500.00",
      startDate: "2020-01-31",
      termMonths: 4,
      scheduleRows: 4,
      phoneCount: 1,
      nationalIdMasked: true,
    });
    // The audit row is written inside the same transaction as the write.
    expect(entry.tx).toBeTruthy();
  });

  it("never writes the National ID or the phone numbers to the log", async () => {
    await createRenter({ organizationId, actorId, input: buildInput() });

    const serialised = JSON.stringify(
      createAuditLog.mock.calls.map(([arg]) => arg.details),
    );
    expect(serialised).not.toContain(stamp);
    expect(serialised).not.toContain("+251912345678");
    expect(serialised).not.toContain("0912345678");
  });

  it("logs PAY with the receipt number and amount", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ monthlyPrice: "2000.00" }),
    });
    createAuditLog.mockClear();

    const detail = await getRenterWithSchedule({
      organizationId,
      id,
      canSeeSensitive: true,
    });
    const result = await recordPayment({
      organizationId,
      actorId,
      renterId: id,
      input: {
        installmentId: detail!.installments[0].id,
        method: "BankTransfer",
        referenceNumber: "FT-4242",
      },
    });

    const entry = callFor("PAY", "rent_payment");
    expect(entry.entityId).toBe(result.paymentId);
    expect(entry.userId).toBe(actorId);
    expect(entry.details).toMatchObject({
      renterId: id,
      monthNumber: 1,
      amount: "2000.00",
      receiptNumber: result.receiptNumber,
      method: "BankTransfer",
      referenceNumber: "FT-4242",
      leaseCompleted: false,
    });
  });

  it("logs VOID with the receipt, amount and the mandatory reason", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput(),
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
    createAuditLog.mockClear();

    await voidPayment({
      organizationId,
      actorId,
      paymentId: paid.paymentId,
      input: voidPaymentSchema.parse({ reason: "Wrong month entered" }),
    });

    const entry = callFor("VOID", "rent_payment");
    expect(entry.entityId).toBe(paid.paymentId);
    expect(entry.details).toMatchObject({
      renterId: id,
      receiptNumber: paid.receiptNumber,
      monthNumber: 1,
      amount: "1500.00",
      reason: "Wrong month entered",
    });
  });

  it("logs TERMINATE with the reason and how many months were voided", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput(),
    });
    createAuditLog.mockClear();

    const result = await terminateLease({
      organizationId,
      actorId,
      id,
      input: { reason: "Premises demolished", effectiveDate: "2020-01-01" },
    });

    const entry = callFor("TERMINATE", "rent_renter");
    expect(entry.entityId).toBe(id);
    expect(entry.details).toMatchObject({
      firstName: "Selam",
      lastName: "Bekele",
      reason: "Premises demolished",
      effectiveDate: "2020-01-01",
      voidedMonths: result.voidedMonths,
    });
  });

  it("logs DELETE for an archive, flagged as a soft delete", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput(),
    });
    createAuditLog.mockClear();

    await archiveRenter({
      organizationId,
      actorId,
      id,
      input: archiveRenterSchema.parse({ reason: "Moved away" }),
    });

    const entry = callFor("DELETE", "rent_renter");
    expect(entry.entityId).toBe(id);
    expect(entry.details).toMatchObject({
      firstName: "Selam",
      lastName: "Bekele",
      reason: "Moved away",
      softDelete: true,
    });
  });

  it("logs UPDATE with a before/after diff of the changed terms", async () => {
    const { id } = await createRenter({
      organizationId,
      actorId,
      input: buildInput({ monthlyPrice: "1000.00" }),
    });
    createAuditLogWithDiff.mockClear();

    await updateRenter({
      organizationId,
      actorId,
      id,
      input: updateRenterSchema.parse({ monthlyPrice: "1300.00" }),
      canOverrideTerms: false,
    });

    expect(createAuditLogWithDiff).toHaveBeenCalled();
    const [arg] = createAuditLogWithDiff.mock.calls[0] as [
      {
        action: string;
        entity: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        details: Record<string, unknown>;
      },
    ];
    expect(arg.action).toBe("UPDATE");
    expect(arg.entity).toBe("rent_renter");
    expect(arg.before.monthlyPrice).toBe("1000.00");
    expect(arg.after.monthlyPrice).toBe("1300.00");
    expect(arg.details.priceChanged).toBe(true);
    expect(arg.details.unpaidMonthsRepriced).toBe("UNPAID only");
  });
});
