"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Warehouse,
  MapPin,
  CalendarClock,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import {
  GENERAL_ASSET_ITEM_TYPES,
  GENERAL_ASSET_CONDITIONS,
} from "@/lib/general-asset-presets";

interface LocationItem {
  locationid: string;
  locationname: string | null;
}

interface GeneralAssetItem {
  id?: string;
  srNo?: number;
  itemType: string;
  pid: string;
  category: string;
  locationId?: string | null;
  locationName?: string | null;
  condition: string;
  brand?: string | null;
  reviewsDate?: string | null;
  remark?: string | null;
}

interface GeneralAssetFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: GeneralAssetItem | null;
  locations: LocationItem[];
  onSuccess: (savedItem: GeneralAssetItem) => void;
}

export default function GeneralAssetFormModal({
  open,
  onOpenChange,
  initialData,
  locations,
  onSuccess,
}: GeneralAssetFormModalProps) {
  const isEditing = !!initialData?.id;

  const [loading, setLoading] = useState(false);
  const [fetchingPid, setFetchingPid] = useState(false);

  // Form State
  const [itemType, setItemType] = useState("Machinery & Equipment");
  const [pid, setPid] = useState("");
  const [category, setCategory] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [condition, setCondition] = useState("Good");
  const [brand, setBrand] = useState("");
  const [reviewsDate, setReviewsDate] = useState("");
  const [remark, setRemark] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  // Reset or populate the form when the modal opens / target record changes.
  // Render-phase state adjustment (React "adjusting state during render" pattern).
  const formKey = `${initialData?.id ?? "new"}:${open ? "open" : "closed"}`;
  const [lastFormKey, setLastFormKey] = useState(formKey);

  if (lastFormKey !== formKey) {
    setLastFormKey(formKey);
    if (open) {
      setFormError(null);
      if (initialData) {
        setItemType(initialData.itemType);
        setPid(initialData.pid);
        setCategory(initialData.category || "");
        setLocationId(initialData.locationId || "");
        setCondition(initialData.condition || "Good");
        setBrand(initialData.brand || "");
        setReviewsDate(
          initialData.reviewsDate ? initialData.reviewsDate.slice(0, 10) : "",
        );
        setRemark(initialData.remark || "");
      } else {
        setItemType("Machinery & Equipment");
        setPid("");
        setCategory("");
        setLocationId(locations[0]?.locationid || "");
        setCondition("Good");
        setBrand("");
        setReviewsDate("");
        setRemark("");
      }
    }
  }

  // Fetch next auto-generated PID preview from the server
  const fetchNextPid = async (type: string) => {
    setFetchingPid(true);
    try {
      const url = new URL("/api/general-asset/next-pid", window.location.origin);
      url.searchParams.set("itemType", type);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setPid(data.pid);
      }
    } catch {
      // Non-critical preview error — PID remains editable manually
    } finally {
      setFetchingPid(false);
    }
  };

  // Fetch next auto-generated PID for NEW asset registrations only.
  useEffect(() => {
    if (!open || initialData) return;
    const id = window.setTimeout(() => {
      fetchNextPid("Machinery & Equipment");
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, initialData]);

  const handleItemTypeChange = (newType: string) => {
    setItemType(newType);
    if (!isEditing) {
      fetchNextPid(newType);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!pid.trim()) {
      setFormError("PID (Asset ID) is required.");
      return;
    }
    if (!category.trim()) {
      setFormError("Category is required.");
      return;
    }

    setLoading(true);

    try {
      const selectedLoc = locations.find((l) => l.locationid === locationId);

      const payload: Record<string, unknown> = {
        itemType,
        pid: pid.trim(),
        category: category.trim(),
        locationId: locationId || null,
        locationName: selectedLoc?.locationname || null,
        condition,
        brand: brand.trim() || null,
        reviewsDate: reviewsDate || null,
        remark: remark.trim() || null,
      };

      if (isEditing) {
        payload.id = initialData?.id;
      }

      const res = await fetch("/api/general-asset", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || "Failed to save general asset.");
      }

      toast.success(
        isEditing
          ? `General asset ${responseData.pid} updated successfully.`
          : `General asset ${responseData.pid} registered successfully.`,
      );

      onSuccess(responseData);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Warehouse className="h-5 w-5 text-primary" />
            {isEditing
              ? `Edit General Asset: ${initialData?.pid}`
              : "Register New General Asset"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update asset details, condition, and review information."
              : "Record a non-IT fixed asset for the factory inventory register."}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* ─── Section 1: Identification ─── */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              1. Asset Identification
            </h4>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Item Type */}
              <div className="space-y-1.5">
                <Label htmlFor="itemType" className="text-xs font-medium">
                  Item Type <span className="text-destructive">*</span>
                </Label>
                <Select value={itemType} onValueChange={handleItemTypeChange}>
                  <SelectTrigger id="itemType">
                    <SelectValue placeholder="Select Item Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERAL_ASSET_ITEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* PID (Asset ID) - Auto-generated, editable */}
              <div className="space-y-1.5">
                <Label htmlFor="pid" className="text-xs font-medium">
                  PID (Asset ID){" "}
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    Auto
                  </Badge>{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="pid"
                    value={pid}
                    onChange={(e) => setPid(e.target.value)}
                    required
                    className="bg-muted/30 font-mono font-semibold"
                    placeholder="e.g. MCH-001"
                  />
                  {!isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => fetchNextPid(itemType)}
                      disabled={fetchingPid}
                      title="Regenerate PID"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${fetchingPid ? "animate-spin" : ""}`}
                      />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Auto-generated from item type prefix (e.g. MCH-001, VEH-004).
                </p>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs font-medium">
                  <Tag className="mr-1 inline h-3 w-3" />
                  Category <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Boiler, Pump, Generator"
                  className="text-xs"
                />
              </div>

              {/* Brand */}
              <div className="space-y-1.5">
                <Label htmlFor="brand" className="text-xs font-medium">
                  Brand
                </Label>
                <Input
                  id="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Bosch, Toyota, Caterpillar"
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── Section 2: Location & Condition ─── */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              2. Placement &amp; Condition
            </h4>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Location */}
              <div className="space-y-1.5">
                <Label htmlFor="locationId" className="text-xs font-medium">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  Location
                </Label>
                <Select
                  value={locationId}
                  onValueChange={(val) =>
                    setLocationId(val === "none" ? "" : val)
                  }
                >
                  <SelectTrigger id="locationId">
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Unassigned</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.locationid} value={loc.locationid}>
                        {loc.locationname || loc.locationid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Condition */}
              <div className="space-y-1.5">
                <Label htmlFor="condition" className="text-xs font-medium">
                  Condition <span className="text-destructive">*</span>
                </Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger id="condition">
                    <SelectValue placeholder="Select Condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERAL_ASSET_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reviews Date */}
              <div className="space-y-1.5">
                <Label htmlFor="reviewsDate" className="text-xs font-medium">
                  <CalendarClock className="mr-1 inline h-3 w-3" />
                  Reviews Date
                </Label>
                <Input
                  id="reviewsDate"
                  type="date"
                  value={reviewsDate}
                  onChange={(e) => setReviewsDate(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Date of last / next physical asset review.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── Section 3: Remark ─── */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              3. Remark
            </h4>
            <div className="space-y-1.5">
              <Label htmlFor="remark" className="text-xs font-medium">
                Remark
              </Label>
              <Textarea
                id="remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Notes, inspection findings, maintenance history..."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Asset" : "Register Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}