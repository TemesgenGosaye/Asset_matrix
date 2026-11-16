/**
 * Employee read layer.
 *
 * All employee reads go through here so that:
 *  * organization scoping and soft-delete visibility are applied uniformly;
 *  * National ID masking happens *before* serialisation, so an unmasked value
 *    cannot leak through a list, detail or export response;
 *  * search is executed by PostgreSQL. Because the migration created `pg_trgm`
 *    GIN indexes on firstname / lastname / employeeNumber / nationalId, the
 *    case-insensitive `contains` filters below are index-backed rather than
 *    sequential scans.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  DISABILITY_NEGATIVE_VALUES,
  hasDisabilityRecord,
  maskNationalId,
} from "./constants";
import { computeEmployeeMcdaScores } from "./mcda";
import { EMPLOYEE_SORT_FIELDS, type EmployeeListQuery } from "./schemas";

/**
 * Columns returned for employee rows.
 *
 * The eight canonical business columns come first; the rest are the retained
 * relational / domain fields other modules depend on plus technical metadata.
 * Columns that are no longer part of the approved schema are not selected, so
 * they cannot leak into an API response.
 */
const employeeSelect = {
  id: true,
  employeeNumber: true,
  firstname: true,
  lastname: true,
  gender: true,
  jobGrade: true,
  serviceYears: true,
  maritalStatus: true,
  disabilityStatus: true,
  profile: {
    select: {
      nationalId: true,
      jobTitle: true,
      employmentType: true,
      employmentStatus: true,
      familySize: true,
      hireDate: true,
    },
  },
  departmentId: true,
  managerId: true,
  userid: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, firstname: true, lastname: true } },
  user: {
    select: { userid: true, firstname: true, lastname: true, email: true },
  },
} satisfies Prisma.EmployeeSelect;

export type EmployeeRow = Prisma.EmployeeGetPayload<{
  select: typeof employeeSelect;
}>;

/** A row as returned to the browser, with National ID masked or not. */
export type EmployeeDto = Omit<EmployeeRow, "profile"> & {
  nationalId: string;
  nationalIdMasked: boolean;
  jobTitle: string | null;
  employmentType: string;
  employmentStatus: string;
  familySize: number | null;
  hireDate: Date | null;
  /**
   * MCDA priority score in [0, 1] for an employee whose record states a
   * disability. `null` for every other employee, and for a disabled employee
   * the engine could not place (no band, no cohort).
   */
  mcdaScore: number | null;
  /** 1-based position of the employee inside their house-band cohort. */
  mcdaRank: number | null;
  /** How many employees compete in the same band. */
  mcdaCohortSize: number | null;
  /** Display-only serial number, computed from the page position. */
  srNo: number;
};

export interface ListEmployeesResult {
  data: EmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** False when the caller may only see masked National IDs. */
  unmaskedNationalIds: boolean;
}

/**
 * Shape a database row for the API, masking the National ID when the caller
 * lacks the sensitive-data permission.
 */
function toDto(
  row: EmployeeRow,
  srNo: number,
  canSeeSensitive: boolean,
  mcda?: {
    score: number;
    rank: number;
    cohortSize: number;
  },
): EmployeeDto {
  const { profile, ...rest } = row;
  // Tests and a few fixtures still build flat employee objects; production
  // reads always return the profile relation. Support both without changing
  // the wire shape.
  const legacy = row as EmployeeRow & {
    nationalId?: string | null;
    jobTitle?: string | null;
    employmentType?: string;
    employmentStatus?: string;
    familySize?: number | null;
    hireDate?: Date | null;
  };
  const nationalId = profile?.nationalId ?? legacy.nationalId ?? null;
  const revealed = canSeeSensitive && nationalId != null && nationalId !== "";
  return {
    ...rest,
    nationalId: revealed ? nationalId : maskNationalId(nationalId),
    nationalIdMasked: Boolean(nationalId) && !revealed,
    jobTitle: profile?.jobTitle ?? legacy.jobTitle ?? null,
    employmentType: profile?.employmentType ?? legacy.employmentType ?? "full_time",
    employmentStatus:
      profile?.employmentStatus ?? legacy.employmentStatus ?? "active",
    familySize: profile?.familySize ?? legacy.familySize ?? null,
    hireDate: profile?.hireDate ?? legacy.hireDate ?? null,
    mcdaScore: mcda?.score ?? null,
    mcdaRank: mcda?.rank ?? null,
    mcdaCohortSize: mcda?.cohortSize ?? null,
    srNo,
    user: row.user
      ? {
          userid: row.user.userid,
          firstname: row.user.firstname,
          lastname: row.user.lastname,
          email: row.user.email,
        }
      : null,
  };
}

/**
 * The MCDA standing of every employee on the page who has a disability on
 * record.
 *
 * The score is only asked for when there is somebody to score: a page of
 * employees with no recorded disability costs no extra query at all.
 */
