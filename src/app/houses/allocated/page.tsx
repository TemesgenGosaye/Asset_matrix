import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import AllocatedHousesClient from "@/ui/houses/AllocatedHousesClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { listAllocatedHouses } from "@/lib/house-queue/views";

export const metadata = {
  title: "Asset Tracker - Allocated Houses",
  description:
    "Individual records of every live house allocation decided by the House Queue.",
};

export default async function AllocatedHousesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/");
  }

  const capabilities = {
    view: ctx.permissions.has("house_queue:view"),
    allocate: ctx.permissions.has("house_queue:allocate"),
    manage: ctx.permissions.has("house_queue:manage"),
    audit: ctx.permissions.has("house_queue:audit"),
  };
  if (!capabilities.view) {
    redirect("/");
  }

  const initialData = await listAllocatedHouses(orgId);

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "Allocated Houses", href: "/houses/allocated" },
        ]}
      />
      <AllocatedHousesClient
        initialData={initialData}
        capabilities={capabilities}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";