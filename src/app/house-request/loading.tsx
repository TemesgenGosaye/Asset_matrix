export default function HouseRequestLoading() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-6xl space-y-5">
      <div className="border-border/70 bg-card overflow-hidden rounded-3xl border shadow-[var(--shadow-md)]">
        <div className="space-y-4 px-5 py-7 sm:px-8 sm:py-9">
          <div className="bg-muted h-3 w-40 animate-pulse rounded" />
          <div className="bg-muted h-9 w-64 max-w-full animate-pulse rounded-lg" />
          <div className="bg-muted h-3.5 w-96 max-w-full animate-pulse rounded" />
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <div className="bg-muted h-14 flex-1 animate-pulse rounded-2xl" />
            <div className="bg-muted h-14 w-full animate-pulse rounded-2xl sm:w-44" />
          </div>
        </div>
        <div className="bg-muted h-1 w-full animate-pulse" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="border-border/70 bg-card h-36 animate-pulse rounded-2xl border"
          />
        ))}
      </div>
    </div>
  );
}
