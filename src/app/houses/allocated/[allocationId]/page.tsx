import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import AllocatedHouseDetailClient from "@/ui/houses/AllocatedHouseDetailClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { getAllocationDetail } from "@/lib/house-queue/views";

export const metadata = {
  title: "Asset Tracker - Allocation Record",
  description:
    "Individual record of a house allocation decided by the House Queue.",
};

interface RecordPageProps {
  params: Promise<{ allocationId: string }>;
}

export default async function AllocationRecordPage({
  params,
}: RecordPageProps) {
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

  const { allocationId } = await params;
  const detail = await getAllocationDetail(orgId, allocationId);
  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          {
            label: "Allocated Houses",
            href: "/houses/allocated",
          },
          {
            label: detail.house?.houseNumber ?? "Record",
            href: `/houses/allocated/${allocationId}`,
          },
        ]}
      />
      <AllocatedHouseDetailClient
        detail={detail}
        capabilities={capabilities}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";