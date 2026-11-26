"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Fingerprint, Info, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SearchableCombobox from "@/components/SearchableCombobox";
import { resolveFinanceNo } from "@/lib/asset-columns";
import { notify } from "@/lib/feedback/notify";
import { prefetchMasterOptions } from "@/lib/master-options-cache";

interface Reference {
  id: string;
  name: string;
  code?: string | null;
}

interface Props {
  mode: "create" | "edit";
  assetId?: string;
  departments?: Reference[];
  statuses?: Reference[];
  locations?: Reference[];
  embedded?: boolean;
  onCancel?: () => void;
  onSuccess?: () => void;
}

interface FormState {
  departmentId: string;
  sourceDepartment: string;
  assetcategorytypeid: string;
  statustypeid: string;
  condition1StatusId: string;
  locationid: string;
  location1Id: string;
  assetname: string;
  serialnumber: string;
  categoryCode: string;
  serialNo: string;
  financeNo: string;
  condition1: string;
  location1: string;
  reviewDate1: string;
  condition2Raw: string;
  location2Raw: string;
  reviewDate2: string;
  additionalData: string;
  hiddenInSource: boolean;
}

const emptyForm: FormState = {
  departmentId: "",
  sourceDepartment: "",
  assetcategorytypeid: "",
  statustypeid: "",
  condition1StatusId: "",
  locationid: "",
  location1Id: "",
  assetname: "",
  serialnumber: "",
  categoryCode: "",
  serialNo: "",
  financeNo: "",
  condition1: "",
  location1: "",
  reviewDate1: "",
  condition2Raw: "",
  location2Raw: "",
  reviewDate2: "",
  additionalData: "",
  hiddenInSource: false,
};

const controlClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-primary/20 h-9 w-full rounded-lg border px-2 text-sm shadow-none";

const textareaClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-primary/20 min-h-20 w-full resize-none rounded-lg border px-2 py-2 text-sm shadow-none";

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

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

