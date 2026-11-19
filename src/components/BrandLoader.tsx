import RadialSpinner from "@/components/RadialSpinner";

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

      <div className="msf-loader-stage">
        <span className="msf-loader-halo" aria-hidden="true" />
        <RadialSpinner size={56} />
      </div>

      <div className="msf-loader-copy" aria-hidden="true">
        <p className="msf-loader-eyebrow">Metahara Sugar Factory</p>
        <p className="msf-loader-title">MSF HomeDesk</p>
        <p className="msf-loader-subtitle">Asset &amp; House Portal</p>
        <p className="msf-loader-status">{label}</p>
      </div>

      <div className="msf-loader-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
