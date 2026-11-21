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

const pageClass =
  "dashboard-modern-text flex h-full min-h-0 flex-col gap-2 px-3 py-3 sm:px-4 sm:py-4 xl:px-5";

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
  const permissionKeys = Array.from(ctx.permissions);

  if (!isAdmin && ctx?.userId) {
    return (
      <main className={pageClass}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <DashboardWelcome fullName={ctx.fullName} headingLevel={1} compact />
          <QuickActions canRequestHouse={canRequestHouse} />
        </div>
        <div className="min-h-0 flex-1">
          <DashboardGrid compact isAdmin={false} permissions={permissionKeys} />
        </div>
      </main>
    );
  }

  if (!ctx.organization?.id) {
    return (
      <main className={pageClass}>
        <DashboardWelcome fullName={ctx.fullName} headingLevel={1} compact />
        <div className="border-border bg-card flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border p-6 text-center">
          <h2 className="text-lg font-semibold">No organization assigned</h2>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">
            Ask an administrator to assign your account to an organization
            before viewing house analytics.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <DashboardWelcome fullName={ctx.fullName} headingLevel={1} compact />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<AnalyticsSkeleton />}>
          <HouseAnalyticsPanel organizationId={ctx.organization.id} />
        </Suspense>
      </div>
    </main>
  );
}
