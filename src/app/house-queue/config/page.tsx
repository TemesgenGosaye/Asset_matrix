import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import EngineConfigClient from "./ui/EngineConfigClient";

export const metadata = {
  title: "Asset Tracker - House Queue Engine Configuration",
  description:
    "Tune the house queue engine: MCDA weights, eligibility bands and recommendation rules — with impact previews and an audit trail.",
};

export const dynamic = "force-dynamic";

export default async function HouseQueueConfigPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/");
  }

  const canManage = Boolean(
    session.user.isadmin || ctx.permissions.has("house_queue:manage"),
  );
  if (!canManage) {
    redirect("/house-queue");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "House Queue", href: "/house-queue" },
          { label: "Engine Configuration", href: "/house-queue/config" },
        ]}
      />
      <EngineConfigClient />
    </div>
  );
}
