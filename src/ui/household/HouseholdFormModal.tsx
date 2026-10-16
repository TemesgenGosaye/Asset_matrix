"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  HOUSE_NUMBER_FAMILY_REGEX,
  HOUSEHOLD_HID_REGEX,
  getExpectedHouseNumberPrefix,
} from "@/lib/household-constants";
import {
  Home,
  Package,
  Wrench,
  Minus,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Info,
  RefreshCw,
} from "lucide-react";
import { notify } from "@/lib/feedback/notify";

interface LocationItem {
  locationid: string;
  locationname: string | null;
}

interface HouseholdItem {
  id?: string;
  srNo?: number;
  hid: string;
  houseType: string;
  staffCategory?: string | null;
  houseNumber: string;
  rgType: string;
  locationId?: string | null;
  locationName?: string | null;
  status: string;
  bedCount: number;
  chairsCount: number;
  lockerCount: number;
  tablesCount: number;
  damageWindow: boolean;
  damageDoor: boolean;
  damageWaterPanel: boolean;
  damageRoof: boolean;
  damageWall: boolean;
  damageElectricity: boolean;
  damageNotes?: string | null;
}

interface HouseholdFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: HouseholdItem | null;
  locations: LocationItem[];
  onSuccess: (savedItem: HouseholdItem) => void;
}

const STAFF_CATEGORIES = ["A", "B", "C", "D", "E"] as const;
const COUNT_FIELDS = [
  { key: "bedCount", label: "Bed", icon: "🛏️" },
  { key: "chairsCount", label: "Chair", icon: "🪑" },
  { key: "lockerCount", label: "Locker", icon: "🗄️" },
  { key: "tablesCount", label: "Table", icon: "🪵" },
] as const;

