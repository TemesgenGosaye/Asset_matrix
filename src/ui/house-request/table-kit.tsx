"use client";

/**
 * The visual language of the House Request page.
 *
 * WHY ONE LANGUAGE, NOT TWO
 * Earlier builds ran two visual systems side by side: heavy "document" surfaces
 * for anything that came out of the register, and ordinary portal surfaces for
 * anything you typed into. The split was meant to mark read-only versus
 * editable, but it cost more than it bought — a navy header here, a grey header
 * two panels down, four accent hues across the page, and a reader who had to
 * work out which material meant what. Every surface below is now the same
 * material, and meaning is carried by ONE thing only: semantic status colour,
 * reserved exclusively for pass / attention.
 *
 * WHY COLOUR IS RESERVED
 * A reader should not have to learn a colour vocabulary before they can use the
 * page, and a decorative accent must never be mistakable for a status. There is
 * exactly one accent — the theme's primary — plus the theme's own success and
 * warning tokens for state. Brass appears once, as the house module's signature
 * rule under the page title, and never competes with a verdict.
 *
 * WHY EVERYTHING IS SOLID
 * No translucent background modifiers, no colour that depends on what is behind
 * it. A record is a printed form on screen, and a printed form has solid fields
 * divided by rules. That is also why the same markup reads correctly in all
 * seven themes: nothing here is a blend, so nothing here can blend wrong.
 *
 * WHY EVERY FACT SURFACE IS A REAL TABLE
 * A house request is a record, and records are compared, not browsed: the reader
 * runs their eye down a column checking one attribute against the next. Every
 * fact surface on this page is a `<table>` with a real `<th scope>`, so the
 * comparison survives — and so a screen reader keeps the label/value pairing
 * when a phone collapses the Detail column underneath.
 *
 * WHY THERE IS A GATE PRIMITIVE AND NOT FOUR PILLS
 * Eligibility is a chain, not a score. Four coloured chips in a row read as four
 * independent facts and lose the one thing that matters — that ALL of them must
 * hold, in order, before the form below is allowed to exist. `GateTable` keeps
 * the chain: a node per gate, a spine between them, a single verdict in the
 * caption bar, and the failing gate named in its own row.
 *
 * WHY THE STEP RAIL IS A REAL PROGRESS BAR
 * A row of four identical bordered boxes, one of them tinted, does not tell a
 * reader how far along they are — it tells them there are four things. `StepFlow`
 * draws the progress as a rail: each node sits on a track that is either walked
 * or not yet, so "two of four done" is legible before a single word is read, and
 * `aria-current="step"` gives a screen reader the same fact. The track is a solid
 * `--border` until the node itself reports a verdict, because a progress rail is
 * structure and must not compete with the eligibility chain for the status hues.
 */

