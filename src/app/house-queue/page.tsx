import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import HouseQueueClient from "@/ui/house-queue/HouseQueueClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { computeHouseQueueWithActiveConfig } from "@/lib/house-queue/engine";

export const metadata = {
  title: "Asset Tracker - House Queue",
  description:
    "Live priority ranking and house recommendation engine based on the House Hold Register and Employee Management records.",
};

export default async function HouseQueuePage() {
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

  const initialData = await computeHouseQueueWithActiveConfig(orgId);

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "House Queue", href: "/house-queue" },
        ]}
      />
      <HouseQueueClient
        initialData={initialData}
        capabilities={capabilities}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";