export default function FixedAssetForm({
  mode,
  assetId,
  embedded = false,
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kick off parallel prefetch of all master lists as soon as the form mounts
  // so every dropdown opens instantly without waiting for user interaction.
  useEffect(() => {
    prefetchMasterOptions();
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !assetId) return;
    fetch(`/api/fixed-assets/${assetId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load asset");
        const payload = await response.json();
        const item = payload.item as Record<string, unknown>;
        setForm({
          departmentId: (item.departmentId as string) ?? "",
          sourceDepartment: (item.sourceDepartment as string) ?? "",
          assetcategorytypeid: (item.assetcategorytypeid as string) ?? "",
          statustypeid: (item.statustypeid as string) ?? "",
          condition1StatusId: (item.condition1StatusId as string) ?? "",
          locationid: (item.locationid as string) ?? "",
          location1Id: (item.location1Id as string) ?? "",
          assetname: (item.assetname as string) ?? "",
          serialnumber: (item.serialnumber as string) ?? "",
          categoryCode: (item.categoryCode as string) ?? "",
          serialNo: (item.serialNo as string) ?? "",
          financeNo:
            resolveFinanceNo({
              financeNo: (item.financeNo as string) ?? null,
              financeNo1: (item.financeNo1 as string) ?? null,
              financeNo2: (item.financeNo2 as string) ?? null,
            }) ?? "",
          condition1: (item.condition1 as string) ?? "",
          location1: (item.location1 as string) ?? "",
          reviewDate1: dateOnly(item.reviewDate1 as string | null),
          condition2Raw: (item.condition2Raw as string) ?? "",
          location2Raw: (item.location2Raw as string) ?? "",
          reviewDate2: dateOnly(item.reviewsDate as string | null),
          additionalData: (item.additionalData as string) ?? "",
          hiddenInSource: Boolean(item.hiddenInSource),
        });
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [mode, assetId]);

  // When department is chosen, prefetch department-scoped location lists
  // so both Location dropdowns open instantly.
  useEffect(() => {
    if (form.departmentId) {
      prefetchMasterOptions(form.departmentId);
    }
  }, [form.departmentId]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const cancel = () => {
    if (onCancel) onCancel();
    else router.push("/assets");
  };

  const submit = async () => {
    if (!form.assetname.trim() || !form.serialnumber.trim()) {
      setError("Asset name and Property No are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const basePayload = {
        assetname: form.assetname.trim(),
        assettag: form.serialnumber.trim(),
        serialnumber: form.serialnumber.trim(),
        departmentId: form.departmentId || null,
        assetcategorytypeid: form.assetcategorytypeid || null,
        statustypeid: form.statustypeid || null,
        condition1StatusId: form.condition1StatusId || null,
        locationid: form.locationid || null,
        location1Id: form.location1Id || null,
        reviewsDate: form.reviewDate2 || undefined,
      };
      const baseResponse = await fetch("/api/asset", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "create"
            ? basePayload
            : { assetid: assetId, ...basePayload },
        ),
      });
      const baseResult = await baseResponse.json();
      if (!baseResponse.ok)
        throw new Error(baseResult.error || "Failed to save asset");
      const savedId = mode === "create" ? baseResult.assetid : assetId;
      const detailResponse = await fetch(`/api/fixed-assets/${savedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryCode: form.categoryCode || null,
          serialNo: form.serialNo || null,
          financeNo: form.financeNo,
          condition1: form.condition1 || null,
          condition1Raw: form.condition1 || null,
          condition1StatusId: form.condition1StatusId || null,
          location1: form.location1 || null,
          location1Id: form.location1Id || null,
          reviewDate1: form.reviewDate1 || null,
          condition2Raw: form.condition2Raw || null,
          statustypeid: form.statustypeid || null,
          location2Raw: form.location2Raw || null,
          locationid: form.locationid || null,
          assetcategorytypeid: form.assetcategorytypeid || null,
          additionalData: form.additionalData || null,
          hiddenInSource: form.hiddenInSource,
        }),
      });
      if (!detailResponse.ok) {
        const detailResult = await detailResponse.json();
        throw new Error(detailResult.error || "Failed to save register fields");
      }
      notify.success(
        mode === "create" ? "Fixed asset created" : "Fixed asset updated",
      );
      if (onSuccess) onSuccess();
      else {
        router.push("/assets");
        router.refresh();
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="border-border/60 bg-muted/20 flex flex-col items-center justify-center gap-2 rounded-lg border p-10 text-sm">
        <Loader2 className="text-primary h-5 w-5 animate-spin" />
        <span className="text-muted-foreground">Loading asset details…</span>
      </div>
    );

  const content = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className={embedded ? "space-y-5" : "form-card space-y-5 p-5 sm:p-6"}
    >
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-xs">
        <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="text-foreground font-semibold">Master lists:</span>{" "}
          choose existing values where possible. Property No is required.
        </p>
      </div>

      <section className="space-y-4">
        <SectionHeading
          step={1}
          title="Identity"
          hint="Fields marked * are required"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableCombobox
            id="fixed-asset-name"
            ariaLabel="Asset name"
            label="Asset name"
            required
            type="assetName"
            value={form.assetname}
            placeholder="Search existing asset names..."
            compact={embedded}
            onChange={(val) => update("assetname", val)}
          />
          <div className="space-y-1.5">
            <Label
              className="text-xs font-medium"
              htmlFor="fixed-asset-property-no"
            >
              Property No *
            </Label>
            <Input
              id="fixed-asset-property-no"
              className={controlClass}
              value={form.serialnumber}
              onChange={(event) => update("serialnumber", event.target.value)}
              required
            />
          </div>
          <SearchableCombobox
            id="fixed-asset-department"
            label="Department"
            ariaLabel="Department"
            type="department"
            value={form.departmentId}
            currentValue={
              !form.departmentId ? form.sourceDepartment || null : null
            }
            placeholder="Select department..."
            allowCreate={false}
            compact={embedded}
            onChange={(val) => update("departmentId", val)}
          />
          <SearchableCombobox
            id="fixed-asset-category"
            label="Category Code"
            ariaLabel="Category Code"
            type="category"
            value={form.assetcategorytypeid}
            departmentId={form.departmentId || null}
            currentValue={
              !form.assetcategorytypeid ? form.categoryCode || null : null
            }
            placeholder="Search category code..."
            compact={embedded}
            onChange={(val, item) => {
              update("assetcategorytypeid", val);
              if (item && !item.isLegacy) {
                update("categoryCode", item.code || item.name);
              } else if (!val) {
                update("categoryCode", "");
              }
            }}
          />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium" htmlFor="fixed-asset-sno">
              S.No
            </Label>
            <Input
              id="fixed-asset-sno"
              className={controlClass}
              value={form.serialNo}
              onChange={(event) => update("serialNo", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              className="text-xs font-medium"
              htmlFor="fixed-asset-financeno"
            >
              Finance No
            </Label>
            <Input
              id="fixed-asset-financeno"
              className={controlClass}
              value={form.financeNo}
              onChange={(event) => update("financeNo", event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          step={2}
          title="Current review"
          hint="Latest condition"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableCombobox
            id="fixed-asset-condition2"
            label="Condition (2nd)"
            ariaLabel="Condition (2nd)"
            type="status"
            value={form.statustypeid}
            currentValue={
              !form.statustypeid ? form.condition2Raw || null : null
            }
            placeholder="Select condition (2nd)..."
            allowCreate={false}
            compact={embedded}
            onChange={(val, item) => {
              update("statustypeid", val);
              if (item && !item.isLegacy) {
                update("condition2Raw", item.name);
              } else if (!val) {
                update("condition2Raw", "");
              }
            }}
          />
          <SearchableCombobox
            id="fixed-asset-location2"
            label="Location (2nd)"
            ariaLabel="Location (2nd)"
            type="location2"
            value={form.locationid}
            departmentId={form.departmentId || null}
            currentValue={!form.locationid ? form.location2Raw || null : null}
            placeholder="Search location (2nd)..."
            compact={embedded}
            onChange={(val, item) => {
              update("locationid", val);
              if (item && !item.isLegacy) {
                update("location2Raw", item.name);
              } else if (!val) {
                update("location2Raw", "");
              }
            }}
          />
          <div className="space-y-1.5">
            <Label
              className="text-xs font-medium"
              htmlFor="fixed-asset-reviewdate2"
            >
              Review Date (2nd)
            </Label>
            <Input
              id="fixed-asset-reviewdate2"
              type="date"
              className={controlClass}
              value={form.reviewDate2}
              onChange={(event) => update("reviewDate2", event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading step={3} title="First review" hint="Source sheet" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableCombobox
            id="fixed-asset-condition1"
            label="Condition (1st)"
            ariaLabel="Condition (1st)"
            type="status"
            value={form.condition1StatusId}
            currentValue={
              !form.condition1StatusId ? form.condition1 || null : null
            }
            placeholder="Select condition (1st)..."
            allowCreate={false}
            compact={embedded}
            onChange={(val, item) => {
              update("condition1StatusId", val);
              if (item && !item.isLegacy) {
                update("condition1", item.name);
              } else if (!val) {
                update("condition1", "");
              }
            }}
          />
          <SearchableCombobox
            id="fixed-asset-location1"
            label="Location (1st)"
            ariaLabel="Location (1st)"
            type="location1"
            value={form.location1Id}
            departmentId={form.departmentId || null}
            currentValue={!form.location1Id ? form.location1 || null : null}
            placeholder="Search location (1st)..."
            compact={embedded}
            onChange={(val, item) => {
              update("location1Id", val);
              if (item && !item.isLegacy) {
                update("location1", item.name);
              } else if (!val) {
                update("location1", "");
              }
            }}
          />
          <div className="space-y-1.5">
            <Label
              className="text-xs font-medium"
              htmlFor="fixed-asset-reviewdate1"
            >
              Review Date (1st)
            </Label>
            <Input
              id="fixed-asset-reviewdate1"
              type="date"
              className={controlClass}
              value={form.reviewDate1}
              onChange={(event) => update("reviewDate1", event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading step={4} title="Register data" hint="Optional" />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              className="text-xs font-medium"
              htmlFor="fixed-asset-additional-data"
            >
              Additional Data
            </Label>
            <Textarea
              id="fixed-asset-additional-data"
              className={textareaClass}
              value={form.additionalData}
              onChange={(event) => update("additionalData", event.target.value)}
            />
          </div>
          <div className="bg-muted/20 flex items-center gap-2 rounded-lg border p-3">
            <Checkbox
              id="fixed-asset-hidden"
              checked={form.hiddenInSource}
              onCheckedChange={(checked) =>
                update("hiddenInSource", Boolean(checked))
              }
            />
            <Label className="text-xs font-medium" htmlFor="fixed-asset-hidden">
              Hidden in Source
            </Label>
          </div>
        </div>
      </section>

      <div className="border-border/60 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={cancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );

  if (embedded) return content;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
              <Fingerprint className="h-4 w-4" />
            </span>
            {mode === "create" ? "New fixed asset" : "Edit fixed asset"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Register an asset using the approved master lists and source fields.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={cancel}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
      {content}
    </div>
  );
}
