import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import EmployeesTable from "../../ui/employees/EmployeesTable";
import { getEmployees, getDepartments } from "@/lib/data";

export const metadata = {
  title: "Asset Tracker - Employees",
  description: "Employee management",
};

function serializeDate(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

export default async function Page() {
  const employeesRaw = await getEmployees();
  const departmentsRaw = await getDepartments();

  const employees = employeesRaw.map((item) => ({
    ...item,
    dateOfBirth: serializeDate(item.dateOfBirth),
    hireDate: serializeDate(item.hireDate),
    terminationDate: serializeDate(item.terminationDate),
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  }));

  const departments = departmentsRaw.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  return (
    <div>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Employees", href: "/employees" },
        ]}
      />
      <EmployeesTable items={employees} departments={departments} />
    </div>
  );
}