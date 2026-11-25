"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SearchableCombobox from "@/components/SearchableCombobox";

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
  financeNo1: string;
  condition1: string;
  location1: string;
  reviewDate1: string;
  financeNo2: string;
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
  financeNo1: "",
  condition1: "",
  location1: "",
  reviewDate1: "",
  financeNo2: "",
  condition2Raw: "",
  location2Raw: "",
  reviewDate2: "",
  additionalData: "",
  hiddenInSource: false,
};

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function FixedAssetForm({ mode, assetId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          financeNo1: (item.financeNo1 as string) ?? "",
          condition1: (item.condition1 as string) ?? "",
          location1: (item.location1 as string) ?? "",
          reviewDate1: dateOnly(item.reviewDate1 as string | null),
          financeNo2: (item.financeNo2 as string) ?? "",
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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
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
          financeNo1: form.financeNo1 || null,
          condition1: form.condition1 || null,
          condition1Raw: form.condition1 || null,
          condition1StatusId: form.condition1StatusId || null,
          location1: form.location1 || null,
          location1Id: form.location1Id || null,
          reviewDate1: form.reviewDate1 || null,
          financeNo2: form.financeNo2 || null,
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
      router.push("/assets");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="text-muted-foreground p-8 text-sm">Loading asset…</div>
    );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            {mode === "create" ? "New fixed asset" : "Edit fixed asset"}
          </h1>
          <p className="text-muted-foreground text-xs">
            Master List fields are saved additively; existing asset features
            stay unchanged.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => router.push("/assets")}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="form-card">
          <CardHeader>
            <CardTitle className="text-lg">Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="space-y-1">
              <SearchableCombobox
                id="fixed-asset-name"
                ariaLabel="Asset name"
                label="Asset name"
                type="assetName"
                value={form.assetname}
                placeholder="Search existing asset names..."
                onChange={(val) => update("assetname", val)}
              />
            </div>
            <div className="space-y-1">
              <Label>Property No *</Label>
              <Input
                value={form.serialnumber}
                onChange={(e) => update("serialnumber", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                onChange={(val, item) => {
                  update("assetcategorytypeid", val);
                  if (item && !item.isLegacy) {
                    update("categoryCode", item.code || item.name);
                  } else if (!val) {
                    update("categoryCode", "");
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fixed-asset-sno">S.No</Label>
                <Input
                  id="fixed-asset-sno"
                  value={form.serialNo}
                  onChange={(e) => update("serialNo", e.target.value)}
                />
              </div>
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
                onChange={(val, item) => {
                  update("statustypeid", val);
                  if (item && !item.isLegacy) {
                    update("condition2Raw", item.name);
                  } else if (!val) {
                    update("condition2Raw", "");
                  }
                }}
              />
            </div>
            <SearchableCombobox
              id="fixed-asset-location2"
              label="Location (2nd)"
              ariaLabel="Location (2nd)"
              type="location2"
              value={form.locationid}
              departmentId={form.departmentId || null}
              currentValue={!form.locationid ? form.location2Raw || null : null}
              placeholder="Search location (2nd)..."
              onChange={(val, item) => {
                update("locationid", val);
                if (item && !item.isLegacy) {
                  update("location2Raw", item.name);
                } else if (!val) {
                  update("location2Raw", "");
                }
              }}
            />
          </CardContent>
        </Card>

        <Card className="form-card">
          <CardHeader>
            <CardTitle className="text-lg">First review</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fixed-asset-financeno1">Finance No (1st)</Label>
                <Input
                  id="fixed-asset-financeno1"
                  value={form.financeNo1}
                  onChange={(e) => update("financeNo1", e.target.value)}
                />
              </div>
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
                onChange={(val, item) => {
                  update("condition1StatusId", val);
                  if (item && !item.isLegacy) {
                    update("condition1", item.name);
                  } else if (!val) {
                    update("condition1", "");
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SearchableCombobox
                id="fixed-asset-location1"
                label="Location (1st)"
                ariaLabel="Location (1st)"
                type="location1"
                value={form.location1Id}
                departmentId={form.departmentId || null}
                currentValue={!form.location1Id ? form.location1 || null : null}
                placeholder="Search location (1st)..."
                onChange={(val, item) => {
                  update("location1Id", val);
                  if (item && !item.isLegacy) {
                    update("location1", item.name);
                  } else if (!val) {
                    update("location1", "");
                  }
                }}
              />
              <div className="space-y-1">
                <Label htmlFor="fixed-asset-reviewdate1">
                  Review Date (1st)
                </Label>
                <Input
                  id="fixed-asset-reviewdate1"
                  type="date"
                  value={form.reviewDate1}
                  onChange={(e) => update("reviewDate1", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fixed-asset-financeno2">Finance No (2nd)</Label>
                <Input
                  id="fixed-asset-financeno2"
                  value={form.financeNo2}
                  onChange={(e) => update("financeNo2", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fixed-asset-reviewdate2">
                  Review Date (2nd)
                </Label>
                <Input
                  id="fixed-asset-reviewdate2"
                  type="date"
                  value={form.reviewDate2}
                  onChange={(e) => update("reviewDate2", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Additional Data</Label>
              <Textarea
                rows={3}
                value={form.additionalData}
                onChange={(e) => update("additionalData", e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.hiddenInSource}
                onCheckedChange={(checked) =>
                  update("hiddenInSource", Boolean(checked))
                }
              />
              Hidden in Source
            </label>
          </CardContent>
        </Card>
      </div>
      <div className="bg-background/95 sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t px-1 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => router.push("/assets")}
        >
          Cancel
        </Button>
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
          onClick={() => void submit()}
          disabled={saving}
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
