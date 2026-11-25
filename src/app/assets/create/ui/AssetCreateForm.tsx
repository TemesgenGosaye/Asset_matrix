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
import { Badge } from "@/components/ui/badge";
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
import SearchableCombobox, {
  type MasterOption,
} from "@/components/SearchableCombobox";
import { flattenDepartmentOptions } from "@/lib/department-master";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

function SectionHeading({ step, title, hint }) {
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
  const categoryOptions = useMemo<QuickCreateOption[]>(
    () =>
      initialCategories
        .filter((c: any) => c.isActive !== false)
        .map((c: any) => ({
          id: c.assetcategorytypeid,
          label: c.assetcategorytypename,
        })),
    [initialCategories],
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
    condition1StatusId: searchParams.get("condition1StatusId") || "",
    supplierid: searchParams.get("supplierid") || "",
    locationid: searchParams.get("locationid") || "",
    location1Id: searchParams.get("location1Id") || "",
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
    const params = new URLSearchParams({
      categoryId: form.assetcategorytypeid,
      departmentId: form.departmentid,
    });
    Promise.resolve()
      .then(() => {
        if (isMounted) setGeneratingPid(true);
        return fetch(`/api/asset/nextPid?${params.toString()}`);
      })
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

  // Default status preselection is handled in initial state if needed

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSelectChange = (name) => (value) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onDepartmentChange = (value: string, item?: MasterOption | null) => {
    const option = departmentOptions.find((o) => o.id === value);
    setForm((f) => ({
      ...f,
      departmentid: value,
      departmentCode: item?.code ?? option?.code ?? "",
    }));
  };

  const onAssetTypeChange = (value: string, item?: MasterOption | null) => {
    const selectedType = categoryOptions.find((c) => c.id === value);
    const label = item?.name ?? selectedType?.label;
    setForm((f) => ({
      ...f,
      assetcategorytypeid: value,
      // Auto-fill asset name with the selected type label if name is currently empty
      // or was previously auto-filled (matches a category label)
      assetname:
        !f.assetname || categoryOptions.some((c) => c.label === f.assetname)
          ? (label ?? f.assetname)
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
      condition1StatusId: "",
      supplierid: "",
      locationid: "",
      location1Id: "",
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
    <div className="mx-auto w-full max-w-4xl">
      <form onSubmit={(e) => onSubmit(e, false)}>
        <div className="border-border/60 bg-card rounded-xl border p-5 shadow-sm sm:p-6">
          <div className="mb-5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
                <Fingerprint className="h-4 w-4" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">
                Create New Asset
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Register an asset using the approved master lists and official
              identifiers.
            </p>
          </div>

          {templates.length > 0 && (
            <div className="border-border/60 bg-muted/30 mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <FileText className="text-primary h-4 w-4 shrink-0" />
              <Label
                htmlFor="template"
                className="shrink-0 text-xs font-semibold"
              >
                From Template
              </Label>
              <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger id="template" className="h-9 max-w-xs">
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

          <div className="bg-muted/40 text-muted-foreground mb-2 flex items-start gap-2 rounded-lg p-3 text-xs">
            <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="text-foreground font-semibold">
                Master lists:
              </span>{" "}
              choose existing values where possible. Purchase details are
              optional at creation.
            </p>
          </div>

          <div className="space-y-6 py-2">
            <section className="space-y-4">
              <SectionHeading
                step={1}
                title="Identity"
                hint="Fields marked * are required"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <SearchableCombobox
                    id="assetcategorytypeid"
                    label="Asset Type"
                    required
                    type="category"
                    value={form.assetcategorytypeid}
                    departmentId={form.departmentid || null}
                    placeholder="Select asset type..."
                    onChange={onAssetTypeChange}
                  />
                </div>
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
                  <SearchableCombobox
                    id="statustypeid"
                    label="Status / Condition (2nd)"
                    type="status"
                    value={form.statustypeid}
                    placeholder="Select status..."
                    allowCreate={false}
                    onChange={(val) => onSelectChange("statustypeid")(val)}
                  />
                </div>
                <div className="space-y-1.5">
                  <SearchableCombobox
                    id="condition1StatusId"
                    label="Condition (1st)"
                    type="status"
                    value={form.condition1StatusId}
                    placeholder="Select condition (1st)..."
                    allowCreate={false}
                    onChange={(val) =>
                      onSelectChange("condition1StatusId")(val)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <SearchableCombobox
                    id="departmentid"
                    label="Department"
                    type="department"
                    value={form.departmentid}
                    placeholder="Select department..."
                    allowCreate={false}
                    onChange={onDepartmentChange}
                  />
                  <p className="text-foreground-500 mt-1 text-xs">
                    Official MSF department. The department code is used in PID
                    and asset tag generation.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <SearchableCombobox
                    id="location1Id"
                    label="Location (1st)"
                    type="location1"
                    value={form.location1Id}
                    departmentId={form.departmentid || null}
                    placeholder="Search location (1st)..."
                    onChange={(val) => onSelectChange("location1Id")(val)}
                  />
                </div>
                <div className="space-y-1.5">
                  <SearchableCombobox
                    id="locationid"
                    label="Location (2nd)"
                    type="location2"
                    value={form.locationid}
                    departmentId={form.departmentid || null}
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
                    <Label
                      className="text-xs font-medium"
                      htmlFor="requestable"
                    >
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
                    <Label className="text-xs font-medium" htmlFor="mobile">
                      Mobile
                    </Label>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading
                step={2}
                title="Identifiers"
                hint="System generated"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-medium" htmlFor="assettag">
                    Asset Tag *
                  </Label>
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
                          if (!res.ok)
                            throw new Error("Failed to generate tag");
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
                    <Label
                      className="text-xs font-medium"
                      htmlFor="serialnumber"
                    >
                      PID (Property ID) *
                    </Label>
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
                      Official Metahara Sugar Factory PID generated
                      automatically.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading
                step={3}
                title="Specifications"
                hint="Recommended"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label
                    className="text-xs font-medium"
                    htmlFor="manufacturerid"
                  >
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
                <div>
                  <Label className="text-xs font-medium" htmlFor="modelid">
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
                <div>
                  <Label className="text-xs font-medium" htmlFor="specs">
                    Specs
                  </Label>
                  <Textarea
                    id="specs"
                    name="specs"
                    value={form.specs ?? ""}
                    onChange={onChange}
                    placeholder="Key technical details..."
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium" htmlFor="notes">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={form.notes ?? ""}
                    onChange={onChange}
                    placeholder="Installation notes, observations, or reminders..."
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading step={4} title="Review" hint="Optional" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-medium" htmlFor="reviewsDate">
                    Reviews Date
                  </Label>
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
                  <Label className="text-xs font-medium" htmlFor="remark">
                    Remark
                  </Label>
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

              <div className="sm:col-span-2">
                <CustomFieldsSection
                  entityType="asset"
                  entityId={null}
                  onChange={setCustomFieldValues}
                />
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading step={5} title="Procurement" hint="Optional" />
              <div className="bg-muted/20 rounded-lg border p-4">
                <div className="text-muted-foreground mb-3 text-xs">
                  Purchase details are completed by Procurement / Finance after
                  confirmation.
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-medium" htmlFor="supplierid">
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
                  <div>
                    <Label
                      className="text-xs font-medium"
                      htmlFor="purchaseprice"
                    >
                      Purchase Price
                    </Label>
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
                    <Label
                      className="text-xs font-medium"
                      htmlFor="purchasedate"
                    >
                      Purchase Date
                    </Label>
                    <Input
                      id="purchasedate"
                      name="purchasedate"
                      value={form.purchasedate}
                      onChange={onChange}
                      type="date"
                    />
                  </div>
                  <div>
                    <Label
                      className="text-xs font-medium"
                      htmlFor="warrantyMonths"
                    >
                      Warranty (months)
                    </Label>
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
                    <Label
                      className="text-xs font-medium"
                      htmlFor="warrantyExpires"
                    >
                      Warranty Expires
                    </Label>
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
            </section>
          </div>

          {error ? (
            <div
              role="alert"
              className="bg-destructive/15 text-destructive mt-4 flex items-start gap-2 rounded-md p-3 text-sm"
            >
              {error}
            </div>
          ) : null}

          <div className="border-border/60 mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              disabled={submitting}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => onSubmit({ preventDefault: () => {} }, true)}
            >
              {submitting ? "Creating..." : "Create & Assign"}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User to {createdAsset?.assetname}</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs font-medium" htmlFor="userid">
              Select a user
            </Label>
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
