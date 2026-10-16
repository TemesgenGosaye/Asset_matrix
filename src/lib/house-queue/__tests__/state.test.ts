import { describe, it, expect } from "vitest";
import {
  ALLOCATION_TRANSITIONS,
  canTransition,
  deriveQueueStatus,
  isAllocated,
  isPersistedStatus,
  isReleasePending,
} from "../state";

describe("canTransition", () => {
  it("allows releasing a live allocation", () => {
    expect(canTransition("allocated", "released")).toBe(true);
  });

  it("forbids releasing a non-allocation and skipping over an allocation", () => {
    expect(canTransition("allocated", "skipped")).toBe(false);
    expect(canTransition("allocated", "deferred")).toBe(false);
  });

  it("allows skip/defer from derived states", () => {
    expect(canTransition("ready_for_allocation", "skipped")).toBe(true);
    expect(canTransition("no_house_available", "deferred")).toBe(true);
    expect(canTransition("not_eligible", "deferred")).toBe(true);
  });

  it("allows re-approving after release", () => {
    expect(canTransition("released", "allocated")).toBe(true);
  });
});

describe("isPersistedStatus / isAllocated", () => {
  it("recognises ledger statuses only", () => {
    expect(isPersistedStatus("allocated")).toBe(true);
    expect(isPersistedStatus("released")).toBe(true);
    expect(isPersistedStatus("ready_for_allocation")).toBe(false);
    expect(isPersistedStatus(null)).toBe(false);
  });

  it("recognises allocated exactly", () => {
    expect(isAllocated("allocated")).toBe(true);
    expect(isAllocated("released")).toBe(false);
  });
});

describe("deriveQueueStatus (live status)", () => {
  it("shows allocated from the ledger", () => {
    expect(
      deriveQueueStatus({
        houseCategory: "A",
        persistedStatus: "allocated",
        hasAvailableHouse: true,
      }),
    ).toBe("allocated");
  });

  it("shows skipped/deferred from the ledger", () => {
    expect(
      deriveQueueStatus({
        houseCategory: "A",
        persistedStatus: "skipped",
        hasAvailableHouse: true,
      }),
    ).toBe("skipped");
    expect(
      deriveQueueStatus({
        houseCategory: "A",
        persistedStatus: "deferred",
        hasAvailableHouse: true,
      }),
    ).toBe("deferred");
  });

  it("derives not_eligible when there is no category", () => {
    expect(
      deriveQueueStatus({
        houseCategory: null,
        persistedStatus: null,
        hasAvailableHouse: true,
      }),
    ).toBe("not_eligible");
  });

  it("derives ready when a house is available, else no_house_available", () => {
    expect(
      deriveQueueStatus({
        houseCategory: "C",
        persistedStatus: null,
        hasAvailableHouse: true,
      }),
    ).toBe("ready_for_allocation");
    expect(
      deriveQueueStatus({
        houseCategory: "C",
        persistedStatus: null,
        hasAvailableHouse: false,
      }),
    ).toBe("no_house_available");
  });

  it("re-derives after a release", () => {
    expect(
      deriveQueueStatus({
        houseCategory: "B",
        persistedStatus: "released",
        hasAvailableHouse: true,
      }),
    ).toBe("ready_for_allocation");
    expect(
      deriveQueueStatus({
        houseCategory: "D",
        persistedStatus: "released",
        hasAvailableHouse: false,
      }),
    ).toBe("no_house_available");
  });
});

describe("handback gate: the only way out of RELEASE_PENDING", () => {
  /**
   * The state machine is the second layer of the gate. Even if a caller reaches
   * for `canTransition` instead of `completeInspection`, a RELEASE_PENDING row
   * must not be able to reach `released` by any other route — and must not be
   * terminable, which was the old path that let a release skip the inspection.
   */
  it("allows RELEASE_PENDING → released and nothing else", () => {
    expect(canTransition("RELEASE_PENDING", "released")).toBe(true);
    expect(canTransition("RELEASE_PENDING", "terminated")).toBe(false);
    expect(canTransition("RELEASE_PENDING", "allocated")).toBe(false);
    expect(canTransition("RELEASE_PENDING", "ready_for_allocation")).toBe(
      false,
    );
    expect(canTransition("RELEASE_PENDING", "skipped")).toBe(false);
    expect(canTransition("RELEASE_PENDING", "deferred")).toBe(false);
  });

  it("applies the same restriction to the legacy lowercase spelling", () => {
    expect(canTransition("release_pending", "released")).toBe(true);
    expect(canTransition("release_pending", "terminated")).toBe(false);
    expect(canTransition("release_pending", "allocated")).toBe(false);
  });

  it("leaves `allocated` reachable but severs it from `terminated` once pending", () => {
    expect(canTransition("allocated", "RELEASE_PENDING")).toBe(true);
    expect(canTransition("allocated", "released")).toBe(true);
    // The severing is the point: this is the edge that previously let a release
    // skip the gate entirely.
    expect(canTransition("RELEASE_PENDING", "terminated")).toBe(false);
  });

  it("identifies a release-pending row under either spelling", () => {
    expect(isReleasePending("RELEASE_PENDING")).toBe(true);
    expect(isReleasePending("release_pending")).toBe(true);
    expect(isReleasePending("allocated")).toBe(false);
    expect(isReleasePending("released")).toBe(false);
  });

  it("derives release_pending rather than allocated for a pending row", () => {
    const status = deriveQueueStatus({
      houseCategory: "B",
      persistedStatus: "RELEASE_PENDING",
      // Even if a house looks free right now, a release in flight keeps the
      // employee parked — it must never read as `ready_for_allocation`.
      hasAvailableHouse: true,
    });
    expect(status).toBe("release_pending");
    expect(status).not.toBe("ready_for_allocation");
  });
});

describe("ALLOCATION_TRANSITIONS completeness", () => {
  it("exists for every status", () => {
    const statuses = [
      "not_eligible",
      "waiting",
      "no_house_available",
      "ready_for_allocation",
      "allocated",
      "skipped",
      "deferred",
      "released",
    ] as const;
    for (const s of statuses) {
      expect(ALLOCATION_TRANSITIONS[s]).toBeDefined();
      expect(canTransition(s, s)).toBe(false); // no self-loops
    }
  });
});
