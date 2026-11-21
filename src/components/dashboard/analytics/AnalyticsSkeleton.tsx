import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      aria-busy="true"
      aria-label="Loading house analytics"
    >
      <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Card
            key={index}
            className="border-border/70 bg-card/70 h-16 p-2 sm:h-[4.5rem]"
          >
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-5 w-12" />
          </Card>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="flex min-h-0 flex-col">
            <div className="px-3 py-2">
              <Skeleton className="h-3 w-36" />
            </div>
            <div className="min-h-0 flex-1 px-2.5 pb-2.5">
              <Skeleton className="h-full min-h-16 w-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
