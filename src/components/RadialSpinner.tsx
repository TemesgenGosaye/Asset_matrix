import type { CSSProperties } from "react";

const SEGMENTS = [
  { rotate: 0, opacity: 1 },
  { rotate: 30, opacity: 0.92 },
  { rotate: 60, opacity: 0.84 },
  { rotate: 90, opacity: 0.76 },
  { rotate: 120, opacity: 0.68 },
  { rotate: 150, opacity: 0.6 },
  { rotate: 180, opacity: 0.52 },
  { rotate: 210, opacity: 0.44 },
  { rotate: 240, opacity: 0.36 },
  { rotate: 270, opacity: 0.28 },
  { rotate: 300, opacity: 0.2 },
  { rotate: 330, opacity: 0.12 },
];

export default function RadialSpinner({
  size = 50,
  color = "hsl(var(--primary))",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  const style = {
    "--msf-spinner-size": `${size}px`,
    "--spinner-color": color,
  } as CSSProperties;

  return (
    <span
      className={`msf-radial-spinner${className ? ` ${className}` : ""}`}
      style={style}
      role="status"
      aria-label="Loading"
    >
      {SEGMENTS.map((seg, i) => (
        <span
          key={i}
          style={{
            transform: `rotate(${seg.rotate}deg)`,
            opacity: seg.opacity,
          }}
        />
      ))}
    </span>
  );
}
