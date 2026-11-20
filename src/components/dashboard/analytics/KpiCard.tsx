import {
  Building2,
  CircleCheck,
  ClipboardCheck,
  DoorOpen,
  House,
  Inbox,
  LogOut,
  UserCheck,
  Users,
  UserX,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import type { HouseAnalyticsKpi } from "@/lib/house-analytics/contract";
import MiniSparkline from "./MiniSparkline";

const icons: Record<string, LucideIcon> = {
  "total-houses": Building2,
  "free-houses": DoorOpen,
  "occupied-houses": House,
  "awaiting-inspection": ClipboardCheck,
  "inactive-houses": Wrench,
  requests: Inbox,
  "queue-ready": UserCheck,
  "not-eligible": UserX,
  "no-house-available": Users,
  "allocated-month": CircleCheck,
  "released-month": LogOut,
};

interface KpiCardProps {
  kpi: HouseAnalyticsKpi;
}

export default function KpiCard({ kpi }: KpiCardProps) {
  const Icon = icons[kpi.id] ?? Building2;
  const trend = kpi.trend ?? 0;
  const positive = kpi.positiveIsGood ? trend >= 0 : trend <= 0;

  return (
    <MetricCard
      title={kpi.label}
      value={kpi.value.toLocaleString()}
      icon={Icon}
      variant={kpi.variant}
      trend={{
        value: trend,
        label: "vs prior",
        positiveIsGood: kpi.positiveIsGood,
      }}
      href={kpi.href}
      subtitle={
        <span className="flex items-center justify-between gap-2">
          <span className="line-clamp-1" title={kpi.hint}>
            {kpi.hint}
          </span>
          <MiniSparkline values={kpi.sparkline} positive={positive} />
        </span>
      }
    />
  );
}
