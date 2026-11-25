"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LayoutList,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUrlState } from "@/hooks/useUrlState";
import { cn } from "@/lib/utils";
import AssetOperationDialogs from "./AssetOperationDialogs";
import AssetOperationsMenu from "./AssetOperationsMenu";
import type {
  ActiveAssetOperation,
  ReferenceItem,
  RegisterAsset,
} from "./asset-types";

function safeColor(color?: string | null): string | null {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

interface Props {
  isAdmin: boolean;
  departments: ReferenceItem[];
  statuses: ReferenceItem[];
  categories: ReferenceItem[];
}

interface ListResponse {
  items: RegisterAsset[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: { key: string; count: number }[];
}

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function ConditionBadge({
  value,
  color,
}: {
  value?: string | null;
  color?: string | null;
}) {
  const normalized = (value ?? "").toLowerCase();
  const variant =
    normalized === "good"
      ? "success"
      : normalized === "n/f" || normalized === "nf"
        ? "warning"
        : normalized === "scrap" || normalized.includes("demol")
          ? "destructive"
          : "muted";
  const swatch = safeColor(color);
  return (
    <Badge variant={variant}>
      {swatch && (
        <span
          aria-hidden="true"
          className="border-foreground/20 mr-1 inline-block h-2.5 w-2.5 rounded-full border"
          style={{ backgroundColor: swatch }}
        />
      )}
      {value || "—"}
    </Badge>
  );
}

export default function FixedAssetRegisterClient({
  isAdmin,
  departments,
  statuses,
  categories,
}: Props) {
  const defaults = useMemo(
    () => ({
      search: "",
      department: "",
      categoryCode: "",
      condition: "",
      reviewFrom: "",
      reviewTo: "",
      groupBy: "department",
      sortBy: "department",
      sortOrder: "asc",
      page: "1",
      pageSize: "25",
      hidden: "false",
      missingProperty: "false",
      needsReview: "false",
      batch: "",
    }),
    [],
  );
  const [urlState, setUrlState] = useUrlState(defaults);
  const [data, setData] = useState<ListResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    pageCount: 0,
    facets: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerItem, setDrawerItem] = useState<RegisterAsset | null>(null);
  const [activeOperation, setActiveOperation] =
    useState<ActiveAssetOperation | null>(null);
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [bulkStatusId, setBulkStatusId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    const mapping: Record<string, string> = {
      search: "search",
      department: "departments",
      categoryCode: "categoryCodes",
      condition: "conditions",
      reviewFrom: "reviewFrom",
      reviewTo: "reviewTo",
      groupBy: "groupBy",
      sortBy: "sortBy",
      sortOrder: "sortOrder",
      page: "page",
      pageSize: "pageSize",
      batch: "batch",
    };
    for (const [key, target] of Object.entries(mapping)) {
      if (urlState[key]) params.set(target, urlState[key]);
    }
    for (const key of ["hidden", "missingProperty", "needsReview"]) {
      if (urlState[key] === "true") params.set(key, "true");
    }
    return params.toString();
  }, [urlState]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/fixed-assets?${query}`, { signal });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Failed to load assets");
        setData(payload as ListResponse);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError((caught as Error).message);
        }
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, refreshKey]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
      if (event.key.toLowerCase() === "r") setRefreshKey((value) => value + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const update = (patch: Partial<typeof defaults>) => {
    setSelected(new Set());
    setUrlState(patch);
  };

  const toggleRow = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected =
    data.items.length > 0 &&
    data.items.every((item) => selected.has(item.assetid));

  const runBulk = async (kind: "status" | "delete") => {
    if (!selected.size) return;
    const ids = [...selected];
    if (kind === "delete") {
      if (!window.confirm(`Permanently delete ${ids.length} asset(s)?`)) return;
      const responses = await Promise.all(
        ids.map((assetId) =>
          fetch("/api/asset/deleteAsset", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        setError("One or more assets could not be deleted");
      }
    } else {
      if (!bulkStatusId) return;
      const responses = await Promise.all(
        ids.map((assetId) =>
          fetch("/api/asset/updateStatus", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId, statusTypeId: bulkStatusId }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        setError("One or more status changes failed");
      }
    }
    setSelected(new Set());
    setRefreshKey((value) => value + 1);
  };

  const groupedItems = useMemo(() => {
    if (urlState.groupBy === "none") return [{ key: "", items: data.items }];
    const groups = new Map<string, RegisterAsset[]>();
    for (const item of data.items) {
      const key =
        urlState.groupBy === "categoryCode"
          ? item.categoryCode || "—"
          : urlState.groupBy === "condition1"
            ? item.condition1 || "—"
            : item.sourceDepartment || item.department?.name || "—";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, items }));
  }, [data.items, urlState.groupBy]);

  const statusColorByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const status of statuses) {
      const color = safeColor(status.color);
      if (color) map.set(status.name.toLowerCase(), color);
    }
    return map;
  }, [statuses]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            Fixed Asset Register
          </h1>
          <p className="text-muted-foreground text-sm">
            {data.total.toLocaleString()} assets · grouped by {urlState.groupBy}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/fixed-assets/export?${query}`}>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href="/assets/register/import">
                  <Upload className="h-4 w-4" /> Import
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/assets/register/create">
                  <Plus className="h-4 w-4" /> Add Asset
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="border-border/70 from-card to-muted/30 bg-gradient-to-r">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label className="text-muted-foreground mb-1 block text-xs">
              Search
            </label>
            <Input
              value={urlState.search}
              placeholder="Description, Property No, Finance No…"
              onChange={(event) =>
                update({ search: event.target.value, page: "1" })
              }
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Department
            </label>
            <select
              className={selectClass}
              value={urlState.department}
              onChange={(event) =>
                update({ department: event.target.value, page: "1" })
              }
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Category code
            </label>
            <select
              className={selectClass}
              value={urlState.categoryCode}
              onChange={(event) =>
                update({ categoryCode: event.target.value, page: "1" })
              }
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.code ?? category.name}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Condition
            </label>
            <select
              className={selectClass}
              value={urlState.condition}
              onChange={(event) =>
                update({ condition: event.target.value, page: "1" })
              }
            >
              <option value="">All conditions</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.name}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Review from
            </label>
            <Input
              type="date"
              className="h-9"
              value={urlState.reviewFrom}
              onChange={(event) =>
                update({ reviewFrom: event.target.value, page: "1" })
              }
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Review to
            </label>
            <Input
              type="date"
              className="h-9"
              value={urlState.reviewTo}
              onChange={(event) =>
                update({ reviewTo: event.target.value, page: "1" })
              }
            />
          </div>
          <div className="flex gap-3 pb-2">
            {(
              [
                ["hidden", "Hidden"],
                ["missingProperty", "No Property No"],
                ["needsReview", "Needs review"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1 text-xs">
                <Checkbox
                  checked={urlState[key] === "true"}
                  onCheckedChange={(checked) =>
                    update({ [key]: checked ? "true" : "false", page: "1" })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="bg-card/60 flex flex-wrap items-center gap-2 rounded-xl border p-2">
        <SlidersHorizontal className="text-muted-foreground h-4 w-4" />
        <select
          className={selectClass}
          value={urlState.groupBy}
          onChange={(event) =>
            update({ groupBy: event.target.value, page: "1" })
          }
        >
          <option value="department">Group: Department</option>
          <option value="categoryCode">Group: Category Code</option>
          <option value="condition1">Group: Condition (1st)</option>
          <option value="none">No grouping</option>
        </select>
        <select
          className={selectClass}
          value={urlState.sortBy}
          onChange={(event) =>
            update({ sortBy: event.target.value, page: "1" })
          }
        >
          <option value="department">Sort: Department</option>
          <option value="description">Sort: Description</option>
          <option value="propertyNo">Sort: Property No</option>
          <option value="condition1">Sort: Condition</option>
          <option value="reviewDate1">Sort: Review (1st)</option>
          <option value="reviewDate2">Sort: Review (2nd)</option>
          <option value="created">Sort: Created</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            update({
              sortOrder: urlState.sortOrder === "asc" ? "desc" : "asc",
              page: "1",
            })
          }
        >
          {urlState.sortOrder === "asc" ? "Ascending" : "Descending"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setDensity((value) =>
              value === "compact" ? "comfortable" : "compact",
            )
          }
        >
          <LayoutList className="h-4 w-4" /> {density}
        </Button>
        <span className="text-muted-foreground ml-auto text-xs">
          Rows:{" "}
          <select
            className="bg-background h-8 rounded-md border px-1"
            value={urlState.pageSize}
            onChange={(event) =>
              update({ pageSize: event.target.value, page: "1" })
            }
          >
            {["25", "50", "100", "500"].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </span>
      </div>

      {selected.size > 0 && (
        <div className="border-border/70 bg-muted/60 flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {isAdmin && (
            <>
              <select
                className={selectClass}
                value={bulkStatusId}
                onChange={(event) => setBulkStatusId(event.target.value)}
              >
                <option value="">Change status…</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => void runBulk("status")}>
                Apply
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void runBulk("delete")}
              >
                Delete
              </Button>
            </>
          )}
          <a
            className="ml-auto text-xs underline"
            href={`/api/fixed-assets/export?${query}&ids=${[...selected].join(",")}`}
          >
            Export selected
          </a>
        </div>
      )}

      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="bg-muted/95 sticky top-0 z-10 backdrop-blur">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked
                          ? new Set(data.items.map((item) => item.assetid))
                          : new Set(),
                      )
                    }
                    aria-label="Select all on page"
                  />
                </TableHead>
                <TableHead>No.</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Category Code</TableHead>
                <TableHead>Property No</TableHead>
                <TableHead>Condition 1st / 2nd</TableHead>
                <TableHead>Location 1st / 2nd</TableHead>
                <TableHead>Review 1st / 2nd</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={11}>
                    <div className="space-y-2">
                      {[0, 1, 2, 3, 4].map((index) => (
                        <Skeleton key={index} className="h-8 w-full" />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !data.items.length && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-muted-foreground py-16 text-center"
                  >
                    No assets match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                groupedItems.map((group) => (
                  <Fragment key={group.key || "ungrouped"}>
                    {group.key && (
                      <TableRow className="bg-muted/60">
                        <TableCell
                          colSpan={11}
                          className="text-foreground font-semibold"
                        >
                          {group.key} ({group.items.length})
                        </TableCell>
                      </TableRow>
                    )}
                    {group.items.map((item, index) => (
                      <TableRow
                        key={item.assetid}
                        data-state={
                          selected.has(item.assetid) ? "selected" : undefined
                        }
                        className={cn(
                          "hover:bg-muted/40 cursor-pointer",
                          density === "compact" ? "py-1" : "py-3",
                          item.hiddenInSource && "opacity-60",
                        )}
                        onClick={() => setDrawerItem(item)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(item.assetid)}
                            onCheckedChange={() => toggleRow(item.assetid)}
                            aria-label={`Select ${item.serialnumber}`}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {(data.page - 1) * data.pageSize + index + 1}
                        </TableCell>
                        <TableCell
                          className="max-w-[280px] truncate font-medium"
                          title={item.assetname}
                        >
                          {item.assetname}
                        </TableCell>
                        <TableCell>
                          {item.sourceDepartment ||
                            item.department?.name ||
                            "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.categoryCode || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.serialnumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <ConditionBadge
                              value={item.condition1}
                              color={
                                statusColorByName.get(
                                  item.condition1?.toLowerCase() ?? "",
                                ) ?? null
                              }
                            />
                            <ConditionBadge
                              value={item.statusType?.statustypename}
                              color={safeColor(
                                statusColorByName.get(
                                  item.statusType?.statustypename.toLowerCase() ??
                                    "",
                                ) ?? null,
                              )}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">
                          {item.location1 || "—"}
                          <br />
                          {item.location?.locationname ||
                            item.location2Raw ||
                            "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {formatDate(item.reviewDate1)}
                          <br />
                          {formatDate(item.reviewsDate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {item.hiddenInSource && (
                              <Badge variant="muted">Hidden</Badge>
                            )}
                            {!item.serialnumber && (
                              <Badge variant="warning">No Property No</Badge>
                            )}
                            {(item.reviewDate1Ambiguous ||
                              item.reviewDate2Ambiguous) && (
                              <Badge variant="info">Date?</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/assets/${item.assetid}`}>
                                <ExternalLink className="h-4 w-4" /> Details
                              </Link>
                            </Button>
                            <AssetOperationsMenu
                              asset={item}
                              isAdmin={isAdmin}
                              onSelectOperation={(asset, type) =>
                                setActiveOperation({ asset, type })
                              }
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          Page {data.page} of {Math.max(data.pageCount, 1)} ·{" "}
          {data.total.toLocaleString()} rows
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => update({ page: String(data.page - 1) })}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.pageCount}
            onClick={() => update({ page: String(data.page + 1) })}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(drawerItem)}
        onOpenChange={(open) => !open && setDrawerItem(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {drawerItem?.assetname || "Asset detail"}
            </DialogTitle>
            <DialogDescription>
              Property No: {drawerItem?.serialnumber}
            </DialogDescription>
          </DialogHeader>
          {drawerItem && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  [
                    "Department",
                    drawerItem.sourceDepartment || drawerItem.department?.name,
                  ],
                  ["Category Code", drawerItem.categoryCode],
                  ["S.No", drawerItem.serialNo],
                  ["Finance No (1st)", drawerItem.financeNo1],
                  ["Condition (1st)", drawerItem.condition1],
                  ["Location (1st)", drawerItem.location1],
                  ["Review Date (1st)", formatDate(drawerItem.reviewDate1)],
                  ["Finance No (2nd)", drawerItem.financeNo2],
                  ["Condition (2nd)", drawerItem.statusType?.statustypename],
                  [
                    "Location (2nd)",
                    drawerItem.location?.locationname ||
                      drawerItem.location2Raw,
                  ],
                  ["Review Date (2nd)", formatDate(drawerItem.reviewsDate)],
                  ["Additional Data", drawerItem.additionalData],
                  ["Source Row", drawerItem.sourceRow],
                  [
                    "Hidden in Source",
                    drawerItem.hiddenInSource ? "Yes" : "No",
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs tracking-wide uppercase">
                    {label}
                  </div>
                  <div className="mt-1 text-sm break-words">{value || "—"}</div>
                </div>
              ))}
              <div className="sm:col-span-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/assets/${drawerItem.assetid}`}>
                    Open full detail page
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AssetOperationDialogs
        operation={activeOperation}
        statuses={statuses}
        isAdmin={isAdmin}
        onClose={() => setActiveOperation(null)}
        onSuccess={() => setRefreshKey((value) => value + 1)}
      />
    </div>
  );
}
