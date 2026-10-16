import type { Permission } from "@/lib/rbac";

export interface WidgetDefinition {
  type: string;
  title: string;
  description: string;
  icon?: string;
  adminOnly?: boolean;
  /**
   * The permission a user must hold before this widget may be added or rendered.
   *
   * WHY THIS EXISTS ALONGSIDE `adminOnly`
   * `adminOnly` is a presentation hint: it only hides the entry from the Add
   * Widget dialog for non-admins. `POST /api/dashboard/widgets` never checked it,
   * so any signed-in user could add an admin-only widget by calling the API
   * directly, and a widget row persisted before a role change kept rendering
   * forever. `permission` is the enforceable half — it is checked server-side in
   * both the write and the read path — so a widget that exposes tenant-wide data
   * (housing occupancy, fleet value) is gated by something the server believes
   * rather than by something the client decided.
   *
   * A widget with no `permission` needs no RBAC beyond authentication, which is
   * correct for the per-user widgets (`myAssets`, `myTickets`) because they only
   * ever return rows belonging to the caller.
   */
  permission?: Permission;
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
  // ── House Admin ───────────────────────────────────────────────────────────
  // These surface the Housing Allocation Module on the main dashboard instead of
  // making an officer walk to /dashboard/house-allocation to find out whether
  // anything is on fire. Every one of them is permission-gated: a Standard User
  // holds `house_request:create` and nothing else in this module, so without a
  // server-side gate they would be able to read org-wide housing occupancy,
  // vacancy and employee housing files.
  {
    type: "housingSummary",
    title: "Housing Summary",
    description:
      "Occupancy, vacancy, queue depth and allocation pace across all house types",
    permission: "household:view",
  },
  {
    type: "housingAlerts",
    title: "Housing Alerts",
    description:
      "Job-grade cohorts waiting with no house free in their band, plus outstanding inspections",
    permission: "house_queue:view",
  },
  {
    type: "housingActivity",
    title: "Housing Activity",
    description:
      "Recent house allocations, releases, inspections and queue decisions",
    permission: "house_queue:view",
  },
];

export const DEFAULT_WIDGETS = [
  { widgetType: "stats", position: 0 },
  { widgetType: "assetsByStatus", position: 1 },
  { widgetType: "housingSummary", position: 2 },
  { widgetType: "housingAlerts", position: 3 },
  { widgetType: "recentActivity", position: 4 },
];

/**
 * Which set of defaults a user starts from.
 *
 * Exported because BOTH `GET /api/dashboard/widgets` and `PUT /api/dashboard/widgets`
 * need to agree on it. The write path previously mapped synthetic `default-N` ids
 * against `DEFAULT_WIDGETS` unconditionally, so the first reorder a non-admin
 * performed materialised rows carrying an ADMIN's `widgetType` values — a Standard
 * User's "My Assets" widget silently turned into the admin "Stats Overview".
 */
export function defaultWidgetsFor(
  isAdmin: boolean,
): { widgetType: string; position: number }[] {
  return isAdmin ? DEFAULT_WIDGETS : DEFAULT_USER_WIDGETS;
}

export const DEFAULT_USER_WIDGETS = [
  { widgetType: "myAssets", position: 0 },
  { widgetType: "myRequests", position: 1 },
  { widgetType: "myTickets", position: 2 },
];
