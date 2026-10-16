import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Edit,
  ExternalLink,
  FileText,
  Heart,
  Home,
  Mail,
  MapPin,
  Phone,
  Shield,
  User,
  Users,
} from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/organization-context";
import { getEmployee } from "@/lib/employees/queries";
import { canViewSensitiveEmployeeData } from "@/lib/employees/access";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_BADGE_VARIANT,
  EMPLOYMENT_TYPE_LABELS,
  labelOrDash,
} from "@/lib/employees/constants";
import { houseCategoryForJobGrade } from "@/lib/house-queue/eligibility";
import EmployeeDetailActions from "./ui/EmployeeDetailActions";

export const metadata = {
  title: "Asset Tracker - Employee Details",
  description: "Employee details and management",
};

function formatDate(val: string | Date | null | undefined): string {
  if (!val) return "—";
  const d = typeof val === "string" ? new Date(val) : val;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(first: string, last: string): string {
  const f = first ? first[0] : "";
  const l = last ? last[0] : "";
  return `${f}${l}`.toUpperCase() || "E";
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    redirect("/login");
  }

  const canView = ctx.isAdmin || ctx.permissions.has("employee:view");
  if (!canView) {
    redirect("/employees");
  }

  const { id } = await params;
  const canSeeSensitive = await canViewSensitiveEmployeeData(session.user);

  const employee = await getEmployee({
    organizationId: orgId,
    id,
    canSeeSensitive,
    includeDeleted: true,
  });

  if (!employee) {
    notFound();
  }

  const canEdit = ctx.isAdmin || ctx.permissions.has("employee:edit");
  const canDelete = ctx.isAdmin || ctx.permissions.has("employee:delete");
  const canRestore = ctx.isAdmin || ctx.permissions.has("employee:restore");

  const [directReports, auditLogs] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organizationId: orgId,
        managerId: id,
        deletedAt: null,
      },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        employeeNumber: true,
        jobTitle: true,
      },
      orderBy: [{ lastname: "asc" }, { firstname: "asc" }],
    }),
    prisma.audit_logs.findMany({
      where: {
        organizationId: orgId,
        entity: "EMPLOYEE",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const fullName = `${employee.firstname} ${employee.lastname}`.trim();
  const eligibleCategory = houseCategoryForJobGrade(employee.jobGrade);

  return (
    <div className="space-y-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Employees", href: "/employees" },
          { label: fullName },
        ]}
      />

      {/* Header section with profile avatar and actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="border-primary/20 bg-primary/10 text-primary flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-lg font-bold">
            {initials(employee.firstname, employee.lastname)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-foreground text-2xl font-bold tracking-tight">
                {fullName}
              </h1>
              <Badge
                variant={
                  (EMPLOYMENT_STATUS_BADGE_VARIANT[
                    employee.employmentStatus as keyof typeof EMPLOYMENT_STATUS_BADGE_VARIANT
                  ] ?? "outline") as any
                }
              >
                {labelOrDash(
                  EMPLOYMENT_STATUS_LABELS,
                  employee.employmentStatus,
                )}
              </Badge>
              {employee.deletedAt ? (
                <Badge variant="destructive">Archived</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-sm">
              <span className="text-foreground font-mono font-medium">
                {employee.employeeNumber}
              </span>
              {employee.jobTitle ? <span>• {employee.jobTitle}</span> : null}
              {employee.department ? (
                <span>
                  • {employee.department.name}
                  {employee.department.code
                    ? ` (${employee.department.code})`
                    : ""}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/employees">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to List
            </Link>
          </Button>

          {canEdit && !employee.deletedAt ? (
            <Button asChild size="sm">
              <Link href={`/employees/${employee.id}/edit`}>
                <Edit className="mr-1.5 h-4 w-4" />
                Edit Profile
              </Link>
            </Button>
          ) : null}

          <EmployeeDetailActions
            employeeId={employee.id}
            employeeName={fullName}
            isDeleted={Boolean(employee.deletedAt)}
            canDelete={canDelete}
            canRestore={canRestore}
          />
        </div>
      </div>

      <Separator />

      {/* Main detail content grids */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Job & Organization */}
        <section className="bg-card rounded-lg border p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Building2 className="text-primary h-4 w-4" />
            <h2 className="text-foreground text-sm font-semibold">
              Employment & Organization
            </h2>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Employee ID</dt>
              <dd className="font-mono text-xs font-semibold">
                {employee.employeeNumber}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Department</dt>
              <dd className="text-foreground font-medium">
                {employee.department ? (
                  <span>
                    {employee.department.name}
                    {employee.department.code
                      ? ` (${employee.department.code})`
                      : ""}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Job Title</dt>
              <dd className="text-foreground font-medium">
                {employee.jobTitle || "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Job Grade</dt>
              <dd>
                {employee.jobGrade != null ? (
                  <Badge variant="secondary" className="font-mono font-medium">
                    Grade {employee.jobGrade}
                  </Badge>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">House Queue Category</dt>
              <dd>
                {eligibleCategory ? (
                  <Badge
                    variant="outline"
                    className="border-primary/30 text-primary"
                  >
                    <Home className="mr-1 h-3 w-3" />
                    {eligibleCategory}
                  </Badge>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Employment Type</dt>
              <dd className="text-foreground capitalize">
                {EMPLOYMENT_TYPE_LABELS[
                  employee.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS
                ] ?? employee.employmentType}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Hire Date</dt>
              <dd className="text-foreground">
                {formatDate(employee.hireDate)}
              </dd>
            </div>
            {employee.terminationDate ? (
              <div className="text-destructive flex items-center justify-between">
                <dt>Termination Date</dt>
                <dd>{formatDate(employee.terminationDate)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {/* Card 2: Personal & Demographics */}
        <section className="bg-card rounded-lg border p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <User className="text-primary h-4 w-4" />
            <h2 className="text-foreground text-sm font-semibold">
              Personal & Demographics
            </h2>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Full Name</dt>
              <dd className="text-foreground font-medium">{fullName}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Date of Birth</dt>
              <dd className="text-foreground">
                {formatDate(employee.dateOfBirth)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Gender</dt>
              <dd className="text-foreground">
                {labelOrDash(GENDER_LABELS, employee.gender)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Marital Status</dt>
              <dd className="text-foreground">
                {labelOrDash(MARITAL_STATUS_LABELS, employee.maritalStatus)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Family Size</dt>
              <dd className="text-foreground font-semibold">
                {employee.familySize ?? 1}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Disability</dt>
              <dd>
                {employee.disabilityStatus ? (
                  <Badge variant="warning">Yes</Badge>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">National ID</dt>
              <dd className="flex items-center gap-1.5 font-mono text-xs">
                {employee.nationalId ? (
                  <>
                    <span>{employee.nationalId}</span>
                    {employee.nationalIdMasked ? (
                      <Badge variant="outline" className="text-[10px]">
                        Masked
                      </Badge>
                    ) : (
                      <Badge variant="success" className="text-[10px]">
                        Verified
                      </Badge>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Card 3: Contact & Address */}
        <section className="bg-card rounded-lg border p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Mail className="text-primary h-4 w-4" />
            <h2 className="text-foreground text-sm font-semibold">
              Contact & Address
            </h2>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Phone Number</dt>
              <dd className="text-foreground font-mono text-xs">
                {employee.phone || "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Physical Address</dt>
              <dd className="text-foreground">{employee.address || "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">City / Town</dt>
              <dd className="text-foreground">{employee.city || "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">State / Region</dt>
              <dd className="text-foreground">{employee.state || "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Country</dt>
              <dd className="text-foreground">{employee.country || "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Postal Code</dt>
              <dd className="text-foreground font-mono text-xs">
                {employee.postalCode || "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Card 4: Reporting & System Links */}
        <section className="bg-card rounded-lg border p-5 shadow-sm md:col-span-2 lg:col-span-3">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <Users className="text-primary h-4 w-4" />
            <h2 className="text-foreground text-sm font-semibold">
              Hierarchy & System Linkages
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs font-medium">
                Reporting Manager
              </dt>
              <dd className="mt-1 text-sm">
                {employee.manager ? (
                  <Link
                    href={`/employees/${employee.manager.id}`}
                    className="text-primary flex items-center gap-1.5 font-medium hover:underline"
                  >
                    <span>
                      {employee.manager.firstname} {employee.manager.lastname}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    None (Reports to executive / Root)
                  </span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs font-medium">
                Linked System Login User
              </dt>
              <dd className="mt-1 text-sm">
                {employee.user ? (
                  <Link
                    href={`/user/${employee.user.userid}`}
                    className="text-primary flex items-center gap-1.5 font-medium hover:underline"
                  >
                    <span>
                      {employee.user.firstname} {employee.user.lastname}
                      {employee.user.email ? ` (${employee.user.email})` : ""}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    No linked system login account
                  </span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs font-medium">
                Direct Reports
              </dt>
              <dd className="mt-1 text-sm">
                {directReports.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {directReports.map((dr) => (
                      <Link
                        key={dr.id}
                        href={`/employees/${dr.id}`}
                        className="bg-muted hover:bg-muted/80 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                      >
                        {dr.firstname} {dr.lastname} ({dr.employeeNumber})
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    No direct reports
                  </span>
                )}
              </dd>
            </div>
          </div>
        </section>

        {/* Card 5: HR Notes (if any) */}
        {employee.notes ? (
          <section className="bg-card rounded-lg border p-5 shadow-sm md:col-span-2 lg:col-span-3">
            <div className="mb-3 flex items-center gap-2 border-b pb-2">
              <FileText className="text-primary h-4 w-4" />
              <h2 className="text-foreground text-sm font-semibold">
                Confidential HR Notes
              </h2>
            </div>
            <p className="text-foreground/90 text-sm whitespace-pre-wrap">
              {employee.notes}
            </p>
          </section>
        ) : null}

        {/* Card 6: Audit History */}
        {auditLogs.length > 0 ? (
          <section className="bg-card rounded-lg border p-5 shadow-sm md:col-span-2 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Shield className="text-primary h-4 w-4" />
                <h2 className="text-foreground text-sm font-semibold">
                  Audit History
                </h2>
              </div>
              <span className="text-muted-foreground text-xs">
                Recent activities
              </span>
            </div>
            <div className="divide-y text-xs">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {log.action}
                    </Badge>
                    <span className="text-foreground">{log.entity} Record</span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
