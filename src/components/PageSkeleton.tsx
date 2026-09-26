import { Skeleton } from "@/components/ui/skeleton";

export default function PageSkeleton() {
  return (
    <div className="animate-in fade-in fill-mode-both space-y-6 duration-200">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-[60vh] w-full rounded-lg" />
    </div>
  );
}
