import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { computeHouseQueueWithActiveConfig } from "@/lib/house-queue/engine";
import { LIVE_ALLOCATION_STATUSES } from "@/lib/house-queue/state";
import { HOUSE_TYPES } from "@/lib/household-constants";
import {
  addUtcMonths,
  buildMonthlySeries,
  clampPercent,
  monthKey,
  percentChange,
  previousMonthKeys,
  resolveRange,
  sparkFor,
  sumMonth,
  trailingMonths,
  type HouseStatusBucket,
  type MonthlyCountRow,
  type MonthlyFlow,
  type MonthlyPoint,
} from "./aggregate";
import {
  houseAnalyticsResponseSchema,
  type HouseAnalyticsKpi,
  type HouseAnalyticsQuery,
  type HouseAnalyticsResponse,
} from "./contract";

interface HouseBucketRow {
  houseType: string;
  bucket: HouseStatusBucket;
  count: number;
}

interface FlowRow {
  month: string;
  kind: MonthlyFlow;
  count: number;
}

interface InspectionStatsRow {
  pending: number;
  scheduled: number;
  completed: number;
}

interface AverageWaitRow {
  average: number;
}

function href(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  const value = query.toString();
  return value ? `${path}?${value}` : path;
}

function releaseReasonLabel(reason: string): string {
  switch (reason) {
    case "TRANSFER":
      return "Transfer";
    case "EMPLOYEE_LEAVE":
      return "Employee leave";
    case "RETIREMENT":
      return "Retirement";
    default:
      return reason;
  }
}

function buildKpi(input: {
  id: string;
  label: string;
  value: number;
  variant: HouseAnalyticsKpi["variant"];
  flow: MonthlyFlow;
  sparkFlow: MonthlyFlow;
  positiveIsGood: boolean;
  hint: string;
  href: string;
  series: readonly MonthlyPoint[];
  months: readonly string[];
  unit?: HouseAnalyticsKpi["unit"];
}): HouseAnalyticsKpi {
  const current = sumMonth(input.series, input.months, input.flow);
  const previous = sumMonth(
    input.series,
    previousMonthKeys(input.months),
    input.flow,
  );

  return {
    id: input.id,
    label: input.label,
    value: input.value,
    unit: input.unit ?? "count",
    trend: percentChange(current, previous),
    sparkline: sparkFor(input.series, input.sparkFlow),
    href: input.href,
    variant: input.variant,
    positiveIsGood: input.positiveIsGood,
    hint: input.hint,
  };
}