async function loadMcdaScores(
  organizationId: string,
  rows: readonly { id: string; disabilityStatus: string | null }[],
): Promise<Map<string, { score: number; rank: number; cohortSize: number }>> {
  const disabledIds = rows
    .filter((row) => hasDisabilityRecord(row.disabilityStatus))
    .map((row) => row.id);
  if (disabledIds.length === 0) return new Map();

  const standings = await computeEmployeeMcdaScores(organizationId, disabledIds);
  const result = new Map<
    string,
    { score: number; rank: number; cohortSize: number }
  >();
  for (const [id, standing] of standings) {
    result.set(id, {
      score: standing.score,
      rank: standing.rank,
      cohortSize: standing.cohortSize,
    });
  }
  return result;
}

/**
 * Build the Prisma `where` clause from the parsed list query.
 *
 * `includeDeleted` shows archived employees *alongside* live ones (the
 * "Archived" toggle), while `onlyDeleted` narrows to archived rows alone.
 */
export function buildEmployeeWhere(
  query: EmployeeListQuery,
  organizationId: string,
): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = { organizationId };
  /**
   * Conditions that are ANDed together. Several of them are OR groups (search,
   * "no disability recorded"), so they cannot all live on the top-level `OR`
   * key without overwriting each other.
   */
  const and: Prisma.EmployeeWhereInput[] = [];

  if (query.onlyDeleted) {
    where.deletedAt = { not: null };
  } else if (!query.includeDeleted) {
    where.deletedAt = null;
  }

  if (query.search) {
    const term = query.search;
    // Search runs against the approved columns only: Emp ID, first name and
    // last name. The pg_trgm GIN indexes on those columns make the
    // case-insensitive substring match index-backed.
    and.push({
      OR: [
        { firstname: { contains: term, mode: "insensitive" } },
        { lastname: { contains: term, mode: "insensitive" } },
        { employeeNumber: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.employmentStatus || query.employmentType) {
    where.profile = {
      is: {
        ...(query.employmentStatus
          ? { employmentStatus: query.employmentStatus }
          : {}),
        ...(query.employmentType
          ? { employmentType: query.employmentType }
          : {}),
      },
    };
  }
  if (query.gender) where.gender = query.gender;
  if (query.maritalStatus) where.maritalStatus = query.maritalStatus;

  if (query.disability === "recorded") {
    // A disability is on record when the column holds a value that is not one
    // of the explicit "none" tokens. `not: null` is stated separately because
    // SQL's `NOT IN` is unknown for NULL and would drop unrecorded employees.
    //
    // The comparison is case-insensitive because the column stores the
    // source's own wording — "No", "no", "None" all mean the same thing, and
    // `hasDisabilityRecord()` (which the UI and the scoring engine use) reads
    // them the same way.
    and.push({ disabilityStatus: { not: null } });
    and.push({
      disabilityStatus: {
        notIn: [...DISABILITY_NEGATIVE_VALUES],
        mode: "insensitive",
      },
    });
  } else if (query.disability === "none") {
    and.push({
      OR: [
        { disabilityStatus: null },
        {
          disabilityStatus: {
            in: [...DISABILITY_NEGATIVE_VALUES],
            mode: "insensitive",
          },
        },
      ],
    });
  }

  const gradeMin = query.jobGradeFrom;
  const gradeMax = query.jobGradeTo;
  if (gradeMin !== undefined || gradeMax !== undefined) {
    where.jobGrade = {
      ...(gradeMin !== undefined ? { gte: gradeMin } : {}),
      ...(gradeMax !== undefined ? { lte: gradeMax } : {}),
    };
  }

  if (and.length > 0) where.AND = and;

  return where;
}

/**
 * Build the Prisma `orderBy` from an allowlisted sort field.
 *
 * Every field is checked against {@link EMPLOYEE_SORT_FIELDS} so a caller
 * cannot sort by an arbitrary column. A secondary key is always appended to
 * keep pagination stable when the primary key has ties.
 */
export function buildEmployeeOrderBy(
  query: EmployeeListQuery,
): Prisma.EmployeeOrderByWithRelationInput[] {
  const direction = query.sortOrder ?? "asc";
  const field = query.sortBy;
  const isAllowed = (
    value: string,
  ): value is (typeof EMPLOYEE_SORT_FIELDS)[number] =>
    (EMPLOYEE_SORT_FIELDS as readonly string[]).includes(value);

  const primary: Prisma.EmployeeOrderByWithRelationInput | null =
    field && isAllowed(field) ? { [field]: direction } : null;

  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] = primary
    ? [primary]
    : [{ lastname: "asc" }, { firstname: "asc" }];

  // Stable tiebreaker so page N+1 never repeats or skips a row.
  if (!orderBy.some((o) => "id" in o)) orderBy.push({ id: "asc" });
  return orderBy;
}

/** Paginated, filtered, sorted employee list for the table. */
export async function listEmployees(params: {
  organizationId: string;
  query: EmployeeListQuery;
  canSeeSensitive: boolean;
}): Promise<ListEmployeesResult> {
  const { organizationId, query, canSeeSensitive } = params;
  const where = buildEmployeeWhere(query, organizationId);
  const orderBy = buildEmployeeOrderBy(query);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: employeeSelect,
      orderBy,
      skip,
      take: query.pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  const mcdaScores = await loadMcdaScores(organizationId, rows);

  return {
    data: rows.map((row, i) =>
      toDto(row, skip + i + 1, canSeeSensitive, mcdaScores.get(row.id)),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
    unmaskedNationalIds: canSeeSensitive,
  };
}

/** Single employee, org-scoped, National ID masked as appropriate. */
export async function getEmployee(params: {
  organizationId: string;
  id: string;
  canSeeSensitive: boolean;
  includeDeleted?: boolean;
}): Promise<EmployeeDto | null> {
  const {
    organizationId,
    id,
    canSeeSensitive,
    includeDeleted = false,
  } = params;

  const row = await prisma.employee.findFirst({
    where: {
      id,
      organizationId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    select: employeeSelect,
  });

  if (!row) return null;

  const mcdaScores = await loadMcdaScores(organizationId, [row]);
  return toDto(row, 0, canSeeSensitive, mcdaScores.get(row.id));
}

/** Unmasked employee record for internal server-side use only. */
export async function getEmployeeRaw(
  organizationId: string,
  id: string,
): Promise<EmployeeRow | null> {
  return prisma.employee.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: employeeSelect,
  });
}

/**
 * Every row matching the current filters, for export. Bounded so a runaway
 * export cannot exhaust memory; callers surface the truncation.
 */
export const EXPORT_MAX_ROWS = 10_000;

export async function getEmployeesForExport(params: {
  organizationId: string;
  query: EmployeeListQuery;
  canSeeSensitive: boolean;
  limit?: number;
}): Promise<{ rows: EmployeeDto[]; truncated: boolean }> {
  const {
    organizationId,
    query,
    canSeeSensitive,
    limit = EXPORT_MAX_ROWS,
  } = params;
  const where = buildEmployeeWhere(query, organizationId);

  const rows = await prisma.employee.findMany({
    where,
    select: employeeSelect,
    orderBy: buildEmployeeOrderBy(query),
    take: limit + 1,
  });

  const truncated = rows.length > limit;
  return {
    rows: rows
      .slice(0, limit)
      .map((row, i) => toDto(row, i + 1, canSeeSensitive)),
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Reference data for the form and filter controls
// ---------------------------------------------------------------------------

export interface EmployeeOptions {
  departments: { id: string; name: string; code: string | null }[];
  managers: { id: string; name: string; employeeNumber: string }[];
  users: { userid: string; name: string; email: string | null }[];
}

export async function getEmployeeOptions(
  organizationId: string,
): Promise<EmployeeOptions> {
  const [departments, managers, users] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        employeeNumber: true,
      },
      orderBy: [{ lastname: "asc" }, { firstname: "asc" }],
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { userid: true, firstname: true, lastname: true, email: true },
      orderBy: [{ lastname: "asc" }, { firstname: "asc" }],
    }),
  ]);

  return {
    departments,
    managers: managers.map((m) => ({
      id: m.id,
      name: `${m.firstname} ${m.lastname}`.trim(),
      employeeNumber: m.employeeNumber,
    })),
    users: users.map((u) => ({
      userid: u.userid,
      name: `${u.firstname} ${u.lastname ?? ""}`.trim(),
      email: u.email,
    })),
  };
}

