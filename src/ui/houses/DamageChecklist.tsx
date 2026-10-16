"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, ChevronDown, ChevronUp } from "lucide-react";

import {
  DAMAGE_ITEMS,
  formatEtb,
  parseCostCents,
  runningDamageTotal,
  fromCents,
  type DamageCosts,
  type DamageState,
} from "@/lib/house-queue/damage";

/**
 * The handback damage checklist, in its two modes.
 *
 * One component for both, because a checklist is a *record*, not a form control:
 * once the inspection is complete the same six parts are shown with their states
 * and costs, frozen. Building the read-only view out of the same list and the
 * same formatting is what guarantees a reader cannot see a part the writer could
 * not have set, or a total laid out differently from the one that was signed.
 *
 * A damaged part's cost is required, not optional. That is enforced visually
 * here (the field appears and is marked) and for real in `validateDamage`, which
 * the server also runs — this component must never be the only thing standing
 * between a damaged part and a blank cost.
 */

export interface DamageChecklistValues {
  /** Part key (`window`, `door`, ...) → is it damaged. */
  state: DamageState;
  /** Part key → the raw cost text from the input. */
  costs: DamageCosts;
}

/** Starter values: every part OK, no costs. */
export function emptyDamageChecklist(): DamageChecklistValues {
  return { state: {}, costs: {} };
}

/** Seed the form from a saved inspection, so an edit starts from what is stored. */
export function damageChecklistFromRecord(record: {
  state: DamageState;
  costs: DamageCosts;
}): DamageChecklistValues {
  return { state: { ...record.state }, costs: { ...record.costs } };
}

// ---------------------------------------------------------------------------
// Editable
// ---------------------------------------------------------------------------

