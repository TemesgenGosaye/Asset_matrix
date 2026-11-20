import { Clock3 } from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";

type Inspection = HouseAnalyticsResponse["inspections"];

interface InspectionPipelineProps {
  inspection: Inspection;
}

export default function InspectionPipeline({
  inspection,
}: InspectionPipelineProps) {
  const stages = [
    { label: "Pending", value: inspection.pending, className: "bg-amber-500" },
    {
      label: "Scheduled",
      value: inspection.scheduled,
      className: "bg-sky-500",
    },
    {
      label: "Completed",
      value: inspection.completed,
      className: "bg-emerald-500",
    },
  ];
  const total = stages.reduce((sum, stage) => sum + stage.value, 0);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5">
      <div className="bg-muted flex h-1.5 w-full overflow-hidden rounded-full">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={stage.className}
            style={{
              width: total === 0 ? "0%" : `${(stage.value / total) * 100}%`,
            }}
            title={`${stage.label}: ${stage.value}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className="border-border/60 bg-background/40 rounded-md border px-1.5 py-1 text-center"
          >
            <p className="text-muted-foreground truncate text-[9px] leading-none">
              {stage.label}
            </p>
            <p className="mt-0.5 text-sm leading-none font-semibold tabular-nums">
              {stage.value}
            </p>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-[10px] leading-none">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" aria-hidden />
          Avg. waiting
        </span>
        <span className="text-foreground font-semibold tabular-nums">
          {inspection.avgDaysWaiting}d
        </span>
      </div>
    </div>
  );
}
