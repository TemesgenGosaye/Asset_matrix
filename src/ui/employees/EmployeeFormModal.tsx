"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/feedback/notify";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Info,
  Loader2,
  Phone,
  Shield,
  User,
  Users,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DepartmentCombobox } from "./DepartmentCombobox";
import {
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  JOB_GRADE_MIN,
  JOB_GRADE_MAX,
  NATIONAL_ID_MAX,
  EMPLOYEE_NUMBER_MAX,
} from "@/lib/employees/constants";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/employees/schemas";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import type {
  EmployeeDto,
  EmployeeReferenceOption,
  EmployeeManagerOption,
  EmployeeUserOption,
} from "@/lib/employees/types";

interface EmployeeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDto | null;
  departments: EmployeeReferenceOption[];
  onSuccess: () => void;
}

interface FormState {
  employeeNumber: string;
  firstname: string;
  lastname: string;
  gender: string;
  jobGrade: string;
  departmentId: string;
  maritalStatus: string;
  nationalId: string;
  disabilityStatus: boolean;
  phone: string;
  dateOfBirth: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  familySize: string;
  hireDate: string;
  terminationDate: string;
  managerId: string;
  userid: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  notes: string;
}

const INITIAL_FORM_STATE: FormState = {
  employeeNumber: "",
  firstname: "",
  lastname: "",
  gender: "",
  jobGrade: "",
  departmentId: "",
  maritalStatus: "",
  nationalId: "",
  disabilityStatus: false,
  phone: "",
  dateOfBirth: "",
  jobTitle: "",
  employmentType: "full_time",
  employmentStatus: "active",
  familySize: "1",
  hireDate: "",
  terminationDate: "",
  managerId: "",
  userid: "",
  address: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  notes: "",
};

function toDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the initial form state from the record being edited, or blank defaults
 * for a new employee. A masked National ID is surfaced as empty so the user is
 * never silently re-submitting the masked value.
 */
function buildInitialState(employee: EmployeeDto | null): FormState {
  if (!employee) return INITIAL_FORM_STATE;

  return {
    employeeNumber: employee.employeeNumber ?? "",
    firstname: employee.firstname ?? "",
    lastname: employee.lastname ?? "",
    gender: employee.gender ?? "",
    jobGrade: employee.jobGrade != null ? String(employee.jobGrade) : "",
    departmentId: employee.departmentId ?? "",
    maritalStatus: employee.maritalStatus ?? "",
    nationalId: employee.nationalIdMasked ? "" : (employee.nationalId ?? ""),
    disabilityStatus: Boolean(employee.disabilityStatus),
    phone: employee.phone ?? "",
    dateOfBirth: toDateInput(employee.dateOfBirth),
    jobTitle: employee.jobTitle ?? "",
    employmentType: employee.employmentType ?? "full_time",
    employmentStatus: employee.employmentStatus ?? "active",
    familySize: employee.familySize != null ? String(employee.familySize) : "1",
    hireDate: toDateInput(employee.hireDate),
    terminationDate: toDateInput(employee.terminationDate),
    managerId: employee.managerId ?? "",
    userid: employee.userid ?? "",
    address: employee.address ?? "",
    city: employee.city ?? "",
    state: employee.state ?? "",
    country: employee.country ?? "",
    postalCode: employee.postalCode ?? "",
    notes: employee.notes ?? "",
  };
}

