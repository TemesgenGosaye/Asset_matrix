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
  const allColumnKeys = useMemo(() => safeColumns.map((c) => c.key), [safeColumns]);
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
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
          <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Columns</span>
          <Badge variant="secondary" className="h-4 px-1 text-[10px] font-semibold ml-0.5">
            {visibleColumns.length}/{safeColumns.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 text-xs">
        <div className="flex items-center justify-between px-2 py-1.5 font-semibold text-xs text-muted-foreground border-b mb-1">
          <span>Toggle Visible Columns</span>
          <button
            type="button"
            onClick={handleResetColumns}
            className="text-[11px] text-primary hover:underline font-medium"
          >
            Show All
          </button>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
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
                className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={isVisible}
                    onCheckedChange={() => handleColumnToggle(col.key)}
                    className="h-3.5 w-3.5"
                  />
                  <span>{col.label}</span>
                </div>
                {isVisible && <Check className="w-3.5 h-3.5 text-primary" />}
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
      <div className="bg-primary/10 border border-primary/30 flex items-center gap-3 rounded-lg px-3.5 py-1.5 text-xs">
        <span className="font-semibold text-foreground">
          {selectedKeys.size} row{selectedKeys.size > 1 ? "s" : ""} selected
        </span>
        <div className="h-4 w-px bg-border" />
        {bulkActions}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectionChange?.(new Set())}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
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
        <div className="w-full rounded-xl border border-dashed border-border bg-card p-12 text-center flex flex-col items-center justify-center gap-2.5 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-1">
            {emptyIcon || <Inbox className="w-6 h-6 text-muted-foreground/70" />}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{emptyMessage}</h3>
          <p className="text-xs text-muted-foreground max-w-sm">{emptyDescription}</p>
        </div>
      </>
    );
  }

  // 100% Solid column divider styling
  const cellBorderClass = columnDividers ? "border-r border-border last:border-r-0" : "";
  const headBorderClass = columnDividers ? "border-r border-border last:border-r-0" : "";

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
                className="overflow-hidden border border-border bg-card shadow-xs transition-all hover:border-primary/50"
              >
                <CardContent className="p-4 space-y-2.5">
                  {selectable && (
                    <div className="flex items-center gap-2 pb-1.5 border-b border-border">
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
                    <div key={col.key} className="flex justify-between items-center gap-4 py-0.5 border-b border-border/40 last:border-b-0">
                      <span className="text-muted-foreground text-xs font-medium shrink-0">
                        {col.label}:
                      </span>
                      <div className="text-right text-xs font-normal whitespace-nowrap overflow-x-auto scrollbar-none">
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
        <div className="hidden overflow-hidden rounded-xl border border-border bg-background shadow-xs lg:block">
          <div className="overflow-x-auto scrollbar-thin">
            <Table style={{ minWidth }}>
              <TableHeader className={cn(stickyHeader ? "sticky top-0 z-10" : "", "bg-muted dark:bg-slate-900 border-b-2 border-border")}>
                <TableRow className="hover:bg-muted dark:hover:bg-slate-900 border-b-2 border-border">
                  {selectable && (
                    <TableHead className={cn("w-10 px-3.5 border-b-2 border-border", headBorderClass)}>
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
                      className={cn(
                        "whitespace-nowrap font-bold text-xs uppercase tracking-wider text-foreground border-b-2 border-border",
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                        headBorderClass,
                        col.className
                      )}
                    >
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="bg-background divide-y divide-border">
                {data.map((item, idx) => {
                  const itemKey = String(keyExtractor(item));
                  const isSelected = selectedKeys?.has(itemKey) ?? false;
                  return (
                    <TableRow
                      key={itemKey}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "transition-colors duration-150 border-b border-border",
                        isSelected
                          ? "bg-primary/10"
                          : striped && idx % 2 === 1
                          ? "bg-muted/40 hover:bg-muted dark:bg-slate-900/40 dark:hover:bg-slate-800"
                          : "bg-background hover:bg-muted/90 dark:hover:bg-slate-800/90"
                      )}
                    >
                      {selectable && (
                        <TableCell className={cn("w-10 px-3.5 border-b border-border", cellBorderClass)}>
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
                            "whitespace-nowrap px-4 py-3 text-sm font-normal text-foreground border-b border-border",
                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                            cellBorderClass,
                            col.className
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
        <div className="w-full overflow-hidden rounded-xl border border-border bg-background shadow-xs">
          <div
            ref={scrollContainerRef}
            className="overflow-auto scrollbar-thin"
            style={{ maxHeight: virtualMaxHeight }}
          >
            <Table style={{ minWidth }}>
              <TableHeader className="sticky top-0 z-10 bg-muted dark:bg-slate-900 border-b-2 border-border shadow-xs">
                <TableRow className="hover:bg-muted dark:hover:bg-slate-900 border-b-2 border-border">
                  {selectable && (
                    <TableHead className={cn("w-10 px-3.5 border-b-2 border-border", headBorderClass)}>
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
                      className={cn(
                        "whitespace-nowrap font-bold text-xs uppercase tracking-wider text-foreground border-b-2 border-border",
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                        headBorderClass,
                        col.className
                      )}
                    >
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="bg-background divide-y divide-border">
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
                        "transition-colors duration-150 border-b border-border",
                        isSelected
                          ? "bg-primary/10"
                          : striped && idx % 2 === 1
                          ? "bg-muted/40 hover:bg-muted dark:bg-slate-900/40 dark:hover:bg-slate-800"
                          : "bg-background hover:bg-muted/90 dark:hover:bg-slate-800/90"
                      )}
                    >
                      {selectable && (
                        <TableCell className={cn("w-10 px-3.5 border-b border-border", cellBorderClass)}>
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
                            "whitespace-nowrap px-4 py-3 text-sm font-normal text-foreground border-b border-border",
                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                            cellBorderClass,
                            col.className
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
      <div className="w-full overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        <div className="overflow-x-auto scrollbar-thin">
          <Table style={{ minWidth }}>
            <TableHeader className={cn(stickyHeader ? "sticky top-0 z-10" : "", "bg-muted dark:bg-slate-900 border-b-2 border-border")}>
              <TableRow className="hover:bg-muted dark:hover:bg-slate-900 border-b-2 border-border">
                {selectable && (
                  <TableHead className={cn("w-10 px-3.5 border-b-2 border-border", headBorderClass)}>
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
                    className={cn(
                      "whitespace-nowrap font-bold text-xs uppercase tracking-wider text-foreground border-b-2 border-border",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                      headBorderClass,
                      col.className
                    )}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="bg-background divide-y divide-border">
              {data.map((item, idx) => {
                const itemKey = String(keyExtractor(item));
                const isSelected = selectedKeys?.has(itemKey) ?? false;
                return (
                  <TableRow
                    key={itemKey}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(
                      "transition-colors duration-150 border-b border-border",
                      isSelected
                        ? "bg-primary/10"
                        : striped && idx % 2 === 1
                        ? "bg-muted/40 hover:bg-muted dark:bg-slate-900/40 dark:hover:bg-slate-800"
                        : "bg-background hover:bg-muted/90 dark:hover:bg-slate-800/90"
                    )}
                  >
                    {selectable && (
                      <TableCell className={cn("w-10 px-3.5 border-b border-border", cellBorderClass)}>
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
                          "whitespace-nowrap px-4 py-3 text-sm font-normal text-foreground border-b border-border",
                          col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                          cellBorderClass,
                          col.className
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
