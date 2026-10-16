// MUST be the first import: it populates process.env.DATABASE_URL before the
// Prisma singleton (and the pg.Pool it builds) is evaluated.
import "../../../../tests/setup/test-env";
import { describe, it, expect, beforeEach, afterAll } from "vitest";

import prisma from "@/lib/prisma";
import {
  approveAllocation,
  completeInspection,
  executeRelease,
  setSkipOrDefer,
} from "../service";
import { listTerminatedHouses } from "../views";

/**
 * End-to-end tests for the house release flow, against a REAL PostgreSQL
 * database.
 *
 * These are not mocked. Every assertion reads back what the service actually
 * wrote, because the properties under test are transactional and can only be
 * proven by the database:
 *
 *  1. A released house appears on the Terminated Houses page.
 *  2. That page is keyed on `terminatedAt` (the immutable fact), so a
 *     termination survives a later re-allocation that rewrites `status`.
 *  3. Completing the handback inspection finalises the release and returns the
 *     house to stock ATOMICALLY — never one without the other.
 *
 * ISOLATION: the suite creates its own organization and deletes only its own
 * rows afterwards. The shared development database is never truncated.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

let organizationId: string;
let actorId: string;
let stamp: string;

/** Grade 13 sits in category B under the default eligibility bands. */
const GRADE_B = 13;

