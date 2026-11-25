"use client";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Fingerprint, Info, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/feedback/notify";
import CustomFieldsSection from "@/components/CustomFieldsSection";
import SelectWithQuickCreate, {
  type QuickCreateOption,
} from "@/components/SelectWithQuickCreate";
import SearchableCombobox from "@/components/SearchableCombobox";
import { flattenDepartmentOptions } from "@/lib/department-master";

const controlClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring/40 h-9 w-full rounded-lg border px-2 text-sm shadow-none";

const textareaClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring/40 min-h-20 w-full resize-none rounded-lg border px-2 py-2 text-sm shadow-none";

function SectionHeading({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
          {step}
        </span>
        {title}
      </h2>
      {hint ? (
        <Badge variant="outline" className="text-[10px] font-normal">
          {hint}
        </Badge>
      ) : null}
    </div>
  );
}

export default function AssetEditForm({
  initial,
  categories: initialCategories,
  locations: initialLocations,
  manufacturers: initialManufacturers,
  models: initialModels,
  statuses: initialStatuses,
  suppliers: initialSuppliers,
  departments: initialDepartments,
}) {
  const departmentOptions = useMemo(
    () =>
      flattenDepartmentOptions(
        (initialDepartments || [])
          .filter((d: any) => d.isActive !== false)
          .map((d: any) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            parentId: d.parentId,
            sortOrder: d.sortOrder,
          })),
      ),
    [initialDepartments],
  );
  const [manufacturerOptions, setManufacturerOptions] = useState<
    QuickCreateOption[]
  >(() =>
    initialManufacturers.map((m: any) => ({
      id: m.manufacturerid,
      label: m.manufacturername,
    })),
  );
  const [modelOptions, setModelOptions] = useState<QuickCreateOption[]>(() =>
    initialModels.map((m: any) => ({ id: m.modelid, label: m.modelname })),
  );
  const [supplierOptions, setSupplierOptions] = useState<QuickCreateOption[]>(
    () =>
      initialSuppliers.map((s: any) => ({
        id: s.supplierid,
        label: s.suppliername,
      })),
  );

  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assettagTaken, setAssettagTaken] = useState(false);
  const [serialTaken, setSerialTaken] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string | null>
  >({});

  const [form, setForm] = useState({
    assetid: initial.assetid,
    assetname: initial.assetname ?? "",
    assettag: initial.assettag ?? "",
    serialnumber: initial.serialnumber ?? "",
    modelid: initial.modelid ?? "",
    specs: initial.specs ?? "",
    notes: initial.notes ?? "",
    purchaseprice: initial.purchaseprice ?? "",
    purchasedate: initial.purchasedate
      ? new Date(initial.purchasedate).toISOString().slice(0, 10)
      : "",
    mobile: Boolean(initial.mobile),
    requestable: Boolean(initial.requestable),
    assetcategorytypeid: initial.assetcategorytypeid ?? "",
    statustypeid: initial.statustypeid ?? "",
    condition1StatusId: initial.condition1StatusId ?? "",
    supplierid: initial.supplierid ?? "",
    locationid: initial.locationid ?? "",
    location1Id: initial.location1Id ?? "",
    manufacturerid: initial.manufacturerid ?? "",
    departmentid: initial.departmentId ?? "",
    departmentCode: initial.departmentCode ?? "",
    warrantyMonths: initial.warrantyMonths ?? "",
    warrantyExpires: initial.warrantyExpires
      ? new Date(initial.warrantyExpires).toISOString().slice(0, 10)
      : "",
    reviewsDate: initial.reviewsDate
      ? new Date(initial.reviewsDate).toISOString().slice(0, 10)
      : "",
    remark: initial.remark ?? "",
  });

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        assetname: initial.assetname ?? "",
        assettag: initial.assettag ?? "",
        serialnumber: initial.serialnumber ?? "",
        modelid: initial.modelid ?? "",
        specs: initial.specs ?? "",
        notes: initial.notes ?? "",
        purchaseprice: initial.purchaseprice ?? "",
        purchasedate: initial.purchasedate
          ? new Date(initial.purchasedate).toISOString().slice(0, 10)
          : "",
        mobile: Boolean(initial.mobile),
        requestable: Boolean(initial.requestable),
        assetcategorytypeid: initial.assetcategorytypeid ?? "",
        statustypeid: initial.statustypeid ?? "",
        condition1StatusId: initial.condition1StatusId ?? "",
        supplierid: initial.supplierid ?? "",
        locationid: initial.locationid ?? "",
        location1Id: initial.location1Id ?? "",
        manufacturerid: initial.manufacturerid ?? "",
        departmentid: initial.departmentId ?? "",
        departmentCode: initial.departmentCode ?? "",
        warrantyMonths: initial.warrantyMonths ?? "",
        warrantyExpires: initial.warrantyExpires
          ? new Date(initial.warrantyExpires).toISOString().slice(0, 10)
          : "",
        reviewsDate: initial.reviewsDate
          ? new Date(initial.reviewsDate).toISOString().slice(0, 10)
          : "",
        remark: initial.remark ?? "",
      }),
    [initial],
  );

  const isDirty = useMemo(
    () => JSON.stringify({ ...form }) !== initialSnapshot,
    [form, initialSnapshot],
  );

  useEffect(() => {
    const beforeUnload = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSelectChange = (name) => (value) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/asset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          modelid: form.modelid || null,
          specs: form.specs || null,
          notes: form.notes || null,
          purchaseprice: form.purchaseprice === "" ? null : form.purchaseprice,
          purchasedate: form.purchasedate || null,
          assetcategorytypeid: form.assetcategorytypeid || null,
          statustypeid: form.statustypeid || null,
          condition1StatusId: form.condition1StatusId || null,
          supplierid: form.supplierid || null,
          locationid: form.locationid || null,
          location1Id: form.location1Id || null,
          manufacturerid: form.manufacturerid || null,
          departmentId: form.departmentid || null,
          departmentCode: form.departmentCode || null,
          warrantyMonths:
            form.warrantyMonths === "" ? null : Number(form.warrantyMonths),
          warrantyExpires: form.warrantyExpires || null,
          reviewsDate: form.reviewsDate || null,
          remark: form.remark || null,
          _expectedVersion: initial.change_date ?? null,
        }),
      });
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        notify.error(
          err.error ||
            "This item was modified by someone else. Please refresh and try again.",
        );
        setSaving(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to update asset");
      }
      const updated = await res.json();
      if (Object.keys(customFieldValues).length > 0) {
        await fetch("/api/custom-fields/values", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityId: updated.assetid,
            entityType: "asset",
            values: customFieldValues,
          }),
        });
      }
      notify.success({ title: "Asset updated", description: updated.assettag });
      router.push(`/assets/${updated.assetid}`);
    } catch (e) {
      setError(e.message);
      notify.error({ title: "Update failed", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <header className="border-border/70 from-card to-muted/30 flex flex-col gap-3 rounded-xl border bg-gradient-to-r p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Fingerprint className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                  Edit Asset
                </h1>
                <Badge variant={isDirty ? "warning" : "muted"}>
                  {isDirty ? "Unsaved changes" : "Saved"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-medium">{initial.assetname}</span>
                <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono font-medium">
                  {initial.assettag}
                </span>
                <span className="bg-muted rounded px-1.5 py-0.5 font-mono">
                  {initial.serialnumber}
                </span>
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Update the register record and keep master values consistent.
          </p>
        </header>

        <div className="border-border/70 bg-card/80 space-y-5 rounded-xl border p-4 shadow-sm sm:p-5">
          <div className="bg-primary/5 border-primary/20 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-xs">
            <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Required fields are marked. Department, location, status and
              category values come from the shared master lists.
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-destructive/15 text-destructive flex items-start gap-2 rounded-md p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section className="space-y-4">
            <SectionHeading
              step={1}
              title="Identity"
              hint="Asset register core"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SearchableCombobox
                id="assetname"
                ariaLabel="Asset name"
                label="Asset Name"
                required
                compact
                type="assetName"
                value={form.assetname}
                placeholder="Search existing asset names..."
                onChange={(val) => onSelectChange("assetname")(val)}
              />
              <SearchableCombobox
                id="assetcategorytypeid"
                label="Asset Type"
                compact
                type="category"
                value={form.assetcategorytypeid}
                departmentId={form.departmentid || null}
                currentValue={
                  !form.assetcategorytypeid
                    ? initial.categoryCode || null
                    : null
                }
                placeholder="Select asset type..."
                onChange={(val) => onSelectChange("assetcategorytypeid")(val)}
              />
              <SearchableCombobox
                id="statustypeid"
                label="Status / Condition (2nd)"
                compact
                type="status"
                value={form.statustypeid}
                currentValue={
                  !form.statustypeid ? initial.condition2Raw || null : null
                }
                placeholder="Select status..."
                allowCreate={false}
                onChange={(val) => onSelectChange("statustypeid")(val)}
              />
              <SearchableCombobox
                id="condition1StatusId"
                label="Condition (1st)"
                compact
                type="status"
                value={form.condition1StatusId}
                currentValue={
                  !form.condition1StatusId ? initial.condition1 || null : null
                }
                placeholder="Select condition (1st)..."
                allowCreate={false}
                onChange={(val) => onSelectChange("condition1StatusId")(val)}
              />
              <div className="sm:col-span-2">
                <SearchableCombobox
                  id="departmentid"
                  label="Department"
                  compact
                  type="department"
                  value={form.departmentid}
                  currentValue={
                    !form.departmentid ? initial.sourceDepartment || null : null
                  }
                  placeholder="Select department..."
                  allowCreate={false}
                  onChange={(value, item) => {
                    const option = departmentOptions.find(
                      (o) => o.id === value,
                    );
                    setForm((f) => ({
                      ...f,
                      departmentid: value,
                      departmentCode: item?.code ?? option?.code ?? "",
                    }));
                  }}
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Official MSF department. The department code is used in PID
                  and asset tag generation.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading
              step={2}
              title="Location & Availability"
              hint="Shared master lists"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SearchableCombobox
                id="location1Id"
                label="Location (1st)"
                compact
                type="location1"
                value={form.location1Id}
                departmentId={form.departmentid || null}
                currentValue={
                  !form.location1Id ? initial.location1 || null : null
                }
                placeholder="Search location (1st)..."
                onChange={(val) => onSelectChange("location1Id")(val)}
              />
              <SearchableCombobox
                id="locationid"
                label="Location (2nd)"
                compact
                type="location2"
                value={form.locationid}
                departmentId={form.departmentid || null}
                currentValue={
                  !form.locationid ? initial.location2Raw || null : null
                }
                placeholder="Search location (2nd)..."
                onChange={(val) => onSelectChange("locationid")(val)}
              />
              <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requestable"
                    checked={form.requestable}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, requestable: Boolean(v) }))
                    }
                  />
                  <Label htmlFor="requestable" className="text-xs font-medium">
                    Requestable
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="mobile"
                    checked={form.mobile}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, mobile: Boolean(v) }))
                    }
                  />
                  <Label htmlFor="mobile" className="text-xs font-medium">
                    Mobile
                  </Label>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading
              step={3}
              title="Specifications & Procurement"
              hint="Optional"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manufacturerid" className="text-xs font-medium">
                  Brand
                </Label>
                <SelectWithQuickCreate
                  id="manufacturerid"
                  value={form.manufacturerid}
                  onValueChange={onSelectChange("manufacturerid")}
                  options={manufacturerOptions}
                  onItemCreated={(item) =>
                    setManufacturerOptions((prev) => [...prev, item])
                  }
                  placeholder="Select brand"
                  apiEndpoint="/api/manufacturer"
                  nameField="manufacturername"
                  idField="manufacturerid"
                  entityLabel="Brand"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modelid" className="text-xs font-medium">
                  Model
                </Label>
                <SelectWithQuickCreate
                  id="modelid"
                  value={form.modelid}
                  onValueChange={onSelectChange("modelid")}
                  options={modelOptions}
                  onItemCreated={(item) =>
                    setModelOptions((prev) => [...prev, item])
                  }
                  placeholder="Select model"
                  apiEndpoint="/api/model"
                  nameField="modelname"
                  idField="modelid"
                  entityLabel="Model"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="specs" className="text-xs font-medium">
                  Specs
                </Label>
                <Textarea
                  id="specs"
                  name="specs"
                  value={form.specs ?? ""}
                  onChange={onChange}
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes" className="text-xs font-medium">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={form.notes ?? ""}
                  onChange={onChange}
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplierid" className="text-xs font-medium">
                  Supplier
                </Label>
                <SelectWithQuickCreate
                  id="supplierid"
                  value={form.supplierid}
                  onValueChange={onSelectChange("supplierid")}
                  options={supplierOptions}
                  onItemCreated={(item) =>
                    setSupplierOptions((prev) => [...prev, item])
                  }
                  placeholder="Select supplier"
                  apiEndpoint="/api/supplier"
                  nameField="suppliername"
                  idField="supplierid"
                  entityLabel="Supplier"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchaseprice" className="text-xs font-medium">
                  Purchase Price
                </Label>
                <Input
                  id="purchaseprice"
                  name="purchaseprice"
                  value={form.purchaseprice ?? ""}
                  onChange={onChange}
                  type="number"
                  step="0.01"
                  className={controlClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchasedate" className="text-xs font-medium">
                  Purchase Date
                </Label>
                <Input
                  id="purchasedate"
                  name="purchasedate"
                  value={form.purchasedate ?? ""}
                  onChange={onChange}
                  type="date"
                  className={controlClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warrantyMonths" className="text-xs font-medium">
                  Warranty (months)
                </Label>
                <Input
                  id="warrantyMonths"
                  name="warrantyMonths"
                  value={form.warrantyMonths ?? ""}
                  onChange={onChange}
                  type="number"
                  min="0"
                  className={controlClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="warrantyExpires"
                  className="text-xs font-medium"
                >
                  Warranty Expires
                </Label>
                <Input
                  id="warrantyExpires"
                  name="warrantyExpires"
                  value={form.warrantyExpires ?? ""}
                  onChange={onChange}
                  type="date"
                  className={controlClass}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading
              step={4}
              title="Review & Identifiers"
              hint="Register data"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reviewsDate" className="text-xs font-medium">
                  Reviews Date
                </Label>
                <Input
                  id="reviewsDate"
                  name="reviewsDate"
                  value={form.reviewsDate ?? ""}
                  onChange={onChange}
                  type="date"
                  className={controlClass}
                />
                <p className="text-muted-foreground text-xs">
                  Date of last or next physical asset review.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remark" className="text-xs font-medium">
                  Remark
                </Label>
                <Textarea
                  id="remark"
                  name="remark"
                  value={form.remark ?? ""}
                  onChange={onChange}
                  placeholder="Inspection findings, review notes, maintenance observations..."
                  rows={3}
                  className={textareaClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assettag" className="text-xs font-medium">
                  Asset Tag <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="assettag"
                  name="assettag"
                  value={form.assettag}
                  onChange={onChange}
                  onBlur={async () => {
                    if (
                      !form.assettag ||
                      form.assettag === (initial.assettag ?? "")
                    )
                      return;
                    try {
                      const res = await fetch(
                        `/api/asset/validate?assettag=${encodeURIComponent(form.assettag)}`,
                      );
                      const data = await res.json();
                      setAssettagTaken(Boolean(data?.assettag?.exists));
                    } catch {}
                  }}
                  className={
                    assettagTaken
                      ? "border-destructive focus-visible:ring-destructive/40"
                      : controlClass
                  }
                  required
                />
                {assettagTaken && (
                  <p className="text-destructive mt-1 text-xs">
                    Asset tag already exists
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label htmlFor="serialnumber" className="text-xs font-medium">
                    PID (Property ID){" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    System generated
                  </Badge>
                </div>
                <Input
                  id="serialnumber"
                  name="serialnumber"
                  value={form.serialnumber}
                  readOnly
                  className="bg-muted/40 text-muted-foreground cursor-not-allowed font-mono"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  Official Metahara Sugar Factory PID is immutable.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading step={5} title="Custom Fields" hint="Optional" />
            <CustomFieldsSection
              entityType="asset"
              entityId={initial.assetid}
              onChange={setCustomFieldValues}
            />
          </section>

          <div className="border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                Changes are saved to the shared asset register.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (!isDirty || confirm("Discard unsaved changes?"))
                      router.back();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  className="w-full sm:w-auto"
                  type="submit"
                  disabled={saving || assettagTaken || serialTaken}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
