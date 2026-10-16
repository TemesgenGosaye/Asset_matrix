"use client";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { notify } from "@/lib/feedback/notify";
import { Wand2, FileText, Loader2, Info, Fingerprint } from "lucide-react";
import CustomFieldsSection from "@/components/CustomFieldsSection";
import SelectWithQuickCreate, {
  type QuickCreateOption,
} from "@/components/SelectWithQuickCreate";
import { flattenDepartmentOptions } from "@/lib/department-master";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { compareAssetCategoryNames } from "@/lib/utils";

export default function AssetCreateForm({
  categories: initialCategories,
  locations: initialLocations,
  manufacturers: initialManufacturers,
  models: initialModels,
  statuses: initialStatuses,
  suppliers: initialSuppliers,
  users,
  departments: initialDepartments,
}) {
  // Mutable option lists for quick-create
  const [categoryOptions, setCategoryOptions] = useState<QuickCreateOption[]>(
    () =>
      initialCategories.map((c: any) => ({
        id: c.assetcategorytypeid,
        label: c.assetcategorytypename,
      })),
  );
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
  const [statusOptions, setStatusOptions] = useState<QuickCreateOption[]>(() =>
    initialStatuses.map((s: any) => ({
      id: s.statustypeid,
      label: s.statustypename,
    })),
  );
  const [supplierOptions, setSupplierOptions] = useState<QuickCreateOption[]>(
    () =>
      initialSuppliers.map((s: any) => ({
        id: s.supplierid,
        label: s.suppliername,
      })),
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [createdAsset, setCreatedAsset] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [assettagTaken, setAssettagTaken] = useState(false);
  const [serialTaken, setSerialTaken] = useState(false);
  const [serialLookupLoading, setSerialLookupLoading] = useState(false);
  const [serialLookupResult, setSerialLookupResult] = useState<{
    detected: boolean;
    manufacturer: string | null;
    confidence: string | null;
    suggestions: { category: string | null } | null;
  } | null>(null);
  const [generatingTag, setGeneratingTag] = useState(false);
  const [generatingPid, setGeneratingPid] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string | null>
  >({});
  const [form, setForm] = useState(() => ({
    assetname: searchParams.get("assetname") || "",
    assettag: "",
    serialnumber: "",
    modelid: searchParams.get("modelid") || "",
    specs: searchParams.get("specs") || "",
    notes: "",
    purchaseprice: searchParams.get("purchaseprice") || "",
    purchasedate: "",
    mobile: searchParams.get("mobile") === "true",
    requestable: searchParams.get("requestable") === "true",
    assetcategorytypeid: searchParams.get("assetcategorytypeid") || "",
    statustypeid: searchParams.get("statustypeid") || "",
    supplierid: searchParams.get("supplierid") || "",
    locationid: searchParams.get("locationid") || "",
    manufacturerid: searchParams.get("manufacturerid") || "",
    departmentid: searchParams.get("departmentid") || "",
    departmentCode: searchParams.get("departmentCode") || "",
    warrantyMonths: searchParams.get("warrantyMonths") || "",
    warrantyExpires: "",
    reviewsDate: "",
    remark: "",
  }));
  const isDirty =
    form.assetname !== "" ||
    form.assettag !== "" ||
    form.serialnumber !== "" ||
    form.reviewsDate !== "" ||
    form.remark !== "";
  const missingRequired = [
    !form.assetname.trim() && "Asset Name",
    !form.assettag.trim() && "Asset Tag",
    !form.assetcategorytypeid && "Asset Type",
    !form.departmentid && "Department",
  ].filter(Boolean) as string[];
  const canSubmit = missingRequired.length === 0 && !assettagTaken;
  useUnsavedChanges(isDirty);

  // Asset templates
  const [templates, setTemplates] = useState<
    Array<{
      id: string;
      name: string;
      description?: string | null;
      assetcategorytypeid?: string | null;
      manufacturerid?: string | null;
      modelid?: string | null;
      statustypeid?: string | null;
      locationid?: string | null;
      supplierid?: string | null;
      defaultSpecs?: string | null;
      defaultNotes?: string | null;
    }>
  >([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  useEffect(() => {
    fetch("/api/asset-templates")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  const applyTemplate = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      if (!templateId || templateId === "__none__") return;
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return;
      setForm((f) => ({
        ...f,
        assetcategorytypeid: tpl.assetcategorytypeid || f.assetcategorytypeid,
        manufacturerid: tpl.manufacturerid || f.manufacturerid,
        modelid: tpl.modelid || f.modelid,
        statustypeid: tpl.statustypeid || f.statustypeid,
        locationid: tpl.locationid || f.locationid,
        supplierid: tpl.supplierid || f.supplierid,
        specs: tpl.defaultSpecs || f.specs,
        notes: tpl.defaultNotes || f.notes,
      }));
    },
    [templates],
  );

  // Auto-fetch Metahara Sugar PID preview whenever Asset Type and Department are selected
  useEffect(() => {
    if (!form.assetcategorytypeid || !form.departmentid) {
      return;
    }
    let isMounted = true;
    setGeneratingPid(true);
    const params = new URLSearchParams({
      categoryId: form.assetcategorytypeid,
      departmentId: form.departmentid,
    });
    fetch(`/api/asset/nextPid?${params.toString()}`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((d) => {
            throw new Error(d.error || "Failed to preview PID");
          });
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted && data?.pid) {
          setForm((f) => ({ ...f, serialnumber: data.pid }));
          setSerialTaken(false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setGeneratingPid(false);
      });
    return () => {
      isMounted = false;
    };
  }, [form.assetcategorytypeid, form.departmentid]);

  // Preselect default status "Available" if present
  useEffect(() => {
    if (!form.statustypeid && statusOptions.length) {
      const available = statusOptions.find(
        (s) => s.label?.toLowerCase() === "available",
      );
      if (available) {
        setForm((f) => ({ ...f, statustypeid: available.id }));
      }
    }
  }, [statusOptions, form.statustypeid]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSelectChange = (name) => (value) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onDepartmentChange = (value: string) => {
    const option = departmentOptions.find((o) => o.id === value);
    setForm((f) => ({
      ...f,
      departmentid: value,
      departmentCode: option?.code ?? "",
    }));
  };

  const onAssetTypeChange = (value: string) => {
    const selectedType = categoryOptions.find((c) => c.id === value);
    setForm((f) => ({
      ...f,
      assetcategorytypeid: value,
      // Auto-fill asset name with the selected type label if name is currently empty
      // or was previously auto-filled (matches a category label)
      assetname:
        !f.assetname || categoryOptions.some((c) => c.label === f.assetname)
          ? (selectedType?.label ?? f.assetname)
          : f.assetname,
    }));
  };

  const onSubmit = async (e, assignAfter = false) => {
    e.preventDefault();
    if (!form.assetname.trim()) {
      const msg = "Please enter an Asset Name.";
      setError(msg);
      notify.error(msg);
      return;
    }
    if (!form.assettag.trim()) {
      const msg = "Please enter or generate an Asset Tag.";
      setError(msg);
      notify.error(msg);
      return;
    }
    if (!form.assetcategorytypeid) {
      const msg = "Please select an Asset Type.";
      setError(msg);
      notify.error(msg);
      return;
    }
    if (!form.departmentid) {
      const msg = "Please select a Department to generate the official PID.";
      setError(msg);
      notify.error(msg);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        ...form,
        modelid: form.modelid || null,
        specs: form.specs || null,
        notes: form.notes || null,
        purchaseprice: form.purchaseprice === "" ? null : form.purchaseprice,
        purchasedate: form.purchasedate || null,
        assetcategorytypeid: form.assetcategorytypeid || null,
        statustypeid: form.statustypeid || null,
        supplierid: form.supplierid || null,
        locationid: form.locationid || null,
        manufacturerid: form.manufacturerid || null,
        departmentId: form.departmentid || null,
        departmentCode: form.departmentCode || null,
        warrantyMonths:
          form.warrantyMonths === "" ? null : Number(form.warrantyMonths),
        warrantyExpires: form.warrantyExpires || null,
        reviewsDate: form.reviewsDate || null,
        remark: form.remark || null,
      };
      const res = await fetch("/api/asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to create asset");
      }
      const created = await res.json();
      // Save custom field values
      if (Object.keys(customFieldValues).length > 0) {
        await fetch("/api/custom-fields/values", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityId: created.assetid,
            entityType: "asset",
            values: customFieldValues,
          }),
        });
      }
      notify.success({ title: "Asset created", description: created.assettag });
      if (assignAfter) {
        setCreatedAsset(created);
        setAssignModalOpen(true);
      } else {
        router.push(`/assets/${created.assetid}`);
      }
    } catch (err) {
      setError(err.message);
      notify.error({ title: "Create failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = useCallback(() => {
    setForm({
      assetname: "",
      assettag: "",
      serialnumber: "",
      modelid: "",
      specs: "",
      notes: "",
      purchaseprice: "",
      purchasedate: "",
      mobile: false,
      requestable: false,
      assetcategorytypeid: "",
      statustypeid: "",
      supplierid: "",
      locationid: "",
      manufacturerid: "",
      departmentid: "",
      departmentCode: "",
      warrantyMonths: "",
      warrantyExpires: "",
      reviewsDate: "",
      remark: "",
    });
    setSerialLookupResult(null);
    setSerialTaken(false);
    setAssettagTaken(false);
  }, []);

  return (
    <div className="max-w-5xl">
      <form
        onSubmit={(e) => onSubmit(e, false)}
        className="flex flex-col gap-4 sm:gap-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">
              Create New Asset
            </h1>
            <p className="text-foreground-500 mt-1 text-sm">
              Fill out details below
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="w-full sm:w-auto"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="default"
              className="w-full shadow-lg sm:w-auto"
              disabled={submitting}
              type="button"
              onClick={() => onSubmit({ preventDefault: () => {} }, true)}
            >
              {submitting ? "Creating..." : "Create & Assign"}
            </Button>
          </div>
        </div>

        {templates.length > 0 && (
          <div className="border-default-200 bg-muted/30 flex items-center gap-3 rounded-lg border p-3">
            <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
            <Label htmlFor="template" className="shrink-0 text-sm font-medium">
              From Template
            </Label>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger id="template" className="max-w-xs">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="border-primary/20 bg-primary/5 flex items-start gap-3 rounded-lg border p-4 text-sm">
          <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              Required fields: Summary, Specifications, Review, and Identifiers.
            </p>
            <p className="text-foreground-500 mt-0.5 text-xs">
              Procurement details (supplier, purchase price, date, warranty) are
              optional at creation and will be filled in later by the
              Procurement / Finance team via the asset edit page.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* ─── Summary (Required) ─── */}
          <section className="border-default-200 col-span-1 rounded-lg border p-4">
            <h2 className="text-foreground-600 mb-3 flex items-center gap-2 text-sm font-semibold">
              Summary
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
                Required
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="assetcategorytypeid">Asset Type *</Label>
                <SelectWithQuickCreate
                  id="assetcategorytypeid"
                  value={form.assetcategorytypeid}
                  onValueChange={onAssetTypeChange}
                  options={categoryOptions}
                  onItemCreated={(item) =>
                    setCategoryOptions((prev) => [...prev, item])
                  }
                  placeholder="Select asset type"
                  apiEndpoint="/api/assetCategory"
                  nameField="assetcategorytypename"
                  idField="assetcategorytypeid"
                  entityLabel="Asset Type"
                />
              </div>
              <div>
                <Label htmlFor="assetname">Asset Name *</Label>
                <Input
                  id="assetname"
                  name="assetname"
                  value={form.assetname}
                  onChange={onChange}
                  placeholder="Auto-filled from Asset Type — edit if needed"
                />
              </div>
              <div>
                <Label htmlFor="statustypeid">Status</Label>
                <SelectWithQuickCreate
                  id="statustypeid"
                  value={form.statustypeid}
                  onValueChange={onSelectChange("statustypeid")}
                  options={statusOptions}
                  onItemCreated={(item) =>
                    setStatusOptions((prev) => [...prev, item])
                  }
                  placeholder="Select status"
                  apiEndpoint="/api/statusType"
                  nameField="statustypename"
                  idField="statustypeid"
                  entityLabel="Status"
                />
              </div>
              <div>
                <Label htmlFor="departmentid">Department</Label>
                <Select
                  value={form.departmentid}
                  onValueChange={onDepartmentChange}
                >
                  <SelectTrigger id="departmentid">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.length === 0 && (
                      <p className="text-muted-foreground px-3 py-2 text-sm">
                        No departments loaded yet
                      </p>
                    )}
                    {departmentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <span
                          className="flex items-baseline gap-1.5"
                          style={{ paddingLeft: option.depth * 12 }}
                        >
                          {option.code && (
                            <span className="text-muted-foreground font-mono text-xs">
                              {option.code}
                            </span>
                          )}
                          <span>{option.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-foreground-500 mt-1 text-xs">
                  Official MSF department. The department code is used in PID
                  and asset tag generation.
                </p>
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

          {/* ─── Identifiers (Required) ─── */}
          <section className="border-default-200 col-span-1 rounded-lg border p-4">
            <h2 className="text-foreground-600 mb-3 flex items-center gap-2 text-sm font-semibold">
              Identifiers
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
                Required
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="assettag">Asset Tag *</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="assettag"
                    name="assettag"
                    value={form.assettag}
                    onChange={onChange}
                    onBlur={async () => {
                      if (!form.assettag) return;
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title={
                      !form.assetcategorytypeid
                        ? "Select an asset type first to generate a tag"
                        : "Generate asset tag"
                    }
                    disabled={generatingTag || !form.assetcategorytypeid}
                    onClick={async () => {
                      setGeneratingTag(true);
                      try {
                        const params = new URLSearchParams();
                        if (form.assetcategorytypeid)
                          params.set("categoryId", form.assetcategorytypeid);
                        if (form.manufacturerid)
                          params.set("manufacturerId", form.manufacturerid);
                        if (form.modelid) params.set("modelId", form.modelid);
                        if (form.departmentCode)
                          params.set("departmentCode", form.departmentCode);
                        const res = await fetch(
                          `/api/asset/nextTag?${params.toString()}`,
                        );
                        if (!res.ok) throw new Error("Failed to generate tag");
                        const data = await res.json();
                        setForm((f) => ({ ...f, assettag: data.tag }));
                        setAssettagTaken(false);
                      } catch (err) {
                        notify.error("Failed to generate tag");
                      } finally {
                        setGeneratingTag(false);
                      }
                    }}
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
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
                <div className="flex items-center gap-1.5">
                  <Input
                    id="serialnumber"
                    name="serialnumber"
                    value={form.serialnumber}
                    readOnly
                    placeholder={
                      generatingPid
                        ? "Generating PID..."
                        : !form.assetcategorytypeid || !form.departmentid
                          ? "Will be generated automatically"
                          : "PID will appear here"
                    }
                    className={`bg-muted/40 cursor-not-allowed font-mono ${serialTaken ? "border-red-500" : ""}`}
                  />
                  {generatingPid && (
                    <div className="flex items-center px-1">
                      <Loader2 className="text-primary h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
                {serialTaken && (
                  <p className="mt-1 text-sm text-red-500">
                    Property ID already exists
                  </p>
                )}
                {!form.assetcategorytypeid || !form.departmentid ? (
                  <p className="text-foreground-500 mt-1 text-xs">
                    Select Asset Type and Department to generate the official
                    PID (1-06-Type-Dept-Seq).
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Official Metahara Sugar Factory PID generated automatically.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ─── Specifications (Required) ─── */}
          <section className="border-default-200 col-span-1 rounded-lg border p-4">
            <h2 className="text-foreground-600 mb-3 flex items-center gap-2 text-sm font-semibold">
              Specifications
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
                Required
              </span>
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
            </div>
          </section>
        </div>

        {/* ─── Review (Required) ─── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          <section className="border-default-200 col-span-1 rounded-lg border p-4">
            <h2 className="text-foreground-600 mb-3 flex items-center gap-2 text-sm font-semibold">
              Review
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
                Required
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="reviewsDate">Reviews Date</Label>
                <Input
                  id="reviewsDate"
                  name="reviewsDate"
                  value={form.reviewsDate}
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
                  value={form.remark}
                  onChange={onChange}
                  placeholder="Inspection findings, review notes, maintenance observations..."
                  rows={3}
                />
              </div>
            </div>
          </section>
        </div>

        {/* ─── Custom Fields ─── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          <CustomFieldsSection
            entityType="asset"
            entityId={null}
            onChange={setCustomFieldValues}
          />
        </div>

        {/* ─── Procurement (Optional — role-gated) ─── */}
        <div className="border-muted-foreground/25 bg-muted/20 rounded-xl border-2 border-dashed p-5">
          <div className="mb-4">
            <h2 className="text-foreground-600 flex items-center gap-2 text-sm font-semibold">
              Procurement
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
                Optional at creation
              </span>
            </h2>
            <p className="text-foreground-500 mt-1 text-xs">
              These fields are populated later by the Procurement / Finance team
              via the asset edit page after purchase confirmation.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
                value={form.purchaseprice}
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
                value={form.purchasedate}
                onChange={onChange}
                type="date"
              />
            </div>
            <div>
              <Label htmlFor="warrantyMonths">Warranty (months)</Label>
              <Input
                id="warrantyMonths"
                name="warrantyMonths"
                value={form.warrantyMonths}
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
                value={form.warrantyExpires}
                onChange={onChange}
                type="date"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col justify-end gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={resetForm}
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            className="w-full sm:w-auto"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
          <Button
            variant="default"
            className="w-full shadow-lg sm:w-auto"
            disabled={submitting}
            type="button"
            onClick={() => onSubmit({ preventDefault: () => {} }, true)}
          >
            {submitting ? "Creating..." : "Create & Assign"}
          </Button>
        </div>
      </form>

      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User to {createdAsset?.assetname}</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="userid">Select a user</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="userid">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.userid} value={u.userid}>
                    {u.firstname} {u.lastname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignModalOpen(false);
                router.push(`/assets/${createdAsset?.assetid}`);
              }}
            >
              Skip
            </Button>
            <Button
              variant="default"
              disabled={!selectedUserId}
              onClick={async () => {
                try {
                  const res = await fetch(`/api/userAssets/assign`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      assetId: createdAsset.assetid,
                      userId: selectedUserId,
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to assign user");
                  notify.success({
                    title: "User assigned",
                    description: createdAsset.assettag,
                  });
                } catch (e) {
                  notify.error({
                    title: "Assign failed",
                    description: e.message,
                  });
                } finally {
                  setAssignModalOpen(false);
                  router.push(`/assets/${createdAsset?.assetid}`);
                }
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
