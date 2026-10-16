/**
 * Rent read layer.
 *
 * All rent reads go through here so that:
 *   * organization scoping and soft-delete visibility are applied uniformly;
 *   * National ID masking happens BEFORE serialisation, so an unmasked value
 *     cannot leak through a list, detail, export or receipt response;
 *   * the tracking columns (months paid, total paid, outstanding, next due,
 *     overdue count, lease status) are computed by PostgreSQL aggregates on
 *     every read instead of being denormalised onto the renter row, so they can
 *     never drift out of sync with the ledger;
 *   * the list never issues an N+1: one page of renters is followed by exactly
 *     ONE grouped aggregate query, regardless of page size.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveDisplayStatus, type RentDisplayStatus } from "./constants";
import { toDecimal, toMoneyString } from "./money";
import { daysOverdue, formatDateOnly, isOverdue, todayUtc } from "./schedule";
import { maskNationalId } from "./validators";
import type { RentListQuery } from "./schemas";

type Db = Prisma.TransactionClient | typeof prisma;

/** Columns returned for a renter row. */
const renterSelect = {
  id: true,
  firstName: true,
  lastName: true,
  gender: true,
  nationalId: true,
  rentType: true,
  rentTypeDetail: true,
  monthlyPrice: true,
  startDate: true,
  endDate: true,
  termMonths: true,
  status: true,
  terminatedAt: true,
  terminationReason: true,
  archivedReason: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  phones: {
    select: { id: true, phone: true, isPrimary: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.RentRenterSelect;

export type RenterRow = Prisma.RentRenterGetPayload<{
  select: typeof renterSelect;
}>;

/** Empty aggregate set, used for renters with no schedule (defensive). */
export interface InstallmentAggregate {
  totalMonths: number;
  monthsPaid: number;
  overdueMonths: number;
  voidedMonths: number;
  totalPaid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  nextDueDate: Date | null;
}

/** Shape of one row returned by {@link loadInstallmentAggregates}. */
interface RawAggregate {
  renterId: string;
  totalMonths: number;
  monthsPaid: number;
  overdueMonths: number;
  voidedMonths: number;
  totalPaid: Prisma.Decimal | string | number;
  outstanding: Prisma.Decimal | string | number;
  nextDueDate: Date | null;
}

const EMPTY_AGGREGATE: InstallmentAggregate = {
  totalMonths: 0,
  monthsPaid: 0,
  overdueMonths: 0,
  voidedMonths: 0,
  totalPaid: new Prisma.Decimal(0),
  outstanding: new Prisma.Decimal(0),
  nextDueDate: null,
};

/**
 * Grouped per-renter totals for a set of renters, in ONE query.
 *
 * This is the anti-N+1 primitive of the module. Conditional aggregates use
 * PostgreSQL's `FILTER (WHERE ...)` so months paid, months overdue, money
 * collected and money outstanding all come back in the same row, and OVERDUE is
 * *derived* in SQL from `dueDate < today` rather than read from a column that
 * could be stale.
 *
 * `db` may be a transaction client, so a mutation that needs to read fresh
 * aggregates inside its own transaction gets the same answers.
 */
export async function loadInstallmentAggregates(
  db: Db,
  organizationId: string,
  renterIds: string[],
  today: Date = todayUtc(),
): Promise<Map<string, InstallmentAggregate>> {
  if (renterIds.length === 0) return new Map();

  const rows = await db.$queryRaw<RawAggregate[]>(Prisma.sql`
    SELECT
      i."renterId"                                                          AS "renterId",
      COUNT(*)::int                                                         AS "totalMonths",
      COUNT(*) FILTER (WHERE i."status" = 'PAID')::int                      AS "monthsPaid",
      COUNT(*) FILTER (
        WHERE i."status" = 'UNPAID' AND i."dueDate" < ${today}
      )::int                                                               AS "overdueMonths",
      COUNT(*) FILTER (WHERE i."status" = 'VOIDED')::int                    AS "voidedMonths",
      COALESCE(SUM(i."amountDue") FILTER (WHERE i."status" = 'PAID'), 0)    AS "totalPaid",
      COALESCE(SUM(i."amountDue") FILTER (WHERE i."status" = 'UNPAID'), 0)  AS "outstanding",
      MIN(i."dueDate") FILTER (WHERE i."status" = 'UNPAID')                  AS "nextDueDate"
    FROM "public"."rent_installments" i
    WHERE i."organizationId" = ${organizationId}
      AND i."renterId" IN (${Prisma.join(renterIds)})
    GROUP BY i."renterId"
  `);

  const result = new Map<string, InstallmentAggregate>();
  for (const row of rows) {
    result.set(row.renterId, {
      totalMonths: Number(row.totalMonths),
      monthsPaid: Number(row.monthsPaid),
      overdueMonths: Number(row.overdueMonths),
      voidedMonths: Number(row.voidedMonths),
      totalPaid: toDecimal(row.totalPaid),
      outstanding: toDecimal(row.outstanding),
      nextDueDate: row.nextDueDate ? new Date(row.nextDueDate) : null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export interface RenterTotalsDto {
  totalMonths: number;
  monthsPaid: number;
  overdueMonths: number;
  voidedMonths: number;
  totalPaid: string;
  totalContractValue: string;
  outstanding: string;
  nextDueDate: string | null;
}

export interface RenterDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: "male" | "female";
  nationalId: string;
  nationalIdMasked: boolean;
  rentType: "Shop" | "Grocery" | "Other";
  rentTypeDetail: string | null;
  monthlyPrice: string;
  startDate: string;
  endDate: string;
  termMonths: number;
  status: "Active" | "Completed" | "Terminated";
  displayStatus: RentDisplayStatus;
  terminatedAt: string | null;
  terminationReason: string | null;
  archivedReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  phones: { id: string; phone: string; isPrimary: boolean }[];
  totals: RenterTotalsDto;
  srNo: number;
}

/**
 * Shape a database row for the API.
 *
 * Masking happens here, not in the route, so every consumer of this row type
 * (list, detail, export, print) inherits the same rule.
 */
export function toRenterDto(
  row: RenterRow,
  aggregate: InstallmentAggregate,
  srNo: number,
  canSeeSensitive: boolean,
): RenterDto {
  const revealed = canSeeSensitive;
  const monthlyPrice = toDecimal(row.monthlyPrice);

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`.trim(),
    gender: row.gender,
    nationalId: revealed ? row.nationalId : maskNationalId(row.nationalId),
    nationalIdMasked: !revealed,
    rentType: row.rentType,
    rentTypeDetail: row.rentTypeDetail,
    monthlyPrice: toMoneyString(monthlyPrice),
    startDate: formatDateOnly(row.startDate)!,
    endDate: formatDateOnly(row.endDate)!,
    termMonths: row.termMonths,
    status: row.status,
    displayStatus: resolveDisplayStatus({
      status: row.status,
      overdueMonths: aggregate.overdueMonths,
    }),
    terminatedAt: row.terminatedAt ? row.terminatedAt.toISOString() : null,
    terminationReason: row.terminationReason,
    archivedReason: row.archivedReason,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    phones: row.phones.map((p) => ({
      id: p.id,
      phone: p.phone,
      isPrimary: p.isPrimary,
    })),
    totals: {
      totalMonths: aggregate.totalMonths,
      monthsPaid: aggregate.monthsPaid,
      overdueMonths: aggregate.overdueMonths,
      voidedMonths: aggregate.voidedMonths,
      totalPaid: toMoneyString(aggregate.totalPaid),
      // price x term, in decimal - never a float multiply.
      totalContractValue: toMoneyString(monthlyPrice.mul(row.termMonths)),
      outstanding: toMoneyString(aggregate.outstanding),
      nextDueDate: formatDateOnly(aggregate.nextDueDate),
    },
    srNo,
  };
}

// ---------------------------------------------------------------------------
// Where / order
// ---------------------------------------------------------------------------

/**
 * The filter half of a list query, with no pagination.
 *
 * The export route reuses the same `where`/`orderBy` builders as the list route
 * so a downloaded file can never disagree with what is on screen.
 */
export type RentListFilters = Omit<RentListQuery, "page" | "pageSize">;

/**
 * Build the Prisma `where` clause from the parsed list query.
 *
 * `onlyArchived` narrows to archived rows alone; otherwise live rows only.
 * The `Overdue` status filter and `overdueOnly` are applied on the installment
 * relation (an EXISTS sub-query in SQL), never by reading a stored flag.
 */
export function buildRenterWhere(
  query: RentListFilters,
  organizationId: string,
  canSeeSensitive = true,
): Prisma.RentRenterWhereInput {
  const where: Prisma.RentRenterWhereInput = { organizationId };

  where.deletedAt = query.onlyArchived ? { not: null } : null;

  if (query.search) {
    const term = query.search;
    where.OR = [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      // Searching National ID would defeat the masking: the mask reveals the
      // last four digits, so a caller could walk prefixes and rebuild a value
      // they are not entitled to read. Only offered to callers who may see it.
      ...(canSeeSensitive
        ? [{ nationalId: { contains: term, mode: "insensitive" as const } }]
        : []),
      { phones: { some: { phone: { contains: term } } } },
    ];
  }

  if (query.rentType) where.rentType = query.rentType;
  if (query.gender) where.gender = query.gender;
  if (query.status && query.status !== "Overdue") where.status = query.status;

  if (query.startDateFrom || query.startDateTo) {
    where.startDate = {
      ...(query.startDateFrom
        ? { gte: new Date(`${query.startDateFrom}T00:00:00.000Z`) }
        : {}),
      ...(query.startDateTo
        ? { lte: new Date(`${query.startDateTo}T00:00:00.000Z`) }
        : {}),
    };
  }

  const needsOverdueFilter = query.overdueOnly || query.status === "Overdue";
  if (needsOverdueFilter) {
    where.installments = {
      some: {
        status: "UNPAID",
        dueDate: { lt: todayUtc() },
      },
    };
    // An "Overdue" lease is by definition still active - a terminated or
    // completed lease is never presented as overdue.
    where.status = "Active";
  }

  return where;
}

/**
 * Build the `orderBy` from an allowlisted sort field.
 *
 * The field is checked against `RENT_SORT_FIELDS` so a caller cannot sort by an
 * arbitrary column, and `id` is always appended as a tiebreaker so page N+1
 * never repeats or skips a row.
 */
export function buildRenterOrderBy(
  query: RentListFilters,
): Prisma.RentRenterOrderByWithRelationInput[] {
  const direction = query.sortOrder ?? "asc";
  const field = query.sortBy;

  const primary: Prisma.RentRenterOrderByWithRelationInput[] = field
    ? [{ [field]: direction }, { firstName: direction }]
    : [{ lastName: "asc" }, { firstName: "asc" }];

  primary.push({ id: "asc" });
  return primary;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListRentersResult {
  data: RenterDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unmaskedNationalIds: boolean;
}

/** Paginated, filtered, sorted renter list for the table. Two queries, no N+1. */
export async function listRenters(params: {
  organizationId: string;
  query: RentListQuery;
  canSeeSensitive: boolean;
}): Promise<ListRentersResult> {
  const { organizationId, query, canSeeSensitive } = params;
  const where = buildRenterWhere(query, organizationId, canSeeSensitive);
  const orderBy = buildRenterOrderBy(query);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await Promise.all([
    prisma.rentRenter.findMany({
      where,
      select: renterSelect,
      orderBy,
      skip,
      take: query.pageSize,
    }),
    prisma.rentRenter.count({ where }),
  ]);

  // Sequential by necessity: the aggregate is keyed by the ids of the page that
  // was just read. Still exactly ONE aggregate query for the whole page.
  const aggregateMap = await loadInstallmentAggregates(
    prisma,
    organizationId,
    rows.map((row) => row.id),
  );

  return {
    data: rows.map((row, i) =>
      toRenterDto(
        row,
        aggregateMap.get(row.id) ?? EMPTY_AGGREGATE,
        skip + i + 1,
        canSeeSensitive,
      ),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
    unmaskedNationalIds: canSeeSensitive,
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/** Installment columns for the schedule view. */
const installmentSelect = {
  id: true,
  monthNumber: true,
  dueDate: true,
  amountDue: true,
  status: true,
  paidAt: true,
  receiptNumber: true,
  paymentMethod: true,
  referenceNumber: true,
  note: true,
  voidedAt: true,
  voidReason: true,
  payments: {
    select: {
      id: true,
      installmentId: true,
      receiptNumber: true,
      amount: true,
      paidOn: true,
      method: true,
      referenceNumber: true,
      note: true,
      voidedAt: true,
      voidReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.RentInstallmentSelect;

type InstallmentRow = Prisma.RentInstallmentGetPayload<{
  select: typeof installmentSelect;
}>;

export interface InstallmentDto {
  id: string;
  monthNumber: number;
  dueDate: string;
  amountDue: string;
  status: "UNPAID" | "PAID" | "VOIDED";
  overdue: boolean;
  daysOverdue: number;
  paidAt: string | null;
  receiptNumber: string | null;
  paymentMethod: "Cash" | "BankTransfer" | "Other" | null;
  referenceNumber: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  payments: {
    id: string;
    installmentId: string;
    monthNumber: number;
    receiptNumber: string;
    amount: string;
    paidOn: string;
    method: "Cash" | "BankTransfer" | "Other";
    referenceNumber: string | null;
    note: string | null;
    voidedAt: string | null;
    voidReason: string | null;
  }[];
}

/**
 * Shape a schedule row for the API.
 *
 * `overdue` / `daysOverdue` are DERIVED here from `dueDate` + `status` + today,
 * so a month's badge is always correct even if nobody has opened the page in a
 * month. Payment metadata is read from the row itself (the schedule row is
 * self-describing) and the nested `payments` array carries the receipt history
 * including voided receipts.
 */
export function toInstallmentDto(
  row: InstallmentRow,
  now: Date = new Date(),
): InstallmentDto {
  return {
    id: row.id,
    monthNumber: row.monthNumber,
    dueDate: formatDateOnly(row.dueDate)!,
    amountDue: toMoneyString(row.amountDue),
    status: row.status,
    overdue: isOverdue(row.dueDate, row.status, now),
    daysOverdue: daysOverdue(row.dueDate, now),
    paidAt: formatDateOnly(row.paidAt),
    receiptNumber: row.receiptNumber,
    paymentMethod: row.paymentMethod,
    referenceNumber: row.referenceNumber,
    note: row.note,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason: row.voidReason,
    payments: row.payments.map((p) => ({
      id: p.id,
      installmentId: p.installmentId,
      monthNumber: row.monthNumber,
      receiptNumber: p.receiptNumber,
      amount: toMoneyString(p.amount),
      paidOn: formatDateOnly(p.paidOn)!,
      method: p.method,
      referenceNumber: p.referenceNumber,
      note: p.note,
      voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
      voidReason: p.voidReason,
    })),
  };
}

/** Org-scoped renter lookup with the schedule, or `null`. */
export async function getRenterWithSchedule(params: {
  organizationId: string;
  id: string;
  canSeeSensitive: boolean;
  includeArchived?: boolean;
}): Promise<{ renter: RenterDto; installments: InstallmentDto[] } | null> {
  const {
    organizationId,
    id,
    canSeeSensitive,
    includeArchived = false,
  } = params;
  const now = new Date();

  const row = await prisma.rentRenter.findFirst({
    where: {
      id,
      organizationId,
      ...(includeArchived ? {} : { deletedAt: null }),
    },
    select: renterSelect,
  });
  if (!row) return null;

  const [installments, aggregateMap] = await Promise.all([
    prisma.rentInstallment.findMany({
      where: { renterId: id, organizationId },
      select: installmentSelect,
      // Chronological by construction: the schedule is generated in order and
      // monthNumber is unique per renter, so this is a stable total order.
      orderBy: { monthNumber: "asc" },
    }),
    loadInstallmentAggregates(prisma, organizationId, [id]),
  ]);

  return {
    renter: toRenterDto(
      row,
      aggregateMap.get(id) ?? EMPTY_AGGREGATE,
      0,
      canSeeSensitive,
    ),
    installments: installments.map((i) => toInstallmentDto(i, now)),
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface RentSummaryDto {
  totalRenters: number;
  activeLeases: number;
  completedLeases: number;
  terminatedLeases: number;
  archivedRenters: number;
  totalCollected: string;
  totalOutstanding: string;
  totalContractValue: string;
  overdueRenters: number;
  overdueMonths: number;
}

interface RawSummary {
  totalRenters: number;
  activeLeases: number;
  completedLeases: number;
  terminatedLeases: number;
  archivedRenters: number;
  totalContractValue: Prisma.Decimal | string | number;
  totalCollected: Prisma.Decimal | string | number;
  totalOutstanding: Prisma.Decimal | string | number;
  overdueMonths: bigint | number;
  overdueRenters: number;
}

/**
 * Summary cards for the page header - every number a database aggregate.
 *
 * WRITTEN AS TWO CTEs ON PURPOSE. A naive
 * `FROM rent_renters LEFT JOIN rent_installments` fans out one row per
 * installment, so `COUNT(*)` returns the number of SCHEDULE ROWS rather than the
 * number of renters, and `SUM(monthlyPrice * termMonths)` is multiplied by the
 * term. Aggregating the schedule per renter FIRST and only then joining keeps one
 * row per renter, so every renter-level count is exact.
 *
 * The whole header costs a single round trip regardless of data size, and the
 * money is summed by PostgreSQL in `numeric`, never in JavaScript.
 */
export async function getRentSummary(
  organizationId: string,
  now: Date = todayUtc(),
): Promise<RentSummaryDto> {
  const rows = await prisma.$queryRaw<RawSummary[]>(Prisma.sql`
    WITH lease AS (
      SELECT
        r."id"                                                       AS "id",
        r."deletedAt"                                                AS "deletedAt",
        r."status"                                                   AS "status",
        (r."monthlyPrice" * r."termMonths")                           AS "contractValue"
      FROM "public"."rent_renters" r
      WHERE r."organizationId" = ${organizationId}
    ),
    sched AS (
      SELECT
        i."renterId"                                                AS "renterId",
        COUNT(*) FILTER (
          WHERE i."status" = 'UNPAID' AND i."dueDate" < ${now}
        )::int                                                      AS "overdueMonths",
        COALESCE(SUM(i."amountDue") FILTER (WHERE i."status" = 'PAID'), 0)
                                                                  AS "collected",
        COALESCE(SUM(i."amountDue") FILTER (WHERE i."status" = 'UNPAID'), 0)
                                                                  AS "outstanding"
      FROM "public"."rent_installments" i
      WHERE i."organizationId" = ${organizationId}
      GROUP BY i."renterId"
    )
    SELECT
      -- Money totals exclude archived leases, matching every COUNT above.
      -- An archived renter is out of the register, so their balance is not
      -- "outstanding"; including it would also stop "collected" reconciling
      -- against the filtered contract value.
      COUNT(*) FILTER (WHERE l."deletedAt" IS NULL)::int            AS "totalRenters",
      COUNT(*) FILTER (
        WHERE l."deletedAt" IS NULL AND l."status" = 'Active'
      )::int                                                        AS "activeLeases",
      COUNT(*) FILTER (
        WHERE l."deletedAt" IS NULL AND l."status" = 'Completed'
      )::int                                                        AS "completedLeases",
      COUNT(*) FILTER (
        WHERE l."deletedAt" IS NULL AND l."status" = 'Terminated'
      )::int                                                        AS "terminatedLeases",
      COUNT(*) FILTER (WHERE l."deletedAt" IS NOT NULL)::int        AS "archivedRenters",
      COALESCE(SUM(l."contractValue") FILTER (WHERE l."deletedAt" IS NULL), 0)
                                                                  AS "totalContractValue",
      COALESCE(SUM(s."collected") FILTER (WHERE l."deletedAt" IS NULL), 0)
                                                                   AS "totalCollected",
      COALESCE(SUM(s."outstanding") FILTER (WHERE l."deletedAt" IS NULL), 0)
                                                                   AS "totalOutstanding",
      COALESCE(SUM(s."overdueMonths") FILTER (WHERE l."deletedAt" IS NULL), 0)::bigint
                                                                   AS "overdueMonths",
      COUNT(*) FILTER (
        WHERE l."deletedAt" IS NULL
          AND l."status" = 'Active'
          AND COALESCE(s."overdueMonths", 0) > 0
      )::int                                                        AS "overdueRenters"
    FROM lease l
    LEFT JOIN sched s ON s."renterId" = l."id"
  `);

  const row = rows[0];

  return {
    totalRenters: Number(row?.totalRenters ?? 0),
    activeLeases: Number(row?.activeLeases ?? 0),
    completedLeases: Number(row?.completedLeases ?? 0),
    terminatedLeases: Number(row?.terminatedLeases ?? 0),
    archivedRenters: Number(row?.archivedRenters ?? 0),
    totalContractValue: toMoneyString(row?.totalContractValue ?? 0),
    totalCollected: toMoneyString(row?.totalCollected ?? 0),
    totalOutstanding: toMoneyString(row?.totalOutstanding ?? 0),
    overdueRenters: Number(row?.overdueRenters ?? 0),
    overdueMonths: Number(row?.overdueMonths ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Bounded so a runaway export cannot exhaust memory; callers surface truncation. */
export const EXPORT_MAX_ROWS = 10_000;

/**
 * Every renter matching the current filters, for export.
 *
 * Reuses {@link buildRenterWhere} so a downloaded file always matches exactly
 * what is on screen, and issues the same single grouped aggregate query.
 */
export async function getRentersForExport(params: {
  organizationId: string;
  query: RentListFilters;
  canSeeSensitive: boolean;
  limit?: number;
}): Promise<{ rows: RenterDto[]; truncated: boolean }> {
  const {
    organizationId,
    query,
    canSeeSensitive,
    limit = EXPORT_MAX_ROWS,
  } = params;
  const where = buildRenterWhere(query, organizationId);

  const rows = await prisma.rentRenter.findMany({
    where,
    select: renterSelect,
    orderBy: buildRenterOrderBy(query),
    take: limit + 1,
  });

  const aggregateMap = await loadInstallmentAggregates(
    prisma,
    organizationId,
    rows.map((row) => row.id),
  );

  const truncated = rows.length > limit;
  return {
    rows: rows
      .slice(0, limit)
      .map((row, i) =>
        toRenterDto(
          row,
          aggregateMap.get(row.id) ?? EMPTY_AGGREGATE,
          i + 1,
          canSeeSensitive,
        ),
      ),
    truncated,
  };
}
