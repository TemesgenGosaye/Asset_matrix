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

interface Reference {
  id: string;
  name: string;
  code?: string | null;
}

interface Props {
  mode: "create" | "edit";
  assetId?: string;
  departments: Reference[];
  statuses: Reference[];
  locations: Reference[];
}

interface FormState {
  departmentId: string;
  statustypeid: string;
  locationid: string;
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
  statustypeid: "",
  locationid: "",
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

const selectClass =
  "h-10 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function FixedAssetForm({
  mode,
  assetId,
  departments,
  statuses,
  locations,
}: Props) {
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
          statustypeid: (item.statustypeid as string) ?? "",
          locationid: (item.locationid as string) ?? "",
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
      setError("Description and Property No are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const basePayload = {
        assetname: form.assetname.trim(),
        assettag: form.serialnumber.trim(),
        serialnumber: form.serialnumber.trim(),
        departmentId: form.departmentId || undefined,
        statustypeid: form.statustypeid || undefined,
        locationid: form.locationid || undefined,
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
          location1: form.location1 || null,
          reviewDate1: form.reviewDate1 || null,
          financeNo2: form.financeNo2 || null,
          condition2Raw: form.condition2Raw || null,
          location2Raw: form.location2Raw || null,
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-brass-400 text-2xl font-bold">
            {mode === "create" ? "New fixed asset" : "Edit fixed asset"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Master List fields are saved additively; existing asset features
            stay unchanged.
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/assets")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="space-y-1">
              <Label>Description *</Label>
              <Input
                value={form.assetname}
                onChange={(e) => update("assetname", e.target.value)}
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
              <div className="space-y-1">
                <Label>Department</Label>
                <select
                  className={selectClass}
                  value={form.departmentId}
                  onChange={(e) => update("departmentId", e.target.value)}
                >
                  <option value="">—</option>
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Category Code</Label>
                <Input
                  value={form.categoryCode}
                  onChange={(e) => update("categoryCode", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>S.No</Label>
                <Input
                  value={form.serialNo}
                  onChange={(e) => update("serialNo", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Condition (2nd)</Label>
                <select
                  className={selectClass}
                  value={form.statustypeid}
                  onChange={(e) => update("statustypeid", e.target.value)}
                >
                  <option value="">—</option>
                  {statuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Location (2nd)</Label>
              <select
                className={selectClass}
                value={form.locationid}
                onChange={(e) => update("locationid", e.target.value)}
              >
                <option value="">—</option>
                {locations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">First review</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Finance No (1st)</Label>
                <Input
                  value={form.financeNo1}
                  onChange={(e) => update("financeNo1", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Condition (1st)</Label>
                <Input
                  value={form.condition1}
                  onChange={(e) => update("condition1", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Location (1st)</Label>
                <Input
                  value={form.location1}
                  onChange={(e) => update("location1", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Review Date (1st)</Label>
                <Input
                  type="date"
                  value={form.reviewDate1}
                  onChange={(e) => update("reviewDate1", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Finance No (2nd)</Label>
                <Input
                  value={form.financeNo2}
                  onChange={(e) => update("financeNo2", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Review Date (2nd)</Label>
                <Input
                  type="date"
                  value={form.reviewDate2}
                  onChange={(e) => update("reviewDate2", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Condition raw (2nd)</Label>
              <Input
                value={form.condition2Raw}
                onChange={(e) => update("condition2Raw", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Location raw (2nd)</Label>
              <Input
                value={form.location2Raw}
                onChange={(e) => update("location2Raw", e.target.value)}
              />
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
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/assets")}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
