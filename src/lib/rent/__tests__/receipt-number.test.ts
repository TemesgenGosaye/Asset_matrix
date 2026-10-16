// MUST be the first import: it populates process.env.DATABASE_URL before the
// Prisma singleton (and the pg.Pool it builds) is evaluated. See the module's
// comment for why this cannot be an inline call.
import "../../../../tests/setup/test-env";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { Prisma } from "@prisma/client";
// The APP's own Prisma singleton, so the tests exercise the same client, the
// same driver adapter and the same SQL the running app uses.
import prisma from "@/lib/prisma";
import { nextReceiptNumber } from "../service";
import { formatEtb, formatEtbNumber, isZeroAmount } from "../money";

/**
 * Receipt numbering, exercised against a REAL PostgreSQL connection.
 *
 * The whole point of `nextReceiptNumber` is that a single
 * `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` allocates a unique number under
 * concurrency. A mock could not prove that, so these tests talk to the database.
 *
 * The table is never TRUNCATEd - the suite allocates into its own
 * randomly-keyed organization and deletes only its own rows afterwards, so a
 * shared development database is safe.
 */

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

describeDb("nextReceiptNumber (live PostgreSQL)", () => {
  let organizationId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const org = await prisma.organization.create({
      data: {
        name: `rent-receipt-test-${stamp}`,
        slug: `rent-receipt-test-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      },
      select: { id: true },
    });
    organizationId = org.id;
  });

  afterAll(async () => {
    if (!organizationId) return;
    // Clean up only what this suite created.
    await prisma.rentReceiptSequence.deleteMany({ where: { organizationId } });
    await prisma.rentRenter.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it("formats the receipt as RENT-<year>-<6 digits>", async () => {
    const receipt = await nextReceiptNumber(
      prisma,
      organizationId,
      new Date(Date.UTC(2026, 2, 15)),
    );
    expect(receipt).toMatch(/^RENT-2026-\d{6}$/);
  });

  it("keeps a separate counter per calendar year", async () => {
    const y2026 = await nextReceiptNumber(
      prisma,
      organizationId,
      new Date(Date.UTC(2026, 11, 31)),
    );
    const y2027 = await nextReceiptNumber(
      prisma,
      organizationId,
      new Date(Date.UTC(2027, 0, 1)),
    );
    const y2027Again = await nextReceiptNumber(
      prisma,
      organizationId,
      new Date(Date.UTC(2027, 0, 15)),
    );

    expect(y2026).toMatch(/^RENT-2026-/);
    expect(y2027).toMatch(/^RENT-2027-/);
    // 2027 is a fresh counter, so it starts at 1 regardless of 2026's progress.
    expect(Number(y2027.slice(-6))).toBe(1);
    expect(Number(y2027Again.slice(-6))).toBe(2);
  });

  it("increments by exactly one, continuing the existing counter", async () => {
    // Deliberately relative: the suite shares one organization, so an earlier
    // test may already have consumed this year's first numbers. What matters is
    // that consecutive allocations are consecutive - not what they start at.
    const paidOn = new Date(Date.UTC(2026, 6, 1));
    const first = await nextReceiptNumber(prisma, organizationId, paidOn);
    const second = await nextReceiptNumber(prisma, organizationId, paidOn);
    const third = await nextReceiptNumber(prisma, organizationId, paidOn);

    const seq = (r: string) => Number(r.slice(-6));
    expect(seq(second)).toBe(seq(first) + 1);
    expect(seq(third)).toBe(seq(second) + 1);
  });

  it("never issues a duplicate number to concurrent callers", async () => {
    const paidOn = new Date(Date.UTC(2029, 5, 1));

    // 12 simultaneous allocations. Exactly 12 distinct numbers must come back -
    // no gaps, no repeats.
    const allocated = await Promise.all(
      Array.from({ length: 12 }, () =>
        nextReceiptNumber(prisma, organizationId, paidOn),
      ),
    );

    expect(new Set(allocated).size).toBe(12);

    const numbers = allocated
      .map((r) => Number(r.slice(-6)))
      .sort((a, b) => a - b);
    const expected = Array.from({ length: 12 }, (_, i) => numbers[0] + i);
    expect(numbers).toEqual(expected);
  });

  it("counts independently per organization, so the same number may exist in both", async () => {
    const other = await prisma.organization.create({
      data: {
        name: `rent-receipt-other-${Date.now()}`,
        slug: `rent-receipt-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      select: { id: true },
    });

    try {
      // A year neither organization has used yet, so both counters start clean
      // and the comparison is order-independent.
      const paidOn = new Date(Date.UTC(2030, 0, 1));
      const mine1 = await nextReceiptNumber(prisma, organizationId, paidOn);
      const theirs1 = await nextReceiptNumber(prisma, other.id, paidOn);
      const mine2 = await nextReceiptNumber(prisma, organizationId, paidOn);
      const theirs2 = await nextReceiptNumber(prisma, other.id, paidOn);

      const seq = (r: string) => Number(r.slice(-6));

      // Identical strings are CORRECT: the unique constraint is the composite
      // (organizationId, receiptNumber), so two tenants may each hold
      // RENT-2030-000001. What must hold is that each counter advances on its own.
      expect(mine1).toBe("RENT-2030-000001");
      expect(theirs1).toBe("RENT-2030-000001");
      expect(seq(mine2)).toBe(2);
      expect(seq(theirs2)).toBe(2);

      // Each organization owns its own counter row for the year, which is what
      // lets the composite unique index accept the same receipt string twice.
      const rows = await prisma.rentReceiptSequence.findMany({
        where: {
          year: 2030,
          organizationId: { in: [other.id, organizationId] },
        },
        select: { organizationId: true, lastValue: true },
      });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.lastValue).toBe(2);
      }
    } finally {
      await prisma.rentReceiptSequence.deleteMany({
        where: { organizationId: other.id },
      });
      await prisma.organization.deleteMany({ where: { id: other.id } });
    }
  });

  it("produces values that satisfy the database receipt-format CHECK", async () => {
    const receipt = await nextReceiptNumber(
      prisma,
      organizationId,
      new Date(Date.UTC(2031, 3, 9)),
    );
    const check = new RegExp(`^${"RENT"}-[0-9]{4}-[0-9]{6}$`);
    expect(check.test(receipt)).toBe(true);
  });

  it("accepts a transaction client, so a rolled-back payment rolls back its number", async () => {
    // The real guarantee: the counter increment participates in the caller's
    // transaction, so an aborted payment does not burn a receipt number.
    await expect(
      prisma.$transaction(async (tx) => {
        const receipt = await nextReceiptNumber(
          tx,
          organizationId,
          new Date(Date.UTC(2032, 0, 1)),
        );
        expect(receipt).toMatch(/^RENT-2032-/);
        throw new Error("abort on purpose");
      }),
    ).rejects.toThrow("abort on purpose");

    // The counter rolled back, so the next allocation reuses the same number.
    const afterRollback = await nextReceiptNumber(
      prisma,
      organizationId,
      new Date(Date.UTC(2032, 0, 1)),
    );
    expect(Number(afterRollback.slice(-6))).toBe(1);
  });
});

