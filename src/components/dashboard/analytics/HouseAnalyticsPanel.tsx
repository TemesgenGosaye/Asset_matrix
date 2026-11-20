import type { HouseAnalyticsQuery } from "@/lib/house-analytics/contract";
import { loadHouseAnalytics } from "@/lib/house-analytics/service";
import HouseAnalyticsDashboard from "./HouseAnalyticsDashboard";

const initialQuery: HouseAnalyticsQuery = {
  range: "month",
  houseType: "all",
};

interface HouseAnalyticsPanelProps {
  organizationId: string;
}

export default async function HouseAnalyticsPanel({
  organizationId,
}: HouseAnalyticsPanelProps) {
  const initialData = await loadHouseAnalytics(organizationId, initialQuery);
  return (
    <HouseAnalyticsDashboard
      initialData={initialData}
      initialQuery={initialQuery}
    />
  );
}
