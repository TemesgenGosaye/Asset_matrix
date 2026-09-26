import React from "react";
import EmployeeForm from "../../../ui/employees/EmployeeForm";
import Breadcrumb from "@/components/Breadcrumb";
import { getDepartments, getEmployees, getUsers } from "@/lib/data";

export const metadata = {
  title: "Asset Tracker - Add Employee",
};

export default async function Page() {
  const [departmentsRaw, employeesRaw, usersRaw] = await Promise.all([
    getDepartments(),
    getEmployees(),
    getUsers(),
  ]);

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
          { label: "Add Employee" },
        ]}
      />
      <EmployeeForm
        departments={departments}
        managers={managers}
        users={usersRaw}
      />
    </>
  );
}