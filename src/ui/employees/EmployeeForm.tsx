"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { houseCategoryLegend } from "@/lib/house-queue/eligibility";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "temporary", label: "Temporary" },
];

const EMPLOYMENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
  { value: "retired", label: "Retired" },
];

export default function EmployeeForm({
  initialData = null,
  mode = "create",
  departments,
  managers,
  users,
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(() => ({
    employeeNumber: initialData?.employeeNumber ?? "",
    firstname: initialData?.firstname ?? "",
    lastname: initialData?.lastname ?? "",
    email: initialData?.email ?? "",
    phone: initialData?.phone ?? "",
    dateOfBirth: toDateInputValue(initialData?.dateOfBirth),
    gender: initialData?.gender ?? "",
    address: initialData?.address ?? "",
    city: initialData?.city ?? "",
    state: initialData?.state ?? "",
    country: initialData?.country ?? "",
    postalCode: initialData?.postalCode ?? "",
    jobTitle: initialData?.jobTitle ?? "",
    employmentType: initialData?.employmentType || "full_time",
    employmentStatus: initialData?.employmentStatus || "active",
    jobGrade: initialData?.jobGrade ?? "",
    maritalStatus: initialData?.maritalStatus ?? "",
    familySize: initialData?.familySize != null ? String(initialData.familySize) : "1",
    disabilityStatus: initialData?.disabilityStatus ?? false,
    hireDate: toDateInputValue(initialData?.hireDate),
    terminationDate: toDateInputValue(initialData?.terminationDate),
    departmentId: initialData?.departmentId ?? "",
    managerId: initialData?.managerId ?? "",
    userid: initialData?.userid ?? "",
    notes: initialData?.notes ?? "",
  }));

  const setField = (key) => (value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const payload: Record<string, unknown> = {
      employeeNumber: form.employeeNumber,
      firstname: form.firstname,
      lastname: form.lastname,
      email: form.email,
      employmentType: form.employmentType,
      employmentStatus: form.employmentStatus,
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
      ...(form.gender ? { gender: form.gender } : {}),
      ...(form.address ? { address: form.address } : {}),
      ...(form.city ? { city: form.city } : {}),
      ...(form.state ? { state: form.state } : {}),
      ...(form.country ? { country: form.country } : {}),
      ...(form.postalCode ? { postalCode: form.postalCode } : {}),
      ...(form.jobTitle ? { jobTitle: form.jobTitle } : {}),
      ...(form.hireDate ? { hireDate: form.hireDate } : {}),
      ...(form.terminationDate
        ? { terminationDate: form.terminationDate }
        : {}),
      ...(form.jobGrade !== "" ? { jobGrade: Number(form.jobGrade) } : {}),
      ...(form.maritalStatus ? { maritalStatus: form.maritalStatus } : {}),
      ...(form.familySize !== ""
        ? { familySize: Number(form.familySize) }
        : {}),
      disabilityStatus: form.disabilityStatus,
      ...(form.departmentId ? { departmentId: form.departmentId } : {}),
      ...(form.managerId ? { managerId: form.managerId } : {}),
      ...(form.userid ? { userid: form.userid } : {}),
      ...(form.notes ? { notes: form.notes } : {}),
    };

    if (mode === "edit" && initialData?.id) {
      payload.id = initialData.id as string;
    }

    try {
      const res = await fetch("/api/employees", {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save employee");
      }

      toast.success(
        mode === "edit" ? "Employee updated" : "Employee created",
        { description: `${form.firstname} ${form.lastname}`.trim() },
      );
      router.push("/employees");
      router.refresh();
    } catch (err) {
      setError(err.message);
      toast.error("Save failed", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const otherManagers = (managers ?? []).filter(
    (m) => m.id !== initialData?.id,
  );

  const inputClass = "w-full";

  return (
    <div className="max-w-3xl">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">
              {mode === "edit" ? "Edit Employee" : "Add Employee"}
            </h1>
            <p className="text-foreground-500 mt-1 text-sm">
              {mode === "edit"
                ? "Update employee information."
                : "Create a new employee record."}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href="/employees">Cancel</Link>
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={submitting}
            >
              {mode === "edit" ? "Save Changes" : "Create Employee"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-danger text-sm">{error}</p> : null}

        <section className="border-default-200 space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Primary Information</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employeeNumber">
                Employee Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="employeeNumber"
                className={inputClass}
                value={form.employeeNumber}
                onChange={(e) => setField("employeeNumber")(e.target.value)}
                placeholder="e.g. EMP-001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setField("email")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstname">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstname"
                className={inputClass}
                value={form.firstname}
                onChange={(e) => setField("firstname")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastname">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastname"
                className={inputClass}
                value={form.lastname}
                onChange={(e) => setField("lastname")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                className={inputClass}
                value={form.phone}
                onChange={(e) => setField("phone")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Input
                id="gender"
                className={inputClass}
                value={form.gender}
                onChange={(e) => setField("gender")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                className={inputClass}
                value={form.dateOfBirth}
                onChange={(e) => setField("dateOfBirth")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                className={inputClass}
                value={form.jobTitle}
                onChange={(e) => setField("jobTitle")(e.target.value)}
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="border-default-200 space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Employment Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="departmentId">Department</Label>
              <Select
                value={form.departmentId || undefined}
                onValueChange={setField("departmentId")}
              >
                <SelectTrigger id="departmentId" className={inputClass}>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {(departments ?? []).map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="managerId">Reporting Manager</Label>
              <Select
                value={form.managerId || undefined}
                onValueChange={setField("managerId")}
              >
                <SelectTrigger id="managerId" className={inputClass}>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {otherManagers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {`${m.firstname} ${m.lastname ?? ""}`.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employmentType">Employment Type</Label>
              <Select
                value={form.employmentType}
                onValueChange={setField("employmentType")}
              >
                <SelectTrigger id="employmentType" className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employmentStatus">Employment Status</Label>
              <Select
                value={form.employmentStatus}
                onValueChange={setField("employmentStatus")}
              >
                <SelectTrigger id="employmentStatus" className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hireDate">Hire Date</Label>
              <Input
                id="hireDate"
                type="date"
                className={inputClass}
                value={form.hireDate}
                onChange={(e) => setField("hireDate")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terminationDate">Termination Date</Label>
              <Input
                id="terminationDate"
                type="date"
                className={inputClass}
                value={form.terminationDate}
                onChange={(e) => setField("terminationDate")(e.target.value)}
              />
            </div>
            {users && users.length > 0 ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="userid">Linked System User</Label>
                <Select
                  value={form.userid || undefined}
                  onValueChange={setField("userid")}
                >
                  <SelectTrigger id="userid" className={inputClass}>
                    <SelectValue placeholder="Select a user account (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.userid} value={u.userid}>
                        {`${u.firstname} ${u.lastname ?? ""}`.trim()}
                        {u.email ? ` (${u.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </section>

        <Separator />

        <section className="border-default-200 space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Housing &amp; Eligibility</h2>
          <p className="text-muted-foreground text-xs">
            Job grade determines house category eligibility ({houseCategoryLegend()}).
            Marital status, family size and disability are used by the house
            queue MCDA scoring.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="jobGrade">Job Grade</Label>
              <Input
                id="jobGrade"
                type="number"
                min={1}
                max={50}
                className={inputClass}
                value={form.jobGrade}
                onChange={(e) => setField("jobGrade")(e.target.value)}
                placeholder="e.g. 14"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maritalStatus">Marital Status</Label>
              <Select
                value={form.maritalStatus || undefined}
                onValueChange={setField("maritalStatus")}
              >
                <SelectTrigger id="maritalStatus" className={inputClass}>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="familySize">Family Size</Label>
              <Input
                id="familySize"
                type="number"
                min={1}
                max={30}
                className={inputClass}
                value={form.familySize}
                onChange={(e) => setField("familySize")(e.target.value)}
              />
            </div>
            <div className="flex items-center space-y-2 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.disabilityStatus}
                  onChange={(e) => setField("disabilityStatus")(e.target.checked)}
                />
                Registered disability
              </label>
            </div>
          </div>
        </section>

        <Separator />

        <section className="border-default-200 space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Contact &amp; Address</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                className={inputClass}
                value={form.address}
                onChange={(e) => setField("address")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                className={inputClass}
                value={form.city}
                onChange={(e) => setField("city")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                className={inputClass}
                value={form.state}
                onChange={(e) => setField("state")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                className={inputClass}
                value={form.country}
                onChange={(e) => setField("country")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                className={inputClass}
                value={form.postalCode}
                onChange={(e) => setField("postalCode")(e.target.value)}
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="border-default-200 space-y-2 rounded-lg border p-4">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setField("notes")(e.target.value)}
            placeholder="Additional information about this employee"
          />
        </section>

        <Separator />

        <div className="flex flex-col justify-end gap-2 sm:flex-row">
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/employees">Cancel</Link>
          </Button>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={submitting}
          >
            {mode === "edit" ? "Save Changes" : "Create Employee"}
          </Button>
        </div>
      </form>
    </div>
  );
}