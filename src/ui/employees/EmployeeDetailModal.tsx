"use client";

import React, { useMemo } from "react";
import {
  Building2,
  Edit,
  FileText,
  Info,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Trash2,
  User,
  Users,
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
import { Badge } from "@/components/ui/badge";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_BADGE_VARIANT,
  EMPLOYMENT_TYPE_LABELS,
  labelOrDash,
} from "@/lib/employees/constants";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import type { EmployeeDto } from "@/lib/employees/types";

interface EmployeeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDto | null;
  canEdit: boolean;
  canDelete: boolean;
  canRestore?: boolean;
  onEdit: (employee: EmployeeDto) => void;
  onArchive: (employee: EmployeeDto) => void;
  onRestore?: (employee: EmployeeDto) => void;
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Section heading, matching the employee form modal's numbered pattern. */
function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-muted-foreground flex items-center gap-2 border-b pb-1 text-xs font-semibold tracking-wider uppercase">
        <Icon className="text-primary h-3.5 w-3.5" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function EmployeeDetailModal({
  open,
  onOpenChange,
  employee,
  canEdit,
  canDelete,
  canRestore = false,
  onEdit,
  onArchive,
  onRestore,
}: EmployeeDetailModalProps) {
  const houseTier = useMemo(
    () => houseCategoryForJobGrade(employee?.jobGrade),
    [employee?.jobGrade],
  );

  if (!employee) return null;

  const fullName = `${employee.firstname} ${employee.lastname}`.trim();
  const initials =
    `${employee.firstname.charAt(0)}${employee.lastname.charAt(0)}`.toUpperCase();
  const fullAddress =
    [
      employee.address,
      employee.city,
      employee.state,
      employee.country,
      employee.postalCode,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold">
            <span className="border-primary/20 bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-bold">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{fullName}</span>
              <span className="text-muted-foreground mt-0.5 flex items-center gap-2 font-mono text-xs font-normal">
                <span>{employee.employeeNumber}</span>
                {employee.department ? (
                  <>
                    <span>·</span>
                    <span className="text-foreground/80 truncate">
                      {employee.department.name}
                    </span>
                  </>
                ) : null}
              </span>
            </span>
          </DialogTitle>
          <DialogDescription>
            Read-only profile. Use Edit Profile to update this employee record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Key attributes at a glance */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-card rounded-lg border p-3">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Status
              </span>
              <div className="mt-1.5">
                <Badge
                  variant={
                    EMPLOYMENT_STATUS_BADGE_VARIANT[employee.employmentStatus]
                  }
                >
                  {EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}
                </Badge>
              </div>
            </div>

            <div className="bg-card rounded-lg border p-3">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Job Grade
              </span>
              <div className="mt-1.5 font-mono text-sm font-bold">
                {employee.jobGrade != null ? `Grade ${employee.jobGrade}` : "—"}
              </div>
            </div>

            <div className="bg-card rounded-lg border p-3">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                House Tier
              </span>
              <div className="mt-1.5">
                {houseTier ? (
                  <Badge>{`Category ${houseTier}`}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs italic">
                    None
                  </span>
                )}
              </div>
            </div>

            <div className="bg-card rounded-lg border p-3">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Disability
              </span>
              <div className="mt-1.5">
                {employee.disabilityStatus ? (
                  <Badge variant="warning">Registered</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">None</span>
                )}
              </div>
            </div>
          </div>

          <DetailSection icon={User} title="Identity">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
              <Field label="Employee Number">
                <span className="font-mono font-medium">
                  {employee.employeeNumber}
                </span>
              </Field>
              <Field label="National ID">
                <span className="flex items-center gap-1.5 font-mono font-medium">
                  {employee.nationalId ? (
                    <>
                      <span>{employee.nationalId}</span>
                      {employee.nationalIdMasked ? (
                        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                          Masked
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </Field>
              <Field label="Gender">
                {labelOrDash(GENDER_LABELS, employee.gender)}
              </Field>
              <Field label="Marital Status">
                {labelOrDash(MARITAL_STATUS_LABELS, employee.maritalStatus)}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Department">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Building2 className="text-muted-foreground h-4 w-4" />
                    {employee.department ? (
                      <span>
                        {employee.department.name}
                        {employee.department.code ? (
                          <span className="text-muted-foreground ml-1 font-mono text-xs">
                            ({employee.department.code})
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "Unassigned"
                    )}
                  </span>
                </Field>
              </div>
            </dl>
          </DetailSection>

          <DetailSection icon={Users} title="Employment">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
              <Field label="Job Title">{employee.jobTitle || "—"}</Field>
              <Field label="Employment Type">
                {labelOrDash(EMPLOYMENT_TYPE_LABELS, employee.employmentType)}
              </Field>
              <Field label="Hire Date">{formatDate(employee.hireDate)}</Field>
              <Field label="Termination Date">
                {formatDate(employee.terminationDate)}
              </Field>
              <Field label="Family Size">{employee.familySize ?? "—"}</Field>
              <Field label="Reporting Manager">
                {employee.manager
                  ? `${employee.manager.firstname} ${employee.manager.lastname}`
                  : "—"}
              </Field>
            </dl>
          </DetailSection>

          <DetailSection icon={FileText} title="HR Notes">
            {employee.notes ? (
              <p className="bg-muted/20 text-muted-foreground rounded-md border p-3 text-sm whitespace-pre-wrap">
                {employee.notes}
              </p>
            ) : (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs italic">
                <Info className="h-3.5 w-3.5" />
                No HR notes recorded for this employee.
              </p>
            )}
          </DetailSection>
        </div>

        <DialogFooter className="justify-between gap-2 pt-3 sm:justify-between">
          <div>
            {employee.deletedAt ? (
              canRestore && onRestore ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onRestore(employee);
                  }}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Restore
                </Button>
              ) : null
            ) : canDelete ? (
              <Button
                variant="destructive"
                onClick={() => {
                  onOpenChange(false);
                  onArchive(employee);
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Archive
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {canEdit && !employee.deletedAt ? (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onEdit(employee);
                }}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                Edit Profile
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
