"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/feedback/notify";
import CustomFieldsSection from "@/components/CustomFieldsSection";
import SelectWithQuickCreate, {
  type QuickCreateOption,
} from "@/components/SelectWithQuickCreate";
import SearchableCombobox from "@/components/SearchableCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { flattenDepartmentOptions } from "@/lib/department-master";

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
  // DB-backed department hierarchy from the official MSF master list.
  // Only active departments are offered for assignment.
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
    <div className="mx-auto w-full max-w-6xl">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              Edit: {initial.assetname}
            </h1>
            <p className="text-foreground-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono font-medium text-blue-700 dark:text-blue-200">
                {initial.assettag}
              </span>
              <span className="bg-muted rounded px-1.5 py-0.5 font-mono">
                {initial.serialnumber}
              </span>
              {isDirty ? (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                  Unsaved changes
                </span>
              ) : null}
            </p>
          </div>
          <p className="text-foreground-500 text-xs">
            Update the register record and keep master values consistent.
          </p>
        </div>

        <Tabs defaultValue="core" className="w-full">
          <TabsList className="bg-muted/60 h-10 w-full justify-start gap-1 rounded-xl p-1 sm:w-auto">
            <TabsTrigger
              value="core"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Core
            </TabsTrigger>
            <TabsTrigger
              value="details"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Details
            </TabsTrigger>
            <TabsTrigger
              value="review"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Review
            </TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="mt-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className="form-card">
                <h2 className="text-foreground-600 mb-3 text-sm font-semibold">
                  Summary
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <SearchableCombobox
                      id="assetname"
                      ariaLabel="Asset name"
                      label="Asset Name"
                      required
                      type="assetName"
                      value={form.assetname}
                      placeholder="Search existing asset names..."
                      onChange={(val) => onSelectChange("assetname")(val)}
                    />
                  </div>
                  <div>
                    <SearchableCombobox
                      id="assetcategorytypeid"
                      label="Asset Type"
                      type="category"
                      value={form.assetcategorytypeid}
                      departmentId={form.departmentid || null}
                      currentValue={
                        !form.assetcategorytypeid
                          ? initial.categoryCode || null
                          : null
                      }
                      placeholder="Select asset type..."
                      onChange={(val) =>
                        onSelectChange("assetcategorytypeid")(val)
                      }
                    />
                  </div>
                  <div>
                    <SearchableCombobox
                      id="statustypeid"
                      label="Status / Condition (2nd)"
                      type="status"
                      value={form.statustypeid}
                      currentValue={
                        !form.statustypeid
                          ? initial.condition2Raw || null
                          : null
                      }
                      placeholder="Select status..."
                      allowCreate={false}
                      onChange={(val) => onSelectChange("statustypeid")(val)}
                    />
                  </div>
                  <div>
                    <SearchableCombobox
                      id="condition1StatusId"
                      label="Condition (1st)"
                      type="status"
                      value={form.condition1StatusId}
                      currentValue={
                        !form.condition1StatusId
                          ? initial.condition1 || null
                          : null
                      }
                      placeholder="Select condition (1st)..."
                      allowCreate={false}
                      onChange={(val) =>
                        onSelectChange("condition1StatusId")(val)
                      }
                    />
                  </div>
                  <div>
                    <SearchableCombobox
                      id="departmentid"
                      label="Department"
                      type="department"
                      value={form.departmentid}
                      currentValue={
                        !form.departmentid
                          ? initial.sourceDepartment || null
                          : null
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
                    <p className="text-foreground-500 mt-1 text-xs">
                      Official MSF department. The department code is used in
                      PID and asset tag generation.
                    </p>
                  </div>
                  <div>
                    <SearchableCombobox
                      id="location1Id"
                      label="Location (1st)"
                      type="location1"
                      value={form.location1Id}
                      departmentId={form.departmentid || null}
                      currentValue={
                        !form.location1Id ? initial.location1 || null : null
                      }
                      placeholder="Search location (1st)..."
                      onChange={(val) => onSelectChange("location1Id")(val)}
                    />
                  </div>
                  <div>
                    <SearchableCombobox
                      id="locationid"
                      label="Location (2nd)"
                      type="location2"
                      value={form.locationid}
                      departmentId={form.departmentid || null}
                      currentValue={
                        !form.locationid ? initial.location2Raw || null : null
                      }
                      placeholder="Search location (2nd)..."
                      onChange={(val) => onSelectChange("locationid")(val)}
                    />
                  </div>
                  <div className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="requestable"
                        checked={form.requestable}
                        onCheckedChange={(v) =>
                          setForm((f) => ({ ...f, requestable: Boolean(v) }))
                        }
                      />
                      <Label htmlFor="requestable">Requestable</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="mobile"
                        checked={form.mobile}
                        onCheckedChange={(v) =>
                          setForm((f) => ({ ...f, mobile: Boolean(v) }))
                        }
                      />
                      <Label htmlFor="mobile">Mobile</Label>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="details" className="mt-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className="form-card">
                <h2 className="text-foreground-600 mb-3 text-sm font-semibold">
                  Specifications
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="manufacturerid">Brand</Label>
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
                  <div>
                    <Label htmlFor="modelid">Model</Label>
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
                  <div>
                    <Label htmlFor="specs">Specs</Label>
                    <Textarea
                      id="specs"
                      name="specs"
                      value={form.specs ?? ""}
                      onChange={onChange}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={form.notes ?? ""}
                      onChange={onChange}
                      rows={2}
                    />
                  </div>
                </div>
              </section>

              <section className="form-card">
                <h2 className="text-foreground-600 mb-3 text-sm font-semibold">
                  Procurement
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="supplierid">Supplier</Label>
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
                  <div>
                    <Label htmlFor="purchaseprice">Purchase Price</Label>
                    <Input
                      id="purchaseprice"
                      name="purchaseprice"
                      value={form.purchaseprice ?? ""}
                      onChange={onChange}
                      type="number"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="purchasedate">Purchase Date</Label>
                    <Input
                      id="purchasedate"
                      name="purchasedate"
                      value={form.purchasedate ?? ""}
                      onChange={onChange}
                      type="date"
                    />
                  </div>
                  <div>
                    <Label htmlFor="warrantyMonths">Warranty (months)</Label>
                    <Input
                      id="warrantyMonths"
                      name="warrantyMonths"
                      value={form.warrantyMonths ?? ""}
                      onChange={onChange}
                      type="number"
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="warrantyExpires">Warranty Expires</Label>
                    <Input
                      id="warrantyExpires"
                      name="warrantyExpires"
                      value={form.warrantyExpires ?? ""}
                      onChange={onChange}
                      type="date"
                    />
                  </div>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="review" className="mt-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className="form-card">
                <h2 className="text-foreground-600 mb-3 text-sm font-semibold">
                  Review
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="reviewsDate">Reviews Date</Label>
                    <Input
                      id="reviewsDate"
                      name="reviewsDate"
                      value={form.reviewsDate ?? ""}
                      onChange={onChange}
                      type="date"
                    />
                    <p className="text-foreground-500 mt-1 text-xs">
                      Date of last / next physical asset review.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="remark">Remark</Label>
                    <Textarea
                      id="remark"
                      name="remark"
                      value={form.remark ?? ""}
                      onChange={onChange}
                      placeholder="Inspection findings, review notes, maintenance observations..."
                      rows={3}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className="form-card">
                <h2 className="text-foreground-600 mb-3 text-sm font-semibold">
                  Identifiers
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="assettag">Asset Tag *</Label>
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
                      className={assettagTaken ? "border-red-500" : ""}
                      required
                    />
                    {assettagTaken && (
                      <p className="mt-1 text-sm text-red-500">
                        Asset tag already exists
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <Label htmlFor="serialnumber">PID (Property ID) *</Label>
                      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium">
                        🔒 System Generated
                      </span>
                    </div>
                    <Input
                      id="serialnumber"
                      name="serialnumber"
                      value={form.serialnumber}
                      readOnly
                      className="bg-muted/40 cursor-not-allowed font-mono"
                      required
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Official Metahara Sugar Factory PID is immutable.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <CustomFieldsSection
                entityType="asset"
                entityId={initial.assetid}
                onChange={setCustomFieldValues}
              />
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <div className="bg-background/95 sticky bottom-0 z-20 -mx-1 mt-1 flex flex-col gap-2 border-t px-1 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-foreground-500 hidden text-xs sm:block">
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
              className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
              type="submit"
              disabled={saving || assettagTaken || serialTaken}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
