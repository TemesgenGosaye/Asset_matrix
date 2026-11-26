"use client";

/**
 * SearchableCombobox
 *
 * A fully-featured combobox for master-list dropdowns:
 * - Options pre-fetched and cached via master-options-cache (opens instantly)
 * - @tanstack/react-virtual for large lists (asset names, locations)
 * - Popover via Radix PopoverContent (portal, correct z-index, never clipped)
 * - Solid-blue hover / keyboard focus — matches /assets Department filter
 * - Selected option scrolled into view on open
 * - Keyboard: Arrow up/down, Home, End, Enter, Escape, type-ahead
 * - Loading → skeleton rows; Error → message + Retry button; Empty → "No results"
 * - Quick-create dialog preserved for location / category / assetName types
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  ChevronDown,
  X,
  Loader2,
  Plus,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  filterSelectListClass,
  filterSelectOptionClass,
  filterSelectPopoverClass,
  filterSelectTriggerClass,
} from "@/lib/select-styles";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/feedback/notify";
import {
  fetchMasterOptions,
  invalidateMasterOptions,
  type MasterOption,
  type MasterOptionType,
} from "@/lib/master-options-cache";

// Re-export so callers that import MasterOption from here still work
export type { MasterOption };

function safeColor(color?: string | null): string | null {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  return color;
}

interface SearchableComboboxProps {
  value: string;
  onChange: (value: string, item?: MasterOption | null) => void;
  type: MasterOptionType;
  departmentId?: string | null;
  currentValue?: string | null;
  placeholder?: string;
  label?: string;
  id?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  className?: string;
  ariaLabel?: string;
  required?: boolean;
  compact?: boolean;
}

/** Rows to show in virtual list before scrolling */
const VIRTUAL_ROW_HEIGHT = 36; // px — matches py-1.5 + text-sm
/** Only virtualise when list exceeds this count (saves overhead for small lists) */
const VIRTUAL_THRESHOLD = 60;

