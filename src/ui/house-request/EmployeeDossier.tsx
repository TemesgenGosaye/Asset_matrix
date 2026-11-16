"use client";

import type { ReactNode } from "react";
import {
  Accessibility,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Fingerprint,
  GraduationCap,
  Home,
  IdCard,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  MISSING_JOB_GRADE_LABEL,
  MISSING_JOB_GRADE_NOTICE,
  hasDisabilityRecord,
} from "@/lib/employees/constants";
import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/ui/household/house-format";
import { humaniseEnum, initialsFor } from "./format";

function labelFor(
  labels: Record<string, string>,
  value: string | null,
): string | null {
  if (!value) return null;
  return labels[value] ?? humaniseEnum(value);
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "neutral" | "brass";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        tone === "success" &&
          "bg-success-bg text-success-foreground ring-success-foreground/20",
        tone === "warning" &&
          "bg-warning-bg text-warning-foreground ring-warning-foreground/20",
        tone === "neutral" &&
          "bg-secondary text-secondary-foreground ring-border",
        tone === "brass" &&
          "bg-brass-500/10 text-brass-600 ring-brass-500/30 dark:text-brass-300",
      )}
    >
      {children}
    </span>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
      <span className="bg-secondary text-muted-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
          {label}
        </dt>
        <dd className="text-foreground mt-0.5 truncate text-sm font-bold tabular-nums">
          {value}
        </dd>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="text-foreground mt-1.5 truncate text-sm font-medium">
        {value}
      </dd>
    </div>
  );
}

