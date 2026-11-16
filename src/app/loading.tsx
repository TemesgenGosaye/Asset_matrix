import Image from "next/image";

/**
 * Route-level loading UI.
 *
 * A brand mark plus an indeterminate bar: it says "HomeDesk is working" the same
 * way whether it is the first paint or a navigation, and it borrows the theme's
 * own tokens so it sits correctly on every appearance rather than assuming the
 * light palette.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/5 shadow-sm">
          <Image
            src="/images/msflogo.jpg"
            alt="Metahara Sugar Factory"
            width={80}
            height={80}
            className="h-full w-full object-cover"
            priority
          />
        </div>

        <div className="relative h-1 w-44 overflow-hidden rounded-full bg-muted">
          <span className="animate-import-progress absolute top-0 left-0 h-full w-1/3 rounded-full bg-primary" />
        </div>

        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          Loading HomeDesk…
        </p>
      </div>
    </div>
  );
}
