import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * The organisation lockup used across the app chrome.
 *
 * Metahara Sugar Factory badge, generated from public/images/msflogo.jpg by
 * scripts/generate-brand-icons.mjs. Kept circular because the artwork is a round
 * seal — a rounded-rect mask would clip the green ring.
 *
 * Amharic leads and English follows, matching the printed forms. Both lines are
 * rendered, never one or the other: the Amharic is the organisation's own name
 * and the English is its register, and a viewer should never have to guess which
 * one they are looking at.
 *
 * One component rather than three copies of this markup, so the sidebar, top bar
 * and mobile sheet cannot drift apart.
 */

type BrandLockupSize = "sm" | "md" | "lg";

const SIZES: Record<
  BrandLockupSize,
  { logo: string; factory: string; portal: string }
> = {
  sm: { logo: "h-7 w-7", factory: "text-[11px]", portal: "text-[9px]" },
  md: { logo: "h-8 w-8", factory: "text-[13px]", portal: "text-[10px]" },
  lg: { logo: "h-9 w-9", factory: "text-[15px]", portal: "text-[11px]" },
};

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/msf-logo.png"
      alt=""
      aria-hidden="true"
      width={32}
      height={32}
      className={cn("shrink-0 rounded-full object-cover", className)}
    />
  );
}

export function BrandLockup({
  size = "md",
  subtitle,
  className,
  asLink = true,
  text = true,
}: {
  size?: BrandLockupSize;
  /** Optional third line — the sidebar uses it to show Admin / Workspace. */
  subtitle?: string;
  className?: string;
  /** Wrap in a link to the dashboard. Off when the parent is already a link. */
  asLink?: boolean;
  /**
   * Set false to render the seal alone, for surfaces that sit beside one that
   * already names the organisation — the top bar above the sidebar, for
   * instance. The link keeps its accessible name either way, so a
   * logo-only lockup is still announced correctly to a screen reader.
   */
  text?: boolean;
}) {
  const dims = SIZES[size];

  const label = `${BRAND.factoryAm} ${BRAND.portalAm}`;

  const content = text ? (
    <span className="flex min-w-0 flex-col leading-tight">
      <span
        className={cn("truncate font-semibold", dims.factory)}
        // The Amharic line is the organisation's name; the English is a
        // courtesy rendering of the same thing, not the other way round.
        lang="am"
      >
        {BRAND.factoryAm}
      </span>
      <span className={cn("text-muted-foreground truncate", dims.portal)}>
        {BRAND.portalAm}
      </span>
      {subtitle ? (
        <span className="text-muted-foreground truncate text-[10px]">
          {subtitle}
        </span>
      ) : null}
    </span>
  ) : null;

  const mark = <BrandLogo className={cn(dims.logo, "ring-border ring-1")} />;

  if (!asLink) {
    return (
      <span
        className={cn("flex min-w-0 items-center gap-2", className)}
        role={text ? undefined : "img"}
        aria-label={text ? undefined : label}
      >
        {mark}
        {content}
      </span>
    );
  }

  return (
    <Link
      href="/dashboard"
      // Names the link even when the visible text is suppressed, so a
      // logo-only lockup is still announced as the portal it navigates to.
      aria-label={text ? undefined : label}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-sm transition-opacity hover:opacity-80",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
    >
      {mark}
      {content}
    </Link>
  );
}
