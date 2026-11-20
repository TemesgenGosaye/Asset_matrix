import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function PanelSkeleton({
  className,
  bars = 3,
}: {
  className?: string;
  bars?: number;
}) {
  return (
    <div
      className={cn(
        "border-border/70 bg-card/60 flex min-h-0 flex-col rounded-xl border p-3",
        className,
      )}
    >
      <Skeleton className="h-2 w-20" />
      <Skeleton className="mt-1.5 h-3 w-40 max-w-full" />
      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-end gap-1.5">
        {Array.from({ length: bars }, (_, index) => (
          <Skeleton
            key={index}
            className="h-4 w-full"
            style={{ opacity: 1 - index * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 xl:h-full xl:overflow-hidden"
      aria-busy="true"
      aria-label="Loading house analytics"
    >
      <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="border-border/70 bg-card/60 h-24 rounded-xl border p-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-6 rounded-md" />
            </div>
            <Skeleton className="mt-3 h-6 w-16" />
            <Skeleton className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="border-border/70 bg-card/60 flex h-9 items-center gap-2 rounded-lg border px-2"
          >
            <Skeleton className="h-1.5 w-1.5 shrink-0 rounded-full" />
            <Skeleton className="h-2.5 w-full" />
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[minmax(0,1.12fr)_minmax(0,0.96fr)_minmax(0,0.92fr)]">
        <PanelSkeleton
          bars={6}
          className="min-h-[220px] md:col-span-2 xl:col-span-8 xl:min-h-0"
        />
        <PanelSkeleton
          bars={4}
          className="min-h-[220px] xl:col-span-4 xl:min-h-0"
        />
        <PanelSkeleton
          className="min-h-[190px] xl:col-span-3 xl:min-h-0"
          bars={4}
        />
        <PanelSkeleton
          className="min-h-[190px] xl:col-span-3 xl:min-h-0"
          bars={5}
        />
        <PanelSkeleton
          className="min-h-[190px] xl:col-span-3 xl:min-h-0"
          bars={4}
        />
        <PanelSkeleton
          className="min-h-[190px] xl:col-span-3 xl:min-h-0"
          bars={4}
        />
        <PanelSkeleton
          className="min-h-[190px] xl:col-span-7 xl:min-h-0"
          bars={3}
        />
        <PanelSkeleton
          className="min-h-[190px] xl:col-span-5 xl:min-h-0"
          bars={4}
        />
      </div>
    </div>
  );
}
