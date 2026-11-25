"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { Check, ChevronsUpDown, X, Loader2, Plus, AlertCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/feedback/notify";

export interface MasterOption {
  id: string;
  name: string;
  code?: string | null;
  usageCount: number;
  departmentUsageCount?: number;
  isLegacy?: boolean;
}

interface SearchableComboboxProps {
  value: string;
  onChange: (value: string, item?: MasterOption | null) => void;
  type: "location1" | "location2" | "location" | "category" | "department" | "status";
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
}

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
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [options, setOptions] = useState<MasterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  // Quick-create dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createWarning, setCreateWarning] = useState<string | null>(null);
  const [existingNearMatch, setExistingNearMatch] = useState<MasterOption | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch options whenever debouncedQuery, type, or departmentId changes
  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        type,
        q: debouncedQuery,
        limit: "50",
      });
      if (departmentId) params.set("departmentId", departmentId);
      if (value) params.set("currentId", value);
      if (currentValue) params.set("currentValue", currentValue);

      const res = await fetch(`/api/master-options?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load options");
      }
      const data = await res.json();
      setOptions(data.items || []);
      setHighlightedIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading options");
    } finally {
      setLoading(false);
    }
  }, [type, debouncedQuery, departmentId, value, currentValue]);

  // Initial and reactive fetch
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  // Selected option label resolution
  const selectedOption = useMemo(() => {
    const found = options.find((opt) => opt.id === value);
    if (found) return found;
    if (currentValue && !value) {
      return {
        id: `legacy:${currentValue}`,
        name: currentValue,
        usageCount: 0,
        isLegacy: true,
      };
    }
    return null;
  }, [options, value, currentValue]);

  // Virtualizer for options list inside PopoverContent
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 5,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(highlightedIndex + 1, options.length - 1);
      setHighlightedIndex(next);
      virtualizer.scrollToIndex(next, { align: "auto" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(highlightedIndex - 1, 0);
      setHighlightedIndex(prev);
      virtualizer.scrollToIndex(prev, { align: "auto" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlightedIndex];
      if (opt) {
        onChange(opt.id, opt);
        setOpen(false);
      }
    }
  };

  // Handle "Add new..." action
  const handleCreateSubmit = async (force = false) => {
    const trimmed = newOptionName.trim();
    if (!trimmed) return;

    setCreating(true);
    setCreateWarning(null);
    try {
      const res = await fetch("/api/master-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: trimmed, force }),
      });
      const data = await res.json();

      if (res.status === 409) {
        if (data.duplicate) {
          // Exact duplicate exists
          notify.error(data.warning);
          if (data.existingItem) {
            onChange(data.existingItem.id, data.existingItem);
            setCreateDialogOpen(false);
            setOpen(false);
          }
          return;
        }
        if (data.requiresConfirmation) {
          // Near duplicate exists, warn and allow force add
          setCreateWarning(data.warning);
          setExistingNearMatch(data.nearMatch);
          return;
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to create option");
      }

      const created = data.item;
      notify.success({
        title: "Option created",
        description: `Added "${created.name}" to master list.`,
      });

      // Update options list and select newly created item
      setOptions((prev) => [created, ...prev]);
      onChange(created.id, created);
      setCreateDialogOpen(false);
      setOpen(false);
      setNewOptionName("");
      setCreateWarning(null);
    } catch (err) {
      notify.error({
        title: "Creation failed",
        description: err instanceof Error ? err.message : "Error creating option",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={id} className="text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative flex items-center">
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label={ariaLabel || label || placeholder}
              disabled={disabled}
              className={cn(
                "h-10 w-full justify-between bg-background px-3 text-left font-normal text-sm shadow-xs",
                !value && !currentValue && "text-muted-foreground",
                selectedOption?.isLegacy && "border-amber-500/60 bg-amber-500/5 text-amber-900 dark:text-amber-200"
              )}
            >
              <span className="truncate pr-4">
                {selectedOption ? (
                  selectedOption.isLegacy ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-300">
                        Current (not in list)
                      </span>
                      <span>{selectedOption.name}</span>
                    </span>
                  ) : (
                    <span>
                      {selectedOption.code ? `[${selectedOption.code}] ` : ""}
                      {selectedOption.name}
                    </span>
                  )
                ) : (
                  placeholder
                )}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
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
              className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 shadow-lg"
          align="start"
        >
          {/* Search box input */}
          <div className="flex items-center border-b px-3 py-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or type to filter..."
              aria-activedescendant={
                options[highlightedIndex]
                  ? `${id || "combobox"}-opt-${highlightedIndex}`
                  : undefined
              }
              className="h-8 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm"
              autoFocus
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* Quick department usage note */}
          {departmentId && (
            <div className="bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground border-b flex justify-between">
              <span>Department-used options first</span>
              <span>All options available</span>
            </div>
          )}

          {/* Options container with virtualization */}
          <div
            ref={parentRef}
            className="max-h-60 overflow-y-auto overflow-x-hidden p-1 text-sm"
            role="listbox"
          >
            {error && (
              <div className="p-3 text-center text-xs text-destructive">
                {error}
              </div>
            )}

            {!loading && options.length === 0 && !error && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No matching options found.
              </div>
            )}

            {options.length > 0 && (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const opt = options[virtualRow.index];
                  const isSelected = opt.id === value;
                  const isHighlighted = virtualRow.index === highlightedIndex;

                  return (
                    <div
                      key={opt.id}
                      id={`${id || "combobox"}-opt-${virtualRow.index}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightedIndex(virtualRow.index)}
                      onClick={() => {
                        onChange(opt.id, opt);
                        setOpen(false);
                      }}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-sm transition-colors select-none hover:bg-accent hover:text-accent-foreground",
                        isHighlighted && "bg-accent text-accent-foreground",
                        isSelected && "bg-accent/80 font-medium",
                        opt.isLegacy && "text-amber-800 dark:text-amber-300"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isSelected ? "opacity-100 text-primary" : "opacity-0"
                          )}
                        />
                        <span className="truncate">
                          {opt.code ? (
                            <span className="font-mono text-xs text-muted-foreground mr-1.5">
                              {opt.code}
                            </span>
                          ) : null}
                          {opt.name}
                        </span>
                      </div>

                      {/* Small usage count badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {opt.isLegacy ? (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            Legacy
                          </span>
                        ) : (
                          <>
                            {opt.departmentUsageCount ? (
                              <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary" title="Department usage count">
                                Dept: {opt.departmentUsageCount}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-muted-foreground" title="Global asset usage count">
                              {opt.usageCount}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add new option footer */}
          {allowCreate && (
            <div className="border-t p-1 bg-muted/20">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-normal h-8 text-primary"
                onClick={() => {
                  setNewOptionName(searchQuery.trim());
                  setCreateWarning(null);
                  setExistingNearMatch(null);
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add &quot;{searchQuery.trim() || "new option"}&quot;...
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Quick-Create Confirmation Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New {type.startsWith("location") ? "Location" : type === "category" ? "Category Code" : "Option"}</DialogTitle>
            <DialogDescription>
              Create a new master entry. The system checks for near-duplicates to prevent spelling fragmentation.
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

            {/* Near-duplicate warning banner */}
            {createWarning && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Possible duplicate detected</span>
                </div>
                <p>{createWarning}</p>
                {existingNearMatch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-background text-foreground"
                    onClick={() => {
                      onChange(existingNearMatch.id, existingNearMatch);
                      setCreateDialogOpen(false);
                      setOpen(false);
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
