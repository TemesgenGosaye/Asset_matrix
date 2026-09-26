"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  PlusIcon,
  SearchIcon,
  EditIcon,
  DeleteIcon,
  MoreVertical,
} from "../Icons";
import { toast } from "sonner";

const ROWS_PER_PAGE_OPTIONS = ["10", "20", "50", "100"];

function formatDate(value, withYear = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, withYear ? {} : {});
}

const STATUS_COLORS = {
  active: "success",
  on_leave: "warning",
  terminated: "destructive",
  retired: "secondary",
};

const STATUS_LABELS = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  retired: "Retired",
};

const EMPLOYMENT_TYPE_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
  temporary: "Temporary",
};

function fullName(item) {
  if (!item) return "";
  return `${item.firstname}${item.lastname ? ` ${item.lastname}` : ""}`;
}

export default function EmployeesTable({ items, departments }) {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [rowsPerPage, setRowsPerPage] = useState(
    Number(ROWS_PER_PAGE_OPTIONS[0]),
  );
  const [page, setPage] = useState(1);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeesData, setEmployeesData] = useState(items);

  const departmentMap = useMemo(
    () => new Map((departments ?? []).map((d) => [d.id, d.name])),
    [departments],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();

    return employeesData.filter((item) => {
      const matchesSearch =
        !normalizedQuery ||
        fullName(item).toLowerCase().includes(normalizedQuery) ||
        (item.employeeNumber ?? "").toLowerCase().includes(normalizedQuery) ||
        (item.email ?? "").toLowerCase().includes(normalizedQuery) ||
        (item.jobTitle ?? "").toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" || item.employmentStatus === statusFilter;

      const matchesDept =
        deptFilter === "all" || item.departmentId === deptFilter;

      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [employeesData, searchValue, statusFilter, deptFilter]);

  const pages = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, page, rowsPerPage]);

  const columns = [
    { key: "employee", label: "Employee" },
    { key: "employeeNumber", label: "Emp. Number" },
    { key: "jobGrade", label: "Job Grade" },
    { key: "department", label: "Department" },
    { key: "jobTitle", label: "Job Title" },
    { key: "status", label: "Status" },
    { key: "hireDate", label: "Hire Date" },
    { key: "actions", label: "Actions" },
  ];

  const handleDelete = async (employeeId: string) => {
    try {
      const response = await fetch("/api/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employeeId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete employee");
      }

      const result = await response.json();

      toast.success(result.message, {
        description: "Employee removed successfully",
      });

      setEmployeesData((prevItems) =>
        prevItems.filter((item) => item.id !== employeeId),
      );
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error("Error deleting employee:", error);
      toast.error("Failed to delete employee", {
        description: error.message,
      });
    }
  };

  const renderCell = (item, columnKey) => {
    switch (columnKey) {
      case "employee":
        return (
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">
              {item.firstname?.charAt(0)}
              {item.lastname?.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{fullName(item)}</span>
              <span className="text-muted-foreground text-xs">{item.email}</span>
            </div>
          </div>
        );
      case "employeeNumber":
        return item.employeeNumber || "-";
      case "department":
        return (
          departmentMap.get(item.departmentId) ||
          item.department?.name ||
          "-"
        );
      case "jobGrade":
        return item.jobGrade != null ? (
          <Badge variant="secondary">{item.jobGrade}</Badge>
        ) : (
          "-"
        );
      case "jobTitle":
        return item.jobTitle || "-";
      case "status":
        return (
          <Badge
            variant={STATUS_COLORS[item.employmentStatus] || "secondary"}
          >
            {STATUS_LABELS[item.employmentStatus] || item.employmentStatus}
          </Badge>
        );
      case "hireDate":
        return formatDate(item.hireDate);
      case "employmentType":
        return (
          EMPLOYMENT_TYPE_LABELS[item.employmentType] || item.employmentType
        );
      case "actions":
        return (
          <div className="flex items-center gap-2">
            <Button
              className="text-muted-foreground h-6 w-6 cursor-pointer text-lg hover:opacity-80"
              size="icon"
              variant="ghost"
              asChild
            >
              <Link href={`/employees/${item.id}/edit`}>
                <EditIcon />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="text-muted-foreground h-6 w-6 cursor-pointer text-lg hover:opacity-80"
                  size="icon"
                  variant="ghost"
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    setSelectedEmployee(item);
                    setIsDeleteModalOpen(true);
                  }}
                >
                  <DeleteIcon className="mr-2 h-4 w-4" />
                  Delete Employee
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Employees</h1>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search employees..."
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
            {departments && departments.length > 0 ? (
              <Select
                value={deptFilter}
                onValueChange={(v) => {
                  setDeptFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button asChild>
              <Link href="/employees/create">
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Employee
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">
            Showing {paginatedItems.length} of {filteredItems.length} employees
          </span>
          <Select
            value={String(rowsPerPage)}
            onValueChange={(value) => {
              setRowsPerPage(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROWS_PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ResponsiveTable
        columns={columns}
        data={paginatedItems}
        renderCell={renderCell}
        keyExtractor={(item) => item.id}
        emptyMessage="No employees found"
        mobileCardView={true}
      />
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1 || filteredItems.length === 0}
        >
          Previous
        </Button>
        <span className="text-sm">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.min(pages, page + 1))}
          disabled={page === pages || filteredItems.length === 0}
        >
          Next
        </Button>
      </div>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {fullName(selectedEmployee)}? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(selectedEmployee?.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}