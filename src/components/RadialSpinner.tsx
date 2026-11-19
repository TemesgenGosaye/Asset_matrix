import type { CSSProperties } from "react";

const BARS = Array.from({ length: 12 }, (_, index) => index);

export default function RadialSpinner({
  size = 44,
  color,
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  const style = {
    "--msf-spinner-size": `${size}px`,
    ...(color ? { "--spinner-color": color } : {}),
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
