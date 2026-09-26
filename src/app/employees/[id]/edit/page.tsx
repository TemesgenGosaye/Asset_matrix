import React from "react";
import EmployeeForm from "../../../../ui/employees/EmployeeForm";
import Breadcrumb from "@/components/Breadcrumb";
import { getEmployeeById, getDepartments, getEmployees, getUsers } from "@/lib/data";

export const metadata = {
  title: "Asset Tracker - Edit Employee",
};

function serializeDate(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [employeeRaw, departmentsRaw, employeesRaw, usersRaw] =
    await Promise.all([
      getEmployeeById(id),
      getDepartments(),
      getEmployees(),
      getUsers(),
    ]);

  const employee = {
    ...employeeRaw,
    dateOfBirth: serializeDate(employeeRaw.dateOfBirth),
    hireDate: serializeDate(employeeRaw.hireDate),
    terminationDate: serializeDate(employeeRaw.terminationDate),
  };

  const departments = departmentsRaw.map((d) => ({ id: d.id, name: d.name }));
  const managers = employeesRaw.map((e) => ({
    id: e.id,
    firstname: e.firstname,
    lastname: e.lastname,
  }));

  return (
    <>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Employees", href: "/employees" },
          { label: "Edit" },
        ]}
      />
      <EmployeeForm
        initialData={employee}
        mode="edit"
        departments={departments}
        managers={managers}
        users={usersRaw}
      />
    </>
  );
}