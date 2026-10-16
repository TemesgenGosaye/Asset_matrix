"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useUrlState } from "@/hooks/useUrlState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/feedback/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditIcon, DeleteIcon, EyeIcon, PlusIcon, SearchIcon } from "../Icons";

const ROWS_PER_PAGE_OPTIONS = ["10", "20", "50", "100"];
const roleOptions = [
  { key: "all", label: "All roles" },
  { key: "admin", label: "Admins" },
  { key: "requester", label: "Requesters" },
  { key: "deactivated", label: "Deactivated" },
];

function formatDateStable(value) {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "N/A";
    return d.toISOString().replace("T", " ").replace("Z", "");
  } catch {
    return "N/A";
  }
}

function resolveRole(user) {
  if (user?.isadmin) return "admin";
  if (user?.canrequest) return "requester";
  return "deactivated";
}

function DashboardTable({ data, columns: propColumns }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // -- URL-synced state for shareable filter / pagination URLs --
  const [urlState, setUrlState] = useUrlState({
    search: "",
    role: "all",
    page: "1",
    pageSize: ROWS_PER_PAGE_OPTIONS[0],
  });

  // Derived values from URL state
  const searchValue = urlState.search;
  const roleFilter = urlState.role;
  const page = Number(urlState.page) || 1;
  const rowsPerPage =
    Number(urlState.pageSize) || Number(ROWS_PER_PAGE_OPTIONS[0]);

  // Convenience setters that update URL state
  const setSearchValue = useCallback(
    (v: string) => setUrlState({ search: v, page: "1" }),
    [setUrlState],
  );
  const setRoleFilter = useCallback(
    (v: string) => setUrlState({ role: v, page: "1" }),
    [setUrlState],
  );
  const setRowsPerPage = useCallback(
    (n: number) => setUrlState({ pageSize: String(n), page: "1" }),
    [setUrlState],
  );
  const setPage = useCallback(
    (p: number) => setUrlState({ page: String(p) }),
    [setUrlState],
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();

    return data.filter((user) => {
      const matchesSearch =
        !normalizedQuery ||
        [user.firstname, user.lastname, user.email, user.username]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedQuery));

      const matchesRole =
        roleFilter === "all" || resolveRole(user) === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [data, searchValue, roleFilter]);

  const pages = Math.max(1, Math.ceil(filteredUsers.length / rowsPerPage));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredUsers.slice(start, start + rowsPerPage);
  }, [filteredUsers, page, rowsPerPage]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userid: deleteTarget.userid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to delete user");
      }
      notify.success({
        title: "User deleted",
        description:
          `${deleteTarget.firstname ?? ""} ${deleteTarget.lastname ?? ""}`.trim() ||
          deleteTarget.username ||
          deleteTarget.userid,
      });
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      notify.error({ title: "Delete failed", description: err.message });
    } finally {
      setDeleting(false);
    }
  };

  // Map columns from props to ResponsiveTable format
  const columns = useMemo(
    () =>
      propColumns.map((col: { uid: string; name: string }) => ({
        key: col.uid,
        label: col.name,
        ...(col.uid === "actions" ? { hideable: false } : {}),
      })),
    [propColumns],
  );

  const renderCell = useCallback(
    (user: Record<string, unknown>, columnKey: string) => {
      const cellValue = user[columnKey];

      if (columnKey === "creation_date" || columnKey === "change_date") {
        return cellValue ? formatDateStable(cellValue as string) : "N/A";
      }

      switch (columnKey) {
        case "firstName":
          return <span>{String(user.firstname ?? "")}</span>;
        case "lastName":
          return <span>{String(user.lastname ?? "")}</span>;
        case "email":
          return (
            <div className="flex flex-col">
              <span className="text-bold text-sm">
                {String(user.email ?? "")}
              </span>
            </div>
          );
        case "userName":
          return <span>{String(user.username ?? "")}</span>;
        case "role":
          return <span className="capitalize">{resolveRole(user)}</span>;
        case "actions":
          return (
            <div className="relative flex items-center gap-2">
              <Link
                href={`/user/${user.userid}/`}
                className="text-default-400 hover:text-default-500"
              >
                <span className="cursor-pointer text-lg active:opacity-50">
                  <EyeIcon />
                </span>
              </Link>
              <Link
                href={`/user/${user.userid}/edit/`}
                className="text-default-400 hover:text-default-500"
              >
                <span className="cursor-pointer text-lg active:opacity-50">
                  <EditIcon />
                </span>
              </Link>
              <button
                type="button"
                className="text-danger cursor-pointer text-lg active:opacity-50"
                aria-label="Delete user"
                onClick={() => setDeleteTarget(user)}
              >
                <DeleteIcon />
              </button>
            </div>
          );
        default:
          return cellValue != null ? String(cellValue) : "";
      }
    },
    [],
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search by name, username, or email"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild>
              <Link href="/user/create">
                <PlusIcon className="mr-2 h-4 w-4" />
                Create
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">
            Showing {paginatedUsers.length} of {filteredUsers.length} users
          </span>
          <Select
            value={String(rowsPerPage)}
            onValueChange={(value) => setRowsPerPage(Number(value))}
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
        data={paginatedUsers}
        renderCell={renderCell}
        keyExtractor={(item) =>
          (item as Record<string, unknown>).userid as number
        }
        emptyMessage="No users found"
        mobileCardView={true}
        storageKey="columns:users"
      />
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1 || filteredUsers.length === 0}
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
          disabled={page === pages || filteredUsers.length === 0}
        >
          Next
        </Button>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!deleting) setDeleteTarget(open ? deleteTarget : null);
        }}
        title="Delete user"
        description={
          deleteTarget
            ? `Are you sure you want to permanently delete ${
                `${deleteTarget.firstname ?? ""} ${deleteTarget.lastname ?? ""}`.trim() ||
                deleteTarget.username ||
                deleteTarget.email
              }? This removes their account, sessions, and assigned records. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

export default DashboardTable;
