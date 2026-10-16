import { describe, expect, it } from "vitest";
import {
  diffSections,
  includesAdminOnlySection,
  ENGINE_CONFIG_SECTIONS,
  type EngineConfigPayload,
} from "@/lib/house-queue/config/types";

/**
 * The publish gate's inputs.
 *
 * `buildPublishGate` (in the config route's `_shared.ts`) turns these two
 * functions into the `requiresReauth` flag the client renders. The bug that
 * motivated moving this server-side was a client that computed the same thing
 * from its own unsaved state, so the flag it showed and the flag the publish
 * endpoint enforced could disagree — producing a `403 REAUTH_REQUIRED` with no
 * password field on screen. These tests pin the semantics both sides rely on.
 */

const base: EngineConfigPayload = {
  weights: { serviceYears: 30, maritalStatus: 15, disability: 10, gender: 5 },
  eligibilityBands: [
    { category: "A", gradeMin: 1, gradeMax: 5 },
    { category: "B", gradeMin: 6, gradeMax: 10 },
  ],
  recommendation: {
    preferRegularOverGuest: true,
    locationSortDirection: "asc",
    houseNumberSortMode: "numeric_aware",
  },
};

const clone = (p: EngineConfigPayload): EngineConfigPayload =>
  JSON.parse(JSON.stringify(p)) as EngineConfigPayload;

describe("diffSections", () => {
  it("reports nothing for an unchanged payload", () => {
    expect(diffSections(base, clone(base))).toEqual([]);
  });

  it("reports only the section that actually changed", () => {
    const draft = clone(base);
    draft.recommendation.locationSortDirection = "desc";
    expect(diffSections(base, draft)).toEqual(["recommendation"]);
  });

  it("reports several sections at once", () => {
    const draft = clone(base);
    draft.weights.gender = 9;
    draft.recommendation.locationSortDirection = "desc";
    expect(diffSections(base, draft).sort()).toEqual([
      "recommendation",
      "weights",
    ]);
  });

  it("treats an emptied eligibility band list as a change", () => {
    const draft = clone(base);
    draft.eligibilityBands = [];
    expect(diffSections(base, draft)).toContain("eligibilityBands");
  });
});

describe("includesAdminOnlySection", () => {
  it("is false when nothing admin-only changed", () => {
    const draft = clone(base);
    draft.recommendation.preferRegularOverGuest = false;
    const changed = diffSections(base, draft);
    expect(changed).not.toHaveLength(0);
    expect(includesAdminOnlySection(changed)).toBe(false);
  });

  it("is true when weights changed", () => {
    const draft = clone(base);
    draft.weights.gender = 9;
    expect(includesAdminOnlySection(diffSections(base, draft))).toBe(true);
  });

  it("is true when eligibility bands changed", () => {
    const draft = clone(base);
    draft.eligibilityBands[0].gradeMax = 6;
    expect(includesAdminOnlySection(diffSections(base, draft))).toBe(true);
  });

  it("is false for an empty change set", () => {
    expect(includesAdminOnlySection([])).toBe(false);
  });

  /**
   * The exact scenario that produced the reported 403s: a change the client
   * did not consider admin-only, over a draft that already contained one.
   */
  it("is true when an admin change accompanies a recommendation change", () => {
    const draft = clone(base);
    draft.weights.maritalStatus = 20;
    draft.recommendation.locationSortDirection = "desc";
    const changed = diffSections(base, draft);
    expect(changed).toContain("recommendation");
    expect(includesAdminOnlySection(changed)).toBe(true);
  });
});

describe("ENGINE_CONFIG_SECTIONS", () => {
  it("marks weights and eligibility bands admin-only, and recommendation not", () => {
    const adminOnly = ENGINE_CONFIG_SECTIONS.filter(
      (s) => s.adminOnlyPublish,
    ).map((s) => s.key);
    expect(adminOnly.sort()).toEqual(["eligibilityBands", "weights"]);
  });

  it("gives every section a blast radius and a description", () => {
    for (const s of ENGINE_CONFIG_SECTIONS) {
      expect(s.label, s.key).toBeTruthy();
      expect(s.description, s.key).toBeTruthy();
      expect(s.blastRadius, s.key).toBeTruthy();
    }
  });
});
