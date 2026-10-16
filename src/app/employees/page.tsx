import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import EmployeesTable from "../../ui/employees/EmployeesTable";
import { auth } from "@/lib/auth";
import { getDepartments } from "@/lib/data";
import { getOrganizationContext } from "@/lib/organization-context";
import { getEmployeeCounts } from "@/lib/employees/queries";

export const metadata = {
  title: "Asset Tracker - Employees",
  description: "Employee management",
};

function permission(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>>,
  perm: string,
): boolean {
  return ctx.isAdmin || ctx.permissions.has(perm);
}

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/login");
  }

  if (!permission(ctx!, "employee:view")) {
    redirect("/dashboard");
  }

  const [departmentsRaw, counts] = await Promise.all([
    getDepartments(),
    getEmployeeCounts(orgId),
  ]);

  const departments = departmentsRaw.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code ?? null,
  }));

  return (
    <div>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Employees", href: "/employees" },
        ]}
      />
      <EmployeesTable
        departments={departments}
        counts={counts}
        canCreate={permission(ctx!, "employee:create")}
        canExport={permission(ctx!, "employee:export")}
        canImport={permission(ctx!, "employee:import")}
        canDelete={permission(ctx!, "employee:delete")}
        canEdit={permission(ctx!, "employee:edit")}
        canRestore={permission(ctx!, "employee:restore")}
      />
    </div>
  );
}