export function DamageChecklistEditor({
  values,
  onChange,
  disabled = false,
}: {
  values: DamageChecklistValues;
  onChange: (next: DamageChecklistValues) => void;
  disabled?: boolean;
}) {
  const setDamaged = (key: string, damaged: boolean) => {
    // Switching back to OK clears the cost rather than hiding it. A stale figure
    // left sitting in state is the classic way a "door is fine" row still gets
    // billed, and it would also be submitted here, since a hidden input is not
    // an absent one.
    const costs = { ...values.costs };
    if (!damaged) delete costs[key];
    onChange({
      state: { ...values.state, [key]: damaged },
      costs,
    });
  };

  const setCost = (key: string, text: string) => {
    onChange({
      state: values.state,
      costs: { ...values.costs, [key]: text },
    });
  };

  const damagedCount = DAMAGE_ITEMS.filter((i) => values.state[i.key]).length;
  const total = runningDamageTotal(
    // The editor keys state by part name; `validateDamage`/the columns use the
    // `checklist*` names, so the map is translated here rather than at each use.
    Object.fromEntries(
      DAMAGE_ITEMS.map((i) => [i.stateKey, values.state[i.key]]),
    ),
    Object.fromEntries(
      DAMAGE_ITEMS.map((i) => [i.costKey, values.costs[i.key]]),
    ),
  );

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Damage checklist — mark each part, then price what is damaged
        </p>
        <p className="text-muted-foreground text-[11px]">
          {damagedCount} damaged ·{" "}
          <span className="text-foreground font-semibold">
            {formatEtb(total)}
          </span>
        </p>
      </div>

      <ul className="divide-border border-border divide-y rounded-lg border">
        {DAMAGE_ITEMS.map((item) => {
          const damaged = Boolean(values.state[item.key]);
          const raw = values.costs[item.key];
          const cents = parseCostCents(raw);
          const showCost = damaged;
          const costInvalid = showCost && (cents === null || cents < 1);

          return (
            <li key={item.key} className="px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-sm font-medium ${damaged ? "text-rose-700 dark:text-rose-300" : ""}`}
                >
                  {item.label}
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                    {item.labelAm}
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  {showCost && (
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor={`damage-cost-${item.key}`}
                        className="text-muted-foreground text-[11px] font-normal"
                      >
                        Cost
                      </Label>
                      <Input
                        id={`damage-cost-${item.key}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        disabled={disabled}
                        value={
                          raw === undefined || raw === null ? "" : String(raw)
                        }
                        onChange={(e) => setCost(item.key, e.target.value)}
                        aria-invalid={costInvalid}
                        className={`h-8 w-24 text-right text-sm tabular-nums ${costInvalid ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                      />
                      <span className="text-muted-foreground text-[11px]">
                        ETB
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={damaged}
                    onClick={() => setDamaged(item.key, !damaged)}
                    className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      damaged
                        ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    <Badge
                      variant={damaged ? "destructive" : "outline"}
                      className="gap-1 px-2 py-0.5"
                    >
                      {damaged && <X className="h-3 w-3" />}
                      {damaged ? "Damaged" : "OK"}
                    </Badge>
                  </button>
                </div>
              </div>

              {showCost && costInvalid && (
                <p className="text-destructive mt-1 text-[11px]">
                  A damaged {item.label.toLowerCase()} needs a cost greater than
                  0.00, with at most 2 decimals.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="bg-muted/40 mt-2 flex items-baseline justify-between rounded-lg px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium">
          Total damage cost
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {formatEtb(total)}
        </span>
      </div>

      <p className="text-muted-foreground mt-1.5 text-xs">
        {damagedCount > 0
          ? `${damagedCount} damaged part${damagedCount === 1 ? "" : "s"} → the house will be resolved Under Maintenance.`
          : "No damages marked — the house will resolve back to Active."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only (a completed inspection is permanent)
// ---------------------------------------------------------------------------

/**
 * The frozen record of a completed inspection.
 *
 * Takes no setters and no value callbacks: a completed inspection cannot be
 * edited, and a component that cannot be handed a setter cannot be made editable
 * by accident. Disclosure is the one interaction it offers — a damaged part's
 * cost is one click away rather than six rows of money on screen at once, which
 * is what makes the column readable at worklist density — and that state lives
 * here rather than in the parent, so opening a row cannot be mistaken for
 * changing one.
 */
export function DamageChecklistReadonly({
  state,
  costs,
  conditionNote,
  className,
}: {
  state: DamageState;
  costs: DamageCosts;
  conditionNote?: string | null;
  className?: string;
}) {
  /** Which damaged parts the reader has opened, by part key. */
  const [openParts, setOpenParts] = React.useState<Record<string, boolean>>({});
  const total = runningDamageTotal(state, costs);
  const note = conditionNote?.trim();
  const damagedCount = DAMAGE_ITEMS.filter((i) => state[i.stateKey]).length;

  const toggle = (key: string) =>
    setOpenParts((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className={className}>
      <ul className="space-y-1">
        {DAMAGE_ITEMS.map((item, index) => {
          const isDamaged = Boolean(state[item.stateKey]);
          // A part flagged without a cost can only predate cost recording; it is
          // stated as unpriced rather than silently dropped, so the reader can see
          // the gap instead of trusting a smaller total.
          const cents = parseCostCents(costs[item.costKey]);
          const priced = cents !== null && cents > 0;
          const expanded = isDamaged && Boolean(openParts[item.key]);

          return (
            <li
              key={item.key}
              className="border-border/60 bg-card rounded-md border"
            >
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="text-muted-foreground w-3 shrink-0 text-right text-[10px] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="truncate text-xs font-medium">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    {item.labelAm}
                  </span>
                </span>

                {isDamaged ? (
                  <button
                    type="button"
                    onClick={() => toggle(item.key)}
                    aria-expanded={expanded}
                    aria-label={`${item.label} is damaged — ${
                      expanded ? "hide" : "show"
                    } repair cost`}
                    className="focus-visible:ring-ring focus-visible:ring-offset-background flex shrink-0 items-center gap-0.5 rounded-full ring-offset-2 outline-none focus-visible:ring-2"
                  >
                    <Badge
                      variant="destructive"
                      className="gap-1 px-2 py-0.5 text-[10px]"
                    >
                      Damaged
                      {expanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Badge>
                  </button>
                ) : (
                  <span className="border-border text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium">
                    No Damage
                  </span>
                )}
              </div>

              {expanded && (
                <div className="border-border/60 bg-muted/40 flex items-baseline justify-between gap-2 border-t px-2 py-1 text-xs">
                  <span className="text-muted-foreground">Repair cost</span>
                  <span className="font-semibold tabular-nums">
                    {priced ? formatEtb(fromCents(cents)) : "Not recorded"}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-border bg-muted/40 mt-1.5 flex items-baseline justify-between gap-2 rounded-md border px-2 py-1">
        <span className="text-muted-foreground text-[11px] font-medium">
          {damagedCount === 0
            ? `No damage recorded — all ${DAMAGE_ITEMS.length} parts checked`
            : `${damagedCount} of ${DAMAGE_ITEMS.length} parts damaged`}
        </span>
        <span className="text-xs font-semibold tabular-nums">
          {formatEtb(total)}
        </span>
      </div>

      <div className="mt-2">
        <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
          Condition note
        </p>
        <p className="mt-0.5 text-xs">
          {note || <span className="text-muted-foreground">No note</span>}
        </p>
      </div>
    </div>
  );
}
