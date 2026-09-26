"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ComponentCategoryData {
  id: string;
  name: string;
}

interface ComponentCategoryCreateFormProps {
  initialData?: ComponentCategoryData | null;
  mode?: "create" | "edit";
}

export default function ComponentCategoryCreateForm({
  initialData = null,
  mode = "create",
}: ComponentCategoryCreateFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initialData?.name ?? "");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        name,
      };

      if (mode === "edit" && initialData?.id) {
        payload.id = initialData.id;
      }

      const res = await fetch("/api/componentCategory", {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save component category");
      }

      const created = await res.json();
      toast.success(
        mode === "edit"
          ? "Component category updated"
          : "Component category created",
        {
          description: created.name,
        },
      );
      router.push("/componentCategories");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      toast.error("Save failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">
              {mode === "edit"
                ? "Edit Component Category"
                : "Create Component Category"}
            </h1>
            <p className="text-foreground-500 mt-1 text-sm">
              Manage component classification types.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href="/componentCategories">Cancel</Link>
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={submitting}
            >
              {mode === "edit" ? "Save" : "Create"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-danger text-sm">{error}</p> : null}

        <section className="border-default-200 space-y-2 rounded-lg border p-4">
          <Label htmlFor="name">
            Category Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </section>

        <Separator />

        <div className="flex flex-col justify-end gap-2 sm:flex-row">
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/componentCategories">Cancel</Link>
          </Button>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={submitting}
          >
            {mode === "edit" ? "Save Changes" : "Create Component Category"}
          </Button>
        </div>
      </form>
    </div>
  );
}
