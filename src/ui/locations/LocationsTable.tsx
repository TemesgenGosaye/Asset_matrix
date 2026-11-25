"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PlusIcon,
  SearchIcon,
  EditIcon,
  DeleteIcon,
  MoreVertical,
} from "../Icons";
import { ChevronRight, MapPin, GitMerge, Sparkles, Edit3, Power, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/feedback/notify";

const ROWS_PER_PAGE_OPTIONS = ["10", "20", "50", "100"];

interface DuplicateCluster {
  primary: { id: string; name: string; usageCount: number };
  candidates: { id: string; name: string; usageCount: number; reason: string }[];
}

export default function LocationsTable({ items }) {
  const [searchValue, setSearchValue] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [rowsPerPage, setRowsPerPage] = useState(
    Number(ROWS_PER_PAGE_OPTIONS[0]),
  );
  const [page, setPage] = useState(1);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationsData, setLocationsData] = useState(items);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Multi-select & merge states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);

  // Rename modal states
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Possible duplicates modal states
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicateClusters, setDuplicateClusters] = useState<DuplicateCluster[]>([]);

  const toggleExpand = (locationId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  };

  const countries = useMemo(() => {
    const unique = new Set<string>(
      locationsData
        .map((item) => item.country)
        .filter(
          (country): country is string =>
            typeof country === "string" && country.trim().length > 0,
        ),
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [locationsData]);

  // Build parent → children map
  const childrenMap = useMemo(() => {
    const map = new Map<string, typeof locationsData>();
    for (const loc of locationsData) {
      if (loc.parentId) {
        const existing = map.get(loc.parentId) || [];
        existing.push(loc);
        map.set(loc.parentId, existing);
      }
    }
    return map;
  }, [locationsData]);

  // Filter: show only top-level locations (no parentId), unless searching
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();
    const isSearching = normalizedQuery.length > 0;

    return locationsData.filter((item) => {
      // When not searching, only show top-level locations (children shown via expand)
      if (!isSearching && item.parentId) return false;

      const matchesSearch =
        !normalizedQuery ||
        [item.locationname, item.street, item.housenumber, item.city]
          .filter(Boolean)
          .some((value) =>
            value.toString().toLowerCase().includes(normalizedQuery),
          );

      const matchesCountry =
        countryFilter === "all" ||
        (item.country ?? "").toLowerCase() === countryFilter.toLowerCase();

      const itemActive = item.isActive !== false;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && itemActive) ||
        (statusFilter === "inactive" && !itemActive);

      return matchesSearch && matchesCountry && matchesStatus;
    });
  }, [locationsData, searchValue, countryFilter, statusFilter]);

  const pages = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, page, rowsPerPage]);

  const handleDelete = async (locationId: string) => {
    try {
      const response = await fetch("/api/location", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationid: locationId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete location");
      }

      const result = await response.json();

      notify.success({
        title: result.message,
        description: `${locationId} deleted`,
      });

      setLocationsData((prevItems) =>
        prevItems.filter((item) => item.locationid !== locationId),
      );
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error("Error deleting location:", error);
      notify.error({
        title: "Failed to delete location",
        description: error.message,
      });
    }
  };

  const toggleSelect = (locationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  };

  const handleToggleActive = async (item) => {
    const nextActive = item.isActive === false;
    try {
      const res = await fetch("/api/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationid: item.locationid,
          isActive: nextActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      setLocationsData((prev) =>
        prev.map((loc) =>
          loc.locationid === item.locationid
            ? { ...loc, isActive: nextActive }
            : loc,
        ),
      );
      notify.success(
        nextActive ? "Location reactivated" : "Location deactivated",
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleRenameSubmit = async () => {
    if (!selectedLocation || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch("/api/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationid: selectedLocation.locationid,
          locationname: renameValue.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename location");
      setLocationsData((prev) =>
        prev.map((loc) =>
          loc.locationid === selectedLocation.locationid
            ? { ...loc, locationname: data.locationname }
            : loc,
        ),
      );
      notify.success("Location renamed");
      setIsRenameModalOpen(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  };

  const handleMerge = async (sourceIds: string[], targetId: string) => {
    setMerging(true);
    try {
      const res = await fetch("/api/master-data/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "location", sourceIds, targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      notify.success(data.message || "Locations merged");

      const sourceSet = new Set(sourceIds.filter((id) => id !== targetId));
      const newTargetUsage = data.details?.targetLocation?.usageCount;
      setLocationsData((prev) =>
        prev.map((loc) => {
          if (sourceSet.has(loc.locationid)) {
            return { ...loc, isActive: false };
          }
          if (loc.locationid === targetId && typeof newTargetUsage === "number") {
            return { ...loc, usageCount: newTargetUsage };
          }
          return loc;
        }),
      );
      setSelectedIds(new Set());
      setIsMergeModalOpen(false);
      // Remove merged candidates from duplicateClusters if open
      setDuplicateClusters((prev) =>
        prev
          .map((cluster) => ({
            ...cluster,
            candidates: cluster.candidates.filter((c) => !sourceSet.has(c.id)),
          }))
          .filter((cluster) => cluster.candidates.length > 0),
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  const openDuplicatesModal = async () => {
    setIsDuplicatesOpen(true);
    setDuplicatesLoading(true);
    try {
      const res = await fetch("/api/master-data/duplicates?type=location");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load duplicates");
      setDuplicateClusters(data.clusters || []);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Failed to load duplicates");
    } finally {
      setDuplicatesLoading(false);
    }
  };

  const renderActions = (item) => (
    <div className="flex items-center gap-1">
      <Button
        className="text-muted-foreground h-7 w-7 cursor-pointer hover:opacity-80"
        size="icon"
        variant="ghost"
        asChild
      >
        <Link href={`/locations/${item.locationid}/edit`}>
          <EditIcon className="h-4 w-4" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="text-muted-foreground h-7 w-7 cursor-pointer hover:opacity-80"
            size="icon"
            variant="ghost"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setSelectedLocation(item);
              setRenameValue(item.locationname ?? "");
              setIsRenameModalOpen(true);
            }}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleToggleActive(item)}>
            <Power className="mr-2 h-4 w-4" />
            {item.isActive === false ? "Reactivate" : "Deactivate"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={(item.usageCount ?? 0) > 0}
            onClick={() => {
              setSelectedLocation(item);
              setIsDeleteModalOpen(true);
            }}
          >
            <DeleteIcon className="mr-2 h-4 w-4" />
            {(item.usageCount ?? 0) > 0 ? "Delete (In Use)" : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const renderLocationRow = (item, depth = 0) => {
    const children = childrenMap.get(item.locationid) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedRows.has(item.locationid);

    return (
      <React.Fragment key={item.locationid}>
        <TableRow className={depth > 0 ? "bg-muted/30" : ""}>
          <TableCell className="w-10">
            <Checkbox
              aria-label={`Select ${item.locationname ?? "location"}`}
              checked={selectedIds.has(item.locationid)}
              onCheckedChange={() => toggleSelect(item.locationid)}
            />
          </TableCell>
          <TableCell>
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: `${depth * 24}px` }}
            >
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(item.locationid)}
                  className="hover:bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded"
                >
                  <ChevronRight
                    className={`text-muted-foreground h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <MapPin className="text-muted-foreground/50 h-3.5 w-3.5" />
                </span>
              )}
              <span className={depth === 0 && hasChildren ? "font-medium" : ""}>
                {item.locationname ?? "(unnamed)"}
              </span>
              {item.isActive === false && (
                <Badge variant="secondary" className="text-[10px]">
                  Inactive
                </Badge>
              )}
              {hasChildren && (
                <span className="text-muted-foreground text-xs">
                  ({children.length})
                </span>
              )}
            </div>
          </TableCell>
          <TableCell className="font-mono text-xs">
            {item.usageCount ?? 0}
          </TableCell>
          <TableCell>
            {item.street
              ? `${item.street} ${item.housenumber ?? ""}`.trim()
              : "-"}
          </TableCell>
          <TableCell>{item.city ?? "-"}</TableCell>
          <TableCell>{item.country ?? "-"}</TableCell>
          <TableCell>{renderActions(item)}</TableCell>
        </TableRow>
        {isExpanded &&
          children.map((child) => renderLocationRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Locations: ቦታዎች</h1>
        <div className="flex items-center gap-2">
          {selectedIds.size >= 2 && (
            <Button
              variant="secondary"
              onClick={() => {
                const firstSelected = Array.from(selectedIds)[0] || "";
                setMergeTargetId(firstSelected);
                setIsMergeModalOpen(true);
              }}
            >
              <GitMerge className="mr-2 h-4 w-4" />
              Merge ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={openDuplicatesModal}>
            <Sparkles className="mr-2 h-4 w-4" />
            Possible Duplicates
          </Button>
          <Button asChild>
            <Link href="/locations/create">
              <PlusIcon className="mr-2 h-4 w-4" />
              Create
            </Link>
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search by name or address details"
            autoFocus
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={countryFilter}
          onValueChange={(v) => {
            setCountryFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {countries.map((country) => (
              <SelectItem key={country} value={country}>
                {country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {filteredItems.length} locations
        </span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(value) => {
            setRowsPerPage(Number(value));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROWS_PER_PAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tree table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Usage</TableHead>
              <TableHead>Street</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-24 text-center"
                >
                  No locations found
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => renderLocationRow(item))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1 || filteredItems.length === 0}
        >
          Previous
        </Button>
        <span className="text-sm">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.min(pages, page + 1))}
          disabled={page === pages || filteredItems.length === 0}
        >
          Next
        </Button>
      </div>

      {/* Delete confirmation */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete location &quot;
              {selectedLocation?.locationname}&quot;? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(selectedLocation?.locationid)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Location</DialogTitle>
            <DialogDescription>
              Update the master display name for &quot;
              {selectedLocation?.locationname}&quot;.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Location name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={renaming || !renameValue.trim()}
              onClick={handleRenameSubmit}
            >
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Modal */}
      <Dialog open={isMergeModalOpen} onOpenChange={setIsMergeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selectedIds.size} Locations</DialogTitle>
            <DialogDescription>
              Choose the canonical target location. All assets referencing the
              other selected locations will be re-pointed to the target, and the
              source entries will be deactivated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Target Location</label>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose target..." />
              </SelectTrigger>
              <SelectContent>
                {locationsData
                  .filter((l) => selectedIds.has(l.locationid))
                  .map((l) => (
                    <SelectItem key={l.locationid} value={l.locationid}>
                      {l.locationname} ({l.usageCount ?? 0} uses)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsMergeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={merging || !mergeTargetId}
              onClick={() =>
                handleMerge(Array.from(selectedIds), mergeTargetId)
              }
            >
              {merging ? "Merging..." : "Confirm Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Possible Duplicates Modal */}
      <Dialog open={isDuplicatesOpen} onOpenChange={setIsDuplicatesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Possible Duplicate Locations</DialogTitle>
            <DialogDescription>
              Similar spellings and abbreviations detected in active locations.
              Review carefully before merging.
            </DialogDescription>
          </DialogHeader>
          {duplicatesLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning
              locations...
            </div>
          ) : duplicateClusters.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No likely duplicates found among top active locations.
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {duplicateClusters.map((cluster) => (
                <div
                  key={cluster.primary.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">
                        {cluster.primary.name}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({cluster.primary.usageCount} uses — Primary)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5 pl-3 border-l-2 border-muted">
                    {cluster.candidates.map((cand) => (
                      <div
                        key={cand.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <div>
                          <span>{cand.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({cand.usageCount} uses · {cand.reason})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={merging}
                          onClick={() =>
                            handleMerge([cand.id], cluster.primary.id)
                          }
                        >
                          Merge into Primary
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