export default function HouseholdFormModal({
  open,
  onOpenChange,
  initialData,
  locations,
  onSuccess,
}: HouseholdFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Home className="text-primary h-5 w-5" />
            {initialData?.id
              ? `Edit Household: ${initialData.houseNumber}`
              : "Register New Household"}
          </DialogTitle>
          <DialogDescription>
            {initialData?.id
              ? "Update household records, inside items, and condition status."
              : "HID is generated automatically. House Number is entered manually and must match the selected family."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <HouseholdFormFields
            initialData={initialData}
            locations={locations}
            onSuccess={onSuccess}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owns all form state. Mounted only while the dialog is open so the form is
 * freshly initialized from the current record (or blank defaults) on every
 * open — no auto-filled values and no state-reset effects required.
 */
function HouseholdFormFields({
  initialData,
  locations,
  onSuccess,
  onClose,
}: {
  initialData?: HouseholdItem | null;
  locations: LocationItem[];
  onSuccess: (savedItem: HouseholdItem) => void;
  onClose: () => void;
}) {
  const isEditing = !!initialData?.id;

  const [loading, setLoading] = useState(false);
  const [identifiersLoading, setIdentifiersLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Identification & Types — HID is auto-generated, House Number is typed
  // by the user
  const [hid, setHid] = useState(initialData?.hid ?? "");
  const [houseType, setHouseType] = useState(initialData?.houseType || "Staff");
  const [staffCategory, setStaffCategory] = useState(
    initialData?.staffCategory || "A",
  );
  const [houseNumber, setHouseNumber] = useState(
    initialData?.houseNumber ?? "",
  );
  const [rgType, setRgType] = useState(initialData?.rgType || "Regular");
  const [locationId, setLocationId] = useState<string>(
    initialData?.locationId ?? "",
  );
  const [status, setStatus] = useState(initialData?.status || "Active");

  // Inside Items
  const [bedCount, setBedCount] = useState(initialData?.bedCount ?? 0);
  const [chairsCount, setChairsCount] = useState(initialData?.chairsCount ?? 0);
  const [lockerCount, setLockerCount] = useState(initialData?.lockerCount ?? 0);
  const [tablesCount, setTablesCount] = useState(initialData?.tablesCount ?? 0);

  // Damage Checklist
  const [damageWindow, setDamageWindow] = useState(!!initialData?.damageWindow);
  const [damageDoor, setDamageDoor] = useState(!!initialData?.damageDoor);
  const [damageWaterPanel, setDamageWaterPanel] = useState(
    !!initialData?.damageWaterPanel,
  );
  const [damageRoof, setDamageRoof] = useState(!!initialData?.damageRoof);
  const [damageWall, setDamageWall] = useState(!!initialData?.damageWall);
  const [damageElectricity, setDamageElectricity] = useState(
    !!initialData?.damageElectricity,
  );
  const [damageNotes, setDamageNotes] = useState(
    initialData?.damageNotes ?? "",
  );

  // Expected house number prefix for the current selection (e.g. SA, A)
  const expectedPrefix = useMemo(
    () =>
      getExpectedHouseNumberPrefix(
        houseType,
        houseType === "Staff" ? staffCategory : null,
      ) || "",
    [houseType, staffCategory],
  );

  const houseNumberPattern = useMemo(
    () => new RegExp(`^${expectedPrefix}\\d+$`),
    [expectedPrefix],
  );

  // Auto-generate the HID when creating. The house number is never generated
  // for the user — it is typed in by hand and validated against the family
  // prefix of the selected house type / staff category.
  const generationRan = useRef(false);
  useEffect(() => {
    if (isEditing || generationRan.current) return;
    generationRan.current = true;

    let cancelled = false;
    const loadHid = async () => {
      setIdentifiersLoading(true);
      try {
        const res = await fetch("/api/household/next-hid");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data?.nextHid === "string") setHid(data.nextHid);
      } catch {
        // Identifier fetch is best-effort; the server re-generates on POST.
      } finally {
        if (!cancelled) setIdentifiersLoading(false);
      }
    };
    loadHid();
    return () => {
      cancelled = true;
    };
  }, [isEditing]);

  const handleHouseTypeChange = (type: string) => {
    setHouseType(type);
  };

  const handleStaffCategoryChange = (cat: string) => {
    setStaffCategory(cat);
  };

  const refreshHid = async () => {
    setIdentifiersLoading(true);
    try {
      const res = await fetch("/api/household/next-hid");
      if (!res.ok) throw new Error("Failed to refresh the generated HID.");
      const d = await res.json();
      if (typeof d?.nextHid === "string") setHid(d.nextHid);
    } catch {
      notify.error("Failed to refresh generated identifier.");
    } finally {
      setIdentifiersLoading(false);
    }
  };

  // Live field validation — the auto-generated HID always passes, while the
  // hand-typed house number is checked against the strict family rules.
  const hidTouched = hid.trim().length > 0;
  const hidHint = !hidTouched
    ? "HID is generated automatically (canonical 106-90-000 format)."
    : HOUSEHOLD_HID_REGEX.test(hid.trim())
      ? null
      : "HID must follow the canonical format 106-90-000.";

  const houseNumberTouched = houseNumber.trim().length > 0;
  const houseNumberHint = !houseNumberTouched
    ? `Enter the house number manually — it must start with "${expectedPrefix}" followed by digits (e.g. ${expectedPrefix}1).`
    : !HOUSE_NUMBER_FAMILY_REGEX.test(houseNumber.trim())
      ? "Invalid family — only Staff SA-SE and categories A-E are allowed (e.g. SA1, E5)."
      : !houseNumberPattern.test(houseNumber.trim())
        ? `House number must start with "${expectedPrefix}" and be followed by digits.`
        : null;

  const hasAnyDamage =
    damageWindow ||
    damageDoor ||
    damageWaterPanel ||
    damageRoof ||
    damageWall ||
    damageElectricity;

  const totalInsideItems = bedCount + chairsCount + lockerCount + tablesCount;

  const damagedCount = [
    damageWindow,
    damageDoor,
    damageWaterPanel,
    damageRoof,
    damageWall,
    damageElectricity,
  ].filter(Boolean).length;

  const canSubmit =
    hidHint === null &&
    houseNumberHint === null &&
    (status !== "Inactive" || hasAnyDamage);

  const updateCount = (
    key: (typeof COUNT_FIELDS)[number]["key"],
    delta: number,
  ) => {
    const setter = {
      bedCount: setBedCount,
      chairsCount: setChairsCount,
      lockerCount: setLockerCount,
      tablesCount: setTablesCount,
    }[key];
    setter((prev) => Math.max(0, prev + delta));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!hid.trim()) {
      setFormError("House ID (HID) is required.");
      return;
    }
    if (hidHint) {
      setFormError(hidHint);
      return;
    }
    if (!houseNumber.trim()) {
      setFormError("House Number is required.");
      return;
    }
    if (houseNumberHint) {
      setFormError(houseNumberHint);
      return;
    }
    if (houseType === "Staff" && !staffCategory) {
      setFormError("Staff category is required for Staff houses.");
      return;
    }
    if (status === "Inactive" && !hasAnyDamage) {
      setFormError(
        "Damage information is mandatory when Status is Inactive. Please identify at least one damaged component.",
      );
      return;
    }

    setLoading(true);

    try {
      const selectedLoc = locations.find((l) => l.locationid === locationId);

      const payload: Record<string, unknown> = {
        houseType,
        staffCategory: houseType === "Staff" ? staffCategory : null,
        houseNumber: houseNumber.trim().toUpperCase(),
        rgType,
        locationId: locationId || null,
        locationName: selectedLoc?.locationname || null,
        status,
        bedCount: Number(bedCount) || 0,
        chairsCount: Number(chairsCount) || 0,
        lockerCount: Number(lockerCount) || 0,
        tablesCount: Number(tablesCount) || 0,
        damageWindow: status === "Inactive" ? damageWindow : false,
        damageDoor: status === "Inactive" ? damageDoor : false,
        damageWaterPanel: status === "Inactive" ? damageWaterPanel : false,
        damageRoof: status === "Inactive" ? damageRoof : false,
        damageWall: status === "Inactive" ? damageWall : false,
        damageElectricity: status === "Inactive" ? damageElectricity : false,
        damageNotes: status === "Inactive" ? damageNotes.trim() : null,
      };

      // For edit mode, include the record id
      if (isEditing) {
        payload.id = initialData?.id;
      }

      const res = await fetch("/api/household", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof responseData?.error === "string"
            ? responseData.error
            : "Failed to save household record.",
        );
      }

      notify.success(
        isEditing
          ? `House ${responseData.houseNumber} updated`
          : `House ${responseData.houseNumber} registered`,
      );

      onSuccess(responseData);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setFormError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const locationNameDisplay = useMemo(() => {
    const loc = locations.find((l) => l.locationid === locationId);
    return loc?.locationname || "—";
  }, [locations, locationId]);

  const summaryEntries = [
    { label: "HID", value: hid.trim() || "—", mono: true },
    {
      label: "House No.",
      value: houseNumber.trim().toUpperCase() || "—",
      mono: true,
    },
    {
      label: "Type",
      value: houseType === "Staff" ? `Staff (${staffCategory})` : houseType,
    },
    { label: "R/G", value: rgType },
    { label: "Location", value: locationNameDisplay },
    { label: "Status", value: status },
    { label: "Inside Items", value: String(totalInsideItems) },
    {
      label: "Damage",
      value: status === "Inactive" ? String(damagedCount) : "None",
    },
  ];

  return (
    <>
      {formError && (
        <div
          role="alert"
          className="bg-destructive/15 text-destructive flex items-start gap-2 rounded-md p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 py-2">
        {/* ─── Section 1: Identification & Types ─── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
                1
              </span>
              Basic Identification
            </h4>
            <Badge variant="outline" className="text-[10px] font-normal">
              {isEditing ? "Identifiers locked" : "HID auto-generated"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* HID - Auto-generated */}
            <div className="space-y-1.5">
              <Label htmlFor="hid" className="text-xs font-medium">
                House ID (HID) <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="hid"
                  value={hid}
                  onChange={(e) => setHid(e.target.value)}
                  readOnly
                  placeholder="e.g. 106-90-001"
                  className={`text-muted-foreground font-mono text-sm ${
                    hidHint && hidTouched
                      ? "border-destructive focus-visible:ring-destructive/40"
                      : ""
                  }`}
                />
                {!isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={refreshHid}
                    disabled={identifiersLoading}
                    aria-label="Refresh auto-generated HID"
                    title="Refresh auto-generated HID"
                  >
                    {identifiersLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              <p
                className={`flex items-start gap-1 text-[11px] ${
                  hidHint && hidTouched
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {hidHint && hidTouched ? (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                ) : hidHint === null && hidTouched ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                )}
                {hidHint}
              </p>
            </div>

            {/* House Type */}
            <div className="space-y-1.5">
              <Label htmlFor="houseType" className="text-xs font-medium">
                House Type <span className="text-destructive">*</span>
              </Label>
              <Select value={houseType} onValueChange={handleHouseTypeChange}>
                <SelectTrigger id="houseType">
                  <SelectValue placeholder="Select House Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Staff">Staff</SelectItem>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                  <SelectItem value="E">E</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Staff Category (Conditional) */}
            {houseType === "Staff" && (
              <div className="space-y-1.5">
                <Label htmlFor="staffCategory" className="text-xs font-medium">
                  Staff Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={staffCategory}
                  onValueChange={handleStaffCategoryChange}
                >
                  <SelectTrigger id="staffCategory">
                    <SelectValue placeholder="Select Staff Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        Staff {cat} (S{cat})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* House Number - typed manually, validated against the family prefix */}
            <div className="space-y-1.5">
              <Label htmlFor="houseNumber" className="text-xs font-medium">
                House Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="houseNumber"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value.toUpperCase())}
                placeholder={`e.g. ${expectedPrefix}1`}
                className={`text-primary font-mono font-semibold ${
                  houseNumberHint && houseNumberTouched
                    ? "border-destructive focus-visible:ring-destructive/40"
                    : houseNumberHint === null && houseNumberTouched
                      ? "border-emerald-600/60 focus-visible:ring-emerald-500/30"
                      : ""
                }`}
              />
              <p
                className={`flex items-start gap-1 text-[11px] ${
                  houseNumberHint && houseNumberTouched
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {houseNumberHint && houseNumberTouched ? (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                ) : houseNumberHint === null && houseNumberTouched ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                )}
                {houseNumberHint}
              </p>
            </div>

            {/* R/G Selection */}
            <div className="space-y-1.5">
              <Label htmlFor="rgType" className="text-xs font-medium">
                R / G Type <span className="text-destructive">*</span>
              </Label>
              <Select value={rgType} onValueChange={setRgType}>
                <SelectTrigger id="rgType">
                  <SelectValue placeholder="Select R/G Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="Guest">Guest House</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="locationId" className="text-xs font-medium">
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

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs font-medium">
                Status <span className="text-destructive">*</span>
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">
                    Active (Ready for occupancy)
                  </SelectItem>
                  <SelectItem value="Inactive">
                    Inactive (Under maintenance)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <Separator />

        {/* ─── Section 2: Inside Items ─── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
                2
              </span>
              <Package className="h-4 w-4" />
              Inside Items Inventory
            </h4>
            <Badge variant="outline" className="text-[11px]">
              {totalInsideItems} item{totalInsideItems === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COUNT_FIELDS.map((field) => (
              <div
                key={field.key}
                className="bg-card space-y-1.5 rounded-lg border p-3"
              >
                <Label
                  htmlFor={field.key}
                  className="flex items-center gap-1.5 text-xs font-medium"
                >
                  <span className="text-sm">{field.icon}</span> {field.label}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => updateCount(field.key, -1)}
                    disabled={loading}
                    aria-label={`Decrease ${field.label.toLowerCase()} count`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    id={field.key}
                    type="number"
                    min="0"
                    value={
                      (
                        {
                          bedCount,
                          chairsCount,
                          lockerCount,
                          tablesCount,
                        } as Record<string, number>
                      )[field.key]
                    }
                    onChange={(e) => {
                      const value = Math.max(
                        0,
                        parseInt(e.target.value, 10) || 0,
                      );
                      const setter = {
                        bedCount: setBedCount,
                        chairsCount: setChairsCount,
                        lockerCount: setLockerCount,
                        tablesCount: setTablesCount,
                      }[field.key];
                      setter(value);
                    }}
                    className="h-8 text-center font-semibold tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => updateCount(field.key, 1)}
                    disabled={loading}
                    aria-label={`Increase ${field.label.toLowerCase()} count`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 3: Condition & Damage ─── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
                3
              </span>
              <Wrench className="h-4 w-4" />
              Condition Inspection
            </h4>
            {status === "Inactive" ? (
              <Badge variant="destructive" className="text-[10px]">
                Required
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Optional (Active)
              </Badge>
            )}
          </div>

          {status === "Active" ? (
            <p className="text-muted-foreground text-xs">
              The house is marked <strong>Active</strong>, so no damage
              inspection is recorded. Switch status to <strong>Inactive</strong>{" "}
              to log damage for maintenance.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                Since this house is marked <strong>Inactive</strong>, identify
                at least one damaged component:
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
                {(
                  [
                    [damageWindow, setDamageWindow],
                    [damageDoor, setDamageDoor],
                    [damageWaterPanel, setDamageWaterPanel],
                    [damageRoof, setDamageRoof],
                    [damageWall, setDamageWall],
                    [damageElectricity, setDamageElectricity],
                  ] as Array<[boolean, (v: boolean) => void]>
                ).map(([checked, setter], index) => {
                  const label = [
                    "Window",
                    "Door",
                    "Water Panel",
                    "Roof",
                    "Wall",
                    "Electricity",
                  ][index];
                  return (
                    <label
                      key={label}
                      className="bg-card hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => setter(!!c)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="space-y-1.5 pt-2">
                <Label htmlFor="damageNotes" className="text-xs font-medium">
                  Damage Description / Notes (Optional)
                </Label>
                <Textarea
                  id="damageNotes"
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder="Provide details of repair work needed..."
                  rows={2}
                  className="text-xs"
                />
              </div>
            </>
          )}
        </section>

        {/* ─── Summary Preview ─── */}
        <div className="bg-muted/40 rounded-lg border p-3">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
            <Info className="h-3.5 w-3.5" />
            Registration Summary
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {summaryEntries.map((entry) => (
              <div key={entry.label} className="flex flex-col">
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  {entry.label}
                </span>
                <span
                  className={`text-foreground truncate text-xs font-semibold ${
                    entry.mono ? "font-mono" : ""
                  }`}
                >
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !canSubmit}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update Household" : "Register Household"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
