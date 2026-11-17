import Link from "next/link";
import { Home, Inbox } from "lucide-react";
import type { HouseRegisterStat } from "@/lib/data";

/**
 * House Register dashboard section.
 *
 * Renders the residential register as a category board — S (Staff) plus the
 * A–E tiers — with each tile showing the category total and how that total
 * splits across occupied / vacant / maintenance. The split is drawn as a
 * proportional bar so a glance reads "how much of this tier is full" without
 * having to subtract numbers.
 *
 * Every tile links to the register pre-filtered to its category
 * (`/household/register?type=<category>`), so "how many B houses are vacant?"
 * is one tap from the dashboard instead of filter twiddling.
 *
 * Server component: it is a pure render of the aggregate passed in, so it ships
 * no JavaScript to the browser.
 */

/** Register store the literal "Staff"; the estate calls that tier "S". */
const CATEGORY_LABELS: Record<string, string> = { Staff: "S" };

const CATEGORY_NAMES: Record<string, string> = { Staff: "Staff" };

interface HouseRegisterDashboardProps {
  stat: HouseRegisterStat;
}

function tilePercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

export default function HouseRegisterDashboard({
  stat,
}: HouseRegisterDashboardProps) {
  const {
    categories,
    totalHouses,
    occupiedCount,
    vacantCount,
    maintenanceCount,
  } = stat;

  const occupancyRate =
    totalHouses > 0 ? Math.round((occupiedCount / totalHouses) * 100) : 0;

  return (
    <section
      aria-label="House register"
      className="bg-card text-card-foreground rounded-xl border shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-6 pb-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <Home className="h-5 w-5" />
          </span>
          <div>
            <h3 className="leading-none font-semibold tracking-tight">
              House Register
            </h3>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Total registered houses by category — S (Staff) and tiers A–E
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
            Total houses
          </p>
          <p className="text-3xl leading-none font-bold tracking-tight tabular-nums">
            {totalHouses}
          </p>
        </div>
      </div>

      {totalHouses === 0 ? (
        <div className="flex flex-col items-center gap-2.5 px-6 pt-2 pb-8 text-center">
          <span className="bg-muted text-muted-foreground flex h-11 w-11 items-center justify-center rounded-full">
            <Inbox className="text-muted-foreground/70 h-5 w-5" />
          </span>
          <p className="text-foreground text-sm font-semibold">
            No houses registered yet
          </p>
          <p className="text-muted-foreground max-w-sm text-xs">
            Add houses to the register and the category breakdown — S (Staff)
            and tiers A–E — will appear here.
          </p>
          <Link
            href="/household/register"
            className="text-primary mt-1 text-xs font-medium hover:underline"
          >
            Open the House Register →
          </Link>
        </div>
      ) : (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((entry) => {
              const label = CATEGORY_LABELS[entry.category] ?? entry.category;
              const name =
                CATEGORY_NAMES[entry.category] ?? `Category ${label}`;
              const occupiedPct = tilePercent(entry.occupied, entry.total);
              const vacantPct = tilePercent(entry.vacant, entry.total);
              const maintenancePct = tilePercent(
                entry.maintenance,
                entry.total,
              );

              return (
                <Link
                  key={entry.category}
                  href={`/household/register?type=${encodeURIComponent(entry.category)}`}
                  title={`Open the register filtered to ${name}`}
                  className="border-border/60 bg-secondary/40 hover:border-primary/50 focus-visible:ring-ring flex flex-col rounded-lg border p-3 transition-colors outline-none focus-visible:ring-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold"
                      title={name}
                    >
                      {label}
                    </span>
                    <span className="text-muted-foreground truncate text-[10px] font-semibold tracking-[0.1em] uppercase">
                      {name}
                    </span>
                  </div>

                  <p className="mt-2.5 text-2xl leading-none font-bold tracking-tight tabular-nums">
                    {entry.total}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[10px] font-medium">
                    {entry.total === 1 ? "house" : "houses"}
                  </p>

                  <div
                    className="bg-muted mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full"
                    role="img"
                    aria-label={`${name}: ${entry.occupied} occupied, ${entry.vacant} vacant, ${entry.maintenance} under maintenance`}
                  >
                    {entry.occupied > 0 && (
                      <span
                        className="bg-emerald-500"
                        style={{ width: `${occupiedPct}%` }}
                      />
                    )}
                    {entry.vacant > 0 && (
                      <span
                        className="bg-sky-500"
                        style={{ width: `${vacantPct}%` }}
                      />
                    )}
                    {entry.maintenance > 0 && (
                      <span
                        className="bg-amber-500"
                        style={{ width: `${maintenancePct}%` }}
                      />
                    )}
                  </div>

                  <div className="text-muted-foreground mt-2 flex items-center justify-between text-[10px] tabular-nums">
                    <span title="Occupied">{entry.occupied} occ</span>
                    <span title="Vacant">{entry.vacant} vac</span>
                    <span title="Under maintenance">
                      {entry.maintenance} mnt
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="border-border/60 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4 text-xs">
            <span className="text-muted-foreground">
              Occupancy{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {occupancyRate}%
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full bg-emerald-500"
                aria-hidden
              />
              <span className="text-muted-foreground">
                Occupied{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {occupiedCount}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
              <span className="text-muted-foreground">
                Vacant{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {vacantCount}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
              <span className="text-muted-foreground">
                Maintenance{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {maintenanceCount}
                </span>
              </span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
