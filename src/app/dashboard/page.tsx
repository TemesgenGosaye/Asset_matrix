import Breadcrumb from "@/components/Breadcrumb";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import DashboardWelcome from "@/components/dashboard/DashboardWelcome";
import QuickActions from "@/components/dashboard/QuickActions";
import AnalyticsSkeleton from "@/components/dashboard/analytics/AnalyticsSkeleton";
import HouseAnalyticsPanel from "@/components/dashboard/analytics/HouseAnalyticsPanel";
import { getOrganizationContext } from "@/lib/organization-context";
import { Suspense } from "react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "House Analytics - Dashboard",
};

export default async function DashboardPage() {
  let ctx: Awaited<ReturnType<typeof getOrganizationContext>> = null;
  try {
    ctx = await getOrganizationContext();
  } catch {
    redirect("/login");
  }
  if (!ctx?.userId) {
    redirect("/login");
  }
  const isAdmin = ctx.isAdmin ?? false;
  const canRequestHouse = ctx.permissions.has("house_request:create");

  // The full permission set, flattened for the client widget grid. The grid uses
  // it to hide cards the caller could not add (the API enforces the same rules),
  // so a Standard User is not offered a Housing Summary that would 403.
  const permissionKeys = Array.from(ctx.permissions);

  if (!isAdmin && ctx?.userId) {
    return (
      <main>
        <Breadcrumb
          options={[{ label: "Dashboard", href: "/dashboard", current: true }]}
        />
        <DashboardWelcome className="mt-3" headingLevel={2} />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              My Dashboard
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Your assets, requests, and tickets at a glance
            </p>
          </div>
          <QuickActions canRequestHouse={canRequestHouse} />
        </div>
        <div className="mt-6">
          <DashboardGrid isAdmin={false} permissions={permissionKeys} />
        </div>
      </main>
    );
  }

  if (!ctx.organization?.id) {
    return (
      <main>
        <Breadcrumb
          options={[
            { label: "Home", href: "/" },
            { label: "Dashboard", href: "/dashboard" },
          ]}
        />
        <DashboardWelcome className="mt-3" headingLevel={2} />
        <div className="border-border bg-card mt-6 rounded-xl border p-6">
          <h1 className="text-xl font-semibold">No organization assigned</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ask an administrator to assign your account to an organization
            before viewing house analytics.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-fixed-main flex h-full min-h-0 flex-col">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
        ]}
      />
      <DashboardWelcome className="mt-3 shrink-0" headingLevel={1} />
      <div className="mt-2 min-h-0 flex-1">
        <Suspense fallback={<AnalyticsSkeleton />}>
          <HouseAnalyticsPanel organizationId={ctx.organization.id} />
        </Suspense>
      </div>
    </main>
  );
}
