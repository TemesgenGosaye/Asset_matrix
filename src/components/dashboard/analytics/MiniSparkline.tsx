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
  const points = values
    .map((value, index) => {
      const x =
        values.length === 1 ? 50 : (index / (values.length - 1)) * 98 + 1;
      const y = 26 - ((value - min) / span) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const surfacePoints = `0,28 ${points} 100,28`;

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
      <polygon points={surfacePoints} fill="currentColor" opacity={0.09} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
