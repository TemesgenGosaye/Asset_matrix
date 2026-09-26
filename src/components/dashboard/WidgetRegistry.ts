export interface WidgetDefinition {
  type: string;
  title: string;
  description: string;
  icon?: string;
  adminOnly?: boolean;
  defaultConfig?: Record<string, unknown>;
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    type: "stats",
    title: "Stats Overview",
    description: "Key metrics at a glance",
    adminOnly: true,
  },
  {
    type: "assetsByStatus",
    title: "Assets by Status",
    description: "Pie chart of asset status distribution",
  },
  {
    type: "recentActivity",
    title: "Recent Activity",
    description: "Latest audit log entries",
  },
  {
    type: "upcomingMaintenance",
    title: "Upcoming Maintenance",
    description: "Next scheduled maintenance tasks",
  },
  {
    type: "expiringLicences",
    title: "Expiring Licences",
    description: "Licences expiring in 90 days",
  },
  {
    type: "costOverview",
    title: "Cost Overview",
    description: "Total asset value breakdown",
  },
  {
    type: "lastEdited",
    title: "Recently Modified",
    description: "Assets updated in the last 24 hours",
    icon: "Clock",
  },
  {
    type: "assetMap",
    title: "Asset Map",
    description: "Map showing asset locations",
  },
  {
    type: "fleetValue",
    title: "Fleet Value",
    description: "Purchase value vs. depreciated current value",
    adminOnly: true,
  },
  {
    type: "myAssets",
    title: "My Assets",
    description: "Assets assigned to you",
  },
  {
    type: "myRequests",
    title: "My Requests",
    description: "Your recent reservation requests",
  },
  {
    type: "myTickets",
    title: "My Tickets",
    description: "Your recent support tickets",
  },
  {
    type: "healthScore",
    title: "Asset Health",
    description: "Fleet health score overview",
    adminOnly: true,
  },
  {
    type: "tco",
    title: "Total Cost of Ownership",
    description: "Aggregate costs: purchase + maintenance + licences",
    adminOnly: true,
  },
  {
    type: "duplicateDetection",
    title: "Potential Duplicates",
    description: "Assets that may be duplicate entries",
    icon: "Copy",
    adminOnly: true,
  },
];

export const DEFAULT_WIDGETS = [
  { widgetType: "stats", position: 0 },
  { widgetType: "assetsByStatus", position: 1 },
  { widgetType: "recentActivity", position: 2 },
];

export const DEFAULT_USER_WIDGETS = [
  { widgetType: "myAssets", position: 0 },
  { widgetType: "myRequests", position: 1 },
  { widgetType: "myTickets", position: 2 },
];
