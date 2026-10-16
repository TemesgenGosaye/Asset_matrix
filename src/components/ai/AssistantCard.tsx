"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Table2, Zap } from "lucide-react";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import type { CardTone, FastCard } from "@/lib/ai/protocol";
import { cn } from "@/lib/utils";

/**
 * Renders a fast-lane answer.
 *
 * A fast-lane hit is a recorded fact, not a sentence, so it is presented as a
 * data card rather than a chat bubble: the figure, the split, the rows, and a
 * set of deep links that take the user straight to the record. No model is
 * involved in producing any of it, which is why nothing here is styled as
 * "generated" — it is quoted data and should look like it.
 */

const TONE_TEXT: Record<CardTone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  caution: "text-amber-600 dark:text-amber-400",
  critical: "text-destructive",
};

const TONE_CHIP: Record<CardTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  caution: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  critical: "bg-destructive/10 text-destructive",
};

const TONE_ROW: Record<CardTone, string> = {
  neutral: "",
  positive: "bg-emerald-500/[0.04]",
  caution: "bg-amber-500/[0.05]",
  critical: "bg-destructive/[0.05]",
};

export interface AssistantCardProps {
  card: FastCard;
  /** Milliseconds the server spent producing the card. */
  ms?: number;
  /** Whether the underlying aggregate came from the assistant cache. */
  cached?: boolean;
}

export function AssistantCard({ card, ms, cached }: AssistantCardProps) {
  return (
    <div className="border-primary/25 bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]">
      {/* Title block — the accent rule reads as the card's header seal. */}
      <div className="border-primary/20 from-primary/[0.07] border-b bg-gradient-to-b to-transparent px-4 py-3">
        <h3 className="housing-serif text-foreground text-[15px] leading-snug font-semibold">
          {card.title}
        </h3>
        {card.summary && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {card.summary}
          </p>
        )}
      </div>

      {/* Hero figures */}
      {card.stats.length > 0 && (
        <div className="border-border bg-border grid grid-cols-2 gap-px border-b sm:grid-cols-3">
          {card.stats.map((stat, i) => (
            <div key={`${stat.label}-${i}`} className="bg-card px-3 py-2.5">
              <div
                className={cn(
                  "font-mono text-lg leading-none font-semibold tabular-nums",
                  TONE_TEXT[stat.tone ?? "neutral"],
                )}
              >
                {stat.value}
              </div>
              <div className="text-muted-foreground mt-1.5 text-[10px] tracking-wider uppercase">
                {stat.label}
              </div>
              {stat.hint && (
                <div className="text-muted-foreground/80 mt-0.5 text-[10px]">
                  {stat.hint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail rows */}
      {card.table && card.table.rows.length > 0 && (
        <div className="max-h-72 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/95 sticky top-0 z-10 backdrop-blur">
              <tr>
                {card.table.columns.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="border-border text-muted-foreground border-b px-3 py-1.5 text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.table.rows.map((row, r) => {
                const tone = card.table?.rowTones?.[r] ?? "neutral";
                return (
                  <tr
                    key={r}
                    className={cn(
                      "border-border/50 border-b last:border-0",
                      TONE_ROW[tone],
                    )}
                  >
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn(
                          "px-3 py-1.5 whitespace-nowrap",
                          c === 0
                            ? "text-foreground font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {cell === null || cell === "" ? "—" : cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Deep links */}
      {card.actions && card.actions.length > 0 && (
        <div className="border-border bg-muted/30 flex flex-wrap gap-1.5 border-t px-3 py-2">
          {card.actions.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              className="border-primary/30 bg-primary/[0.06] text-primary hover:border-primary/60 hover:bg-primary/15 hover:text-primary inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
            >
              {action.label}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}

      {/* Provenance — the trust line. States where the numbers came from. */}
      <div className="border-border bg-muted/20 text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[10px]">
        <span className="text-primary inline-flex items-center gap-1">
          <Table2 className="h-3 w-3" />
          {ASSISTANT_BRAND.latin} · direct record
        </span>
        {typeof ms === "number" && (
          <span className="font-mono tabular-nums">{ms} ms</span>
        )}
        {cached && (
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" />
            cached
          </span>
        )}
      </div>

      {card.footnote && (
        <p className="border-border/60 text-muted-foreground/90 border-t px-3 py-2 text-[11px] leading-relaxed">
          {card.footnote}
        </p>
      )}
    </div>
  );
}

export default AssistantCard;
