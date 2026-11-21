import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsSkeleton() {
  return (
    <div
      className="space-y-2 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-2 xl:overflow-hidden"
      aria-busy="true"
      aria-label="Loading house analytics"
    >
      <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 xl:auto-rows-[68px] xl:grid-cols-5 2xl:auto-rows-[70px]">
        {Array.from({ length: 5 }, (_, index) => (
          <Card
            key={index}
            className="border-border/70 bg-card/70 h-full p-2.5"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-6 w-14" />
            <Skeleton className="mt-2 h-3 w-full" />
          </Card>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="flex min-h-0 flex-col">
            <CardHeader className="px-3 py-2">
              <Skeleton className="h-3 w-36" />
            </CardHeader>
            <CardContent className="min-h-0 flex-1 px-2.5 pt-0 pb-2.5">
              <Skeleton className="h-full min-h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
