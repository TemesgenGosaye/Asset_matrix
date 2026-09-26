import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import TerminatedHousesClient from "@/ui/houses/TerminatedHousesClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { listTerminatedHouses } from "@/lib/house-queue/views";

export const metadata = {
  title: "Asset Tracker - Terminated Houses",
  description:
    "Archive of reason-coded house allocation terminations decided by the House Queue.",
};

export default async function TerminatedHousesPage() {
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

  const initialData = await listTerminatedHouses(orgId);

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "Terminated Houses", href: "/houses/terminated" },
        ]}
      />
      <TerminatedHousesClient initialData={initialData} />
    </div>
  );
}

export const dynamic = "force-dynamic";