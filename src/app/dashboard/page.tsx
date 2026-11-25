import Breadcrumb from "@/components/Breadcrumb";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import DashboardWelcome from "@/components/dashboard/DashboardWelcome";
import QuickActions from "@/components/dashboard/QuickActions";
import AnalyticsSkeleton from "@/components/dashboard/analytics/AnalyticsSkeleton";
import HouseAnalyticsPanel from "@/components/dashboard/analytics/HouseAnalyticsPanel";
import DashboardAnalyticsTabs from "@/components/dashboard/fixed-asset-analytics/DashboardAnalyticsTabs";
import FixedAssetAnalyticsDashboard from "@/components/dashboard/fixed-asset-analytics/FixedAssetAnalyticsDashboard";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { parseFixedAssetAnalyticsFilters } from "@/lib/fixed-asset-analytics/contract";
import { getOrganizationContext } from "@/lib/organization-context";
import { Suspense } from "react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Analytics Dashboard",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const fixedAssetFilters = parseFixedAssetAnalyticsFilters(await searchParams);
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
  const canViewFixedAssets =
    isFeatureEnabled("fixedAssetRegister") &&
    (isAdmin || permissionKeys.includes("asset:view"));

  if (!isAdmin && ctx?.userId) {
    return (
      <main className="dashboard-modern-text">
        <Breadcrumb
          options={[{ label: "Dashboard", href: "/dashboard", current: true }]}
        />
        <DashboardWelcome
          className="mt-3"
          fullName={ctx.fullName}
          headingLevel={2}
        />
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
        {canViewFixedAssets ? (
          <section
            className="mt-8"
            aria-labelledby="fixed-asset-analytics-heading"
          >
            <h2
              id="fixed-asset-analytics-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Fixed asset analytics
            </h2>
            <p className="text-muted-foreground mt-1 mb-3 text-sm">
              Portfolio, condition, review, and data-quality intelligence
            </p>
            <FixedAssetAnalyticsDashboard initialFilters={fixedAssetFilters} />
          </section>
        ) : null}
      </main>
    );
  }

  if (!ctx.organization?.id) {
    return (
      <main className="dashboard-modern-text">
        <Breadcrumb
          options={[
            { label: "Home", href: "/" },
            { label: "Dashboard", href: "/dashboard" },
          ]}
        />
        <DashboardWelcome
          className="mt-3"
          fullName={ctx.fullName}
          headingLevel={2}
        />
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
    <main className="dashboard-fixed-main dashboard-modern-text flex h-full min-h-0 flex-col">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
        ]}
      />
      <DashboardWelcome
        className="mt-3 shrink-0"
        fullName={ctx.fullName}
        headingLevel={1}
      />
      <div className="mt-2 min-h-0 flex-1">
        <DashboardAnalyticsTabs
          house={
            <Suspense fallback={<AnalyticsSkeleton />}>
              <HouseAnalyticsPanel organizationId={ctx.organization.id} />
            </Suspense>
          }
          fixedAssets={
            canViewFixedAssets ? (
              <FixedAssetAnalyticsDashboard
                initialFilters={fixedAssetFilters}
                embedded
              />
            ) : null
          }
        />
      </div>
    </main>
  );
}