/**
 * Guard: the module's own money helpers must never round-trip through a float.
 *
 * This asserts on `formatEtb`/`formatEtbNumber` from `./money` - the display path
 * a receipt amount actually takes. An earlier version of this test built the
 * Decimal inline in the test body, so it asserted on Prisma.Decimal rather than
 * on this module and would still have passed if `money.ts` were deleted.
 */
describe("money formatting", () => {
  it("renders exact decimals without IEEE-754 drift", () => {
    // 0.1 + 0.2 as a float is 0.30000000000000004; the decimal path is exact.
    const amount = new Prisma.Decimal("0.1").add("0.2");
    expect(formatEtbNumber(amount)).toBe("0.30");
    expect(formatEtb(amount)).toBe("0.30 ETB");
  });

  it("groups a 12-digit ETB amount without losing precision", () => {
    expect(formatEtbNumber("9999999999.99")).toBe("9,999,999,999.99");
  });

  it("pads and truncates to two decimals", () => {
    expect(formatEtbNumber("7")).toBe("7.00");
    expect(formatEtbNumber(0)).toBe("0.00");
    expect(formatEtbNumber("1250.5")).toBe("1,250.50");
  });

  it("treats only a true zero as zero", () => {
    expect(isZeroAmount("0")).toBe(true);
    expect(isZeroAmount("0.00")).toBe(true);
    expect(isZeroAmount("9")).toBe(false);
    expect(isZeroAmount("0.01")).toBe(false);
  });
});
