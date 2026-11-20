import { cn } from "@/lib/utils";

interface MiniSparklineProps {
  values: readonly number[];
  positive?: boolean;
  className?: string;
}

export default function MiniSparkline({
  values,
  positive = true,
  className,
}: MiniSparklineProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const slot = 100 / values.length;
  const bars = values.map((value, index) => {
    const height = Math.max(2, ((value - min) / span) * 22);
    return {
      x: index * slot + 1,
      y: 26 - height,
      width: Math.max(2, slot - 2),
      height,
      last: index === values.length - 1,
    };
  });

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className={cn(
        "h-6 w-16 shrink-0",
        positive ? "text-emerald-500" : "text-destructive",
        className,
      )}
    >
      <line
        x1="0"
        y1="27.5"
        x2="100"
        y2="27.5"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx="1.4"
          fill="currentColor"
          fillOpacity={bar.last ? 1 : 0.45}
        />
      ))}
    </svg>
  );
}