async function loadUncached(
  organizationId: string,
  query: HouseAnalyticsQuery,
): Promise<HouseAnalyticsResponse> {
  const now = new Date();
  const range = resolveRange(query.range, now, {
    from: query.from,
    to: query.to,
  });
  const sparkEnd = new Date(`${range.toKey}-01T00:00:00.000Z`);
  const seriesMonths = trailingMonths(sparkEnd, 12);
  const flowStart = new Date(`${seriesMonths[0]}-01T00:00:00.000Z`);
  const flowEnd = addUtcMonths(sparkEnd, 1);
  const typeFilter =
    query.houseType === "all"
      ? Prisma.empty
      : Prisma.sql`AND h."houseType" = ${query.houseType}`;

  const [
    houseRows,
    flowRows,
    inspectionStats,
    averageWait,
    releaseGroups,
    queue,
  ] = await Promise.all([
    prisma.$queryRaw<HouseBucketRow[]>(Prisma.sql`
        SELECT "houseType", "bucket", COUNT(*)::int AS "count"
        FROM (
          SELECT h."houseType" AS "houseType",
            CASE
              WHEN h."occupancyStatus" = 'Occupied' THEN 'occupied'
              WHEN h."status" IN ('PendingInspection', 'UnderMaintenance')
                OR EXISTS (
                  SELECT 1 FROM "house_inspections" i
                  WHERE i."organizationId" = ${organizationId}
                    AND i."householdId" = h."id"
                    AND i."resolvedTo" IS NULL
                ) THEN 'awaitingInspection'
              WHEN h."status" IN ('Inactive', 'UnderMaintenance')
                OR COALESCE(h."damageWindow", false)
                OR COALESCE(h."damageDoor", false)
                OR COALESCE(h."damageWaterPanel", false)
                OR COALESCE(h."damageRoof", false)
                OR COALESCE(h."damageWall", false)
                OR COALESCE(h."damageElectricity", false) THEN 'inactive'
              WHEN h."status" = 'Active'
                AND h."occupancyStatus" = 'Vacant'
                AND NOT EXISTS (
                  SELECT 1 FROM "house_allocations" a
                  WHERE a."organizationId" = ${organizationId}
                    AND a."householdId" = h."id"
                    AND a."status" IN (${Prisma.join(LIVE_ALLOCATION_STATUSES)})
                ) THEN 'free'
              ELSE 'inactive'
            END AS "bucket"
          FROM "households" h
          WHERE h."organizationId" = ${organizationId} ${typeFilter}
        ) classified
        GROUP BY "houseType", "bucket"
      `),
    prisma.$queryRaw<FlowRow[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', COALESCE(a."effectiveDate", a."createdAt")), 'YYYY-MM') AS "month",
          'allocations'::text AS "kind", COUNT(*)::int AS "count"
        FROM "house_allocations" a
        WHERE a."organizationId" = ${organizationId}
          AND COALESCE(a."effectiveDate", a."createdAt") >= ${flowStart}
          AND COALESCE(a."effectiveDate", a."createdAt") < ${flowEnd}
        GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('month', a."terminatedAt"), 'YYYY-MM') AS "month",
          'releases'::text AS "kind", COUNT(*)::int AS "count"
        FROM "house_allocations" a
        WHERE a."organizationId" = ${organizationId}
          AND a."terminatedAt" >= ${flowStart}
          AND a."terminatedAt" < ${flowEnd}
        GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('month', r."createdAt"), 'YYYY-MM') AS "month",
          'requests'::text AS "kind", COUNT(*)::int AS "count"
        FROM "house_requests" r
        WHERE r."organizationId" = ${organizationId}
          AND r."status" = 'submitted'
          AND r."createdAt" >= ${flowStart}
          AND r."createdAt" < ${flowEnd}
        GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('month', h."createdAt"), 'YYYY-MM') AS "month",
          'housesAdded'::text AS "kind", COUNT(*)::int AS "count"
        FROM "households" h
        WHERE h."organizationId" = ${organizationId}
          AND h."createdAt" >= ${flowStart}
          AND h."createdAt" < ${flowEnd}
        GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('month', i."completedAt"), 'YYYY-MM') AS "month",
          'inspectionsCompleted'::text AS "kind", COUNT(*)::int AS "count"
        FROM "house_inspections" i
        WHERE i."organizationId" = ${organizationId}
          AND i."completedAt" >= ${flowStart}
          AND i."completedAt" < ${flowEnd}
        GROUP BY 1
      `),
    prisma.$queryRaw<InspectionStatsRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE i."resolvedTo" IS NULL AND i."status" <> 'COMPLETED')::int AS "pending",
          COUNT(*) FILTER (WHERE i."resolvedTo" IS NULL AND i."status" = 'SCHEDULED')::int AS "scheduled",
          COUNT(*) FILTER (WHERE i."resolvedTo" IS NOT NULL)::int AS "completed"
        FROM "house_inspections" i
        WHERE i."organizationId" = ${organizationId}
          AND i."createdAt" >= ${range.from}
          AND i."createdAt" < ${range.to}
      `),
    prisma.$queryRaw<AverageWaitRow[]>(Prisma.sql`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (
          COALESCE(i."completedAt", NOW()) - i."createdAt"
        )) / 86400), 0)::float8 AS "average"
        FROM "house_inspections" i
        WHERE i."organizationId" = ${organizationId}
          AND i."createdAt" >= ${range.from}
          AND i."createdAt" < ${range.to}
      `),
    prisma.houseAllocation.groupBy({
      by: ["terminationReason"],
      where: {
        organizationId,
        terminationReason: { not: null },
        terminatedAt: { gte: range.from, lt: range.to },
      },
      _count: { id: true },
    }),
    computeHouseQueueWithActiveConfig(organizationId),
  ]);

  const series = buildMonthlySeries(
    flowRows.map((row) => ({
      month: row.month,
      kind: row.kind,
      count: row.count,
    })) satisfies MonthlyCountRow[],
    seriesMonths,
  );

  const buckets: Record<HouseStatusBucket, number> = {
    free: 0,
    occupied: 0,
    awaitingInspection: 0,
    inactive: 0,
  };
  const byType = new Map<
    string,
    {
      free: number;
      occupied: number;
      awaitingInspection: number;
      inactive: number;
    }
  >();
  for (const category of HOUSE_TYPES) {
    byType.set(category, {
      free: 0,
      occupied: 0,
      awaitingInspection: 0,
      inactive: 0,
    });
  }
  for (const row of houseRows) {
    buckets[row.bucket] += row.count;
    const entry = byType.get(row.houseType) ?? {
      free: 0,
      occupied: 0,
      awaitingInspection: 0,
      inactive: 0,
    };
    entry[row.bucket] += row.count;
    byType.set(row.houseType, entry);
  }

  const totalHouses = Object.values(buckets).reduce(
    (sum, value) => sum + value,
    0,
  );
  const occupancyValue = clampPercent(
    totalHouses === 0 ? 0 : (buckets.occupied / totalHouses) * 100,
  );
  const rangeParams = {
    range: query.range,
    from: query.from ?? range.fromKey,
    to: query.to ?? range.toKey,
    type: query.houseType,
  };

  const queueHref = (status?: string) =>
    href("/house-queue", {
      ...(status ? { status } : {}),
      range: rangeParams.range,
    });
  const registerHref = (type?: string) =>
    href("/household/register", {
      ...(type ? { type } : {}),
      range: rangeParams.range,
    });

  const kpis: HouseAnalyticsKpi[] = [
    buildKpi({
      id: "total-houses",
      label: "Total houses",
      value: totalHouses,
      variant: "brass",
      flow: "housesAdded",
      sparkFlow: "housesAdded",
      positiveIsGood: true,
      hint: "Registry count by house type; trend from houses added to the register.",
      href: registerHref(),
      series,
      months: range.months,
    }),
    buildKpi({
      id: "free-houses",
      label: "Free / available",
      value: buckets.free,
      variant: "success",
      flow: "releases",
      sparkFlow: "releases",
      positiveIsGood: true,
      hint: "Active, vacant, no live allocation and not awaiting inspection.",
      href: registerHref("all"),
      series,
      months: range.months,
    }),
    buildKpi({
      id: "occupied-houses",
      label: "Occupied",
      value: buckets.occupied,
      variant: "navy",
      flow: "allocations",
      sparkFlow: "allocations",
      positiveIsGood: true,
      hint: "Households physically marked Occupied; trend from live allocation dates.",
      href: "/houses/allocated",
      series,
      months: range.months,
    }),
    buildKpi({
      id: "awaiting-inspection",
      label: "Awaiting inspection",
      value: buckets.awaitingInspection,
      variant: "warning",
      flow: "releases",
      sparkFlow: "releases",
      positiveIsGood: false,
      hint: "PendingInspection / UnderMaintenance or an unresolved handback inspection.",
      href: "/houses/inspections?status=pending",
      series,
      months: range.months,
    }),
    buildKpi({
      id: "inactive-houses",
      label: "Inactive / damaged",
      value: buckets.inactive,
      variant: "destructive",
      flow: "inspectionsCompleted",
      sparkFlow: "inspectionsCompleted",
      positiveIsGood: false,
      hint: "Inactive, under maintenance or with a recorded damage flag.",
      href: registerHref(),
      series,
      months: range.months,
    }),
    buildKpi({
      id: "requests",
      label: "House requests",
      value: sumMonth(series, range.months, "requests"),
      variant: "brass",
      flow: "requests",
      sparkFlow: "requests",
      positiveIsGood: false,
      hint: "Submitted HouseRequest records created in the selected period.",
      href: "/house-request",
      series,
      months: range.months,
    }),
    buildKpi({
      id: "queue-ready",
      label: "Employees in queue",
      value: queue.summary.readyCount,
      variant: "navy",
      flow: "requests",
      sparkFlow: "requests",
      positiveIsGood: false,
      hint: "Ready-for-allocation rows from the live queue engine.",
      href: queueHref("ready_for_allocation"),
      series,
      months: range.months,
    }),
    buildKpi({
      id: "not-eligible",
      label: "Not eligible",
      value: queue.summary.notEligibleCount,
      variant: "destructive",
      flow: "requests",
      sparkFlow: "requests",
      positiveIsGood: false,
      hint: "Requesters with no eligible job-grade band in the active config.",
      href: queueHref("not_eligible"),
      series,
      months: range.months,
    }),
    buildKpi({
      id: "no-house-available",
      label: "No house available",
      value: queue.summary.noHouseCount,
      variant: "warning",
      flow: "requests",
      sparkFlow: "requests",
      positiveIsGood: false,
      hint: "Eligible requesters with no recommended house in their band.",
      href: queueHref("no_house_available"),
      series,
      months: range.months,
    }),
    buildKpi({
      id: "allocated-month",
      label: "Allocated this period",
      value: sumMonth(series, range.months, "allocations"),
      variant: "success",
      flow: "allocations",
      sparkFlow: "allocations",
      positiveIsGood: true,
      hint: "Ledger allocations using effectiveDate, falling back to createdAt.",
      href: "/houses/allocated",
      series,
      months: range.months,
    }),
    buildKpi({
      id: "released-month",
      label: "Terminated / released",
      value: sumMonth(series, range.months, "releases"),
      variant: "warning",
      flow: "releases",
      sparkFlow: "releases",
      positiveIsGood: false,
      hint: "Ledger rows with a termination timestamp in the selected period.",
      href: "/houses/terminated",
      series,
      months: range.months,
    }),
  ];

  const auditRows = await prisma.audit_logs.findMany({
    where: {
      entity: "house_queue",
      createdAt: { gte: range.from, lt: range.to },
      user: { organizationId },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      action: true,
      entity: true,
      details: true,
      createdAt: true,
      entityId: true,
    },
  });

  const activity = auditRows.map((row) => {
    let detail = "";
    if (row.details) {
      try {
        const parsed: unknown = JSON.parse(row.details);
        if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          detail =
            typeof record.reason === "string"
              ? record.reason
              : typeof record.note === "string"
                ? record.note
                : typeof record.houseNumber === "string"
                  ? record.houseNumber
                  : "";
        }
      } catch {
        detail = "";
      }
    }
    const action = row.action.replace(/_/g, " ").toLowerCase();
    return {
      id: row.id,
      action: row.action,
      entity: row.entity,
      description: `${action.charAt(0).toUpperCase()}${action.slice(1)}${
        detail ? ` · ${detail}` : ""
      }`,
      at: row.createdAt.toISOString(),
      href: row.entityId
        ? `/house-queue?employee=${row.entityId}`
        : "/house-queue",
    };
  });

  const rankedRows = queue.rows
    .filter((row) => !row.isAllocated && row.priorityRank !== null)
    .sort((a, b) => {
      const left = a.priorityRank ?? Number.MAX_SAFE_INTEGER;
      const right = b.priorityRank ?? Number.MAX_SAFE_INTEGER;
      return left - right || (b.mcdScore ?? 0) - (a.mcdScore ?? 0);
    })
    .slice(0, 10);
  const topQueue = rankedRows.map((row) => ({
    rank: row.priorityRank,
    name: `${row.firstname}${row.lastname ? ` ${row.lastname}` : ""}`,
    employeeNumber: row.employeeNumber,
    grade: row.houseCategory ?? "Ungraded",
    score:
      row.mcdScore !== null && row.cohortSize > 1
        ? Math.round(row.mcdScore * 1000) / 10
        : null,
    status: row.queueStatus,
    href: `/house-queue?employee=${row.employeeId}`,
  }));

  const supplyDemand = HOUSE_TYPES.map((category) => {
    const demand = queue.gradeGroups
      .filter((group) => group.category === category)
      .reduce((total, group) => total + group.total, 0);
    const supply =
      queue.availability.find((item) => item.category === category)
        ?.available ?? 0;
    return {
      band: category,
      demand,
      supply,
      shortage: Math.max(0, demand - supply),
      href: registerHref(category),
    };
  });

  const releaseReasons = releaseGroups
    .map((group) => ({
      name: group.terminationReason
        ? releaseReasonLabel(group.terminationReason)
        : "Other",
      value: group._count.id,
      href: href("/houses/terminated", {
        reason: group.terminationReason ?? "ALL",
        range: query.range,
      }),
    }))
    .sort((a, b) => b.value - a.value);

  const inspection = inspectionStats[0] ?? {
    pending: 0,
    scheduled: 0,
    completed: 0,
  };

  return houseAnalyticsResponseSchema.parse({
    meta: {
      generatedAt: now.toISOString(),
      range: query.range,
      from: query.from ?? range.fromKey,
      to: query.to ?? range.toKey,
      houseType: query.houseType,
    },
    kpis,
    occupancy: {
      value: occupancyValue,
      occupied: buckets.occupied,
      total: totalHouses,
    },
    monthly: series,
    statusDistribution: [
      {
        name: "Free",
        value: buckets.free,
        href: registerHref(),
      },
      {
        name: "Occupied",
        value: buckets.occupied,
        href: "/houses/allocated",
      },
      {
        name: "Awaiting inspection",
        value: buckets.awaitingInspection,
        href: "/houses/inspections?status=pending",
      },
      {
        name: "Inactive / damaged",
        value: buckets.inactive,
        href: registerHref(),
      },
    ],
    housesByType: HOUSE_TYPES.map((category) => ({
      type: category,
      ...(byType.get(category) ?? {
        free: 0,
        occupied: 0,
        awaitingInspection: 0,
        inactive: 0,
      }),
    })),
    supplyDemand,
    funnel: {
      eligible: queue.summary.eligibleCount,
      ready: queue.summary.readyCount,
      allocated: queue.summary.allocatedCount,
      skipped: queue.rows.filter((row) => row.queueStatus === "skipped").length,
      deferred: queue.rows.filter((row) => row.queueStatus === "deferred")
        .length,
      noHouse: queue.summary.noHouseCount,
      notEligible: queue.summary.notEligibleCount,
    },
    releaseReasons,
    topQueue,
    activity,
    inspections: {
      pending: inspection.pending,
      scheduled: inspection.scheduled,
      completed: inspection.completed,
      avgDaysWaiting: Math.round((averageWait[0]?.average ?? 0) * 10) / 10,
    },
  });
}

export function loadHouseAnalytics(
  organizationId: string,
  query: HouseAnalyticsQuery,
): Promise<HouseAnalyticsResponse> {
  const key = `house-analytics:${organizationId}:${query.range}:${
    query.from ?? ""
  }:${query.to ?? ""}:${query.houseType}:${monthKey(new Date())}`;
  return cached(key, () => loadUncached(organizationId, query), 60_000);
}
