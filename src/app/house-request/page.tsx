import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import HouseRequestClient from "@/ui/house-request/HouseRequestClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";

export const metadata = {
  title: "Asset Tracker - House Request",
  description:
    "Verify an employee ID against the Employee Register and file a house request. Eligibility follows the central job grade to house category rule.",
};

export default async function HouseRequestPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/");
  }

  // Nobody without the submit permission can file a request, so the page is
  // unreachable rather than rendered as a permanently disabled worklist.
  const canCreate = ctx.permissions.has("house_request:create");
  if (!canCreate) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "House Request", href: "/house-request" },
        ]}
      />
      <HouseRequestClient capabilities={{ create: canCreate }} />
    </div>
  );
}

export const dynamic = "force-dynamic";
