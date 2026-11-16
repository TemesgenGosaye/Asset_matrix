"use client";

import React, { useCallback, useMemo, useState } from "react";
import { notify } from "@/lib/feedback/notify";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  User,
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  JOB_GRADE_MIN,
  JOB_GRADE_MAX,
  DISABILITY_MAX,
  EMPLOYEE_NUMBER_MAX,
  SERVICE_YEARS_MIN,
  SERVICE_YEARS_MAX,
} from "@/lib/employees/constants";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/employees/schemas";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import type { EmployeeDto } from "@/lib/employees/types";

interface EmployeeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDto | null;
  onSuccess: () => void;
}

/**
 * The approved canonical employee schema is exactly eight business fields.
 * Every other attribute (department, job title, employment status, hire date,
 * family size, National ID, manager, login link) lives outside this form so it
 * cannot be mistaken for part of the approved register.
 */
interface FormState {
  employeeNumber: string;
  firstname: string;
  lastname: string;
  gender: string;
  jobGrade: string;
  serviceYears: string;
  maritalStatus: string;
  /** Free text, exactly as the source stated it. Empty means "not recorded". */
  disabilityStatus: string;
}

const INITIAL_FORM_STATE: FormState = {
  employeeNumber: "",
  firstname: "",
  lastname: "",
  gender: "",
  jobGrade: "",
  serviceYears: "",
  maritalStatus: "",
  disabilityStatus: "",
};

function buildInitialState(employee: EmployeeDto | null): FormState {
  if (!employee) return INITIAL_FORM_STATE;

  return {
    employeeNumber: employee.employeeNumber ?? "",
    firstname: employee.firstname ?? "",
    lastname: employee.lastname ?? "",
    gender: employee.gender ?? "",
    jobGrade: employee.jobGrade != null ? String(employee.jobGrade) : "",
    serviceYears:
      employee.serviceYears != null ? String(employee.serviceYears) : "",
    maritalStatus: employee.maritalStatus ?? "",
    disabilityStatus: employee.disabilityStatus ?? "",
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
  onSuccess,
}: EmployeeFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <User className="text-primary h-5 w-5" />
            {employee ? "Edit Employee" : "Add New Employee"}
          </DialogTitle>
          <DialogDescription>
            {employee
              ? `Update the record for ${employee.firstname} ${employee.lastname} (${employee.employeeNumber}).`
              : "Register an employee using the eight approved fields of the canonical register."}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <EmployeeFormFields
            employee={employee}
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
  onSuccess,
  onClose,
}: {
  employee: EmployeeDto | null;
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

  const canSubmit =
    form.employeeNumber.trim().length > 0 &&
    form.firstname.trim().length > 0 &&
    form.lastname.trim().length > 0;

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
      serviceYears: form.serviceYears ? Number(form.serviceYears) : null,
      maritalStatus: form.maritalStatus || null,
      disabilityStatus: form.disabilityStatus.trim() || null,
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
          if (msg.toLowerCase().includes("employee number")) {
            setFieldErrors((prev) => ({ ...prev, employeeNumber: msg }));
          }
          throw new Error(msg);
        }
        throw new Error(
          responseBody?.error || "Failed to save employee record.",
        );
      }

      notify.success({
        title: isEditing ? "Employee record updated" : "Employee registered",
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
        <section className="space-y-4">
          <SectionHeading
            step={1}
            title="Identity"
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

            <div className="space-y-1.5 sm:col-span-2">
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
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading step={2} title="Position" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Label htmlFor="serviceYears" className="text-xs font-medium">
                Service Years ({SERVICE_YEARS_MIN}–{SERVICE_YEARS_MAX})
              </Label>
              <Input
                id="serviceYears"
                type="number"
                min={SERVICE_YEARS_MIN}
                max={SERVICE_YEARS_MAX}
                value={form.serviceYears}
                onChange={(e) => updateField("serviceYears", e.target.value)}
                placeholder="e.g. 5"
                className={`font-mono text-sm ${fieldClassName(Boolean(fieldErrors.serviceYears))}`}
              />
              <FieldHint
                hint={
                  fieldErrors.serviceYears ??
                  (form.serviceYears
                    ? null
                    : "Years of service, used for the house queue priority score.")
                }
                touched={Boolean(touched.serviceYears)}
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
              <div className="bg-muted/20 space-y-1.5 rounded-lg border p-3">
                <Label
                  htmlFor="disabilityStatus"
                  className="text-xs font-semibold"
                >
                  Disability
                </Label>
                <Input
                  id="disabilityStatus"
                  value={form.disabilityStatus}
                  maxLength={DISABILITY_MAX}
                  onChange={(e) =>
                    updateField("disabilityStatus", e.target.value)
                  }
                  placeholder="e.g. Physical impairment — or leave blank if not recorded"
                  className={`text-sm ${fieldClassName(Boolean(fieldErrors.disabilityStatus))}`}
                />
                <p className="text-muted-foreground text-[11px]">
                  Recorded exactly as written. Employees with a disability on
                  record receive MCDA priority weighting in the house allocation
                  queue. Leave blank when nothing is recorded.
                </p>
              </div>
            </div>
          </div>
        </section>

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
