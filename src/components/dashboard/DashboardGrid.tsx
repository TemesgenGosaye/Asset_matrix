"use client";

import { useEffect, useState, useCallback, lazy, Suspense, memo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  GripVertical,
  House,
  Users,
  X,
  Plus,
} from "lucide-react";
import { WIDGET_DEFINITIONS, type WidgetDefinition } from "./WidgetRegistry";

const AssetMap = lazy(() => import("@/components/maps/AssetMap"));

interface DashboardWidgetData {
  id: string;
  widgetType: string;
  position: number;
  visible: boolean;
  config: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Widget content components
// ---------------------------------------------------------------------------

function StatsWidget({
  serverStats,
}: {
  serverStats?: { assets: number; accessories: number; users: number };
}) {
  if (!serverStats) {
    return <p className="text-muted-foreground text-sm">No stats available</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <p className="text-2xl font-bold">{serverStats.assets}</p>
        <p className="text-muted-foreground text-xs">Assets</p>
      </div>
      <div>
        <p className="text-2xl font-bold">{serverStats.accessories}</p>
        <p className="text-muted-foreground text-xs">Accessories</p>
      </div>
      <div>
        <p className="text-2xl font-bold">{serverStats.users}</p>
        <p className="text-muted-foreground text-xs">Users</p>
      </div>
    </div>
  );
}

function AssetsByStatusWidget() {
  return (
    <div className="flex h-24 items-center justify-center">
      <p className="text-muted-foreground text-sm">
        Asset status chart - see chart above
      </p>
    </div>
  );
}

function RecentActivityWidget() {
  const [logs, setLogs] = useState<
    Array<{ id: string; action: string; entity: string; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch(
          "/api/admin/audit-logs?page=1&pageSize=5&sortBy=createdAt&sortOrder=desc",
        );
        const data = await res.json();
        setLogs(data.data ?? []);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading activity...</p>;
  }

  if (logs.length === 0) {
    return <p className="text-muted-foreground text-sm">No recent activity</p>;
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li key={log.id} className="flex justify-between text-sm">
          <span className="truncate">
            <span className="font-medium">{log.action}</span>{" "}
            <span className="text-muted-foreground">{log.entity}</span>
          </span>
          <span className="text-muted-foreground ml-2 text-xs whitespace-nowrap">
            {new Date(log.createdAt).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UpcomingMaintenanceWidget() {
  const [tasks, setTasks] = useState<
    Array<{ id: string; title: string; nextDueDate: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMaintenance() {
      try {
        const res = await fetch(
          "/api/maintenance?page=1&pageSize=5&sortBy=nextDueDate&sortOrder=asc",
        );
        const data = await res.json();
        setTasks(data.data ?? []);
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    }
    fetchMaintenance();
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Loading maintenance tasks...
      </p>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No upcoming maintenance</p>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id} className="flex justify-between text-sm">
          <span className="truncate font-medium">{task.title}</span>
          <span className="text-muted-foreground ml-2 text-xs whitespace-nowrap">
            {new Date(task.nextDueDate).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ExpiringLicencesWidget() {
  const [licences, setLicences] = useState<
    Array<{
      licenceid: string;
      licencekey: string | null;
      licensedtoemail: string | null;
      expirationdate: string | null;
      daysUntilExpiry: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLicences() {
      try {
        const res = await fetch("/api/dashboard/expiring-licences");
        const data = await res.json();
        setLicences(Array.isArray(data) ? data : []);
      } catch {
        setLicences([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLicences();
  }, []);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading licences...</p>;
  }

  if (licences.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No licences expiring soon</p>
    );
  }

  return (
    <ul className="space-y-2">
      {licences.map((licence) => {
        let badgeClass = "bg-blue-100 text-blue-800";
        if (licence.daysUntilExpiry < 7) {
          badgeClass = "bg-red-100 text-red-800";
        } else if (licence.daysUntilExpiry < 30) {
          badgeClass = "bg-yellow-100 text-yellow-800";
        }

        return (
          <li
            key={licence.licenceid}
            className="flex items-center justify-between text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {licence.licencekey
                  ? licence.licencekey.length > 20
                    ? licence.licencekey.slice(0, 20) + "..."
                    : licence.licencekey
                  : "No key"}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {licence.licensedtoemail ?? "No email"}
              </span>
            </div>
            <span
              className={`ml-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
            >
              {licence.daysUntilExpiry}d
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CostOverviewWidget() {
  const [costData, setCostData] = useState<{
    totalAssets: number;
    totalValue: number;
    avgValue: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCostData() {
      try {
        const res = await fetch("/api/dashboard/cost-overview");
        const data = await res.json();
        setCostData({
          totalAssets: data.totalAssets ?? 0,
          totalValue: data.totalValue ?? 0,
          avgValue: data.avgValue ?? 0,
        });
      } catch {
        setCostData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchCostData();
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading cost data...</p>
    );
  }

  if (!costData) {
    return (
      <p className="text-muted-foreground text-sm">No cost data available</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Total Assets</span>
        <span className="font-medium">
          {costData.totalAssets.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Total Value</span>
        <span className="font-medium">
          $
          {costData.totalValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Avg. Value</span>
        <span className="font-medium">
          $
          {costData.avgValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );
}

function FleetValueWidget() {
  const [data, setData] = useState<{
    totalPurchaseValue: number;
    totalCurrentValue: number;
    totalDepreciation: number;
    assetCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFleetValue() {
      try {
        const res = await fetch("/api/dashboard/fleet-value");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchFleetValue();
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading fleet value...</p>
    );
  }

  if (!data) {
    return (
      <p className="text-muted-foreground text-sm">No depreciation data</p>
    );
  }

  const depreciationPercent =
    data.totalPurchaseValue > 0
      ? (data.totalDepreciation / data.totalPurchaseValue) * 100
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Purchase Value</span>
        <span className="font-medium">
          $
          {data.totalPurchaseValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Current Value</span>
        <span className="font-medium text-green-600">
          $
          {data.totalCurrentValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Total Depreciation</span>
        <span className="text-destructive font-medium">
          -$
          {data.totalDepreciation.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <div className="bg-muted mt-2 h-2 rounded-full">
        <div
          className="bg-destructive h-2 rounded-full transition-all"
          style={{ width: `${Math.min(100, depreciationPercent)}%` }}
        />
      </div>
      <p className="text-muted-foreground text-center text-xs">
        {depreciationPercent.toFixed(1)}% depreciated across {data.assetCount}{" "}
        assets
      </p>
    </div>
  );
}

function MyAssetsWidget() {
  const [assets, setAssets] = useState<
    Array<{ id: string; name: string; tag: string; status: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/my-assets")
      .then((r) => r.json())
      .then((d) => setAssets(Array.isArray(d) ? d : []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (assets.length === 0)
    return (
      <p className="text-muted-foreground text-sm">No assets assigned to you</p>
    );

  return (
    <ul className="divide-y">
      {assets.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{a.name}</p>
            <p className="text-muted-foreground text-xs">{a.tag}</p>
          </div>
          {a.status && (
            <span className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
              {a.status}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function entityTypeBadgeClass(entityType: string): string {
  switch (entityType) {
    case "asset":
      return "bg-blue-100 text-blue-800";
    case "accessory":
      return "bg-purple-100 text-purple-800";
    case "consumable":
      return "bg-orange-100 text-orange-800";
    case "licence":
      return "bg-teal-100 text-teal-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function MyRequestsWidget() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      entityType: string;
      entityName: string;
      status: string;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/requests?mine=true&limit=5")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (items.length === 0)
    return <p className="text-muted-foreground text-sm">No pending requests</p>;

  return (
    <ul className="divide-y">
      {items.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${entityTypeBadgeClass(r.entityType)}`}
              >
                {r.entityType}
              </span>
              <p className="truncate text-sm font-medium">{r.entityName}</p>
            </div>
          </div>
          <span className="bg-secondary text-secondary-foreground ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs">
            {r.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MyTicketsWidget() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/my-tickets")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (items.length === 0)
    return <p className="text-muted-foreground text-sm">No tickets</p>;

  return (
    <ul className="divide-y">
      {items.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{t.title}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs">
              {t.status}
            </span>
            <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs">
              {t.priority}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function LastEditedWidget() {
  const [assets, setAssets] = useState<
    Array<{
      assetid: string;
      assetname: string;
      assettag: string;
      change_date: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecentAssets() {
      try {
        const res = await fetch(
          "/api/asset?page=1&pageSize=5&sortBy=change_date&sortOrder=desc",
        );
        const data = await res.json();
        setAssets(data.data ?? []);
      } catch {
        setAssets([]);
      } finally {
        setLoading(false);
      }
    }
    fetchRecentAssets();
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading recent edits...</p>
    );
  }

  if (assets.length === 0) {
    return <p className="text-muted-foreground text-sm">No recent edits</p>;
  }

  return (
    <ul className="space-y-2">
      {assets.map((asset) => (
        <li key={asset.assetid} className="text-sm">
          <a
            href={`/assets/${asset.assetid}`}
            className="hover:bg-muted -mx-1 flex items-center justify-between rounded px-1 py-0.5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {asset.assetname}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {asset.assettag}
              </span>
            </div>
            <span className="text-muted-foreground ml-2 text-xs whitespace-nowrap">
              {asset.change_date ? formatRelativeTime(asset.change_date) : "-"}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function AssetMapWidget() {
  const [locations, setLocations] = useState<
    Array<{
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      assetCount: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLocations() {
      try {
        const res = await fetch("/api/location");
        const data = await res.json();
        if (!Array.isArray(data)) {
          setLocations([]);
          return;
        }
        const withCoords = data
          .filter(
            (loc: { latitude?: number | null; longitude?: number | null }) =>
              loc.latitude != null && loc.longitude != null,
          )
          .map(
            (loc: {
              locationid: string;
              locationname: string;
              latitude: number;
              longitude: number;
              asset?: unknown[];
            }) => ({
              id: loc.locationid,
              name: loc.locationname,
              latitude: loc.latitude,
              longitude: loc.longitude,
              assetCount: Array.isArray(loc.asset) ? loc.asset.length : 0,
            }),
          );
        setLocations(withCoords);
      } catch {
        setLocations([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLocations();
  }, []);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading map...</p>;
  }

  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">Loading map...</p>}
    >
      <AssetMap locations={locations} />
    </Suspense>
  );
}

function HealthScoreWidget() {
  const [data, setData] = useState<{
    averageScore: number;
    totalAssets: number;
    distribution: { label: string; count: number }[];
    lowestScoring: {
      assetId: string;
      name: string;
      tag: string;
      score: number;
      label: string;
    }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/health-score")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading health scores...</p>
    );
  }

  if (!data || data.totalAssets === 0) {
    return (
      <p className="text-muted-foreground text-sm">No health data available</p>
    );
  }

  const labelColors: Record<string, string> = {
    excellent: "bg-green-500",
    good: "bg-blue-500",
    fair: "bg-yellow-500",
    poor: "bg-orange-500",
    critical: "bg-red-500",
  };

  const labelBadgeColors: Record<string, string> = {
    excellent: "bg-green-100 text-green-800",
    good: "bg-blue-100 text-blue-800",
    fair: "bg-yellow-100 text-yellow-800",
    poor: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">Average Score</span>
        <span className="text-2xl font-bold">{data.averageScore}</span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full">
        {data.distribution.map((d) =>
          d.count > 0 ? (
            <div
              key={d.label}
              className={`${labelColors[d.label] ?? "bg-gray-300"}`}
              style={{
                width: `${(d.count / data.totalAssets) * 100}%`,
              }}
              title={`${d.label}: ${d.count}`}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {data.distribution
          .filter((d) => d.count > 0)
          .map((d) => (
            <span
              key={d.label}
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium capitalize ${labelBadgeColors[d.label] ?? ""}`}
            >
              {d.label}: {d.count}
            </span>
          ))}
      </div>

      {data.lowestScoring.length > 0 && (
        <div className="pt-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            Needs Attention
          </p>
          <ul className="space-y-1">
            {data.lowestScoring.slice(0, 3).map((a) => (
              <li
                key={a.assetId}
                className="flex items-center justify-between text-sm"
              >
                <span className="min-w-0 truncate">{a.name}</span>
                <span
                  className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${labelBadgeColors[a.label] ?? ""}`}
                >
                  {a.score}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TCOWidget() {
  const [data, setData] = useState<{
    totalPurchaseCost: number;
    totalMaintenanceCost: number;
    totalLicenceCost: number;
    grandTotal: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/tco")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading TCO data...</p>;
  }

  if (!data) {
    return (
      <p className="text-muted-foreground text-sm">No TCO data available</p>
    );
  }

  const fmt = (v: number) =>
    "$" +
    v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Purchase Costs</span>
        <span className="font-medium">{fmt(data.totalPurchaseCost)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Maintenance Costs</span>
        <span className="font-medium">{fmt(data.totalMaintenanceCost)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Licence Costs</span>
        <span className="font-medium">{fmt(data.totalLicenceCost)}</span>
      </div>
      <div className="border-t pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Grand Total</span>
          <span className="text-lg font-bold">{fmt(data.grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function DuplicateDetectionWidget() {
  const [data, setData] = useState<{
    totalGroups: number;
    groups: {
      reason: string;
      confidence: string;
      assets: { assetId: string; assetName: string; assetTag: string }[];
    }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/duplicates")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Scanning for duplicates...
      </p>
    );
  }

  if (!data || data.totalGroups === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No potential duplicates found
      </p>
    );
  }

  const reasonLabel: Record<string, string> = {
    same_model_location: "Same Model & Location",
    similar_serial: "Similar Serial",
    similar_name: "Similar Name",
  };

  const confidenceColor: Record<string, string> = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-blue-100 text-blue-800",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">Duplicate Groups</span>
        <span className="text-2xl font-bold">{data.totalGroups}</span>
      </div>

      <ul className="space-y-2">
        {data.groups.slice(0, 5).map((group, idx) => (
          <li key={idx} className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceColor[group.confidence] ?? ""}`}
              >
                {group.confidence}
              </span>
              <span className="text-muted-foreground text-xs">
                {reasonLabel[group.reason] ?? group.reason}
              </span>
            </div>
            <div className="text-sm">
              {group.assets
                .slice(0, 3)
                .map((a) => a.assetName)
                .join(", ")}
              {group.assets.length > 3 && (
                <span className="text-muted-foreground">
                  {" "}
                  +{group.assets.length - 3} more
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// House Admin widgets
// ---------------------------------------------------------------------------

/**
 * The shape `/api/dashboard/housing` returns.
 *
 * Declared here rather than imported so a client component does not pull the
 * server-only HAMS query layer (which imports Prisma and the house-queue engine)
 * into the browser bundle. It is a projection of the server's `HamsKpiData` /
 * `HamsCohortAlert` / `HamsActivityItem`, narrowed to the fields these cards read.
 */
interface HousingOverview {
  kpis: {
    totalHouses: number;
    occupiedCount: number;
    vacantCount: number;
    maintenanceCount: number;
    occupancyRate: number;
    activeQueueSize: number;
    pendingInspectionCount: number;
    thisMonthAllocations: number;
    allocationDelta: number;
  };
  alerts: Array<{
    grade: number | null;
    category: string | null;
    waitingCount: number;
    availableHouses: number;
  }>;
  activity: Array<{
    id: string;
    action: string;
    timestamp: string;
    actorName: string;
    employeeName: string;
    employeeNumber: string;
    houseNumber: string;
    hid: string;
    targetHref: string;
  }>;
}

/**
 * One in-flight request, shared by all three cards.
 *
 * The cards mount in the same commit, so without this the dashboard would issue
 * three identical calls for what is one aggregate query on the server — and
 * `GET /api/dashboard/housing` runs seven `groupBy`s plus the whole house-queue
 * engine. The handle is released on settle rather than cached, so a card mounted
 * later (a user re-adds the widget) asks for current numbers instead of serving a
 * snapshot from when the page first loaded.
 */
let housingInflight: Promise<HousingOverview | null> | null = null;

function fetchHousingOverview(): Promise<HousingOverview | null> {
  if (housingInflight) return housingInflight;

  housingInflight = fetch("/api/dashboard/housing")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data ? (data as HousingOverview) : null))
    .catch(() => null)
    .finally(() => {
      housingInflight = null;
    });

  return housingInflight;
}

/** Shared loader. Returns `null` for "not loaded yet" and "could not load". */
function useHousingOverview() {
  const [data, setData] = useState<HousingOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchHousingOverview().then((result) => {
      if (!active) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading };
}

/**
 * One figure in the summary grid.
 *
 * A tile rather than a table row: these are read by glancing down a 2×2, not by
 * comparing across a column, and the card is a third of the dashboard's width at
 * `lg`. `tone` only ever selects a THEME token — `success` / `warning` / `muted` —
 * never a hard-coded ramp, so the card reads correctly in all seven themes rather
 * than washing out on Paper or vanishing on OLED.
 */
function HousingFigure({
  label,
  value,
  caption,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: "default" | "muted" | "success" | "warning";
}) {
  return (
    <div className="border-border/60 bg-secondary/60 rounded-lg border px-3 py-2.5">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
        {label}
      </p>
      <p
        className={
          "mt-1 text-2xl leading-none font-bold tracking-tight tabular-nums " +
          (tone === "success"
            ? "text-success-foreground"
            : tone === "warning"
              ? "text-warning-foreground"
              : tone === "muted"
                ? "text-muted-foreground"
                : "text-foreground")
        }
      >
        {value}
      </p>
      {caption ? (
        <p className="text-muted-foreground mt-1 text-[11px] leading-tight">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Housing estate at a glance.
 *
 * The four numbers an officer is asked for at a counter — how many houses, how full,
 * how many free, how many people waiting — plus the two that drift silently and
 * need watching: handbacks not yet inspected, and whether allocation pace is
 * rising or falling month on month.
 */
function HousingSummaryWidget() {
  const { data, loading } = useHousingOverview();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-[86px] animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<Building2 className="h-8 w-8" />}
        title="Housing data unavailable"
        description="You need the household or house-queue permission to see this, or the housing service did not respond."
      />
    );
  }

  const { kpis } = data;

  if (kpis.totalHouses === 0) {
    return (
      <EmptyState
        icon={<House className="h-8 w-8" />}
        title="No houses registered"
        description="Add house units in the Household Register to see occupancy and vacancy here."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <HousingFigure
          label="Total houses"
          value={kpis.totalHouses}
          caption="Staff and tiers A–E"
        />
        <HousingFigure
          label="Occupancy"
          value={`${kpis.occupancyRate}%`}
          caption={`${kpis.occupiedCount} occupied`}
          tone={kpis.occupancyRate >= 90 ? "warning" : "default"}
        />
        <HousingFigure
          label="Vacant"
          value={kpis.vacantCount}
          caption={
            kpis.maintenanceCount > 0
              ? `${kpis.maintenanceCount} under maintenance`
              : "ready to allocate"
          }
          tone={kpis.vacantCount > 0 ? "success" : "muted"}
        />
        <HousingFigure
          label="Queue"
          value={kpis.activeQueueSize}
          caption="waiting on a house"
          tone={kpis.activeQueueSize > 0 ? "warning" : "muted"}
        />
      </div>

      {/* Allocation pace, and nothing else.
          Outstanding inspections used to sit here as well, which meant the same
          number appeared twice on one screen — once as a statistic here and once
          as an actionable row in the alerts card. It belongs in exactly one place
          and that place is the card that can do something about it, so it is gone
          from here and the summary keeps the one figure that has no home of its
          own. */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1">
          Allocations this month {kpis.thisMonthAllocations}
          {kpis.allocationDelta !== 0 ? (
            <span
              className={
                kpis.allocationDelta > 0
                  ? "text-success-foreground font-semibold"
                  : "text-warning-foreground font-semibold"
              }
            >
              {kpis.allocationDelta > 0 ? "↑" : "↓"}
              {Math.abs(kpis.allocationDelta)} vs last month
            </span>
          ) : null}
        </span>
      </div>

      <a
        href="/dashboard/house-allocation"
        className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Open House Ledger
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}

/**
 * What is stuck, and what it is costing.
 *
 * A shortage alert is a COHORT, not a person: "four Grade-15 applicants are
 * eligible for a Type A house and there are none free" is the actionable fact,
 * and naming an individual would be both wrong and unkind. So each row reports the
 * band, how many are waiting and how many are free — and says nothing when
 * nothing is short, rather than rendering an empty panel that invites the reader
 * to wonder whether the check ran.
 */
function HousingAlertsWidget() {
  const { data, loading } = useHousingOverview();

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="bg-muted h-12 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title="Alerts unavailable"
        description="The house-queue service did not respond."
      />
    );
  }

  const { alerts, kpis } = data;

  if (alerts.length === 0 && kpis.pendingInspectionCount === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-8 w-8" />}
        title="Nothing needs attention"
        description="Every eligible cohort has a house free in its band, and no handback is waiting on an inspection."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {alerts.length > 0 ? (
        <ul className="space-y-1.5">
          {alerts.map((alert) => (
            <li
              key={`${alert.grade}-${alert.category}`}
              className="border-warning-foreground/30 bg-warning-bg flex items-start gap-2.5 rounded-lg border px-3 py-2"
            >
              <AlertTriangle
                className="text-warning-foreground mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-xs leading-tight">
                <p className="text-foreground font-semibold">
                  Grade {alert.grade ?? "—"}
                  {alert.category ? ` · Type ${alert.category}` : ""} short of
                  houses
                </p>
                <p className="text-muted-foreground mt-0.5">
                  <span className="text-warning-foreground font-semibold tabular-nums">
                    {alert.waitingCount}
                  </span>{" "}
                  waiting
                  <span aria-hidden> · </span>
                  <span className="tabular-nums">
                    {alert.availableHouses}
                  </span>{" "}
                  free in band
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {kpis.pendingInspectionCount > 0 ? (
        <a
          href="/houses/inspections"
          className="border-border/60 bg-secondary/60 hover:border-primary/40 flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors"
        >
          <ClipboardCheck
            className="text-muted-foreground h-3.5 w-3.5 shrink-0"
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-xs leading-tight">
            <span className="text-foreground font-semibold tabular-nums">
              {kpis.pendingInspectionCount}
            </span>{" "}
            <span className="text-muted-foreground">
              handback{kpis.pendingInspectionCount === 1 ? "" : "s"} awaiting
              inspection
            </span>
          </p>
          <ArrowUpRight
            className="text-muted-foreground h-3 w-3 shrink-0"
            aria-hidden
          />
        </a>
      ) : null}

      {alerts.length > 0 ? (
        <a
          href="/house-queue"
          className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Open the House Queue
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

/**
 * Recent housing decisions, newest first.
 *
 * Every row carries its subject: the employee, and the house if one is attached.
 * A housing audit line without a subject is a mystery, and this feed exists
 * precisely so an officer can answer "who moved into B-202 last month?" without
 * opening the ledger.
 */
function HousingActivityWidget() {
  const { data, loading } = useHousingOverview();

  if (loading) {
    return (
      <ul className="space-y-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bg-muted h-10 animate-pulse rounded-lg" />
        ))}
      </ul>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<House className="h-8 w-8" />}
        title="Activity unavailable"
        description="The housing service did not respond."
      />
    );
  }

  if (data.activity.length === 0) {
    return (
      <EmptyState
        icon={<House className="h-8 w-8" />}
        title="No housing activity yet"
        description="Allocations, releases, inspections and queue decisions appear here as they happen."
      />
    );
  }

  return (
    <ul className="space-y-1">
      {data.activity.map((item) => {
        const subject = item.employeeName || item.employeeNumber || "—";
        const place = item.houseNumber || item.hid;

        return (
          <li key={item.id}>
            <a
              href={item.targetHref}
              className="hover:bg-muted/60 focus-visible:ring-ring -mx-1.5 flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="bg-muted text-muted-foreground mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                <House className="h-3 w-3" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {item.action}
                </span>
                <span className="text-muted-foreground block truncate text-[11px]">
                  {subject}
                  {place ? ` · ${place}` : ""} · {item.actorName} ·{" "}
                  {formatRelativeTime(item.timestamp)}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

const WidgetContent = memo(function WidgetContent({
  widgetType,
  serverStats,
}: {
  widgetType: string;
  serverStats?: { assets: number; accessories: number; users: number };
}) {
  switch (widgetType) {
    case "stats":
      return <StatsWidget serverStats={serverStats} />;
    case "assetsByStatus":
      return <AssetsByStatusWidget />;
    case "recentActivity":
      return <RecentActivityWidget />;
    case "upcomingMaintenance":
      return <UpcomingMaintenanceWidget />;
    case "expiringLicences":
      return <ExpiringLicencesWidget />;
    case "costOverview":
      return <CostOverviewWidget />;
    case "lastEdited":
      return <LastEditedWidget />;
    case "assetMap":
      return <AssetMapWidget />;
    case "fleetValue":
      return <FleetValueWidget />;
    case "myAssets":
      return <MyAssetsWidget />;
    case "myRequests":
      return <MyRequestsWidget />;
    case "myTickets":
      return <MyTicketsWidget />;
    case "healthScore":
      return <HealthScoreWidget />;
    case "tco":
      return <TCOWidget />;
    case "duplicateDetection":
      return <DuplicateDetectionWidget />;
    case "housingSummary":
      return <HousingSummaryWidget />;
    case "housingAlerts":
      return <HousingAlertsWidget />;
    case "housingActivity":
      return <HousingActivityWidget />;
    default:
      return (
        <p className="text-muted-foreground text-sm">Unknown widget type</p>
      );
  }
});

// ---------------------------------------------------------------------------
// Sortable widget card
// ---------------------------------------------------------------------------

const SortableWidget = memo(function SortableWidget({
  widget,
  onRemove,
  serverStats,
}: {
  widget: DashboardWidgetData;
  onRemove: (id: string) => void;
  serverStats?: { assets: number; accessories: number; users: number };
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const definition = WIDGET_DEFINITIONS.find(
    (d) => d.type === widget.widgetType,
  );
  const title = definition?.title ?? widget.widgetType;

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-1">
            <button
              className="hover:bg-muted cursor-grab rounded p-1"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
            >
              <GripVertical className="text-muted-foreground h-4 w-4" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-destructive/10 h-auto w-auto rounded p-1"
              onClick={() => onRemove(widget.id)}
              aria-label="Remove widget"
            >
              <X className="text-muted-foreground h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <WidgetContent
            widgetType={widget.widgetType}
            serverStats={serverStats}
          />
        </CardContent>
      </Card>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main DashboardGrid
// ---------------------------------------------------------------------------

export default function DashboardGrid({
  serverStats,
  isAdmin = true,
  permissions,
}: {
  serverStats?: { assets: number; accessories: number; users: number };
  isAdmin?: boolean;
  /**
   * The caller's RBAC permission keys, passed down from the server page.
   *
   * This is a UX filter, not the security boundary — `POST /api/dashboard/widgets`
   * and `GET /api/dashboard/housing` both enforce the same permissions
   * server-side, and the read path drops rows the caller is no longer entitled
   * to. Its job is to stop the Add Widget dialog from offering a card that would
   * come back 403, which is the difference between "you cannot see housing data"
   * and a broken-looking dashboard.
   */
  permissions?: string[];
} = {}) {
  const [widgets, setWidgets] = useState<DashboardWidgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const fetchWidgets = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/widgets");
      const data = await res.json();
      setWidgets((data as DashboardWidgetData[]).filter((w) => w.visible));
    } catch {
      setWidgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = widgets.findIndex((w) => w.id === active.id);
      const newIndex = widgets.findIndex((w) => w.id === over.id);

      const reordered = arrayMove(widgets, oldIndex, newIndex).map((w, i) => ({
        ...w,
        position: i,
      }));

      setWidgets(reordered);

      try {
        await fetch("/api/dashboard/widgets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widgets: reordered.map((w) => ({
              id: w.id,
              position: w.position,
              visible: w.visible,
            })),
          }),
        });
      } catch (err) {
        console.error("Failed to save widget order:", err);
      }
    },
    [widgets],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setWidgets((prev) => prev.filter((w) => w.id !== id));

      try {
        await fetch(`/api/dashboard/widgets?id=${id}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Failed to remove widget:", err);
        fetchWidgets();
      }
    },
    [fetchWidgets],
  );

  const handleAdd = useCallback(
    async (widgetType: string) => {
      try {
        const res = await fetch("/api/dashboard/widgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgetType }),
        });

        if (res.ok) {
          await fetchWidgets();
        }
      } catch (err) {
        console.error("Failed to add widget:", err);
      }

      setDialogOpen(false);
    },
    [fetchWidgets],
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="bg-muted h-4 w-1/2 rounded" />
            </CardHeader>
            <CardContent>
              <div className="bg-muted h-20 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Determine which widget types are already active so we can filter the add
  // dialog, and drop anything the caller is not entitled to.
  const activeTypes = new Set(widgets.map((w) => w.widgetType));

  const isWidgetAvailable = (definition: WidgetDefinition): boolean => {
    if (definition.adminOnly && !isAdmin) return false;
    if (!definition.permission) return true;
    // Admins hold every permission by construction, so they always pass.
    return isAdmin || (permissions ?? []).includes(definition.permission);
  };

  const availableWidgets = WIDGET_DEFINITIONS.filter(
    (d) => !activeTypes.has(d.type) && isWidgetAvailable(d),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Custom Widgets</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Widget
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Widget</DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-4">
              {availableWidgets.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  All widgets have been added.
                </p>
              ) : (
                availableWidgets.map((def) => (
                  <Button
                    key={def.type}
                    variant="outline"
                    className="hover:bg-muted flex h-auto flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors"
                    onClick={() => handleAdd(def.type)}
                  >
                    <span className="text-sm font-medium">{def.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {def.description}
                    </span>
                  </Button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgets.map((w) => w.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {widgets.map((widget) => (
              <SortableWidget
                key={widget.id}
                widget={widget}
                onRemove={handleRemove}
                serverStats={serverStats}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
