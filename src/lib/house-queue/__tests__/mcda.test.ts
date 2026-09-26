import { describe, it, expect } from "vitest";
import {
  MCDA_WEIGHTS,
  MCDA_WEIGHTS_TOTAL,
  MCDA_SCORE_EPSILON,
} from "../weights";
import {
  calculateServiceYears,
  compareCandidates,
  computeMCDAScores,
  normalizeMinMax,
  rankCandidates,
  scoresEqual,
  type RankableEntry,
} from "../mcda";

describe("MCDA weights policy", () => {
  it("sums to 1 and stays within [0,1]", () => {
    expect(MCDA_WEIGHTS_TOTAL).toBeCloseTo(1, 9);
    for (const w of Object.values(MCDA_WEIGHTS)) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("provides a non-trivial granularity threshold", () => {
    expect(MCDA_SCORE_EPSILON).toBeGreaterThan(0);
  });
});

describe("normalizeMinMax", () => {
  it("normalizes to [0,1]", () => {
    expect(normalizeMinMax([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it("returns 0 for a degenerate cohort (min == max)", () => {
    expect(normalizeMinMax([7, 7, 7])).toEqual([0, 0, 0]);
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeMinMax([])).toEqual([]);
  });
});

describe("computeMCDAScores", () => {
  it("scores a cohort within [0,1], highest service years first", () => {
    const candidates = [
      { candidateId: "a", serviceYears: 10, maritalStatus: "married", disabilityStatus: true, gender: "female" },
      { candidateId: "b", serviceYears: 1, maritalStatus: "single", disabilityStatus: false, gender: "male" },
    ];
    const scores = computeMCDAScores(candidates);
    const a = scores.find((s) => s.candidateId === "a")!;
    const b = scores.find((s) => s.candidateId === "b")!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.score).toBeLessThanOrEqual(1);
    expect(a.score).toBeGreaterThanOrEqual(0);
  });

  it("produces a weighted sum of the normalized components", () => {
    const results = computeMCDAScores([
      { candidateId: "c", serviceYears: 5, maritalStatus: "married", disabilityStatus: true, gender: "female" },
      { candidateId: "d", serviceYears: 0, maritalStatus: "single", disabilityStatus: false, gender: "male" },
    ]);
    const c = results.find((r) => r.candidateId === "c")!;
    // service yrs (1.0, normalized) · 0.4 + marital (1.0) · 0.25 +
    // disability (1.0) · 0.2 + gender: both =1 so degenerate → 0 · 0.15
    expect(c.score).toBeCloseTo(0.85, 6);
  });

  it("ties sisters candidates with identical attributes", () => {
    const results = computeMCDAScores([
      { candidateId: "x", serviceYears: 4, maritalStatus: "married", disabilityStatus: true, gender: "female" },
      { candidateId: "y", serviceYears: 4, maritalStatus: "married", disabilityStatus: true, gender: "female" },
    ]);
    expect(results[0].score).toEqual(results[1].score);
  });
});

describe("tie-breaking", () => {
  const entry = (
    over: Partial<RankableEntry>,
  ): RankableEntry => ({
    candidateId: over.candidateId ?? "id",
    score: over.score ?? 0.5,
    serviceYears: over.serviceYears ?? 5,
    hireDate: over.hireDate ?? "2020-01-01",
    employeeNumber: over.employeeNumber ?? "E001",
  });

  it("breaks score ties by more service years", () => {
    const a = entry({ candidateId: "a", score: 0.5, serviceYears: 10 });
    const b = entry({ candidateId: "b", score: 0.5, serviceYears: 2 });
    expect(compareCandidates(a, b)).toBeLessThan(0); // a ranks first
  });

  it("breaks equal-score-and-service ties by earlier hire date", () => {
    const a = entry({ candidateId: "a", serviceYears: 5, hireDate: "2018-05-01" });
    const b = entry({ candidateId: "b", serviceYears: 5, hireDate: "2020-05-01" });
    expect(compareCandidates(a, b)).toBeLessThan(0);
  });

  it("breaks full ties by employee number ascending", () => {
    const a = entry({ candidateId: "a", employeeNumber: "E200" });
    const b = entry({ candidateId: "b", employeeNumber: "E100" });
    expect(compareCandidates(a, b)).toBeGreaterThan(0);
  });
});

describe("rankCandidates", () => {
  it("is deterministic across equal-input runs", () => {
    const entries: RankableEntry[] = Array.from({ length: 20 }, (_, i) => ({
      candidateId: `c${i}`,
      score: 0.5,
      serviceYears: 5,
      hireDate: "2020-01-01",
      employeeNumber: `E${String(i).padStart(3, "0")}`,
    }));
    const first = rankCandidates(entries).map((e) => e.candidateId);
    const second = rankCandidates(entries).map((e) => e.candidateId);
    expect(first).toEqual(second);
  });

  it("assigns 1-based ranks in comparator order", () => {
    const entries: RankableEntry[] = [
      { candidateId: "a", score: 0.9, serviceYears: 3, hireDate: null, employeeNumber: "E001" },
      { candidateId: "b", score: 0.3, serviceYears: 1, hireDate: null, employeeNumber: "E002" },
    ];
    expect(rankCandidates(entries).map((e) => [e.candidateId, e.rank])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("uses scoresEqual for near-equal score ties", () => {
    expect(scoresEqual(0.5, 0.5 + 1e-10)).toBe(true);
    expect(scoresEqual(0.5, 0.5 + 1e-3)).toBe(false);
  });
});

describe("calculateServiceYears", () => {
  it("returns 0 for missing or invalid dates", () => {
    expect(calculateServiceYears(null)).toBe(0);
    expect(calculateServiceYears(undefined)).toBe(0);
    expect(calculateServiceYears("not-a-date")).toBe(0);
  });

  it("computes whole years from a valid date", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    expect(calculateServiceYears(twoYearsAgo.toISOString())).toBeGreaterThanOrEqual(1);
  });
});