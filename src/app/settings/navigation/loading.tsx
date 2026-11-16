import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level skeleton for Settings → Navigation.
 *
 * It mirrors the real layout (banner, search row, grouped cards, side preview)
 * rather than showing one grey block, so the swap to real content does not move
 * anything on screen.
 */
export default function NavigationSettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-in fade-in fill-mode-both">
      <Skeleton className="mb-4 h-5 w-64" />
      <Skeleton className="h-36 w-full rounded-xl" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <Skeleton className="h-11 w-full rounded-lg" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        <div className="hidden lg:block">
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
