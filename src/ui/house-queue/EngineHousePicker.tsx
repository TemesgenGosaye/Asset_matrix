"use client";

import React, { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, MapPin, PackageSearch } from "lucide-react";
import { HouseCategoryBadge } from "@/ui/household/house-status";

export interface PickerHouse {
  id: string;
  houseNumber: string;
  hid: string;
  houseType: string;
  rgType: string;
  locationName: string | null;
}

interface EngineHousePickerProps {
  /** Houses already ordered by Engine B's recommendation rank. */
  houses: PickerHouse[];
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyAction?: React.ReactNode;
  selectedId: string | null;
  onSelect: (houseId: string) => void;
  /** Shrink the picker on short viewports; default max-h-420px. */
  maxHeightClass?: string;
}

/**
 * Scrollable, keyboard-navigable picker of recommendation-ranked houses.
 * Shared by the Release/Tran overflow surfaces so every ranked house list in
 * the module looks and behaves identically.
 */
export default function EngineHousePicker({
  houses,
  loading = false,
  loadingLabel = "Running Engine B recommendations…",
  emptyLabel = "No eligible open houses in this grade band.",
  emptyAction,
  selectedId,
  onSelect,
  maxHeightClass,
}: EngineHousePickerProps) {
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const scrollIntoView = (index: number) => {
    rowRefs.current[index]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  };

  const moveFocus = (from: number, delta: number) => {
    if (houses.length === 0) return;
    const next = Math.min(houses.length - 1, Math.max(0, from + delta));
    rowRefs.current[next]?.focus();
    scrollIntoView(next);
  };

  const handleRowKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(index, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(index, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      rowRefs.current[0]?.focus();
      scrollIntoView(0);
    } else if (e.key === "End") {
      e.preventDefault();
      rowRefs.current[houses.length - 1]?.focus();
      scrollIntoView(houses.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(houses[index].id);
    }
  };

  if (loading) {
    return (
      <div
        aria-busy="true"
        className="flex h-56 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20"
      >
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">{loadingLabel}</p>
      </div>
    );
  }

  if (houses.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 text-center">
        <PackageSearch className="h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        {emptyAction && <div className="mt-1">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Open houses ranked by Engine B"
      className={`flex flex-col overflow-hidden rounded-lg border ${
        maxHeightClass ?? "max-h-[420px]"
      }`}
    >
      <div
        role="presentation"
        aria-hidden="true"
        className="grid shrink-0 grid-cols-[2.5rem_1fr_5rem_3.5rem_1fr_2rem] items-center gap-x-2 border-b bg-muted/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur sm:grid-cols-[2.5rem_1.25fr_0.75fr_5rem_4rem_1.5fr_2rem]"
      >
        <span>#</span>
        <span>House</span>
        <span className="hidden sm:block">HID</span>
        <span className="text-center">Type</span>
        <span className="text-center">R/G</span>
        <span className="hidden sm:block">Location</span>
        <span className="sr-only">Select</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {houses.map((house, index) => {
          const selected = house.id === selectedId;
          return (
            <button
              key={house.id}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => onSelect(house.id)}
              onKeyDown={(e) => handleRowKeyDown(e, index)}
              className={`grid w-full cursor-pointer grid-cols-[2.5rem_1fr_5rem_3.5rem_1fr_2rem] items-center gap-x-2 border-b border-border/60 px-3 py-2 text-left text-sm transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[2.5rem_1.25fr_0.75fr_5rem_4rem_1.5fr_2rem] ${
                selected
                  ? "bg-primary/10 ring-1 ring-inset ring-primary"
                  : "hover:bg-muted/40 focus-visible:bg-muted/40"
              }`}
            >
              <span className="tabular-nums text-xs text-muted-foreground">
                #{index + 1}
              </span>
              <span className="font-semibold">{house.houseNumber}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                {house.hid}
              </span>
              <span className="flex justify-center">
                <HouseCategoryBadge category={house.houseType} />
              </span>
              <span className="flex justify-center">
                <Badge variant="outline">{house.rgType}</Badge>
              </span>
              <span className="hidden items-center gap-1 truncate text-xs text-muted-foreground sm:flex">
                <MapPin className="h-3 w-3 shrink-0" />
                {house.locationName ?? "Location not set"}
              </span>
              <span
                className={`flex justify-end ${
                  selected ? "text-primary" : "text-transparent"
                }`}
                aria-hidden="true"
              >
                <Check className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>
      <p className="shrink-0 border-t bg-card/95 px-3 py-1.5 text-center text-[11px] text-muted-foreground backdrop-blur">
        {houses.length} eligible open house{houses.length === 1 ? "" : "s"} ·
        use ↑ ↓ + Enter to navigate
      </p>
    </div>
  );
}