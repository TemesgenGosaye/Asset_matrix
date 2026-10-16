"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { ReactNode, useCallback, useMemo, useRef } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Columns3, X, Inbox, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column {
  key: string;
  label: string;
  hideable?: boolean;
  align?: "left" | "center" | "right";
  className?: string;
  /** Optional adornment rendered after the label (e.g. a sort indicator). */
  icon?: ReactNode;
  /** When provided, the header becomes a button that invokes this handler. */
  onHeaderClick?: () => void;
  /**
   * Current sort state for this column, applied as `aria-sort` on the `<th>`.
   *
   * Without it the sort direction exists only as an icon inside a button whose
   * accessible name is "Sort by X", so assistive tech cannot tell which column
   * is sorted or how.
   */
  ariaSort?: "ascending" | "descending" | "none";
}

export interface ResponsiveTableProps<T> {
  columns: Column[];
  data: T[];
  renderCell: (item: T, key: string, index?: number) => ReactNode;
  mobileCardView?: boolean;
  minWidth?: string;
  keyExtractor?: (item: T) => string | number;
  emptyMessage?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  // Visual Styles
  striped?: boolean;
  columnDividers?: boolean;
  stickyHeader?: boolean;
  // Column visibility
  storageKey?: string;
  defaultVisibleColumns?: string[];
  // Selection
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  bulkActions?: ReactNode;
  // Virtual scrolling
  virtualized?: boolean;
  /** Max height of the virtual scroll container in px (default: 600) */
  virtualMaxHeight?: number;
  /** Estimated row height in px for virtual scrolling (default: 48) */
  estimatedRowHeight?: number;
  /** Number of extra rows rendered beyond the visible area (default: 10) */
  overscan?: number;
}

