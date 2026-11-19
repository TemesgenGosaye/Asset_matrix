import Link from "next/link";

const SUPPORT_URL = "https://t.me/Thefluxor";

type SiteFooterLinksProps = {
  className?: string;
  linkClassName?: string;
  separatorClassName?: string;
};

export default function SiteFooterLinks({
  className = "",
  linkClassName = "",
  separatorClassName = "",
}: SiteFooterLinksProps) {
  const linkCls =
    linkClassName ||
    "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 rounded";
  const sepCls = separatorClassName || "opacity-50";

  return (
    <nav
      aria-label="Footer links"
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 ${className}`.trim()}
    >
      <Link href="/terms" className={linkCls}>
        Terms
      </Link>
      <span aria-hidden className={sepCls}>
        ·
      </span>
      <Link href="/privacy" className={linkCls}>
        Privacy
      </Link>
      <span aria-hidden className={sepCls}>
        ·
      </span>
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={linkCls}
      >
        Support
      </a>
    </nav>
  );
}