import {
  BadgeCheck,
  Check,
  CircleDashed,
  CircleDot,
  CircleSlash,
  FileText,
  Search,
  ShieldAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Row + column hairlines. One rule definition for every table on the page. */
export const RULE_CELL =
  "border-b border-border/60 [&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-r-border/60";

/** The only status vocabulary on the page. */
export type Status = "pass" | "fail" | "pending" | "idle";

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export type PanelTone = "neutral" | "accent" | "success" | "warning" | "danger";

/** The 2px bar that runs along a panel's top edge, by meaning. */
const PANEL_EDGE: Record<PanelTone, string> = {
  neutral: "bg-border",
  accent: "bg-primary",
  success: "bg-success-foreground",
  warning: "bg-warning-foreground",
  danger: "bg-destructive",
};

/**
 * A bordered frame with a caption bar.
 *
 * Every panel on the page is one of these, which is why the page reads as a
 * single document rather than a collection of competing boxes.
 *
 * `tone` paints a 2px edge along the top — the one place a panel may carry a
 * status hue, because it sits opposite the caption and never behind text.
 */
export function Sheet({
  label,
  title,
  icon: Icon,
  actions,
  tone = "neutral",
  className,
  bodyClassName,
  children,
}: {
  /** Accessible name for the region; not necessarily rendered as a heading. */
  label: string;
  /** Rendered in the caption bar when there is one. */
  title?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  tone?: PanelTone;
  className?: string;
  /** Applied to the region that holds the children, for edge-to-edge tables. */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "border-border/80 bg-card relative overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
    >
      {/* The one place a panel may carry a status hue: a 2px edge along the top,
          opposite the caption, never behind text. */}
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 z-10 h-0.5", PANEL_EDGE[tone])}
      />
      {title ? (
        <div className="border-border/60 bg-secondary flex min-h-10 flex-wrap items-center gap-2 border-b px-4 py-2">
          {Icon ? (
            <Icon
              className="text-muted-foreground h-3.5 w-3.5 shrink-0"
              aria-hidden
            />
          ) : null}
          <h2 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {title}
          </h2>
          {actions ? (
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn(bodyClassName ?? "p-4")}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The step rail
// ---------------------------------------------------------------------------

/**
 * The four steps, defined once.
 *
 * The step number a reader sees must come from a single table. When the rail said
 * "3 · Justify" and the justification form's own caption bar said "Step 2 · Justify"
 * — which is exactly what this module used to do — the two surfaces disagreed in
 * plain sight and there was no way to tell which one was true. Every surface that
 * names a step now reads it from here, and `StepCaption` prints the same title
 * text, so the rail and the panel can never drift.
 */
export const HOUSE_REQUEST_STEPS = [
  {
    number: 1,
    key: "search",
    title: "Search",
    caption: "Step 1 · Search by Employee ID",
    desc: "Employee ID",
    icon: Search,
  },
  {
    number: 2,
    key: "verify",
    title: "Verify",
    caption: "Step 2 · Verify against the register",
    desc: "Policy Eligibility",
    icon: UserCheck,
  },
  {
    number: 3,
    key: "justify",
    title: "Justify",
    caption: "Step 3 · Justify the housing need",
    desc: "Housing Need",
    icon: FileText,
  },
  {
    number: 4,
    key: "queued",
    title: "Queued",
    caption: "Step 4 · Queued & official voucher",
    desc: "Official Voucher",
    icon: BadgeCheck,
  },
] as const satisfies readonly {
  number: 1 | 2 | 3 | 4;
  key: string;
  title: string;
  caption: string;
  desc: string;
  icon: LucideIcon;
}[];

export type StepNumber = (typeof HOUSE_REQUEST_STEPS)[number]["number"];

/**
 * The caption a panel prints, taken from the same row of the table as the rail.
 *
 * `Sheet` takes a `title` and this returns it, so a panel's heading cannot say
 * one step number while the rail says another.
 */
export function StepCaption({ step }: { step: StepNumber }): string {
  return (
    HOUSE_REQUEST_STEPS.find((s) => s.number === step)?.caption ??
    HOUSE_REQUEST_STEPS[0].caption
  );
}

/**
 * The rail's node face.
 *
 * `pass` → tick, `fail` → slash, and neither is ever carried by hue alone: the
 * shape changes too, which is the same rule `GateIcon` follows for the gates
 * below. A blocked step wears attention, not failure — the reader was not
 * refused, the form they are looking at is unavailable.
 */
function StepNode({
  status,
  number,
  icon: Icon,
}: {
  status: "todo" | "current" | "done" | "blocked";
  number: number;
  icon: LucideIcon;
}) {
  if (status === "done") {
    return (
      <span
        aria-hidden
        className="bg-success-bg text-success-foreground ring-success-foreground/40 flex h-8 w-8 items-center justify-center rounded-full ring-1"
      >
        <Check className="h-4 w-4" strokeWidth={2.75} />
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span
        aria-hidden
        className="bg-warning-bg text-warning-foreground ring-warning-foreground/40 flex h-8 w-8 items-center justify-center rounded-full ring-1"
      >
        <ShieldAlert className="h-4 w-4" />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span
        aria-hidden
        className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full"
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="bg-card text-muted-foreground ring-border flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold tabular-nums ring-1"
    >
      {number}
    </span>
  );
}

/**
 * The four steps, drawn as a rail.
 *
 * WHY A RAIL AND NOT FOUR CARDS
 * A row of four equal boxes reads as four siblings that all exist at once. This
 * page is a *sequence* — an ID cannot be verified before it is typed, and a
 * reason cannot be written before the record it refers to exists — so the rail
 * makes the ordering the dominant shape and the labels the annotation. Two thirds
 * of a counter officer's attention is on "where am I"; the rail answers that
 * without being read.
 *
 * WHY THE TRACK IS SPLIT IN TWO HALVES
 * Each node owns the half-track on either side of it, and tints the half it has
 * passed. A single unbroken track can only be wholly walked or wholly unwalked,
 * which is either a lie or a lie in the other direction; the split is what makes
 * the bar show 2-of-4 rather than 1-of-4 or 3-of-4.
 *
 * A blocked step is passed a `blockedAt` number rather than being inferred from
 * `current`, because a blocked reader is standing on the step *before* the
 * blocked one — they did everything that step asked and the answer was no.
 */
export function StepFlow({
  current,
  blockedAt = null,
}: {
  current: StepNumber;
  /** The step the reader cannot enter, when policy has refused. */
  blockedAt?: number | null;
}) {
  const last = HOUSE_REQUEST_STEPS.length;

  return (
    <nav aria-label="House request progress" className="w-full">
      <ol className="flex items-start">
        {HOUSE_REQUEST_STEPS.map((step, i) => {
          const isCurrent = step.number === current;
          const isBlocked = blockedAt === step.number;
          const isDone = step.number < current;

          const status: "todo" | "current" | "done" | "blocked" = isBlocked
            ? "blocked"
            : isCurrent
              ? "current"
              : isDone
                ? "done"
                : "todo";

          return (
            <li
              key={step.key}
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
            >
              {/* The walked half-track, in from the left. */}
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-4 left-1/2 h-0.5 w-[calc(50%-1rem)]",
                    step.number <= current
                      ? "bg-success-foreground"
                      : "bg-border",
                  )}
                />
              ) : null}

              {/* The unwalked half-track, out to the right. */}
              {i < last - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-4 left-[calc(50%+1rem)] h-0.5 w-[calc(50%-1rem)]",
                    step.number < current
                      ? "bg-success-foreground"
                      : "bg-border",
                  )}
                />
              ) : null}

              <StepNode status={status} number={step.number} icon={step.icon} />

              <span className="w-full min-w-0 px-1">
                <span
                  className={cn(
                    "block truncate text-[11px] leading-tight font-semibold sm:text-xs",
                    isCurrent
                      ? "text-primary"
                      : isBlocked
                        ? "text-warning-foreground"
                        : "text-foreground",
                  )}
                >
                  {step.title}
                </span>
                <span className="text-muted-foreground mt-0.5 hidden truncate text-[10px] leading-tight sm:block">
                  {isBlocked ? "Blocked by policy" : step.desc}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * A status pill.
 *
 * The single place colour is allowed to mean something. Rendered as text on a
 * tinted pill rather than as a bare colour swatch, so the state is legible in
 * monochrome, on a projector, and to a screen reader — none of which can rely
 * on hue alone.
 */
export function StatusPill({
  status,
  children,
  className,
}: {
  status: Status;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        status === "pass" && "bg-success-bg text-success-foreground",
        status === "fail" && "bg-warning-bg text-warning-foreground",
        (status === "pending" || status === "idle") &&
          "bg-muted text-muted-foreground",
        className ?? "",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The node that carries a gate's state.
 *
 * Each state is a DIFFERENT SHAPE, not a different hue: a tick, a slash, a
 * dashed ring, a filled dot. That survives monochrome, a projector and a colour
 * vision deficiency.
 *
 * Decorative, though — `aria-hidden`. The verdict pill in the same row already
 * says "Met" / "Not met" in words, and a hidden label duplicating it would only
 * make the row read "MetMet" to a screen reader. The shape is for the eye; the
 * word is for everybody else.
 */
export function GateIcon({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const base = cn(
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1",
    className ?? "",
  );

  if (status === "pass") {
    return (
      <span
        aria-hidden
        className={cn(
          base,
          "bg-success-bg text-success-foreground ring-success-foreground/30",
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span
        aria-hidden
        className={cn(
          base,
          "bg-warning-bg text-warning-foreground ring-warning-foreground/30",
        )}
      >
        <CircleSlash className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span
        aria-hidden
        className={cn(base, "bg-muted text-muted-foreground ring-border")}
      >
        <CircleDashed className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(base, "bg-muted text-muted-foreground ring-border")}
    >
      <CircleDot className="h-3.5 w-3.5" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------

const CALLOUT_TONE: Record<
  PanelTone,
  { row: string; rail: string; icon: string; title: string }
> = {
  neutral: {
    row: "border-border bg-secondary",
    rail: "bg-border",
    icon: "text-muted-foreground",
    title: "text-foreground",
  },
  accent: {
    row: "border-primary/30 bg-card",
    rail: "bg-primary",
    icon: "text-primary",
    title: "text-foreground",
  },
  success: {
    row: "border-success-foreground/25 bg-success-bg",
    rail: "bg-success-foreground",
    icon: "text-success-foreground",
    title: "text-foreground",
  },
  warning: {
    row: "border-warning-foreground/30 bg-warning-bg",
    rail: "bg-warning-foreground",
    icon: "text-warning-foreground",
    title: "text-foreground",
  },
  danger: {
    row: "border-destructive/40 bg-destructive/10",
    rail: "bg-destructive",
    icon: "text-destructive",
    title: "text-destructive",
  },
};

/**
 * A block-level message with a solid rail down its leading edge.
 *
 * The rail is what makes a long callout findable while the reader is scanning a
 * page of tables — a tinted box on its own reads as another card, and a card is
 * the thing this page already uses for evidence.
 */
export function Callout({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  tone?: PanelTone;
  icon?: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const t = CALLOUT_TONE[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 overflow-hidden rounded-xl border py-3.5 pr-4 pl-4",
        t.row,
        className ?? "",
      )}
    >
      <span aria-hidden className={cn("-my-3.5 -ml-4 w-1 shrink-0", t.rail)} />
      {Icon ? (
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} aria-hidden />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? (
          <p className={cn("text-sm font-semibold", t.title)}>{title}</p>
        ) : null}
        {children ? (
          <div className="text-muted-foreground text-sm text-pretty">
            {children}
          </div>
        ) : null}
        {actions ? (
          <div className="flex flex-wrap gap-2 pt-1.5">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity + figures
// ---------------------------------------------------------------------------

/**
 * A monogram disc for an employee.
 *
 * Never empty: `initialsFor` falls back to the Employee ID's leading characters,
 * because an empty circle reads as a broken image, which is worse than an
 * approximate initial.
 */
export function Monogram({
  initials,
  size = "md",
  tone = "muted",
}: {
  initials: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "muted" | "accent" | "solid";
}) {
  const dims = {
    sm: "h-8 w-8 rounded-md text-[11px]",
    md: "h-10 w-10 rounded-lg text-xs",
    lg: "h-14 w-14 rounded-xl text-base",
    xl: "h-16 w-16 rounded-xl text-lg",
  }[size];

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold tracking-tight",
        dims,
        tone === "solid"
          ? "bg-primary text-primary-foreground"
          : tone === "accent"
            ? "bg-accent text-accent-foreground ring-primary/30 ring-1"
            : "bg-secondary text-muted-foreground ring-border/80 ring-1",
      )}
    >
      {initials}
    </span>
  );
}

/**
 * A figure read as a figure.
 *
 * Not a table row and not a paragraph — a table makes you look the row up and a
 * paragraph makes you parse the sentence. A number at display size with a label
 * above it and a caption under it is read in the time it takes to land on the
 * page, which is the whole point of putting it where it is.
 *
 * `label` sits ABOVE the number on purpose. These figures run in a row, and a
 * label under each number would be read as a caption for the one to its left —
 * so the caption is the small line and the label is the small heading, which is
 * the only arrangement four-across cannot be misread in.
 */
export function Figure({
  value,
  label,
  caption,
  tone = "default",
  icon: Icon,
}: {
  value: React.ReactNode;
  label?: React.ReactNode;
  caption?: React.ReactNode;
  tone?: "default" | "muted" | "accent";
  icon?: LucideIcon;
}) {
  return (
    <div className="min-w-0">
      {label ? (
        <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] uppercase">
          {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
          <span className="truncate">{label}</span>
        </p>
      ) : null}
      <p
        className={cn(
          "flex items-baseline gap-1.5 leading-none font-semibold tracking-tight tabular-nums",
          "text-2xl",
          tone === "muted"
            ? "text-muted-foreground"
            : tone === "accent"
              ? "text-primary"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      {caption ? (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-tight text-pretty">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The subject
// ---------------------------------------------------------------------------

/**
 * Who was verified.
 *
 * WHY THE NAME IS THE HEADING
 * The whole page exists to attach a decision to one person, and the reader's
 * first question on arrival at a record is always "whose is this?". So the name
 * is the panel's `<h2>` — the only heading inside the record — and everything else
 * on the panel is an attribute of it. The status pill sits opposite the name
 * rather than under it, because "Aster Bekele — Active" is read as one fact and
 * "Active" floating above a name is read as a verdict on the page.
 */
export function SubjectStamp({
  initials,
  name,
  meta,
  status,
  statusLabel,
}: {
  initials: string;
  /** Rendered as the panel's only `<h2>`. */
  name: string;
  /** The ID chip, job title and department, on one wrapping line. */
  meta?: React.ReactNode;
  status?: Status;
  statusLabel?: React.ReactNode;
}) {
  return (
    <header className="border-border/60 bg-secondary flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <Monogram initials={initials} size="lg" tone="accent" />
        <div className="min-w-0">
          <h2 className="housing-serif truncate text-lg leading-tight font-bold tracking-tight sm:text-xl">
            {name}
          </h2>
          {meta ? (
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {status && statusLabel ? (
        <div className="shrink-0">
          <StatusPill status={status}>{statusLabel}</StatusPill>
        </div>
      ) : null}
    </header>
  );
}

/**
 * A row of figures on a shared baseline, divided by hairlines.
 *
 * A strip rather than four loose cards: the figures are attributes of ONE record
 * and are compared against each other (grade against band against family size),
 * so they need a shared edge to be compared against. Dividers replace the borders
 * a card would need, which keeps the row reading as part of the panel above it.
 */
export function FigureRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border/60 [&>*]:border-border/60 grid grid-cols-2 border-b sm:grid-cols-4 [&>*]:border-r [&>*:nth-child(2n)]:border-r-0 sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
      {children}
    </div>
  );
}

/** One cell of a `FigureRow`. */
export function FigureCell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 px-4 py-3.5">{children}</div>;
}

// ---------------------------------------------------------------------------
// Fact tables
// ---------------------------------------------------------------------------

/** Full-width section header inside a fact table. */
export function BandRow({
  colSpan,
  icon: Icon,
  children,
  meta,
}: {
  colSpan: number;
  icon?: LucideIcon;
  children: React.ReactNode;
  /** Right-aligned note, e.g. "4 of 4 met". */
  meta?: React.ReactNode;
}) {
  return (
    <tr>
      <th
        colSpan={colSpan}
        scope="colgroup"
        className="bg-secondary text-muted-foreground border-border/60 border-y px-4 py-2 text-left text-[10px] font-semibold tracking-[0.12em] uppercase"
      >
        <span className="flex items-center gap-1.5">
          {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
          <span className="truncate">{children}</span>
          {meta ? (
            <span className="ml-auto shrink-0 pl-3 text-[10px] font-medium tracking-normal normal-case">
              {meta}
            </span>
          ) : null}
        </span>
      </th>
    </tr>
  );
}

/**
 * Attribute / Value / Detail.
 *
 * Three solid fields divided by hairlines, so the eye runs one vertical line
 * down the whole record instead of re-finding each label. The column widths are
 * not configurable on purpose: every table on the page reads DOWNWARD and they
 * must line up, or the comparison breaks.
 */
export function FactTable({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-[32%] sm:w-[24%]" />
        <col className="sm:w-[30%]" />
        <col className="sm:w-[46%]" />
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  );
}

/**
 * One Attribute / Value / Detail row.
 *
 * The Detail column stacks under the Value below `sm` rather than forcing a
 * horizontally scrolling record onto a phone; `<th scope="row">` keeps the
 * label/value association intact either way.
 */
export function FactRow({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn(RULE_CELL, className ?? "")}>
      <th
        scope="row"
        className="text-muted-foreground px-4 py-2.5 text-left align-top text-[11px] font-medium tracking-[0.08em] uppercase"
      >
        {label}
      </th>
      <td className="px-4 py-2.5 align-top">
        <div className="text-foreground text-sm font-medium">{value}</div>
        {detail ? <div className="mt-1 sm:hidden">{detail}</div> : null}
      </td>
      <td className="text-muted-foreground hidden px-4 py-2.5 align-top text-sm sm:table-cell">
        {detail}
      </td>
    </tr>
  );
}

/** A spanning row used for messages that replace a table body. */
export function NoteRow({
  colSpan,
  children,
  className,
}: {
  colSpan: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn(
          "text-muted-foreground bg-secondary px-4 py-3 text-sm text-pretty",
          className ?? "",
        )}
      >
        {children}
      </td>
    </tr>
  );
}

/**
 * Attribute / Value, for a column too narrow to carry a third one.
 *
 * The register is 360px wide in the evidence rail, and a 3-column fact table in
 * that width produces three truncated lines and no readable value. This drops
 * the third column and folds its content under the value as a caption, so the
 * pair stays readable at rail width and the pairing is still a real
 * `<th scope="row">` for a screen reader.
 */
export function CompactFactTable({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-[42%]" />
        <col />
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  );
}

/** One Attribute / Value row for `CompactFactTable`. */
export function CompactFactRow({
  label,
  value,
  note,
  mono,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Always rendered under the value — never a third column to lose. */
  note?: React.ReactNode;
  mono?: boolean;
  /** A glyph beside the label, so eight attributes read as eight fields and not
   *  as eight identical rows of small caps. Decorative: the label is the name. */
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        RULE_CELL,
        "hover:bg-muted/40 transition-colors",
        className ?? "",
      )}
    >
      <th
        scope="row"
        className="text-muted-foreground w-[40%] px-4 py-2.5 text-left align-top text-[11px] font-semibold tracking-[0.08em] uppercase sm:w-[36%]"
      >
        <span className="flex items-center gap-2">
          {Icon ? (
            <Icon
              className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0"
              aria-hidden
            />
          ) : null}
          <span className="min-w-0">{label}</span>
        </span>
      </th>
      <td className="px-4 py-2.5 align-top">
        <div
          className={cn(
            "text-foreground text-sm font-medium text-pretty",
            mono && "font-mono text-[13px]",
          )}
        >
          {value}
        </div>
        {note ? (
          <div className="text-muted-foreground mt-0.5 text-xs text-pretty">
            {note}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// The gate chain
// ---------------------------------------------------------------------------

/**
 * The four eligibility requirements, as a chain.
 *
 * One table for both the preview (nobody verified, every node pending) and the
 * result (every node settled against a named employee), so the shape the reader
 * learned on arrival is the shape that answers their question. The column
 * widths are fixed: the gate name must line up whether it is being read as a
 * rule or as a verdict.
 */
export function GateTable({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-[46%] sm:w-[38%]" />
        <col />
        <col className="w-[116px]" />
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  );
}

/**
 * One link in the chain.
 *
 * Three fields: what the gate is, the fact that settles it, and the verdict.
 * The verdict sits in its own right-hand column rather than being folded into
 * the evidence sentence, so a failing gate is findable by scanning one column
 * instead of reading four sentences.
 */
export function GateRow({
  gate,
  evidence,
  note,
  status,
  verdict,
  isLast,
  icon: Icon,
  sublabel,
}: {
  gate: string;
  /** The settled fact — or, before verification, the rule itself. */
  evidence: React.ReactNode;
  /** Always visible, always secondary. */
  note?: React.ReactNode;
  status: Status;
  /** The pill in the right-hand column. */
  verdict: React.ReactNode;
  /** Draws the connector down to the next gate. */
  isLast?: boolean;
  icon?: LucideIcon;
  /** The source of the evidence, under the gate name. e.g. "Employee register". */
  sublabel?: string;
}) {
  return (
    <tr className={cn(RULE_CELL, isLast && "border-b-0")}>
      <th
        scope="row"
        className="relative px-4 py-3 text-left align-middle font-normal"
      >
        {/* The spine. A solid rule behind the nodes turns four rows into one
            chain, which is what the gates actually are. */}
        <span
          aria-hidden
          className={cn(
            "bg-border absolute top-0 bottom-0 left-[27px] w-px",
            isLast && "hidden",
          )}
        />
        <span className="flex items-center gap-2.5">
          <GateIcon status={status} />
          <span className="min-w-0">
            <span
              className={cn(
                "block text-[13px] leading-tight font-semibold",
                // The gate that stopped the chain is named in the status hue, so
                // a reader scanning the left column finds the reason without
                // reading any of the evidence sentences.
                status === "fail" && "text-warning-foreground",
              )}
            >
              {gate}
            </span>
            {Icon ? (
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[10px] leading-tight">
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{sublabel}</span>
              </span>
            ) : null}
          </span>
        </span>
      </th>
      <td className="px-4 py-3 align-middle">
        <div className="text-foreground text-sm font-medium text-pretty">
          {evidence}
        </div>
        {note ? (
          <div className="text-muted-foreground mt-0.5 text-xs text-pretty">
            {note}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right align-middle">
        <StatusPill status={status}>{verdict}</StatusPill>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Grid tables
// ---------------------------------------------------------------------------

/**
 * A header row plus data columns — the shape used where the reader compares
 * across a row rather than down a column (the allocation, the request on file,
 * the policy table).
 */
export function GridTable({
  caption,
  head,
  children,
  minWidth = "640px",
}: {
  caption: string;
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-secondary">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Hide a column below a breakpoint. The variant lives in a media query, which
 *  Tailwind emits after the base utilities, so it wins at its breakpoint. */
export const HIDE = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
} as const;

/** A `<th>` for `GridTable`'s header row. */
export function Th({
  children,
  align = "left",
  hideBelow,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  hideBelow?: keyof typeof HIDE;
  /** Column widths and similar — never `display`, which `hideBelow` owns. */
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "text-muted-foreground px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
        hideBelow ? HIDE[hideBelow] : "",
        className ?? "",
      )}
    >
      {children}
    </th>
  );
}

/** A `<td>` for `GridTable`, on a striped row. */
export function Td({
  children,
  align = "left",
  mono,
  striped,
  hideBelow,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  striped?: boolean;
  hideBelow?: keyof typeof HIDE;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-border/60 border-b px-4 py-2.5 align-middle text-sm",
        striped ? "bg-background" : "bg-card",
        align === "right"
          ? "text-right tabular-nums"
          : align === "center"
            ? "text-center"
            : "",
        mono ? "font-mono text-[13px]" : "",
        hideBelow ? HIDE[hideBelow] : "",
        className ?? "",
      )}
    >
      {children}
    </td>
  );
}

/**
 * A full-width row holding the actions for the table above it.
 *
 * Actions live in the table rather than in a toolbar above it, so the reader
 * never has to hold a button in their head while scrolling back up to find what
 * it applies to.
 */
export function ActionRow({
  colSpan,
  children,
  note,
  align = "right",
}: {
  colSpan: number;
  children: React.ReactNode;
  note?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="bg-secondary px-4 py-3">
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            align === "right" ? "sm:justify-end" : "sm:justify-start",
          )}
        >
          {children}
        </div>
        {note ? (
          <p
            className={cn(
              "text-muted-foreground mt-2 text-xs text-pretty",
              align === "right" ? "sm:text-right" : "",
            )}
          >
            {note}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Meters + keys
// ---------------------------------------------------------------------------

/**
 * A filled bar, for proportions.
 *
 * The numeric value is ALWAYS rendered beside the bar, never encoded in the bar
 * alone: a meter that communicates only by width is unreadable to a screen
 * reader, unreadable in monochrome, and unreadable to anyone squinting at a
 * phone in a bright factory yard. The bar is decoration for the number next to
 * it, and it is labelled so the relationship survives a hover or a focus.
 */
export function Meter({
  value,
  max,
  label,
  tone = "accent",
  size = "md",
}: {
  value: number;
  max: number;
  /** Spoken description, e.g. "Free houses in band B". */
  label: string;
  tone?: "accent" | "success" | "warning" | "muted";
  size?: "sm" | "md";
}) {
  const safeMax = Math.max(max, 0);
  const safeValue = Math.min(Math.max(value, 0), safeMax);
  const pct = safeMax === 0 ? 0 : (safeValue / safeMax) * 100;

  return (
    <div
      role="img"
      aria-label={`${label}: ${safeValue} of ${safeMax}`}
      className={cn(
        "bg-muted w-full overflow-hidden rounded-full",
        size === "sm" ? "h-1.5" : "h-2",
      )}
    >
      <div
        className={cn(
          "h-full rounded-full",
          tone === "accent" && "bg-primary",
          tone === "success" && "bg-success-foreground",
          tone === "warning" && "bg-warning-foreground",
          tone === "muted" && "bg-muted-foreground/40",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A keyboard key, for the shortcut hint. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border-border bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[10px] font-medium">
      {children}
    </kbd>
  );
}