/** Renders a column label, optionally as a sort control. */
function ColumnHeaderContent({ col }: { col: Column }) {
  if (!col.onHeaderClick) {
    return (
      <>
        {col.label}
        {col.icon}
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={col.onHeaderClick}
      aria-label={
        col.ariaSort && col.ariaSort !== "none"
          ? `Sort by ${col.label}, currently sorted ${
              col.ariaSort === "ascending" ? "ascending" : "descending"
            }`
          : `Sort by ${col.label}`
      }
      className="hover:text-primary -mx-1 inline-flex items-center gap-1 rounded px-1"
    >
      {col.label}
      {col.icon}
    </button>
  );
}

export function ResponsiveTable<T>({
  columns = [],
  data = [],
  renderCell,
  mobileCardView = false,
  minWidth = "800px",
  keyExtractor = (item) =>
    (item as Record<string, unknown>).id as string | number,
  emptyMessage = "No data records found",
  emptyDescription = "There are no matching entries to display at this time.",
  emptyIcon,
  striped = false,
  columnDividers = true,
  stickyHeader = true,
  storageKey,
  defaultVisibleColumns,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  bulkActions,
  virtualized = false,
  virtualMaxHeight = 600,
  estimatedRowHeight = 48,
  overscan = 10,
}: ResponsiveTableProps<T>) {
  const safeColumns = useMemo(() => columns || [], [columns]);
  const allColumnKeys = useMemo(
    () => safeColumns.map((c) => c.key),
    [safeColumns],
  );
  const [persistedColumns, setPersistedColumns] = usePersistentState<string[]>(
    storageKey || "__unused",
    defaultVisibleColumns || allColumnKeys,
  );

  const visibleColumnKeys = useMemo(
    () => (storageKey ? new Set(persistedColumns) : new Set(allColumnKeys)),
    [storageKey, persistedColumns, allColumnKeys],
  );

  const visibleColumns = useMemo(() => {
    if (!storageKey) return safeColumns;
    return safeColumns.filter((col) => visibleColumnKeys.has(col.key));
  }, [safeColumns, storageKey, visibleColumnKeys]);

  const handleColumnToggle = (columnKey: string) => {
    const current = new Set(persistedColumns);
    if (current.has(columnKey)) {
      if (current.size > 1) {
        current.delete(columnKey);
      }
    } else {
      current.add(columnKey);
    }
    setPersistedColumns(Array.from(current));
  };

  const handleResetColumns = () => {
    setPersistedColumns(allColumnKeys);
  };

  // Selection helpers
  const allPageKeys = useMemo(
    () => data.map((item) => String(keyExtractor(item))),
    [data, keyExtractor],
  );
  const allSelected =
    selectable &&
    selectedKeys &&
    allPageKeys.length > 0 &&
    allPageKeys.every((k) => selectedKeys.has(k));
  const someSelected =
    selectable &&
    selectedKeys &&
    !allSelected &&
    allPageKeys.some((k) => selectedKeys.has(k));

  const handleSelectAll = () => {
    if (!onSelectionChange || !selectedKeys) return;
    if (allSelected) {
      const next = new Set(selectedKeys);
      allPageKeys.forEach((k) => next.delete(k));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedKeys);
      allPageKeys.forEach((k) => next.add(k));
      onSelectionChange(next);
    }
  };

  const handleSelectRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  // Virtual scrolling setup
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtualized ? data.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const measureRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      if (node) {
        const index = Number(node.dataset.index);
        if (!isNaN(index)) {
          virtualizer.measureElement(node);
        }
      }
    },
    [virtualizer],
  );

  // Column Visibility Toolbar UI
  const columnToggleUI = storageKey ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <Columns3 className="text-muted-foreground h-3.5 w-3.5" />
          <span>Columns</span>
          <Badge
            variant="secondary"
            className="ml-0.5 h-4 px-1 text-[10px] font-semibold"
          >
            {visibleColumns.length}/{safeColumns.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 text-xs">
        <div className="text-muted-foreground mb-1 flex items-center justify-between border-b px-2 py-1.5 text-xs font-semibold">
          <span>Toggle Visible Columns</span>
          <button
            type="button"
            onClick={handleResetColumns}
            className="text-primary text-[11px] font-medium hover:underline"
          >
            Show All
          </button>
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {safeColumns.map((col) => {
            if (col.hideable === false) return null;
            const isVisible = visibleColumnKeys.has(col.key);
            return (
              <DropdownMenuItem
                key={col.key}
                onSelect={(e) => {
                  e.preventDefault();
                  handleColumnToggle(col.key);
                }}
                className="flex cursor-pointer items-center justify-between py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={isVisible}
                    onCheckedChange={() => handleColumnToggle(col.key)}
                    className="h-3.5 w-3.5"
                  />
                  <span>{col.label}</span>
                </div>
                {isVisible && <Check className="text-primary h-3.5 w-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  // Bulk actions toolbar
  const bulkBar =
    selectable && selectedKeys && selectedKeys.size > 0 ? (
      <div className="bg-primary/10 border-primary/30 flex items-center gap-3 rounded-lg border px-3.5 py-1.5 text-xs">
        <span className="text-foreground font-semibold">
          {selectedKeys.size} row{selectedKeys.size > 1 ? "s" : ""} selected
        </span>
        <div className="bg-border h-4 w-px" />
        {bulkActions}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectionChange?.(new Set())}
          className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs"
        >
          <X className="mr-1 h-3 w-3" />
          Deselect all
        </Button>
      </div>
    ) : null;

  const toolbarContent =
    columnToggleUI || bulkBar ? (
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div>{bulkBar}</div>
        <div className="ml-auto">{columnToggleUI}</div>
      </div>
    ) : null;

  // Empty state
  if (!data || data.length === 0) {
    return (
      <>
        {toolbarContent}
        <div className="border-border bg-card flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed p-12 text-center shadow-xs">
          <div className="bg-muted text-muted-foreground mb-1 flex h-12 w-12 items-center justify-center rounded-full">
            {emptyIcon || (
              <Inbox className="text-muted-foreground/70 h-6 w-6" />
            )}
          </div>
          <h3 className="text-foreground text-sm font-semibold">
            {emptyMessage}
          </h3>
          <p className="text-muted-foreground max-w-sm text-xs">
            {emptyDescription}
          </p>
        </div>
      </>
    );
  }

  // 100% Solid column divider styling
  const cellBorderClass = columnDividers
    ? "border-r border-border last:border-r-0"
    : "";
  const headBorderClass = columnDividers
    ? "border-r border-border last:border-r-0"
    : "";

  // Mobile card view mode
  if (mobileCardView) {
    return (
      <>
        {toolbarContent}
        {/* Mobile: Card view */}
        <div className="block space-y-3 lg:hidden">
          {data.map((item) => {
            const itemKey = String(keyExtractor(item));
            return (
              <Card
                key={itemKey}
                className="border-border bg-card hover:border-primary/50 overflow-hidden border shadow-xs transition-all"
              >
                <CardContent className="space-y-2.5 p-4">
                  {selectable && (
                    <div className="border-border flex items-center gap-2 border-b pb-1.5">
                      <Checkbox
                        checked={selectedKeys?.has(itemKey) ?? false}
                        onCheckedChange={() => handleSelectRow(itemKey)}
                      />
                      <span className="text-muted-foreground text-xs font-medium">
                        Select entry
                      </span>
                    </div>
                  )}
                  {visibleColumns.map((col) => (
                    <div
                      key={col.key}
                      className="border-border/40 flex items-center justify-between gap-4 border-b py-0.5 last:border-b-0"
                    >
                      <span className="text-muted-foreground shrink-0 text-xs font-medium">
                        {col.label}:
                      </span>
                      <div className="scrollbar-none overflow-x-auto text-right text-xs font-normal whitespace-nowrap">
                        {renderCell(item, col.key, data.indexOf(item))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Desktop: 100% Solid Table view */}
        <div className="border-border bg-background hidden overflow-hidden rounded-xl border shadow-xs lg:block">
          <div className="scrollbar-thin overflow-x-auto">
            <Table style={{ minWidth }}>
              <TableHeader
                className={cn(
                  stickyHeader ? "sticky top-0 z-10" : "",
                  "bg-muted border-border border-b-2 dark:bg-slate-900",
                )}
              >
                <TableRow className="hover:bg-muted border-border border-b-2 dark:hover:bg-slate-900">
                  {selectable && (
                    <TableHead
                      className={cn(
                        "border-border w-10 border-b-2 px-3.5",
                        headBorderClass,
                      )}
                    >
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el)
                            (el as unknown as HTMLInputElement).indeterminate =
                              !!someSelected;
                        }}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
                  {visibleColumns.map((col) => (
                    <TableHead
                      key={col.key}
                      aria-sort={col.ariaSort}
                      className={cn(
                        "text-foreground border-border border-b-2 text-xs font-bold tracking-wider whitespace-nowrap uppercase",
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left",
                        headBorderClass,
                        col.className,
                      )}
                    >
                      <ColumnHeaderContent col={col} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="bg-background divide-border divide-y">
                {data.map((item, idx) => {
                  const itemKey = String(keyExtractor(item));
                  const isSelected = selectedKeys?.has(itemKey) ?? false;
                  return (
                    <TableRow
                      key={itemKey}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "border-border border-b transition-colors duration-150",
                        isSelected
                          ? "bg-primary/10"
                          : striped && idx % 2 === 1
                            ? "bg-muted/40 hover:bg-muted dark:bg-slate-900/40 dark:hover:bg-slate-800"
                            : "bg-background hover:bg-muted/90 dark:hover:bg-slate-800/90",
                      )}
                    >
                      {selectable && (
                        <TableCell
                          className={cn(
                            "border-border w-10 border-b px-3.5",
                            cellBorderClass,
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleSelectRow(itemKey)}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={cn(
                            "text-foreground border-border border-b px-4 py-3 text-sm font-normal whitespace-nowrap",
                            col.align === "right"
                              ? "text-right"
                              : col.align === "center"
                                ? "text-center"
                                : "text-left",
                            cellBorderClass,
                            col.className,
                          )}
                        >
                          {renderCell(item, col.key, idx)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </>
    );
  }

  // Virtualized mode
  if (virtualized) {
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const colSpan = visibleColumns.length + (selectable ? 1 : 0);

    return (
      <>
        {toolbarContent}
        <div className="border-border bg-background w-full overflow-hidden rounded-xl border shadow-xs">
          <div
            ref={scrollContainerRef}
            className="scrollbar-thin overflow-auto"
            style={{ maxHeight: virtualMaxHeight }}
          >
            <Table style={{ minWidth }}>
              <TableHeader className="bg-muted border-border sticky top-0 z-10 border-b-2 shadow-xs dark:bg-slate-900">
                <TableRow className="hover:bg-muted border-border border-b-2 dark:hover:bg-slate-900">
                  {selectable && (
                    <TableHead
                      className={cn(
                        "border-border w-10 border-b-2 px-3.5",
                        headBorderClass,
                      )}
                    >
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el)
                            (el as unknown as HTMLInputElement).indeterminate =
                              !!someSelected;
                        }}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
                  {visibleColumns.map((col) => (
                    <TableHead
                      key={col.key}
                      aria-sort={col.ariaSort}
                      className={cn(
                        "text-foreground border-border border-b-2 text-xs font-bold tracking-wider whitespace-nowrap uppercase",
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left",
                        headBorderClass,
                        col.className,
                      )}
                    >
                      <ColumnHeaderContent col={col} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="bg-background divide-border divide-y">
                {virtualItems.length > 0 && (
                  <tr>
                    <td
                      colSpan={colSpan}
                      style={{ height: virtualItems[0].start, padding: 0 }}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualRow, idx) => {
                  const item = data[virtualRow.index];
                  const itemKey = String(keyExtractor(item));
                  const isSelected = selectedKeys?.has(itemKey) ?? false;
                  return (
                    <TableRow
                      key={itemKey}
                      data-index={virtualRow.index}
                      data-state={isSelected ? "selected" : undefined}
                      ref={measureRef}
                      className={cn(
                        "border-border border-b transition-colors duration-150",
                        isSelected
                          ? "bg-primary/10"
                          : striped && idx % 2 === 1
                            ? "bg-muted/40 hover:bg-muted dark:bg-slate-900/40 dark:hover:bg-slate-800"
                            : "bg-background hover:bg-muted/90 dark:hover:bg-slate-800/90",
                      )}
                    >
                      {selectable && (
                        <TableCell
                          className={cn(
                            "border-border w-10 border-b px-3.5",
                            cellBorderClass,
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleSelectRow(itemKey)}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={cn(
                            "text-foreground border-border border-b px-4 py-3 text-sm font-normal whitespace-nowrap",
                            col.align === "right"
                              ? "text-right"
                              : col.align === "center"
                                ? "text-center"
                                : "text-left",
                            cellBorderClass,
                            col.className,
                          )}
                        >
                          {renderCell(item, col.key, virtualRow.index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {virtualItems.length > 0 && (
                  <tr>
                    <td
                      colSpan={colSpan}
                      style={{
                        height:
                          totalSize - virtualItems[virtualItems.length - 1].end,
                        padding: 0,
                      }}
                    />
                  </tr>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </>
    );
  }

  // Standard Plain Table mode
  return (
    <>
      {toolbarContent}
      <div className="border-border bg-background w-full overflow-hidden rounded-xl border shadow-xs">
        <div className="scrollbar-thin overflow-x-auto">
          <Table style={{ minWidth }}>
            <TableHeader
              className={cn(
                stickyHeader ? "sticky top-0 z-10" : "",
                "bg-muted border-border border-b-2 dark:bg-slate-900",
              )}
            >
              <TableRow className="hover:bg-muted border-border border-b-2 dark:hover:bg-slate-900">
                {selectable && (
                  <TableHead
                    className={cn(
                      "border-border w-10 border-b-2 px-3.5",
                      headBorderClass,
                    )}
                  >
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => {
                        if (el)
                          (el as unknown as HTMLInputElement).indeterminate =
                            !!someSelected;
                      }}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                )}
                {visibleColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    aria-sort={col.ariaSort}
                    className={cn(
                      "text-foreground border-border border-b-2 text-xs font-bold tracking-wider whitespace-nowrap uppercase",
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left",
                      headBorderClass,
                      col.className,
                    )}
                  >
                    <ColumnHeaderContent col={col} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="bg-background divide-border divide-y">
              {data.map((item, idx) => {
                const itemKey = String(keyExtractor(item));
                const isSelected = selectedKeys?.has(itemKey) ?? false;
                return (
                  <TableRow
                    key={itemKey}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(
                      "border-border border-b transition-colors duration-150",
                      isSelected
                        ? "bg-primary/10"
                        : striped && idx % 2 === 1
                          ? "bg-muted/40 hover:bg-muted dark:bg-slate-900/40 dark:hover:bg-slate-800"
                          : "bg-background hover:bg-muted/90 dark:hover:bg-slate-800/90",
                    )}
                  >
                    {selectable && (
                      <TableCell
                        className={cn(
                          "border-border w-10 border-b px-3.5",
                          cellBorderClass,
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectRow(itemKey)}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          "text-foreground border-border border-b px-4 py-3 text-sm font-normal whitespace-nowrap",
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                              ? "text-center"
                              : "text-left",
                          cellBorderClass,
                          col.className,
                        )}
                      >
                        {renderCell(item, col.key, idx)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