function Absent() {
  return <span className="text-muted-foreground/70 font-normal">Not recorded</span>;
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border/60 bg-background/40 rounded-2xl border p-5">
      <div className="flex items-start gap-3">
        <span className="bg-secondary text-muted-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-foreground text-sm font-bold tracking-tight">
            {title}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

export interface EmployeeDossierProps {
  verify: HouseRequestVerifyResult;
  onReset: () => void;
}

export default function EmployeeDossier({ verify, onReset }: EmployeeDossierProps) {
  const employee = verify.employee;
  const active = employee.employmentStatus.toLowerCase() === "active";
  const house = verify.allocation;
  const request = verify.existingRequest;

  return (
    <section
      aria-label="Employee dossier"
      className="border-border/70 bg-card overflow-hidden rounded-3xl border shadow-[var(--shadow-md)]"
    >
      <div className="from-secondary via-card to-card relative overflow-hidden border-b border-border/60 bg-gradient-to-br px-5 py-6 sm:px-7">
        <div
          aria-hidden
          className="bg-brass-500/10 absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="from-brass-400 to-brass-600 text-foreground ring-background relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-black tracking-tight shadow-lg ring-4">
              {initialsFor(employee)}
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                Verified employee
              </p>
              <h2 className="housing-serif text-foreground mt-1 truncate text-2xl leading-tight font-bold tracking-tight">
                {verify.fullName}
              </h2>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-foreground font-mono font-semibold tracking-wide">
                  {verify.empId}
                </span>
                {employee.jobTitle ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{employee.jobTitle}</span>
                  </>
                ) : null}
                {verify.department ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{verify.department}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Pill tone={active ? "success" : "warning"}>
              {active ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden />
              ) : (
                <Clock3 className="h-3 w-3" aria-hidden />
              )}
              {humaniseEnum(employee.employmentStatus)}
            </Pill>
            {verify.eligibleHouseType ? (
              <Pill tone="brass">
                <Home className="h-3 w-3" aria-hidden />
                Type {verify.eligibleHouseType}
              </Pill>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              className="bg-background/70 h-8 gap-1.5 rounded-full px-3 text-[11px] font-semibold backdrop-blur"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              New search
            </Button>
          </div>
        </div>
      </div>

      <dl className="divide-border/60 bg-card grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
        <Stat
          icon={CalendarDays}
          label="Service"
          value={`${employee.serviceYears} yr${employee.serviceYears === 1 ? "" : "s"}`}
        />
        <Stat
          icon={GraduationCap}
          label="Job grade"
          value={employee.jobGrade ?? MISSING_JOB_GRADE_LABEL}
        />
        <Stat
          icon={Users}
          label="Family size"
          value={employee.familySize ?? "Not recorded"}
        />
        <Stat
          icon={Home}
          label="House band"
          value={verify.eligibleHouseType ?? "None"}
        />
      </dl>

      {employee.jobGrade == null ? (
        <div className="border-warning/40 bg-warning/10 text-warning-foreground m-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm sm:mx-6">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">{MISSING_JOB_GRADE_LABEL}.</strong>{" "}
            {MISSING_JOB_GRADE_NOTICE}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
        <Section
          icon={BriefcaseBusiness}
          title="Employment"
          description="Read live from the Employee Register."
        >
          <Detail
            icon={Building2}
            label="Department"
            value={verify.department ?? <Absent />}
          />
          <Detail
            icon={IdCard}
            label="Job title"
            value={employee.jobTitle ?? <Absent />}
          />
          <Detail
            icon={BriefcaseBusiness}
            label="Employment type"
            value={
              labelFor(EMPLOYMENT_TYPE_LABELS, employee.employmentType) ?? (
                <Absent />
              )
            }
          />
          <Detail
            icon={ShieldCheck}
            label="Status"
            value={humaniseEnum(employee.employmentStatus)}
          />
          <Detail
            icon={CalendarDays}
            label="Hire date"
            value={formatDate(employee.hireDate)}
          />
          <Detail
            icon={GraduationCap}
            label="Service years"
            value={employee.serviceYears}
          />
        </Section>

        <Section
          icon={Users}
          title="Personal & household"
          description="Sensitive identifiers stay masked unless your role allows them."
        >
          <Detail
            icon={Users}
            label="Gender"
            value={labelFor(GENDER_LABELS, employee.gender) ?? <Absent />}
          />
          <Detail
            icon={Users}
            label="Marital status"
            value={
              labelFor(MARITAL_STATUS_LABELS, employee.maritalStatus) ?? (
                <Absent />
              )
            }
          />
          <Detail
            icon={Users}
            label="Family size"
            value={employee.familySize ?? <Absent />}
          />
          <Detail
            icon={Accessibility}
            label="Accessibility"
            value={
              hasDisabilityRecord(employee.disabilityStatus)
                ? employee.disabilityStatus
                : "None recorded"
            }
          />
          <Detail
            icon={Phone}
            label="Phone"
            value={employee.phone ?? <Absent />}
          />
          <Detail
            icon={Fingerprint}
            label="National ID"
            value={employee.nationalIdMasked ?? <Absent />}
          />
        </Section>

        <div className="xl:col-span-2">
          <section className="border-border/60 bg-background/40 rounded-2xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="bg-secondary text-muted-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <Home className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-foreground text-sm font-bold tracking-tight">
                    Housing position
                  </h3>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    Allocation and queue facts for this employee only.
                  </p>
                </div>
              </div>
              {house ? (
                <Pill tone="success">
                  <Home className="h-3 w-3" aria-hidden />
                  Allocated
                </Pill>
              ) : request ? (
                <Pill tone="warning">
                  <Clock3 className="h-3 w-3" aria-hidden />
                  In the queue
                </Pill>
              ) : (
                <Pill tone="neutral">No allocation</Pill>
              )}
            </div>

            {house ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="bg-card border-border/60 rounded-xl border p-4">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                    House
                  </p>
                  <p className="housing-serif text-foreground mt-1 text-xl font-bold">
                    {house.houseNumber ?? "Unnumbered"}
                  </p>
                  <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {house.locationName ?? "Location not recorded"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    HID {house.hid ?? "—"} · Type {house.houseType ?? "—"}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-4">
                  <Detail
                    icon={Home}
                    label="Occupancy"
                    value={house.occupancyStatus ?? <Absent />}
                  />
                  <Detail
                    icon={ShieldCheck}
                    label="House status"
                    value={house.houseStatus ?? <Absent />}
                  />
                  <Detail
                    icon={CalendarDays}
                    label="Allocated"
                    value={formatDate(house.allocatedAt)}
                  />
                  <Detail
                    icon={RotateCcw}
                    label="Moves"
                    value={house.moveCount}
                  />
                </dl>
              </div>
            ) : request ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="bg-card border-border/60 rounded-xl border p-4">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                    Request status
                  </p>
                  <p className="text-foreground mt-1 text-sm font-bold">
                    {humaniseEnum(request.status)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Submitted {formatDate(request.submittedAt)}
                  </p>
                </div>
                <div className="bg-card border-border/60 rounded-xl border p-4">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                    Reason on file
                  </p>
                  <p className="text-foreground mt-1 line-clamp-3 text-xs leading-relaxed">
                    {request.remarks}
                  </p>
                </div>
              </div>
            ) : (
              <div className="border-border/60 bg-card mt-5 rounded-xl border border-dashed p-6 text-center">
                <p className="text-foreground text-sm font-semibold">
                  No house and no open request
                </p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
                  This employee is ready to be considered. File a request with a
                  clear justification to add them to the House Queue.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
