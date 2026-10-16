"use client";

import { MCDA_CRITERIA, MCDA_WEIGHTS_TOTAL } from "@/lib/house-queue/weights";
import type { McdaWeights } from "@/lib/house-queue/config/types";
import type { McdaComponents } from "@/lib/house-queue/types";

/**
 * MCDA score breakdown — makes Engine A's arithmetic visible.
 *
 * WHY THIS EXISTS
 * A single "Priority Score 0.65" asks an allocator to trust a number. The queue
 * table now carries one column per criterion so the four weighted terms can be
 * read side by side and summed; this module covers the parts that need more room
 * than a table cell — the full breakdown in the row details dialog and the
 * legend explaining the formula.
 *
 * The weights come from the engine config version the queue was computed
 * against, not the module defaults, so a published weight change shows up
 * immediately and the displayed arithmetic always matches the score.
 */

/** Two decimals is the reporting precision; the engine keeps full precision. */
function fmt(value: number): string {
  return value.toFixed(2);
}

/**
 * Full criterion-by-criterion breakdown for the row details dialog.
 *
 * Columns: the criterion's normalized value within the cohort, the policy weight
 * in force, and the weighted term. The footer proves the sum, so a reader can
 * check the arithmetic against the Priority Score in the queue table.
 */
export function McdaBreakdownTable({
  components,
  weights,
  score,
  cohortSize,
}: {
  components: McdaComponents;
  weights: McdaWeights;
  score: number | null;
  cohortSize: number;
}) {
  const total = MCDA_CRITERIA.reduce(
    (sum, c) => sum + components[c.key] * weights[c.key],
    0,
  );

  return (
    <div className="space-y-2 text-sm">
      <table className="w-full text-sm">
        <caption className="sr-only">
          MCDA priority score breakdown by criterion
        </caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left text-[11px] tracking-wide uppercase">
            <th scope="col" className="pb-1 font-semibold">
              Criterion
            </th>
            <th scope="col" className="pb-1 text-right font-semibold">
              Normalized
            </th>
            <th scope="col" className="pb-1 text-right font-semibold">
              Weight
            </th>
            <th scope="col" className="pb-1 text-right font-semibold">
              Weighted
            </th>
          </tr>
        </thead>
        <tbody>
          {MCDA_CRITERIA.map((c) => (
            <tr key={c.key} className="border-b last:border-b-0">
              <th
                scope="row"
                className="py-1 pr-2 text-left font-normal"
                title={c.description}
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground ml-1 text-xs">
                  {c.short}
                </span>
              </th>
              <td className="py-1 text-right tabular-nums">
                {fmt(components[c.key])}
              </td>
              <td className="text-muted-foreground py-1 text-right tabular-nums">
                {fmt(weights[c.key])}
              </td>
              <td className="py-1 text-right font-semibold tabular-nums">
                {fmt(components[c.key] * weights[c.key])}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-border border-t-2">
            <th scope="row" className="pt-1.5 text-left font-semibold">
              Priority score
            </th>
            <td colSpan={2} className="text-muted-foreground pt-1.5 text-right">
              weights total {fmt(MCDA_WEIGHTS_TOTAL)}
            </td>
            <td className="pt-1.5 text-right font-bold tabular-nums">
              {fmt(total)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="text-muted-foreground text-xs">
        Each criterion is normalized to 0–1 against{" "}
        <span className="font-medium">
          the other {cohortSize - 1} requester{cohortSize === 2 ? "" : "s"} in
          this band
        </span>
        , then multiplied by its policy weight. A band with one requester has
        nothing to compare against, so every normalized value is 0.
      </p>
    </div>
  );
}

/** Legend explaining the compact strip's order, shown under the queue table. */
export function McdaLegend({ weights }: { weights: McdaWeights }) {
  return (
    <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-1.5 text-xs">
      <span className="font-semibold">Priority score =</span>{" "}
      {MCDA_CRITERIA.map(
        (c, i) =>
          `${i > 0 ? " + " : ""}${c.short} (${c.label.toLowerCase()}) x ${fmt(weights[c.key])}`,
      ).join("")}{" "}
      — each criterion normalized to 0–1 against the others in the same band,
      then weighted. Hover a score for its arithmetic, or open the row for the
      full breakdown.
    </p>
  );
}