export default function SearchableCombobox({
  value,
  onChange,
  type,
  departmentId,
  currentValue,
  placeholder = "Select option...",
  label,
  id,
  disabled = false,
  allowCreate = true,
  className,
  ariaLabel,
  required = false,
  compact = false,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allOptions, setAllOptions] = useState<MasterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Quick-create dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createWarning, setCreateWarning] = useState<string | null>(null);
  const [existingNearMatch, setExistingNearMatch] =
    useState<MasterOption | null>(null);

  // Stable refs — avoid stale closures without adding to dep arrays
  const valueRef = useRef(value);
  const currentValueRef = useRef(currentValue);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    currentValueRef.current = currentValue;
  }, [currentValue]);

  // ─── Fetch / cache ─────────────────────────────────────────────────────────

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const items = await fetchMasterOptions(
          type,
          departmentId ?? null,
          "",
          valueRef.current || undefined,
          currentValueRef.current || undefined,
        );
        setAllOptions(items);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading options");
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    },
    [type, departmentId],
  );

  // Prefetch on mount so the first open is instant
  useEffect(() => {
    load();
  }, [load]);

  // Re-load when departmentId changes (location scoping)
  const prevDeptRef = useRef(departmentId);
  useEffect(() => {
    if (prevDeptRef.current !== departmentId) {
      prevDeptRef.current = departmentId;
      load(true);
    }
  }, [departmentId, load]);

  // ─── Client-side search filter ──────────────────────────────────────────────

  const options = useMemo(() => {
    if (!searchQuery.trim()) return allOptions;
    const q = searchQuery.toLowerCase();
    return allOptions.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        (opt.code?.toLowerCase().includes(q) ?? false),
    );
  }, [allOptions, searchQuery]);

  // ─── Keyboard handling ──────────────────────────────────────────────────────

  const closePopover = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
    setHighlightedIndex(0);
  }, []);

  const selectOption = useCallback(
    (option: MasterOption) => {
      if (option.isLegacy) {
        onChange("", null);
      } else {
        onChange(option.id, option);
      }
      closePopover();
    },
    [onChange, closePopover],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePopover();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setHighlightedIndex(Math.max(0, options.length - 1));
      return;
    }
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlightedIndex];
      if (opt) selectOption(opt);
    }
  };

  // ─── Selected option label ──────────────────────────────────────────────────

  const selectedOption = useMemo(() => {
    const found = allOptions.find((opt) => opt.id === value);
    if (found) return found;
    if (currentValue && !value) {
      return {
        id: `legacy:${currentValue}`,
        name: currentValue,
        usageCount: 0,
        isLegacy: true,
      } as MasterOption;
    }
    return null;
  }, [allOptions, value, currentValue]);

  // ─── Scroll-to-selected on open ─────────────────────────────────────────────

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Scroll the currently selected item into view when the popover opens
    if (!value) return;
    const selectedIdx = options.findIndex((o) => o.id === value);
    if (selectedIdx >= 0) {
      setTimeout(() => {
        setHighlightedIndex(selectedIdx);
      }, 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll highlighted row into view (non-virtual path)
  useEffect(() => {
    if (!open || options.length > VIRTUAL_THRESHOLD) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${highlightedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open, options.length]);

  // ─── Virtualizer (for large lists) ─────────────────────────────────────────

  const useVirtual = options.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: useVirtual ? options.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: 8,
  });

  // Scroll virtual list to highlighted index
  useEffect(() => {
    if (!open || !useVirtual) return;
    virtualizer.scrollToIndex(highlightedIndex, { align: "auto" });
  }, [highlightedIndex, open, useVirtual]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Quick-create ───────────────────────────────────────────────────────────

  const handleCreateSubmit = async (force = false) => {
    const trimmed = newOptionName.trim();
    if (!trimmed) return;

    setCreating(true);
    setCreateWarning(null);
    try {
      if (type === "assetName") {
        const option: MasterOption = {
          id: trimmed,
          name: trimmed,
          usageCount: 0,
        };
        setAllOptions((prev) => [option, ...prev]);
        onChange(option.id, option);
        notify.success({
          title: "Asset name added",
          description: `Using "${trimmed}" on this asset.`,
        });
        setCreateDialogOpen(false);
        closePopover();
        setNewOptionName("");
        setCreateWarning(null);
        return;
      }

      const res = await fetch("/api/master-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: trimmed, force }),
      });
      const data = await res.json();

      if (res.status === 409) {
        if (data.duplicate) {
          notify.error(data.warning);
          if (data.existingItem) {
            onChange(data.existingItem.id, data.existingItem);
            setCreateDialogOpen(false);
            closePopover();
          }
          return;
        }
        if (data.requiresConfirmation) {
          setCreateWarning(data.warning);
          setExistingNearMatch(data.nearMatch);
          return;
        }
      }

      if (!res.ok) throw new Error(data.error || "Failed to create option");

      const created = data.item as MasterOption;
      notify.success({
        title: "Option created",
        description: `Added "${created.name}" to master list.`,
      });

      // Invalidate cache so next open gets fresh data
      invalidateMasterOptions(type, departmentId ?? null);
      setAllOptions((prev) => [created, ...prev]);
      onChange(created.id, created);
      setCreateDialogOpen(false);
      closePopover();
      setNewOptionName("");
      setCreateWarning(null);
    } catch (err) {
      notify.error({
        title: "Creation failed",
        description:
          err instanceof Error ? err.message : "Error creating option",
      });
    } finally {
      setCreating(false);
    }
  };

  // ─── Option row renderer ────────────────────────────────────────────────────

  function OptionRow({
    opt,
    index,
    style,
  }: {
    opt: MasterOption;
    index: number;
    style?: React.CSSProperties;
  }) {
    const isSelected = opt.id === value;
    const isHighlighted = index === highlightedIndex;
    const isActive = isHighlighted || isSelected;

    return (
      <div
        key={opt.id}
        id={`${id || "combobox"}-opt-${index}`}
        data-option-index={index}
        role="option"
        aria-selected={isSelected}
        data-highlighted={isHighlighted ? "true" : undefined}
        data-selected={isSelected ? "true" : undefined}
        style={style}
        onMouseEnter={() => setHighlightedIndex(index)}
        onClick={() => selectOption(opt)}
        className={cn(
          filterSelectOptionClass,
          "cursor-pointer",
          // Solid blue on hover/highlight (matches /assets Department filter)
          isHighlighted && !isSelected && "bg-primary text-primary-foreground",
          // Selected: strong tint + check
          isSelected && "bg-primary text-primary-foreground font-semibold",
          // Unselected + unhovered
          !isActive && "hover:bg-primary hover:text-primary-foreground",
          // Legacy warning tint (only when not active)
          opt.isLegacy && !isActive && "text-amber-800 dark:text-amber-300",
        )}
      >
        {/* Check mark */}
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check
            className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
          />
        </span>

        {/* Label */}
        <div className="flex min-w-0 items-center gap-2 pr-2">
          {safeColor(opt.color) && (
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-3 w-3 shrink-0 rounded-full border",
                isActive
                  ? "border-primary-foreground/40"
                  : "border-foreground/20",
              )}
              style={{ backgroundColor: safeColor(opt.color) ?? undefined }}
            />
          )}
          <span className="truncate">
            {opt.code ? (
              <span
                className={cn(
                  "combobox-badge mr-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                {opt.code}
              </span>
            ) : null}
            <span className="truncate">{opt.name}</span>
          </span>
          {opt.isCurrent && (
            <span
              className={cn(
                "combobox-badge shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-amber-500/20 text-amber-700 dark:text-amber-300",
              )}
            >
              Current
            </span>
          )}
        </div>

        {/* Usage badges */}
        <div className="flex shrink-0 items-center gap-1">
          {opt.isLegacy ? (
            <span
              className={cn(
                "combobox-badge rounded px-1.5 py-0.5 text-[10px] font-semibold",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-amber-500/20 text-amber-700 dark:text-amber-300",
              )}
            >
              Legacy
            </span>
          ) : type !== "employee" ? (
            <>
              {opt.departmentUsageCount ? (
                <span
                  className={cn(
                    "combobox-badge rounded px-1 py-0.5 text-[10px] font-medium",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                  title="Department usage count"
                >
                  Dept: {opt.departmentUsageCount}
                </span>
              ) : null}
              <span
                className={cn(
                  "combobox-count text-[11px]",
                  isActive
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
                title="Global asset usage count"
              >
                {opt.usageCount}
              </span>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label
          htmlFor={id}
          className={compact ? "text-xs font-medium" : "text-sm font-medium"}
        >
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true);
          else closePopover();
        }}
      >
        <div className="relative flex items-center">
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-label={ariaLabel || label || placeholder}
              disabled={disabled}
              className={cn(
                filterSelectTriggerClass,
                "text-left",
                !value && !currentValue && "text-muted-foreground",
                !!selectedOption &&
                  !selectedOption.isLegacy &&
                  !selectedOption.isCurrent &&
                  "border-primary/40 bg-primary/5 text-primary",
                (selectedOption?.isLegacy || selectedOption?.isCurrent) &&
                  "border-amber-500/60 bg-amber-500/5 text-amber-900 dark:text-amber-200",
              )}
            >
              <span className="truncate pr-4">
                {selectedOption ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                    {(selectedOption.isLegacy || selectedOption.isCurrent) && (
                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-300">
                        Current (not in list)
                      </span>
                    )}
                    {safeColor(selectedOption.color) && (
                      <span
                        aria-hidden="true"
                        className="border-foreground/20 inline-block h-3 w-3 shrink-0 rounded-full border"
                        style={{
                          backgroundColor:
                            safeColor(selectedOption.color) ?? undefined,
                        }}
                      />
                    )}
                    {selectedOption.code && (
                      <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                        {selectedOption.code}
                      </span>
                    )}
                    <span className="truncate">{selectedOption.name}</span>
                  </span>
                ) : (
                  placeholder
                )}
              </span>
              {loading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-40" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              )}
            </Button>
          </PopoverTrigger>

          {/* Clear button */}
          {(value || currentValue) && !disabled && (
            <button
              type="button"
              aria-label={`Clear ${label || "selection"}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange("", null);
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-8 -translate-y-1/2 rounded p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Popover renders in a Radix portal — always above modal, never clipped */}
        <PopoverContent
          className={cn(filterSelectPopoverClass, "z-[200]")}
          align="start"
          sideOffset={4}
          avoidCollisions
        >
          {/* ── Search box — pinned at top ── */}
          <div className="flex items-center border-b px-3 py-2">
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or type to filter..."
              aria-activedescendant={
                options[highlightedIndex]
                  ? `${id || "combobox"}-opt-${highlightedIndex}`
                  : undefined
              }
              className="h-8 border-none bg-transparent text-sm shadow-none focus-visible:ring-0"
              autoFocus
            />
            {loading && (
              <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
            )}
          </div>

          {/* Department usage note */}
          {departmentId && (
            <div className="bg-muted/40 text-muted-foreground flex justify-between border-b px-3 py-1 text-[11px]">
              <span>Department-used options first</span>
              <span>All options available</span>
            </div>
          )}

          {/* ── List area — max 320px, scrolls independently ── */}
          <div
            ref={listRef}
            className={cn(
              filterSelectListClass,
              "max-h-80 overflow-x-hidden overflow-y-auto overscroll-contain p-1 text-sm",
            )}
            role="listbox"
            aria-busy={loading}
            aria-label={ariaLabel || label || placeholder}
            style={{ scrollbarGutter: "stable" }}
            onWheel={(e) => {
              // Allow mouse-wheel to scroll this list without bubbling to the modal behind it
              e.stopPropagation();
            }}
          >
            {/* Loading skeleton */}
            {!loaded && !error && (
              <div
                className="space-y-1 p-1"
                role="status"
                aria-live="polite"
                aria-label="Loading options"
              >
                {[0, 1, 2, 3, 4].map((row) => (
                  <div
                    key={row}
                    className="bg-muted/70 h-8 animate-pulse rounded-md"
                  />
                ))}
              </div>
            )}

            {/* Error state with Retry */}
            {error && (
              <div className="flex flex-col items-center gap-2 py-5 text-center">
                <AlertCircle className="text-destructive h-5 w-5" />
                <p className="text-destructive text-xs">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => load(true)}
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}

            {/* Empty state */}
            {loaded && !loading && !error && options.length === 0 && (
              <div className="text-muted-foreground py-6 text-center text-xs">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : "No options available."}
              </div>
            )}

            {/* ── Virtual list (large datasets) ── */}
            {loaded && options.length > 0 && useVirtual && (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((vItem) => (
                  <OptionRow
                    key={vItem.key}
                    opt={options[vItem.index]}
                    index={vItem.index}
                    style={{
                      position: "absolute",
                      top: vItem.start,
                      left: 0,
                      right: 0,
                      height: `${vItem.size}px`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* ── Normal list (small datasets) ── */}
            {loaded && options.length > 0 && !useVirtual && (
              <div className="space-y-0.5">
                {options.map((opt, index) => (
                  <OptionRow key={opt.id} opt={opt} index={index} />
                ))}
              </div>
            )}
          </div>

          {/* ── Add new option footer ── */}
          {allowCreate && !error && loaded && (
            <div className="bg-muted/20 border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:bg-primary hover:text-primary-foreground h-8 w-full justify-start text-xs font-normal"
                onClick={() => {
                  setNewOptionName(searchQuery.trim());
                  setCreateWarning(null);
                  setExistingNearMatch(null);
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add &quot;
                {searchQuery.trim() ||
                  (type === "assetName" ? "new asset name" : "new option")}
                &quot;...
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Quick-Create Confirmation Dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add New{" "}
              {type.startsWith("location")
                ? "Location"
                : type === "category"
                  ? "Category Code"
                  : type === "assetName"
                    ? "Asset Name"
                    : "Option"}
            </DialogTitle>
            <DialogDescription>
              {type === "assetName"
                ? "Use this name on the asset. Existing register names are shown first."
                : "Create a new master entry. The system checks for near-duplicates to prevent spelling fragmentation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name / Display Value</Label>
              <Input
                id="new-name"
                value={newOptionName}
                onChange={(e) => {
                  setNewOptionName(e.target.value);
                  setCreateWarning(null);
                }}
                placeholder="Enter standard name"
                autoFocus
              />
            </div>

            {/* Near-duplicate warning */}
            {createWarning && (
              <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Possible duplicate detected</span>
                </div>
                <p>{createWarning}</p>
                {existingNearMatch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-background text-foreground h-7 text-xs"
                    onClick={() => {
                      onChange(existingNearMatch.id, existingNearMatch);
                      setCreateDialogOpen(false);
                      closePopover();
                    }}
                  >
                    Use existing: &quot;{existingNearMatch.name}&quot;
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !newOptionName.trim()}
              onClick={() => handleCreateSubmit(Boolean(createWarning))}
            >
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : createWarning ? (
                "Confirm & Add Anyway"
              ) : (
                "Save & Select"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
