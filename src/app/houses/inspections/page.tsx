import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import InspectionsWorklistClient from "@/ui/houses/InspectionsWorklistClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { listInspections } from "@/lib/house-queue/views";

export const metadata = {
  title: "Asset Tracker - Inspections",
  description:
    "Facility worklist of pending and resolved house handback inspections raised by the Release Workflow.",
};

export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/");
  }

  const permissions = ctx.permissions;
  const capabilities = {
    view: permissions.has("house_queue:view"),
    allocate: permissions.has("house_queue:allocate"),
    manage: permissions.has("house_queue:manage"),
    audit: permissions.has("house_queue:audit"),
  };
  if (!capabilities.view) {
    redirect("/");
  }

  const inspections = await listInspections(orgId, { status: "open" });

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "Inspections", href: "/houses/inspections" },
        ]}
      />
      <InspectionsWorklistClient
        initialData={inspections}
        capabilities={capabilities}
      />
    </div>
  );
}