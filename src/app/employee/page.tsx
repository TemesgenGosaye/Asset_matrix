import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { auth } from "@/lib/auth";
import { getOrganizationContext } from "@/lib/organization-context";
import { getEmployeeCounts } from "@/lib/employees/queries";
import EmployeeDirectorySearch from "./ui/EmployeeDirectorySearch";

export const metadata = {
  title: "Asset Tracker - Employee Search",
  description: "Search the employee register by employee ID or name",
};

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

  const canView = ctx!.isAdmin || ctx!.permissions.has("employee:view");
  if (!canView) {
    redirect("/dashboard");
  }

  const counts = await getEmployeeCounts(orgId);

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Employees", href: "/employees" },
          { label: "Search", href: "/employee" },
        ]}
      />
      <EmployeeDirectorySearch totalEmployees={counts.total} />
    </div>
  );
}