function makeStamp(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/** `hid`, `houseNumber` and `employeeNumber` are unique, so each needs its own tag. */
let houseSeq = 0;
let employeeSeq = 0;

async function makeHouse(houseType: string) {
  houseSeq += 1;
  const tag = `${stamp}-${houseSeq}`;
  return prisma.household.create({
    data: {
      organizationId,
      hid: `hid-${tag}`,
      houseNumber: `${houseType}${tag.slice(-4)}`,
      houseType,
      rgType: "Regular",
      status: "Active",
      occupancyStatus: "Vacant",
    },
    select: { id: true, houseNumber: true },
  });
}

async function makeEmployee() {
  employeeSeq += 1;
  return prisma.employee.create({
    data: {
      organizationId,
      employeeNumber: `EMP-${stamp}-${employeeSeq}`,
      firstname: "Release",
      lastname: "Subject",
      jobGrade: GRADE_B,
    },
    select: { id: true },
  });
}

/** Allocate -> park the allocation at RELEASE_PENDING with an open inspection. */
async function raiseRelease(
  branch: "EMPLOYEE_LEAVE" | "RETIREMENT" = "EMPLOYEE_LEAVE",
) {
  const house = await makeHouse("B");
  const employee = await makeEmployee();
  const allocation = await approveAllocation({
    organizationId,
    employeeId: employee.id,
    householdId: house.id,
    decidedBy: actorId,
  });
  const { inspectionId } = await executeRelease({
    organizationId,
    employeeId: employee.id,
    decidedBy: actorId,
    branch,
    reason: "Integration test",
  });
  return { house, employee, allocation, inspectionId };
}

const cleanHandback = {
  window: false,
  door: false,
  waterPanel: false,
  roof: false,
  wall: false,
  electricity: false,
};

beforeEach(async () => {
  stamp = makeStamp();
  if (!organizationId) {
    const suffix = `${Date.now()}-${stamp}`;
    const org = await prisma.organization.create({
      data: {
        name: `release-integration-${suffix}`,
        slug: `release-integration-${suffix}`,
      },
      select: { id: true },
    });
    organizationId = org.id;

    const user = await prisma.user.create({
      data: {
        username: `release-facility-${stamp}`,
        firstname: "Release",
        lastname: "Facility",
        email: `release-facility-${stamp}@example.invalid`,
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
  // Delete only this suite's rows. Children first — the FKs are RESTRICT.
  await prisma.houseTerminationReceipt.deleteMany({
    where: { organizationId },
  });
  await prisma.houseInspectionArchive.deleteMany({ where: { organizationId } });
  await prisma.houseInspection.deleteMany({ where: { organizationId } });
  await prisma.houseAllocation.deleteMany({ where: { organizationId } });
  await prisma.household.deleteMany({ where: { organizationId } });
  await prisma.employee.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

describeDb("release -> Terminated Houses", () => {
  it("does NOT list a release that is still awaiting its handback", async () => {
    const { allocation } = await raiseRelease();

    const row = await prisma.houseAllocation.findUnique({
      where: { id: allocation.allocationId },
      select: { status: true, terminatedAt: true },
    });
    expect(row?.status).toBe("RELEASE_PENDING");
    expect(row?.terminatedAt).toBeNull();

    // An in-flight release has chosen a reason but has not happened yet.
    const archive = await listTerminatedHouses(organizationId);
    expect(
      archive.some((r) => r.allocationId === allocation.allocationId),
    ).toBe(false);
  });

  it("lists the release once the handback inspection is completed", async () => {
    const { allocation, inspectionId, house } = await raiseRelease();

    const result = await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
      conditionNote: "Handed back in good order",
    });

    expect(result.resolvedTo).toBe("Active");
    expect(result.terminatedAt).toBeTruthy();

    // THE POINT: the release is on the Terminated Houses page.
    const archive = await listTerminatedHouses(organizationId);
    const listed = archive.find(
      (r) => r.allocationId === allocation.allocationId,
    );
    expect(listed).toBeDefined();
    expect(listed!.house?.houseNumber).toBe(house.houseNumber);
    expect(listed!.terminationReason).toBe("EMPLOYEE_LEAVE");
    expect(listed!.terminatedAt).toBeTruthy();
    expect(listed!.inspection?.resolvedTo).toBe("Active");

    // And the house is back in the pool, in the same transaction.
    const after = await prisma.household.findUnique({
      where: { id: house.id },
      select: { status: true, occupancyStatus: true },
    });
    expect(after?.status).toBe("Active");
    expect(after?.occupancyStatus).toBe("Vacant");
  });

  it("records the termination and the stock return together, or not at all", async () => {
    const { allocation, inspectionId, house } = await raiseRelease();

    await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    const [row, household] = await Promise.all([
      prisma.houseAllocation.findUnique({
        where: { id: allocation.allocationId },
        select: { status: true, terminatedAt: true, terminatedBy: true },
      }),
      prisma.household.findUnique({
        where: { id: house.id },
        select: { status: true, occupancyStatus: true },
      }),
    ]);

    // Same instant on both sides: there is no window in which the archive says
    // "terminated" but the house is still out of the pool, or vice versa.
    expect(row?.status).toBe("released");
    expect(row?.terminatedAt).toBeInstanceOf(Date);
    expect(row?.terminatedBy).toBe(actorId);
    expect(household?.status).toBe("Active");
    expect(household?.occupancyStatus).toBe("Vacant");
  });

  it("parks a damaged handback in maintenance and still lists the release", async () => {
    const { allocation, inspectionId, house } =
      await raiseRelease("RETIREMENT");

    const result = await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: { ...cleanHandback, window: true, wall: true },
      costs: { window: "1250.50", wall: "99.50" },
      conditionNote: "Broken window, cracked wall",
    });

    expect(result.resolvedTo).toBe("UnderMaintenance");
    expect(result.totalDamageCost).toBe(1350);

    const household = await prisma.household.findUnique({
      where: { id: house.id },
      select: { status: true, occupancyStatus: true, damageNotes: true },
    });
    expect(household?.status).toBe("UnderMaintenance");
    expect(household?.occupancyStatus).toBe("Maintenance");
    // Human labels, not raw keys — this is read by the next inspector.
    expect(household?.damageNotes).toContain("Window");
    expect(household?.damageNotes).toContain("Wall");

    // Damage does not exempt the release from the archive.
    const archive = await listTerminatedHouses(organizationId);
    const listed = archive.find(
      (r) => r.allocationId === allocation.allocationId,
    );
    expect(listed).toBeDefined();
    expect(listed!.terminationReason).toBe("RETIREMENT");
    expect(listed!.inspection?.resolvedTo).toBe("UnderMaintenance");
  });

  it("rolls the whole completion back when the damage is unpriced", async () => {
    const { allocation, inspectionId, house } = await raiseRelease();

    await expect(
      completeInspection({
        organizationId,
        inspectionId,
        decidedBy: actorId,
        checklist: { ...cleanHandback, window: true },
        // No cost for the damaged window.
      }),
    ).rejects.toThrow(/Window is marked damaged/);

    // Nothing moved: not the inspection, not the allocation, not the house.
    const [inspection, row, household] = await Promise.all([
      prisma.houseInspection.findUnique({
        where: { id: inspectionId },
        select: { resolvedTo: true },
      }),
      prisma.houseAllocation.findUnique({
        where: { id: allocation.allocationId },
        select: { status: true, terminatedAt: true },
      }),
      prisma.household.findUnique({
        where: { id: house.id },
        select: { status: true },
      }),
    ]);
    expect(inspection?.resolvedTo).toBeNull();
    expect(row?.status).toBe("RELEASE_PENDING");
    expect(row?.terminatedAt).toBeNull();
    expect(household?.status).toBe("PendingInspection");
  });

  it("refuses a second completion and leaves the release exactly once", async () => {
    const { allocation, inspectionId } = await raiseRelease();

    await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });
    const firstTerminatedAt = (
      await prisma.houseAllocation.findUnique({
        where: { id: allocation.allocationId },
        select: { terminatedAt: true },
      })
    )?.terminatedAt;

    await expect(
      completeInspection({
        organizationId,
        inspectionId,
        decidedBy: actorId,
        checklist: cleanHandback,
      }),
    ).rejects.toThrow(/already completed/i);

    // The archive holds exactly one row and its timestamp never moved.
    const archive = await listTerminatedHouses(organizationId);
    const matches = archive.filter(
      (r) => r.allocationId === allocation.allocationId,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].terminatedAt).toBe(firstTerminatedAt?.toISOString());
  });

  it("serialises concurrent completions: one wins, the archive stays single", async () => {
    const { allocation, inspectionId } = await raiseRelease();

    const attempts = await Promise.allSettled([
      completeInspection({
        organizationId,
        inspectionId,
        decidedBy: actorId,
        checklist: cleanHandback,
      }),
      completeInspection({
        organizationId,
        inspectionId,
        decidedBy: actorId,
        checklist: cleanHandback,
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const archive = await listTerminatedHouses(organizationId);
    expect(
      archive.filter((r) => r.allocationId === allocation.allocationId),
    ).toHaveLength(1);
  });

  it("refuses to finalise when the release is no longer pending", async () => {
    const { allocation, inspectionId, house } = await raiseRelease();

    // Simulate a competing finaliser winning the race.
    await prisma.houseAllocation.update({
      where: { id: allocation.allocationId },
      data: {
        status: "released",
        terminatedAt: new Date(),
        terminatedBy: actorId,
      },
    });

    await expect(
      completeInspection({
        organizationId,
        inspectionId,
        decidedBy: actorId,
        checklist: cleanHandback,
      }),
    ).rejects.toThrow(/no longer pending/i);

    // The house must NOT be pushed back into the pool for an allocation that is
    // not pending: the guard runs before the household write, inside the tx.
    const household = await prisma.household.findUnique({
      where: { id: house.id },
      select: { status: true },
    });
    expect(household?.status).toBe("PendingInspection");
  });
});

describeDb("the archive survives later decisions", () => {
  it("keeps the terminated row when the employee is re-allocated a new house", async () => {
    const { employee, allocation, inspectionId } = await raiseRelease();
    await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    const before = await listTerminatedHouses(organizationId);
    expect(
      before.filter((r) => r.allocationId === allocation.allocationId),
    ).toHaveLength(1);

    // The employee comes back and is given a different house. The OLD
    // termination must remain on the archive — this is the bug that used to
    // erase it, because the re-allocation reused and overwrote the same row.
    const newHouse = await makeHouse("B");
    await approveAllocation({
      organizationId,
      employeeId: employee.id,
      householdId: newHouse.id,
      decidedBy: actorId,
    });

    const archived = await prisma.houseAllocation.findUnique({
      where: { id: allocation.allocationId },
      select: { status: true, terminatedAt: true, householdId: true },
    });
    // Untouched.
    expect(archived?.status).toBe("released");
    expect(archived?.terminatedAt).toBeInstanceOf(Date);

    const after = await listTerminatedHouses(organizationId);
    const listed = after.find(
      (r) => r.allocationId === allocation.allocationId,
    );
    expect(listed).toBeDefined();
    expect(listed!.house?.houseNumber).not.toBe(newHouse.houseNumber);

    // And the NEW allocation is live and separate.
    const live = await prisma.houseAllocation.findFirst({
      where: { organizationId, employeeId: employee.id, status: "allocated" },
      select: { id: true, householdId: true },
    });
    expect(live?.id).not.toBe(allocation.allocationId);
    expect(live?.householdId).toBe(newHouse.id);
  });

  it("keeps the terminated row when the employee is skipped", async () => {
    const { employee, allocation, inspectionId } = await raiseRelease();
    await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    await setSkipOrDefer({
      organizationId,
      employeeId: employee.id,
      mode: "skip",
      reason: "Left the organisation",
      decidedBy: actorId,
    });

    const after = await listTerminatedHouses(organizationId);
    expect(
      after.filter((r) => r.allocationId === allocation.allocationId),
    ).toHaveLength(1);
  });

  it("keeps the terminated row when the employee is deferred", async () => {
    const { employee, allocation, inspectionId } = await raiseRelease();
    await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    await setSkipOrDefer({
      organizationId,
      employeeId: employee.id,
      mode: "defer",
      decidedBy: actorId,
    });

    const after = await listTerminatedHouses(organizationId);
    expect(
      after.filter((r) => r.allocationId === allocation.allocationId),
    ).toHaveLength(1);
  });

  it("lets the same employee be released a second time, separately", async () => {
    // The 1:1 handback inspection is keyed on the allocation, so a reused row
    // would collide on the second release. Each release gets its own row.
    const first = await raiseRelease();
    await completeInspection({
      organizationId,
      inspectionId: first.inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    const house2 = await makeHouse("B");
    await approveAllocation({
      organizationId,
      employeeId: first.employee.id,
      householdId: house2.id,
      decidedBy: actorId,
    });
    const second = await executeRelease({
      organizationId,
      employeeId: first.employee.id,
      decidedBy: actorId,
      branch: "RETIREMENT",
      reason: "Retired later",
    });
    await completeInspection({
      organizationId,
      inspectionId: second.inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    // BOTH terminations are listed, with their own reasons.
    const archive = await listTerminatedHouses(organizationId);
    const mine = archive.filter((r) => r.employee.id === first.employee.id);
    expect(mine).toHaveLength(2);
    expect(mine.map((r) => r.terminationReason).sort()).toEqual([
      "EMPLOYEE_LEAVE",
      "RETIREMENT",
    ]);
  });
});

describeDb("the archive keys on the termination, not the status", () => {
  /**
   * THE REGRESSION THIS WHOLE FIX EXISTS FOR.
   *
   * The archive used to select `status = 'released'`. That hid real terminations
   * twice: rows written as `terminated` by the original release path, and rows
   * whose `status` was later rewritten by a re-allocation. Both carried a full
   * termination record and neither appeared.
   *
   * Membership is now decided by `terminatedAt`, so each damaged shape below is
   * still listed.
   */
  it.each([
    "terminated",
    "skipped",
    "deferred",
    "allocated",
    "ready_for_allocation",
  ])(
    "lists a termination whose status was later set to %s",
    async (clobberedStatus) => {
      const { allocation, inspectionId } = await raiseRelease();
      await completeInspection({
        organizationId,
        inspectionId,
        decidedBy: actorId,
        checklist: cleanHandback,
      });

      // Simulate the damage the old in-place-reuse bug caused.
      await prisma.houseAllocation.update({
        where: { id: allocation.allocationId },
        data: { status: clobberedStatus },
      });

      const archive = await listTerminatedHouses(organizationId);
      const listed = archive.find(
        (r) => r.allocationId === allocation.allocationId,
      );
      expect(listed).toBeDefined();
      expect(listed!.terminationReason).toBe("EMPLOYEE_LEAVE");
      expect(listed!.terminatedAt).toBeTruthy();
    },
  );

  it("still excludes a release that has not been finalised", async () => {
    // The mirror image: a row with a reason but no `terminatedAt` is an
    // in-flight release, not a termination, and must stay off the archive.
    const { allocation } = await raiseRelease();

    const archive = await listTerminatedHouses(organizationId);
    expect(
      archive.some((r) => r.allocationId === allocation.allocationId),
    ).toBe(false);
  });

  it("honours the terminationReason filter", async () => {
    const leave = await raiseRelease("EMPLOYEE_LEAVE");
    const retire = await raiseRelease("RETIREMENT");
    for (const row of [leave, retire]) {
      await completeInspection({
        organizationId,
        inspectionId: row.inspectionId,
        decidedBy: actorId,
        checklist: cleanHandback,
      });
    }

    // Scoped to this test's two allocations: the suite's organization is shared
    // across every case in the file.
    const mine = new Set([
      leave.allocation.allocationId,
      retire.allocation.allocationId,
    ]);
    const leaveOnly = await listTerminatedHouses(
      organizationId,
      "EMPLOYEE_LEAVE",
    );
    const leaveReasons = leaveOnly
      .filter((r) => mine.has(r.allocationId))
      .map((r) => r.terminationReason);
    expect(leaveReasons).toEqual(["EMPLOYEE_LEAVE"]);

    const retireOnly = await listTerminatedHouses(organizationId, "RETIREMENT");
    const retireRows = retireOnly.filter((r) => mine.has(r.allocationId));
    expect(retireRows.map((r) => r.allocationId)).toEqual([
      retire.allocation.allocationId,
    ]);
  });

  it("lists most recent first", async () => {
    const first = await raiseRelease();
    await completeInspection({
      organizationId,
      inspectionId: first.inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    // A distinct, later moment for the second release.
    await new Promise((r) => setTimeout(r, 1100));
    const second = await raiseRelease("RETIREMENT");
    await completeInspection({
      organizationId,
      inspectionId: second.inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    const archive = await listTerminatedHouses(organizationId);
    const ids = archive.map((r) => r.allocationId);
    expect(ids.indexOf(second.allocation.allocationId)).toBeLessThan(
      ids.indexOf(first.allocation.allocationId),
    );
  });
});

describeDb("inspection completion finalises the release", () => {
  it("finalises the release from the inspection alone", async () => {
    const { allocation, inspectionId } = await raiseRelease();

    // The inspection completion IS the single gate.
    const result = await completeInspection({
      organizationId,
      inspectionId,
      decidedBy: actorId,
      checklist: cleanHandback,
    });

    expect(result.terminatedAt).toBeTruthy();

    const row = await prisma.houseAllocation.findUnique({
      where: { id: allocation.allocationId },
      select: { status: true },
    });
    expect(row?.status).toBe("released");
  });
});
