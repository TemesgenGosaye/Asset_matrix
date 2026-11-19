import type { CSSProperties } from "react";

const BARS = Array.from({ length: 12 }, (_, index) => index);

export default function RadialSpinner({
  size = 48,
  color = "#0a4f2c",
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
      {BARS.map((index) => (
        <span key={index} />
      ))}
    </span>
  );
}