/** Small dashboard tile counts for the employee page header. */
export async function getEmployeeCounts(organizationId: string): Promise<{
  total: number;
  active: number;
  onLeave: number;
  terminated: number;
  retired: number;
  disabled: number;
  unassigned: number;
  archived: number;
}> {
  const [total, archived, disabled, unassigned, byStatus] = await Promise.all([
    prisma.employee.count({ where: { organizationId, deletedAt: null } }),
    prisma.employee.count({
      where: { organizationId, deletedAt: { not: null } },
    }),
    prisma.employee.count({
      where: {
        organizationId,
        deletedAt: null,
        disabilityStatus: {
          not: null,
          notIn: [...DISABILITY_NEGATIVE_VALUES],
          mode: "insensitive",
        },
      },
    }),
    prisma.employee.count({
      where: { organizationId, deletedAt: null, departmentId: null },
    }),
    prisma.employeeProfile.groupBy({
      by: ["employmentStatus"],
      where: { organizationId, employee: { deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const statusCount = (value: string) =>
    byStatus.find((row) => row.employmentStatus === value)?._count._all ?? 0;

  return {
    total,
    active: statusCount("active"),
    onLeave: statusCount("on_leave"),
    terminated: statusCount("terminated"),
    retired: statusCount("retired"),
    disabled,
    unassigned,
    archived,
  };
}
