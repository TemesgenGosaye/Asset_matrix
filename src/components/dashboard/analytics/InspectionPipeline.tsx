import { Clock3 } from "lucide-react";
import type { HouseAnalyticsResponse } from "@/lib/house-analytics/contract";
import ChartCard from "./ChartCard";

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
      className: "bg-blue-500",
    },
    {
      label: "Completed",
      value: inspection.completed,
      className: "bg-emerald-500",
    },
  ];
  const total = stages.reduce((sum, stage) => sum + stage.value, 0);

  return (
    <ChartCard
      title="Inspection pipeline"
      description="Handback inspections created in the selected period"
      className="h-full"
    >
      <div className="space-y-4">
        <div className="bg-muted flex h-3 w-full overflow-hidden rounded-full">
          {stages.map((stage) => (
            <div
              key={stage.label}
              className={stage.className}
              style={{
                width: total === 0 ? "0%" : `${(stage.value / total) * 100}%`,
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {stages.map((stage) => (
            <div key={stage.label} className="rounded-lg border py-3">
              <p className="text-muted-foreground text-[11px]">{stage.label}</p>
              <p className="housing-serif text-xl font-semibold tabular-nums">
                {stage.value}
              </p>
            </div>
          ))}
        </div>
        <div className="border-border/60 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Average waiting time
          </span>
          <span className="font-semibold tabular-nums">
            {inspection.avgDaysWaiting} days
          </span>
        </div>
      </div>
    </ChartCard>
  );
}
