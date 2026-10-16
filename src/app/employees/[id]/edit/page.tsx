import React from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import EmployeesTable from "../../../../ui/employees/EmployeesTable";
import { auth } from "@/lib/auth";
import { getDepartments } from "@/lib/data";
import { getOrganizationContext } from "@/lib/organization-context";
import { getEmployee, getEmployeeCounts } from "@/lib/employees/queries";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import type { EmployeeDto } from "@/lib/employees/types";

export const metadata = {
  title: "Asset Tracker - Edit Employee",
};

function permission(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>>,
  perm: string,
): boolean {
  return ctx.isAdmin || ctx.permissions.has(perm);
}

/** `getEmployee` returns `Date` objects; the client DTO contract is strings. */
function serializeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/**
 * Deep link to the employee edit flow. The register page owns the single
 * create/edit dialog, so this route reuses it with the record pre-loaded rather
 * than shipping a second, divergent form.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  if (!permission(ctx!, "employee:edit")) {
    redirect("/employees");
  }

  const { id } = await params;
  const canSeeSensitive = await canViewSensitiveEmployeeData(session.user);

  const [departmentsRaw, counts, employee] = await Promise.all([
    getDepartments(),
    getEmployeeCounts(orgId),
    getEmployee({ organizationId: orgId, id, canSeeSensitive }),
  ]);

  if (!employee) {
    notFound();
  }

  const employeeDto: EmployeeDto = {
    ...employee,
    // Prisma surfaces these as plain strings; the client contract is a union.
    gender: employee.gender as EmployeeDto["gender"],
    maritalStatus: employee.maritalStatus as EmployeeDto["maritalStatus"],
    employmentType: employee.employmentType as EmployeeDto["employmentType"],
    employmentStatus:
      employee.employmentStatus as EmployeeDto["employmentStatus"],
    dateOfBirth: serializeDate(employee.dateOfBirth),
    hireDate: serializeDate(employee.hireDate),
    terminationDate: serializeDate(employee.terminationDate),
    deletedAt: serializeDate(employee.deletedAt),
    createdAt: serializeDate(employee.createdAt) ?? "",
    updatedAt: serializeDate(employee.updatedAt) ?? "",
  };

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
          { label: employeeDto.employeeNumber },
          { label: "Edit" },
        ]}
      />
      <EmployeesTable
        departments={departments}
        counts={counts}
        canCreate={permission(ctx!, "employee:create")}
        canExport={permission(ctx!, "employee:export")}
        canImport={permission(ctx!, "employee:import")}
        canDelete={permission(ctx!, "employee:delete")}
        canEdit
        canRestore={permission(ctx!, "employee:restore")}
        initialEditEmployee={employeeDto}
      />
    </div>
  );
}
