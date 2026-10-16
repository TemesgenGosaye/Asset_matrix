/**
 * Route-level placeholder for /house-request.
 *
 * Shaped like the page it replaces — the gradient hero with its brass hairline,
 * the Employee ID command bar, and the record that lands beneath it — so the
 * frame does not resize when the real page arrives. A generic centred spinner
 * would be a visible jump on every navigation into a task people perform dozens
 * of times a day.
 */
export default function HouseRequestLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5" aria-hidden>
      {/* Hero */}
      <div className="border-border/80 relative overflow-hidden rounded-2xl border shadow-sm">
        <span className="from-primary/14 via-card to-card absolute inset-0 bg-gradient-to-br" />
        <span className="from-brass-400 via-brass-500 absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="bg-muted h-12 w-12 shrink-0 animate-pulse rounded-2xl sm:h-14 sm:w-14" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="bg-muted h-8 w-56 animate-pulse rounded" />
              <div className="bg-muted h-0.5 w-16 animate-pulse rounded" />
              <div className="bg-muted h-3 w-full max-w-xl animate-pulse rounded" />
            </div>
          </div>
          <div className="bg-muted h-9 w-40 shrink-0 animate-pulse rounded-lg" />
        </div>
      </div>

      {/* Step 1 — the Employee ID command bar */}
      <div className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border/60 bg-secondary h-10 border-b" />
        <div className="px-4 py-4 sm:px-5">
          <div className="bg-muted h-3.5 w-24 animate-pulse rounded" />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="bg-muted h-10 flex-1 animate-pulse rounded-lg" />
            <div className="bg-muted h-10 w-28 animate-pulse rounded-lg" />
          </div>
          <div className="bg-muted mt-2.5 h-3 w-64 animate-pulse rounded" />
        </div>
      </div>

      {/* The record that lands beneath it */}
      <div className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border/60 bg-secondary flex items-center gap-3 border-b px-4 py-4">
          <div className="bg-muted h-14 w-14 shrink-0 animate-pulse rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-5 w-48 animate-pulse rounded" />
            <div className="bg-muted h-3 w-72 animate-pulse rounded" />
          </div>
        </div>
        <div className="border-border/60 bg-secondary/50 space-y-2.5 border-b px-4 py-3.5">
          <div className="bg-muted h-2.5 w-48 animate-pulse rounded" />
          <div className="bg-muted h-6 w-56 animate-pulse rounded" />
          <div className="bg-muted h-3 w-full max-w-md animate-pulse rounded" />
        </div>
        <div className="space-y-2.5 p-4">
          {[30, 26, 22, 34, 20, 28, 24, 32].map((w, i) => (
            <div key={i} className="flex gap-4">
              <div
                className="bg-muted h-3 animate-pulse rounded"
                style={{ width: `${w}%` }}
              />
              <div
                className="bg-muted h-3 animate-pulse rounded"
                style={{ width: `${w * 1.4}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* The reason box */}
      <div className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border/60 bg-secondary h-10 border-b" />
        <div className="space-y-3 px-4 py-4">
          <div className="bg-muted h-3.5 w-16 animate-pulse rounded" />
          <div className="bg-muted h-28 w-full animate-pulse rounded" />
          <div className="bg-muted h-2 w-2/3 animate-pulse rounded" />
        </div>
      </div>

      {/* The submit gate */}
      <div className="border-border/80 bg-secondary/60 flex items-center gap-3 rounded-xl border px-4 py-3.5">
        <div className="flex-1 space-y-2">
          <div className="bg-muted h-2.5 w-32 animate-pulse rounded" />
          <div className="bg-muted h-3.5 w-48 animate-pulse rounded" />
        </div>
        <div className="bg-muted h-10 w-40 animate-pulse rounded-lg" />
      </div>
    </div>
  );
}