/** Numbered section heading, matching the household register form pattern. */
function SectionHeading({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
          {step}
        </span>
        {title}
      </h4>
      {hint ? (
        <Badge variant="outline" className="text-[10px] font-normal">
          {hint}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * Inline validation / guidance message. `hint === null` means the value passed
 * validation, so the message turns green once the field has been touched.
 */
function FieldHint({
  hint,
  touched,
}: {
  hint: string | null;
  touched: boolean;
}) {
  const state = hint === null && touched ? "valid" : hint ? "invalid" : "info";
  return (
    <p
      className={`flex items-start gap-1 text-[11px] ${
        state === "invalid"
          ? "text-destructive"
          : state === "valid"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground"
      }`}
    >
      {state === "invalid" ? (
        <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
      ) : state === "valid" ? (
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
      )}
      {hint}
    </p>
  );
}

/** Shared error styling for inputs that failed server or schema validation. */
function fieldClassName(hasError: boolean): string {
  return hasError ? "border-destructive focus-visible:ring-destructive/40" : "";
}

export function EmployeeFormModal({
  open,
  onOpenChange,
  employee,
  departments,
  onSuccess,
}: EmployeeFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <User className="text-primary h-5 w-5" />
            {employee ? "Edit Employee" : "Add New Employee"}
          </DialogTitle>
          <DialogDescription>
            {employee
              ? `Update the record for ${employee.firstname} ${employee.lastname} (${employee.employeeNumber}).`
              : "Register an employee with the department, job grade, and housing eligibility attributes required for the house queue."}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <EmployeeFormFields
            employee={employee}
            departments={departments}
            onSuccess={onSuccess}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owns all form state. Mounted only while the dialog is open, so the form is
 * freshly initialized from the current record (or blank defaults) on every
 * open — no auto-filled values and no state-reset effects required.
 */
function EmployeeFormFields({
  employee,
  departments,
  onSuccess,
  onClose,
}: {
  employee: EmployeeDto | null;
  departments: EmployeeReferenceOption[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const isEditing = Boolean(employee);

  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(employee),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Lookup options for reporting managers and linked login accounts.
  const [managers, setManagers] = useState<EmployeeManagerOption[]>([]);
  const [users, setUsers] = useState<EmployeeUserOption[]>([]);

  useEffect(() => {
    let isCurrent = true;

    async function loadOptions() {
      try {
        const res = await fetch("/api/employees/options");
        if (res.ok) {
          const data = await res.json();
          if (isCurrent) {
            setManagers(data.managers || []);
            setUsers(data.users || []);
          }
        }
      } catch {
        // Manager/user linking is optional — degrade quietly if unavailable.
      }
    }

    void loadOptions();
    return () => {
      isCurrent = false;
    };
  }, []);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setTouched((prev) => ({ ...prev, [key]: true }));
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  // Live House Category eligibility derived from the entered Job Grade.
  const eligibleCategory = useMemo(
    () =>
      houseCategoryForJobGrade(form.jobGrade ? Number(form.jobGrade) : null),
    [form.jobGrade],
  );

  const departmentName = useMemo(() => {
    if (!form.departmentId) return null;
    return departments.find((d) => d.id === form.departmentId)?.name ?? null;
  }, [departments, form.departmentId]);

  const canSubmit =
    form.employeeNumber.trim().length > 0 &&
    form.firstname.trim().length > 0 &&
    form.lastname.trim().length > 0;

  const summaryEntries = useMemo(
    () => [
      {
        label: "Emp ID",
        value: form.employeeNumber.trim() || "—",
        mono: true,
      },
      {
        label: "Name",
        value: `${form.firstname} ${form.lastname}`.trim() || "—",
        mono: false,
      },
      {
        label: "Department",
        value: departmentName ?? "Unassigned",
        mono: false,
      },
      {
        label: "Job Grade",
        value: form.jobGrade || "—",
        mono: true,
      },
      {
        label: "Employment",
        value:
          EMPLOYMENT_STATUS_LABELS[
            form.employmentStatus as keyof typeof EMPLOYMENT_STATUS_LABELS
          ] ?? form.employmentStatus,
        mono: false,
      },
      {
        label: "Type",
        value:
          EMPLOYMENT_TYPE_LABELS[
            form.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS
          ] ?? form.employmentType,
        mono: false,
      },
      {
        label: "House Tier",
        value: eligibleCategory
          ? `Category ${eligibleCategory}`
          : "Not eligible",
        mono: false,
      },
      {
        label: "Disability",
        value: form.disabilityStatus ? "Registered" : "None",
        mono: false,
      },
    ],
    [
      departmentName,
      eligibleCategory,
      form.disabilityStatus,
      form.employeeNumber,
      form.employmentStatus,
      form.employmentType,
      form.firstname,
      form.jobGrade,
      form.lastname,
    ],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setGeneralError(null);

    const rawPayload: Record<string, unknown> = {
      employeeNumber: form.employeeNumber.trim(),
      firstname: form.firstname.trim(),
      lastname: form.lastname.trim(),
      gender: form.gender || null,
      jobGrade: form.jobGrade ? Number(form.jobGrade) : null,
      departmentId: form.departmentId || null,
      maritalStatus: form.maritalStatus || null,
      nationalId: form.nationalId.trim() || null,
      disabilityStatus: form.disabilityStatus,
      phone: form.phone.trim() || null,
      dateOfBirth: form.dateOfBirth || null,
      jobTitle: form.jobTitle.trim() || null,
      employmentType: form.employmentType || "full_time",
      employmentStatus: form.employmentStatus || "active",
      familySize: form.familySize ? Number(form.familySize) : null,
      hireDate: form.hireDate || null,
      terminationDate: form.terminationDate || null,
      managerId: form.managerId || null,
      userid: form.userid || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      postalCode: form.postalCode.trim() || null,
      notes: form.notes.trim() || null,
    };

    const schema = isEditing ? updateEmployeeSchema : createEmployeeSchema;
    const result = schema.safeParse(rawPayload);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const fieldName = String(issue.path[0] || "general");
        errors[fieldName] = issue.message;
      });
      setFieldErrors(errors);
      setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
      notify.error("Please resolve the highlighted validation errors.");
      return;
    }

    setIsSubmitting(true);

    try {
      const url = isEditing
        ? `/api/employees/${employee!.id}`
        : "/api/employees";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawPayload),
      });

      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          const msg = responseBody?.error || "A conflict occurred.";
          const lowered = msg.toLowerCase();
          if (lowered.includes("national id")) {
            setFieldErrors((prev) => ({ ...prev, nationalId: msg }));
          } else if (lowered.includes("employee number")) {
            setFieldErrors((prev) => ({ ...prev, employeeNumber: msg }));
          }
          throw new Error(msg);
        }
        throw new Error(
          responseBody?.error || "Failed to save employee record.",
        );
      }

      notify.success({
        title: isEditing ? "Employee profile updated" : "Employee registered",
        description: `${form.firstname} ${form.lastname} (${form.employeeNumber})`,
      });

      onSuccess();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save employee.";
      setGeneralError(message);
      notify.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {generalError ? (
        <div
          role="alert"
          className="bg-destructive/15 text-destructive flex items-start gap-2 rounded-md p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{generalError}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5 py-2">
        {/* ─── Section 1: Identity & Eligibility ─── */}
        <section className="space-y-4">
          <SectionHeading
            step={1}
            title="Identity & Eligibility"
            hint="Fields marked * are required"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="employeeNumber" className="text-xs font-medium">
                Employee Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="employeeNumber"
                value={form.employeeNumber}
                maxLength={EMPLOYEE_NUMBER_MAX}
                onChange={(e) => updateField("employeeNumber", e.target.value)}
                placeholder="e.g. EMP-1049"
                className={`font-mono text-sm ${fieldClassName(Boolean(fieldErrors.employeeNumber))}`}
                required
              />
              <FieldHint
                hint={
                  fieldErrors.employeeNumber ??
                  (form.employeeNumber.trim()
                    ? null
                    : "Unique staff identifier, e.g. EMP-1049.")
                }
                touched={Boolean(touched.employeeNumber)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nationalId" className="text-xs font-medium">
                National ID
              </Label>
              <Input
                id="nationalId"
                value={form.nationalId}
                maxLength={NATIONAL_ID_MAX}
                onChange={(e) => updateField("nationalId", e.target.value)}
                placeholder={
                  employee?.nationalIdMasked
                    ? "Masked — leave blank to keep unchanged"
                    : "e.g. NAT-908123"
                }
                className={`font-mono text-sm ${fieldClassName(Boolean(fieldErrors.nationalId))}`}
              />
              <FieldHint
                hint={
                  fieldErrors.nationalId ??
                  (employee?.nationalIdMasked
                    ? "Stored value is masked for your permission level; leave blank to keep it."
                    : "Optional. Masked automatically for non-privileged viewers.")
                }
                touched={Boolean(touched.nationalId)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="firstname" className="text-xs font-medium">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstname"
                value={form.firstname}
                onChange={(e) => updateField("firstname", e.target.value)}
                placeholder="First name"
                className={fieldClassName(Boolean(fieldErrors.firstname))}
                required
              />
              <FieldHint
                hint={fieldErrors.firstname ?? null}
                touched={Boolean(touched.firstname)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lastname" className="text-xs font-medium">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastname"
                value={form.lastname}
                onChange={(e) => updateField("lastname", e.target.value)}
                placeholder="Last name"
                className={fieldClassName(Boolean(fieldErrors.lastname))}
                required
              />
              <FieldHint
                hint={fieldErrors.lastname ?? null}
                touched={Boolean(touched.lastname)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-xs font-medium">
                Gender
              </Label>
              <Select
                value={form.gender || "__empty__"}
                onValueChange={(v) =>
                  updateField("gender", v === "__empty__" ? "" : v)
                }
              >
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Not specified</SelectItem>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maritalStatus" className="text-xs font-medium">
                Marital Status
              </Label>
              <Select
                value={form.maritalStatus || "__empty__"}
                onValueChange={(v) =>
                  updateField("maritalStatus", v === "__empty__" ? "" : v)
                }
              >
                <SelectTrigger id="maritalStatus" className="w-full">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Not specified</SelectItem>
                  {MARITAL_STATUS_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="departmentId" className="text-xs font-medium">
                Department
              </Label>
              <DepartmentCombobox
                id="departmentId"
                departments={departments}
                value={form.departmentId}
                onChange={(v) => updateField("departmentId", v)}
                allowClear
                placeholder="Search and select a department..."
              />
              <FieldHint
                hint={
                  fieldErrors.departmentId ??
                  "Linked to the master department register. Free text is not accepted."
                }
                touched={Boolean(touched.departmentId)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="jobGrade" className="text-xs font-medium">
                Job Grade ({JOB_GRADE_MIN}–{JOB_GRADE_MAX})
              </Label>
              <Input
                id="jobGrade"
                type="number"
                min={JOB_GRADE_MIN}
                max={JOB_GRADE_MAX}
                value={form.jobGrade}
                onChange={(e) => updateField("jobGrade", e.target.value)}
                placeholder="e.g. 14"
                className={`font-mono text-sm ${fieldClassName(Boolean(fieldErrors.jobGrade))}`}
              />
              <FieldHint
                hint={
                  fieldErrors.jobGrade ??
                  (form.jobGrade
                    ? `Determines house queue category (currently ${
                        eligibleCategory
                          ? `Category ${eligibleCategory}`
                          : "not eligible"
                      }).`
                    : "Used to derive house queue eligibility.")
                }
                touched={Boolean(touched.jobGrade)}
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                House Queue Eligibility
              </span>
              <div className="bg-muted/40 flex h-9 items-center justify-between rounded-md border px-3">
                <span className="text-muted-foreground text-xs">
                  House Tier
                </span>
                {eligibleCategory ? (
                  <Badge>{`Category ${eligibleCategory}`}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs italic">
                    {form.jobGrade ? "Not eligible" : "Enter a grade"}
                  </span>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="bg-muted/20 flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="disabilityStatus"
                    className="cursor-pointer text-xs font-semibold"
                  >
                    Registered Disability
                  </Label>
                  <p className="text-muted-foreground text-[11px]">
                    Employees with a registered disability receive MCDA priority
                    weighting in the house allocation queue.
                  </p>
                </div>
                <Switch
                  id="disabilityStatus"
                  checked={form.disabilityStatus}
                  onCheckedChange={(checked) =>
                    updateField("disabilityStatus", checked)
                  }
                />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Section 2: Employment & Organization ─── */}
        <section className="space-y-4">
          <SectionHeading step={2} title="Employment & Organization" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="jobTitle" className="text-xs font-medium">
                Job Title
              </Label>
              <Input
                id="jobTitle"
                value={form.jobTitle}
                onChange={(e) => updateField("jobTitle", e.target.value)}
                placeholder="e.g. Senior Agronomist"
                className={fieldClassName(Boolean(fieldErrors.jobTitle))}
              />
              <FieldHint
                hint={fieldErrors.jobTitle ?? null}
                touched={Boolean(touched.jobTitle)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employmentStatus" className="text-xs font-medium">
                Employment Status
              </Label>
              <Select
                value={form.employmentStatus}
                onValueChange={(v) => updateField("employmentStatus", v)}
              >
                <SelectTrigger id="employmentStatus" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employmentType" className="text-xs font-medium">
                Employment Type
              </Label>
              <Select
                value={form.employmentType}
                onValueChange={(v) => updateField("employmentType", v)}
              >
                <SelectTrigger id="employmentType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hireDate" className="text-xs font-medium">
                Hire Date
              </Label>
              <Input
                id="hireDate"
                type="date"
                value={form.hireDate}
                onChange={(e) => updateField("hireDate", e.target.value)}
                className={fieldClassName(Boolean(fieldErrors.hireDate))}
              />
              <FieldHint
                hint={
                  fieldErrors.hireDate ??
                  (form.hireDate
                    ? null
                    : "Seniority in years is computed from this date.")
                }
                touched={Boolean(touched.hireDate)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="terminationDate" className="text-xs font-medium">
                Termination Date
              </Label>
              <Input
                id="terminationDate"
                type="date"
                value={form.terminationDate}
                onChange={(e) => updateField("terminationDate", e.target.value)}
                className={fieldClassName(Boolean(fieldErrors.terminationDate))}
              />
              <FieldHint
                hint={
                  fieldErrors.terminationDate ??
                  (form.employmentStatus === "terminated" ||
                  form.employmentStatus === "retired"
                    ? "Recommended for terminated or retired employees."
                    : "Leave blank while the employee is employed.")
                }
                touched={Boolean(touched.terminationDate)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="familySize" className="text-xs font-medium">
                Family Size
              </Label>
              <Input
                id="familySize"
                type="number"
                min={1}
                max={30}
                value={form.familySize}
                onChange={(e) => updateField("familySize", e.target.value)}
                className={`font-mono text-sm ${fieldClassName(Boolean(fieldErrors.familySize))}`}
              />
              <FieldHint
                hint={
                  fieldErrors.familySize ??
                  "Household size used as a queue tiebreaker. Defaults to 1."
                }
                touched={Boolean(touched.familySize)}
              />
            </div>
          </div>
        </section>

        {/* ─── Section 3: HR Notes ─── */}
        <section className="space-y-4">
          <SectionHeading step={3} title="HR Notes" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes" className="text-xs font-medium">
                HR Notes
              </Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Qualifications, accommodations, or confidential remarks..."
                className="text-xs"
              />
            </div>
          </div>
        </section>

        {/* ─── Summary Preview ─── */}
        <div className="bg-muted/40 rounded-lg border p-3">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
            <Info className="h-3.5 w-3.5" />
            Employee Summary
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {summaryEntries.map((entry) => (
              <div key={entry.label} className="flex flex-col">
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  {entry.label}
                </span>
                <span
                  className={`text-foreground truncate text-xs font-semibold ${
                    entry.mono ? "font-mono" : ""
                  }`}
                >
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !canSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Employee"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
