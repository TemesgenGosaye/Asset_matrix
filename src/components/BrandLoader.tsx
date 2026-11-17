import Image from "next/image";

export default function BrandLoader({
  label = "Loading MSF HomeDesk…",
}: {
  label?: string;
}) {
  return (
    <div
      className="msf-loader fixed inset-0 z-50"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="msf-loader-ambient" aria-hidden="true" />

      <div className="msf-loader-stage" aria-hidden="true">
        <span className="msf-loader-halo" />
        <svg className="msf-loader-ring" viewBox="0 0 128 128">
          <circle className="msf-loader-track" cx="64" cy="64" r="58" />
          <circle
            className="msf-loader-arc"
            cx="64"
            cy="64"
            r="58"
            pathLength={100}
          />
          <circle
            className="msf-loader-arc msf-loader-arc-secondary"
            cx="64"
            cy="64"
            r="58"
            pathLength={100}
          />
        </svg>
        <span className="msf-loader-logo">
          <Image
            src="/icons/msf-logo.png"
            alt=""
            width={96}
            height={96}
            className="h-full w-full object-cover"
            priority
          />
        </span>
      </div>

      <div className="msf-loader-copy" aria-hidden="true">
        <p className="msf-loader-eyebrow">Metahara Sugar Factory</p>
        <p className="msf-loader-title">MSF HomeDesk</p>
        <p className="msf-loader-subtitle">Asset &amp; House Portal</p>
      </div>

      <div className="msf-loader-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
