/**
 * Fast-lane resolvers.
 *
 * Each resolver answers one intent with prepared Prisma aggregates and returns a
 * `FastCard` the client renders directly. No LLM is involved, so the cost of a
 * question like "how many active houses exist" is one indexed `count` plus
 * process-cache lookup — single-digit milliseconds instead of several seconds.
 *
 * Critically, these resolvers deliberately do NOT call the House Queue decision
 * engine unless the question is actually about the queue. The old path answered
 * every housing question through `getHamsKpis`, which recomputed the full MCDA
 * ranking over every active employee as a side effect of a simple count.
 */

import prisma from "@/lib/prisma";
import {
  CACHE_DOMAIN,
  CACHE_TTL,
  cacheKey,
  cached,
  peekCache,
} from "./cache";
import type { CardStat, CardTable, FastCard, FastCardResult } from "./card";
import { ASSISTANT_BRAND, QUICK_ACTIONS } from "./brand";
import { routeIntent, type RoutedIntent } from "./intent";
import { computeHouseQueueWithActiveConfig } from "@/lib/house-queue/engine";

// ---------------------------------------------------------------------------
// Shared aggregates
// ---------------------------------------------------------------------------

export interface HousingOverview {
  total: number;
  active: number;
  inactive: number;
  vacant: number;
  occupied: number;
  maintenance: number;
  byType: { type: string; total: number; active: number }[];
  activeByType: { type: string; occupied: number; vacant: number; maintenance: number; total: number }[];
  occupancyRate: number;
  vacantRate: number;
}

async function loadHousingOverview(organizationId: string): Promise<HousingOverview> {
  // Two group-bys in parallel: register status/occupancy counters, and the
  // per-house-type matrix. Both hit the (organizationId) index.
  const [statusRows, typeRows] = await Promise.all([
    prisma.$queryRaw<
      {
        total: number;
        active: number;
        inactive: number;
        vacant: number;
        occupied: number;
        maintenance: number;
      }[]
    >`
      SELECT
        COUNT(*)::int                                            AS total,
        COUNT(*) FILTER (WHERE status = 'Active')::int           AS active,
        COUNT(*) FILTER (WHERE status = 'Inactive')::int         AS inactive,
        COUNT(*) FILTER (WHERE "occupancyStatus" = 'Vacant')::int      AS vacant,
        COUNT(*) FILTER (WHERE "occupancyStatus" = 'Occupied')::int    AS occupied,
        COUNT(*) FILTER (WHERE "occupancyStatus" = 'Maintenance')::int AS maintenance
      FROM household
      WHERE "organizationId" = ${organizationId}::uuid
    `,
    prisma.household.groupBy({
      by: ["houseType", "occupancyStatus"],
      where: { organizationId },
      _count: { id: true },
    }),
  ]);

  const base = statusRows[0] ?? {
    total: 0,
    active: 0,
    inactive: 0,
    vacant: 0,
    occupied: 0,
    maintenance: 0,
  };

  const matrix = new Map<string, { occupied: number; vacant: number; maintenance: number }>();
  for (const row of typeRows) {
    const bucket = matrix.get(row.houseType) ?? { occupied: 0, vacant: 0, maintenance: 0 };
    if (row.occupancyStatus === "Occupied") bucket.occupied += row._count.id;
    else if (row.occupancyStatus === "Maintenance") bucket.maintenance += row._count.id;
    else bucket.vacant += row._count.id;
    matrix.set(row.houseType, bucket);
  }

  const byType = [...matrix.entries()].map(([type, counts]) => ({
    type,
    occupied: counts.occupied,
    vacant: counts.vacant,
    maintenance: counts.maintenance,
    total: counts.occupied + counts.vacant + counts.maintenance,
  }));
  byType.sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));

  return {
    ...base,
    byType,
    activeByType: byType,
    occupancyRate: base.total > 0 ? Math.round((base.occupied / base.total) * 100) : 0,
    vacantRate: base.total > 0 ? Math.round((base.vacant / base.total) * 100) : 0,
  };
}

const HOUSING_OVERVIEW_KEY = (organizationId: string) =>
  cacheKey(organizationId, CACHE_DOMAIN.housing, "overview");

function getHousingOverview(organizationId: string): Promise<HousingOverview> {
  return cached(HOUSING_OVERVIEW_KEY(organizationId), CACHE_TTL.aggregates, () =>
    loadHousingOverview(organizationId),
  );
}

export function isHousingOverviewCached(organizationId: string): boolean {
  return peekCache(HOUSING_OVERVIEW_KEY(organizationId)) !== undefined;
}

async function loadAssetOverview(organizationId: string) {
  const [total, byCategory, value, warrantySoon] = await Promise.all([
    prisma.asset.count({ where: { organizationId } }),
    prisma.asset.groupBy({
      by: ["assetcategorytypeid"],
      where: { organizationId },
      _count: { assetid: true },
      _sum: { purchaseprice: true },
    }),
    prisma.asset.aggregate({
      where: { organizationId },
      _sum: { purchaseprice: true },
    }),
    prisma.asset.count({
      where: {
        organizationId,
        warrantyExpires: {
          gte: new Date(),
          lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const categories = await prisma.assetCategoryType.findMany({
    where: { id: { in: byCategory.map((r) => r.assetcategorytypeid).filter(Boolean) as string[] } },
    select: { id: true, assetcategorytypename: true },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.assetcategorytypename]));

  return {
    total,
    totalValue: Number(value._sum.purchaseprice ?? 0),
    warrantySoon,
    byCategory: byCategory
      .map((r) => ({
        category: (r.assetcategorytypeid && nameById.get(r.assetcategorytypeid)) || "Uncategorised",
        count: r._count.assetid,
        value: Number(r._sum.purchaseprice ?? 0),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

function getAssetOverview(organizationId: string) {
  return cached(
    cacheKey(organizationId, CACHE_DOMAIN.assets, "overview"),
    CACHE_TTL.aggregates,
    () => loadAssetOverview(organizationId),
  );
}

async function loadEmployeeCounts(organizationId: string) {
  const [byStatus, byGrade, total] = await Promise.all([
    prisma.employee.groupBy({
      by: ["employmentStatus"],
      where: { organizationId },
      _count: { id: true },
    }),
    prisma.employee.groupBy({
      by: ["jobGrade"],
      where: { organizationId, employmentStatus: "active" },
      _count: { id: true },
    }),
    prisma.employee.count({ where: { organizationId } }),
  ]);
  return {
    total,
    byStatus: byStatus.map((s) => ({ status: s.employmentStatus, count: s._count.id })),
    byGrade: byGrade
      .map((g) => ({ grade: g.jobGrade, count: g._count.id }))
      .sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0)),
  };
}

function getEmployeeCounts(organizationId: string) {
  return cached(
    cacheKey(organizationId, CACHE_DOMAIN.people, "counts"),
    CACHE_TTL.aggregates,
    () => loadEmployeeCounts(organizationId),
  );
}

async function loadTicketSummary(organizationId: string, limit: number) {
  // `tickets` has no organizationId column; tenancy is reached through the
  // creating user. Scoping via the relation is the only correct filter.
  const orgWhere = { createdBy: { user: { organizationId } } };

  const [byStatus, byPriority, recent] = await Promise.all([
    prisma.tickets.groupBy({
      by: ["status"],
      where: orgWhere,
      _count: { id: true },
    }),
    prisma.tickets.groupBy({
      by: ["priority"],
      where: { ...orgWhere, status: { notIn: ["resolved", "closed"] } },
      _count: { id: true },
    }),
    prisma.tickets.findMany({
      where: { ...orgWhere, status: { notIn: ["resolved", "closed"] } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        user_tickets_createdByTouser: {
          select: { firstname: true, lastname: true },
        },
      },
    }),
  ]);

  return {
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count.id })),
    recent,
  };
}

function getTicketSummary(organizationId: string, limit: number) {
  const clamped = Math.min(limit, 8);
  return cached(
    cacheKey(organizationId, CACHE_DOMAIN.tickets, `summary:${clamped}`),
    CACHE_TTL.aggregates,
    () => loadTicketSummary(organizationId, clamped),
  );
}

function getQueue(organizationId: string) {
  return cached(
    cacheKey(organizationId, CACHE_DOMAIN.queue, "full"),
    CACHE_TTL.queue,
    () => computeHouseQueueWithActiveConfig(organizationId),
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function tableFromRows(columns: string[], rows: CardTable["rows"]): CardTable {
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

async function resolveCapabilities(): Promise<FastCard> {
  const groups = [
    {
      title: "Housing & house queue",
      items: [
        "Active / inactive / vacant / occupied house counts",
        "Occupancy breakdown by house type",
        "Who occupies a specific house",
        "Queue size, grade breakdown, top-ranked candidates",
        "Pending handback inspections and repair holds",
      ],
    },
    {
      title: "Assets, stock & licences",
      items: [
        "Registered asset counts and total purchase value",
        "Asset estate value by category",
        "Warranties expiring within a window",
        "Low-stock consumables and strained licence seats",
      ],
    },
    {
      title: "People & support",
      items: [
        "Employee headcount by status and job grade",
        "Ticket volume, status and priority breakdown",
        "Anything multi-step — ask in plain language and it reasons it through",
      ],
    },
  ];

  return {
    intent: "support.capabilities",
    title: `${ASSISTANT_BRAND.lockup} can answer these`,
    summary:
      "Count and lookup questions resolve instantly from live portal records. Anything more involved is reasoned through with the same business rules the portal enforces.",
    stats: groups.map((g) => ({
      label: g.title,
      value: `${g.items.length} capabilities`,
    })),
    table: tableFromRows(
      ["Domain", "I can answer"],
      groups.map((g) => [g.title, g.items.join(" · ")]),
    ),
    actions: [
      { label: "Active houses", href: "/houses" },
      { label: "House queue", href: "/house-queue" },
      { label: "Assets", href: "/assets" },
      { label: "Tickets", href: "/tickets" },
    ],
    footnote:
      "Answers always read live data scoped to your organization — never estimates.",
  };
}

async function resolveHousingCounts(
  organizationId: string,
  registerStatus: string | null,
  limit: number,
): Promise<FastCard> {
  const overview = await getHousingOverview(organizationId);

  if (registerStatus === "Inactive") {
    const rows = await prisma.household.findMany({
      where: { organizationId, status: "Inactive" },
      select: { houseNumber: true, hid: true, houseType: true, occupancyStatus: true },
      orderBy: { houseNumber: "asc" },
      take: limit,
    });
    return {
      intent: "housing.counts",
      title: `${formatNumber(overview.inactive)} inactive ${overview.inactive === 1 ? "house" : "houses"}`,
      summary:
        "Inactive houses are held out of the allocation pool until the register re-activates them.",
      stats: [
        {
          label: "Inactive",
          value: formatNumber(overview.inactive),
          tone: "caution",
        },
        { label: "Total in register", value: formatNumber(overview.total) },
        {
          label: "Active",
          value: formatNumber(overview.active),
          tone: "positive",
        },
      ],
      table: rows.length
        ? {
            columns: ["House", "HID", "Type", "Occupancy"],
            rows: rows.map((h) => [h.houseNumber, h.hid, h.houseType, h.occupancyStatus]),
          }
        : undefined,
      actions: [{ label: "Open house register", href: "/houses" }],
      footnote: overview.inactive > limit ? `Showing first ${limit} of ${overview.inactive}.` : undefined,
    };
  }

  if (registerStatus === null) {
    const rows = await prisma.household.findMany({
      where: { organizationId },
      select: { houseNumber: true, hid: true, houseType: true, occupancyStatus: true, status: true },
      orderBy: { houseNumber: "asc" },
      take: limit,
    });
    return {
      intent: "housing.counts",
      title: `${formatNumber(overview.total)} ${overview.total === 1 ? "house" : "houses"} in the register`,
      summary: `Occupancy rate is ${overview.occupancyRate}%. ${overview.vacant} vacant and ready for allocation.`,
      stats: [
        { label: "Total", value: formatNumber(overview.total) },
        { label: "Occupied", value: formatNumber(overview.occupied), tone: "positive" },
        { label: "Vacant", value: formatNumber(overview.vacant), tone: "neutral" },
        { label: "Maintenance", value: formatNumber(overview.maintenance), tone: "caution" },
        { label: "Inactive", value: formatNumber(overview.inactive), tone: "caution" },
      ],
      table: rows.length
        ? {
            columns: ["House", "HID", "Type", "Occupancy", "Register"],
            rows: rows.map((h) => [
              h.houseNumber,
              h.hid,
              h.houseType,
              h.occupancyStatus,
              h.status,
            ]),
          }
        : undefined,
      actions: [{ label: "Open house register", href: "/houses" }],
      footnote: overview.total > limit ? `Showing first ${limit} of ${overview.total}.` : undefined,
    };
  }

  return {
    intent: "housing.counts",
    title: `${formatNumber(overview.active)} active ${overview.active === 1 ? "house" : "houses"}`,
    summary: `${formatNumber(overview.vacant)} vacant, ${formatNumber(overview.occupied)} occupied, ${formatNumber(overview.maintenance)} under maintenance.`,
    stats: [
      { label: "Active", value: formatNumber(overview.active), tone: "positive" },
      { label: "Vacant", value: formatNumber(overview.vacant), tone: "neutral" },
      { label: "Occupied", value: formatNumber(overview.occupied) },
      { label: "Maintenance", value: formatNumber(overview.maintenance), tone: "caution" },
      { label: "Inactive", value: formatNumber(overview.inactive), tone: "caution" },
    ],
    table: overview.byType.length
      ? {
          columns: ["House type", "Total", "Vacant", "Occupied", "Maintenance"],
          rows: overview.byType.map((t) => [
            t.type,
            t.total,
            t.vacant,
            t.occupied,
            t.maintenance,
          ]),
        }
      : undefined,
    actions: [
      { label: "Vacant houses", href: "/houses/vacant" },
      { label: "Allocated houses", href: "/houses/allocated" },
    ],
    footnote: "Active = enabled in the register and eligible for allocation. Inactive houses are excluded.",
  };
}

async function resolveHousingStatusCounts(
  organizationId: string,
  wantVacant: boolean,
  wantOccupied: boolean,
  wantMaintenance: boolean,
  limit: number,
): Promise<FastCard> {
  const statuses: string[] = [];
  if (wantVacant) statuses.push("Vacant");
  if (wantOccupied) statuses.push("Occupied");
  if (wantMaintenance) statuses.push("Maintenance");

  const where = {
    organizationId,
    status: "Active",
    occupancyStatus: { in: statuses as never },
  };

  const [rows, grouped] = await Promise.all([
    prisma.household.findMany({
      where,
      select: {
        houseNumber: true,
        hid: true,
        houseType: true,
        occupancyStatus: true,
        locationName: true,
      },
      orderBy: [{ occupancyStatus: "asc" }, { houseNumber: "asc" }],
      take: limit,
    }),
    prisma.household.groupBy({
      by: ["occupancyStatus"],
      where,
      _count: { id: true },
    }),
  ]);

  const countFor = (status: string) =>
    grouped.find((g) => g.occupancyStatus === status)?._count.id ?? 0;
  const total = grouped.reduce((sum, g) => sum + g._count.id, 0);
  const label = statuses.join(" / ").toLowerCase();

  const stats: CardStat[] = statuses.map((status) => ({
    label: status,
    value: formatNumber(countFor(status)),
    tone:
      status === "Vacant"
        ? "positive"
        : status === "Maintenance"
          ? "caution"
          : "neutral",
  }));
  stats.push({ label: "Combined", value: formatNumber(total) });

  return {
    intent: "housing.statusCounts",
    title: `${formatNumber(total)} ${total === 1 ? "house is" : "houses are"} ${label}`,
    stats,
    table: rows.length
      ? {
          columns: ["House", "HID", "Type", "Occupancy", "Location"],
          rows: rows.map((h) => [
            h.houseNumber,
            h.hid,
            h.houseType,
            h.occupancyStatus,
            h.locationName ?? "—",
          ]),
        }
      : undefined,
    actions:
      wantVacant && !wantOccupied && !wantMaintenance
        ? [{ label: "Allocate a house", href: "/house-queue" }]
        : [{ label: "Open house register", href: "/houses" }],
    footnote: "Counts include only register-active houses.",
  };
}

async function resolveHousingRegisterStatus(
  organizationId: string,
  status: "Active" | "Inactive",
): Promise<FastCard> {
  const overview = await getHousingOverview(organizationId);
  const isActive = status === "Active";
  const value = isActive ? overview.active : overview.inactive;

  const byType = overview.byType.filter((t) => t.total > 0);

  return {
    intent: "housing.registerStatus",
    title: `${formatNumber(value)} ${isActive ? "active" : "inactive"} ${value === 1 ? "house" : "houses"}`,
    summary: isActive
      ? "Active houses are the allocation pool. Inactive houses are held back for repair or deregistration."
      : "Inactive houses are excluded from the allocation pool and the queue engine.",
    stats: [
      { label: "Active", value: formatNumber(overview.active), tone: "positive" },
      { label: "Inactive", value: formatNumber(overview.inactive), tone: "caution" },
      { label: "Total", value: formatNumber(overview.total) },
    ],
    table: byType.length
      ? {
          columns: ["House type", "Total", "Vacant", "Occupied", "Maintenance"],
          rows: byType.map((t) => [t.type, t.total, t.vacant, t.occupied, t.maintenance]),
        }
      : undefined,
    actions: [{ label: "Open house register", href: "/houses" }],
    footnote: isActive
      ? `Occupancy across active houses: ${overview.occupancyRate}%.`
      : "Re-activate a house from the register to return it to the pool.",
  };
}

async function resolveHousingBreakdown(
  organizationId: string,
): Promise<FastCard> {
  const overview = await getHousingOverview(organizationId);

  return {
    intent: "housing.breakdown",
    title: `Occupancy ${overview.occupancyRate}% of ${formatNumber(overview.total)} houses`,
    summary: `${formatNumber(overview.occupied)} occupied · ${formatNumber(overview.vacant)} vacant (${overview.vacantRate}%) · ${formatNumber(overview.maintenance)} under maintenance`,
    stats: [
      { label: "Occupied", value: formatNumber(overview.occupied), tone: "positive" },
      { label: "Vacant", value: formatNumber(overview.vacant) },
      { label: "Maintenance", value: formatNumber(overview.maintenance), tone: "caution" },
      { label: "Occupancy rate", value: `${overview.occupancyRate}%` },
    ],
    table: overview.byType.length
      ? {
          columns: ["House type", "Total", "Occupied", "Vacant", "Maintenance", "Occupied %"],
          rows: overview.byType.map((t) => [
            t.type,
            t.total,
            t.occupied,
            t.vacant,
            t.maintenance,
            pct(t.occupied, t.total),
          ]),
          rowTones: overview.byType.map((t) =>
            t.total > 0 && t.occupied / t.total >= 0.9 ? "positive" : "neutral",
          ),
        }
      : undefined,
    actions: [
      { label: "Allocated houses", href: "/houses/allocated" },
      { label: "House register", href: "/houses" },
    ],
    footnote: "Occupancy rate is occupied ÷ total in the register, including houses under maintenance.",
  };
}

async function resolveOccupantOf(
  organizationId: string,
  houseRef: string,
): Promise<FastCard | null> {
  const needle = houseRef.toLowerCase();
  const household = await prisma.household.findFirst({
    where: {
      organizationId,
      OR: [
        { houseNumber: { equals: houseRef, mode: "insensitive" } },
        { houseNumber: { contains: needle, mode: "insensitive" } },
        { hid: { equals: houseRef, mode: "insensitive" } },
        { hid: { contains: needle, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      houseNumber: true,
      hid: true,
      houseType: true,
      occupancyStatus: true,
      status: true,
      locationName: true,
      bedCount: true,
      chairsCount: true,
      lockerCount: true,
      tablesCount: true,
      damageNotes: true,
    },
    orderBy: { houseNumber: "asc" },
  });

  if (!household) return null;

  const allocation = await prisma.houseAllocation.findFirst({
    where: { organizationId, householdId: household.id, status: "allocated" },
    orderBy: { createdAt: "desc" },
    select: {
      decidedAt: true,
      employee: {
        select: {
          firstname: true,
          lastname: true,
          employeeNumber: true,
          jobTitle: true,
          jobGrade: true,
          department: { select: { name: true } },
        },
      },
      inspection: {
        select: { resolvedTo: true, scheduledDate: true, conditionNote: true },
      },
    },
  });

  const history = await prisma.houseAllocation.findMany({
    where: { organizationId, householdId: household.id },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { status: true, createdAt: true },
  });

  const tenant = allocation?.employee;
  const tenantName = tenant
    ? `${tenant.firstname} ${tenant.lastname}`.trim()
    : null;

  const stats: CardStat[] = [
    {
      label: "Occupancy",
      value: household.occupancyStatus,
      tone:
        household.occupancyStatus === "Occupied"
          ? "positive"
          : household.occupancyStatus === "Maintenance"
            ? "caution"
            : "neutral",
    },
    { label: "Register", value: household.status },
    { label: "Type", value: household.houseType },
  ];

  if (tenant) {
    stats.push({ label: "Grade", value: tenant.jobGrade ?? "—" });
  }

  return {
    intent: "housing.occupantOf",
    title: tenantName
      ? `House ${household.houseNumber} — occupied by ${tenantName}`
      : `House ${household.houseNumber} — ${household.occupancyStatus.toLowerCase()}`,
    summary: tenant
      ? `${tenant.jobTitle ?? "Employee"} · Grade ${tenant.jobGrade ?? "—"}${tenant.department?.name ? ` · ${tenant.department.name}` : ""}${allocation?.decidedAt ? ` · allocated ${allocation.decidedAt.toISOString().slice(0, 10)}` : ""}`
      : "No live allocation is recorded against this house, so it stays in the available pool.",
    stats,
    table: tableFromRows(["Item", "Count"], [
      ["Beds", household.bedCount],
      ["Chairs", household.chairsCount],
      ["Lockers", household.lockerCount],
      ["Tables", household.tablesCount],
    ]),
    actions: [
      { label: "Allocated houses", href: "/houses/allocated" },
      { label: "House queue", href: "/house-queue" },
    ],
    footnote: [
      history.length > 0
        ? `Last decisions: ${history.map((h) => h.status).join(" → ")}.`
        : null,
      household.damageNotes ? `Damage on file: ${household.damageNotes}` : null,
      allocation?.inspection
        ? `Inspection: ${allocation.inspection.resolvedTo ? `resolved to ${allocation.inspection.resolvedTo}` : "pending hold"}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined,
  };
}

async function resolveQueueSize(organizationId: string): Promise<FastCard> {
  const queue = await getQueue(organizationId);
  const { summary, availability } = queue;

  const available = availability.reduce((sum, a) => sum + a.available, 0);
  const allocated = availability.reduce((sum, a) => sum + a.allocated, 0);

  return {
    intent: "queue.size",
    title: `${formatNumber(summary.readyCount)} ${summary.readyCount === 1 ? "employee is" : "employees are"} ready for allocation`,
    summary: `${formatNumber(summary.eligibleCount)} eligible of ${formatNumber(summary.totalEmployees)} active employees · ${formatNumber(summary.noHouseCount)} blocked for want of a suitable house`,
    stats: [
      { label: "Ready now", value: formatNumber(summary.readyCount), tone: "positive" },
      { label: "Waiting on a house", value: formatNumber(summary.noHouseCount), tone: "caution" },
      { label: "Eligible", value: formatNumber(summary.eligibleCount) },
      { label: "Not eligible", value: formatNumber(summary.notEligibleCount) },
      { label: "Already allocated", value: formatNumber(summary.allocatedCount) },
      { label: "Houses available", value: formatNumber(available) },
    ],
    table: availability.some((a) => a.totalActive > 0)
      ? {
          columns: ["Category", "Active houses", "Allocated", "Available"],
          rows: availability
            .filter((a) => a.totalActive > 0)
            .map((a) => [a.category, a.totalActive, a.allocated, a.available]),
          rowTones: availability
            .filter((a) => a.totalActive > 0)
            .map((a) => (a.available === 0 ? "critical" : "neutral")),
        }
      : undefined,
    actions: [{ label: "Open house queue", href: "/house-queue" }],
    footnote:
      "Ready = eligible grade with a house currently recommended. Allocated houses count is " +
      `${formatNumber(allocated)}.`,
  };
}

async function resolveQueueByGrade(
  organizationId: string,
  grade: number,
): Promise<FastCard> {
  const queue = await getQueue(organizationId);
  const rows = queue.rows.filter((r) => r.jobGrade === grade);

  const group = queue.gradeGroups.find((g) => g.grade === grade);
  const availability = group?.category
    ? queue.availability.find((a) => a.category === group.category)
    : undefined;

  const statusCount = (status: string) =>
    rows.filter((r) => r.queueStatus === status).length;

  return {
    intent: "queue.byGrade",
    title: rows.length
      ? `Grade ${grade} — ${formatNumber(rows.length)} active ${rows.length === 1 ? "employee" : "employees"}`
      : `Grade ${grade} — no active employees`,
    summary: group?.category
      ? `Mapped to the ${group.category} house category · ${availability?.available ?? 0} ${group.category} ${(availability?.available ?? 0) === 1 ? "house" : "houses"} available`
      : "This grade has no mapped house category, so its members are not eligible for allocation.",
    stats: [
      { label: "Total", value: formatNumber(rows.length) },
      { label: "Ready", value: formatNumber(statusCount("ready_for_allocation")), tone: "positive" },
      { label: "No house available", value: formatNumber(statusCount("no_house_available")), tone: "caution" },
      { label: "Allocated", value: formatNumber(statusCount("allocated")) },
    ],
    table: rows.length
      ? {
          columns: ["Rank", "Employee", "No.", "Service yrs", "MCDA", "Recommended house", "Status"],
          rows: rows.slice(0, 25).map((r) => [
            r.priorityRank ?? "—",
            `${r.firstname} ${r.lastname}`.trim(),
            r.employeeNumber,
            r.serviceYears,
            r.mcdScore !== null ? r.mcdScore.toFixed(2) : "—",
            r.recommendedHouseNumber ?? "—",
            r.queueStatus,
          ]),
        }
      : undefined,
    actions: [{ label: "Open house queue", href: "/house-queue" }],
    footnote: "MCDA ranks use the live engine weights and eligibility bands.",
  };
}

async function resolveQueuePosition(
  organizationId: string,
  limit: number,
  position: number | null,
): Promise<FastCard> {
  const queue = await getQueue(organizationId);

  // When an explicit position is asked for ("who is third"), answer that row
  // only; otherwise return the head of the queue.
  const rows = position
    ? queue.rows.slice(Math.max(0, position - 1), position)
    : queue.rows
        .filter((r) => r.queueStatus === "ready_for_allocation")
        .slice(0, Math.max(1, Math.min(limit, 10)));

  const pool = position ? rows : queue.rows.filter((r) => r.queueStatus === "ready_for_allocation");
  const available = queue.availability.reduce((sum, a) => sum + a.available, 0);

  if (rows.length === 0) {
    return {
      intent: "queue.position",
      title: position ? `No candidate at position ${position}` : "Nobody is ready for allocation right now",
      summary: `There are ${queue.summary.eligibleCount} eligible employees, but none currently has a house recommended. ${available} houses are available in total.`,
      stats: [
        { label: "Eligible", value: formatNumber(queue.summary.eligibleCount) },
        { label: "Ready", value: "0", tone: "caution" },
        { label: "Houses available", value: formatNumber(available) },
      ],
      actions: [{ label: "Open house queue", href: "/house-queue" }],
    };
  }

  return {
    intent: "queue.position",
    title: position
      ? `Position ${position}: ${rows[0].firstname} ${rows[0].lastname}`.trim()
      : `Top ${formatNumber(rows.length)} ${rows.length === 1 ? "candidate" : "candidates"} waiting`,
    summary: position
      ? `MCDA priority ${rows[0].priorityRank ?? "—"} · ${rows[0].serviceYears} years of service`
      : `Ranked by the live MCDA engine across ${queue.gradeGroups.length} grades, with ${available} ${available === 1 ? "house" : "houses"} available.`,
    stats: [
      { label: "Ready now", value: formatNumber(pool.length) },
      { label: "Eligible", value: formatNumber(queue.summary.eligibleCount) },
      { label: "Houses available", value: formatNumber(available) },
    ],
    table: tableFromRows(
      ["Rank", "Employee", "No.", "Grade", "Service yrs", "MCDA", "Recommended house", "Status"],
      rows.map((r) => [
        r.priorityRank ?? "—",
        `${r.firstname} ${r.lastname}`.trim(),
        r.employeeNumber,
        r.jobGrade ?? "—",
        r.serviceYears,
        r.mcdScore !== null ? r.mcdScore.toFixed(2) : "—",
        r.recommendedHouseNumber
          ? `${r.recommendedHouseNumber} (${r.houseCategory ?? "—"})`
          : "—",
        r.queueStatus,
      ]),
    ),
    actions: [{ label: "Open house queue", href: "/house-queue" }],
    footnote: "Ranks are recomputed live against the current engine configuration.",
  };
}

async function resolveAssetCounts(
  organizationId: string,
  limit: number,
): Promise<FastCard> {
  const overview = await getAssetOverview(organizationId);
  const recent = await prisma.asset.findMany({
    where: { organizationId },
    orderBy: { creation_date: "desc" },
    take: limit,
    select: {
      assettag: true,
      assetname: true,
      assetCategoryType: { select: { assetcategorytypename: true } },
      location: { select: { locationname: true } },
    },
  });

  return {
    intent: "assets.counts",
    title: `${formatNumber(overview.total)} registered ${overview.total === 1 ? "asset" : "assets"}`,
    summary: `${formatNumber(overview.warrantySoon)} warranties expire within 60 days · ${formatCurrency(overview.totalValue)} total purchase value`,
    stats: [
      { label: "Assets", value: formatNumber(overview.total) },
      { label: "Warranty ≤ 60 days", value: formatNumber(overview.warrantySoon), tone: "caution" },
      { label: "Purchase value", value: formatCurrency(overview.totalValue) },
    ],
    table: overview.byCategory.length
      ? {
          columns: ["Category", "Assets", "Purchase value"],
          rows: overview.byCategory
            .slice(0, 12)
            .map((c) => [c.category, c.count, formatCurrency(c.value)]),
        }
      : undefined,
    actions: [{ label: "Open assets", href: "/assets" }],
    footnote: recent.length
      ? `Most recently registered: ${recent.map((a) => a.assettag).join(", ")}.`
      : undefined,
  };
}

async function resolveAssetEstateValue(
  organizationId: string,
): Promise<FastCard> {
  const overview = await getAssetOverview(organizationId);

  return {
    intent: "assets.estateValue",
    title: `${formatNumber(overview.total)} assets worth ${formatCurrency(overview.totalValue)}`,
    summary: "Total recorded purchase value across the registered asset estate.",
    stats: [
      { label: "Total value", value: formatCurrency(overview.totalValue), tone: "positive" },
      { label: "Assets", value: formatNumber(overview.total) },
      {
        label: "Average per asset",
        value: overview.total
          ? formatCurrency(overview.totalValue / overview.total)
          : "—",
      },
    ],
    table: overview.byCategory.length
      ? {
          columns: ["Category", "Assets", "Purchase value", "Share"],
          rows: overview.byCategory.map((c) => [
            c.category,
            c.count,
            formatCurrency(c.value),
            overview.totalValue > 0
              ? `${Math.round((c.value / overview.totalValue) * 100)}%`
              : "—",
          ]),
        }
      : undefined,
    actions: [{ label: "Open assets", href: "/assets" }],
    footnote: "Based on recorded purchase price, before depreciation.",
  };
}

async function resolveExpiringWarranties(
  organizationId: string,
  days: number,
  limit: number,
): Promise<FastCard> {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      warrantyExpires: { gte: now, lte: horizon },
    },
    orderBy: { warrantyExpires: "asc" },
    take: limit,
    select: {
      assetid: true,
      assettag: true,
      assetname: true,
      warrantyExpires: true,
      model: { select: { modelname: true } },
      manufacturer: { select: { manufacturername: true } },
      department: { select: { name: true } },
    },
  });

  const expired = await prisma.asset.count({
    where: { organizationId, warrantyExpires: { lt: now } },
  });

  return {
    intent: "assets.expiringWarranties",
    title:
      assets.length === 0
        ? `No warranties expire in the next ${days} days`
        : `${formatNumber(assets.length)} ${assets.length === 1 ? "warranty expires" : "warranties expire"} within ${days} days`,
    stats: [
      { label: `Expiring ≤ ${days}d`, value: formatNumber(assets.length), tone: "caution" },
      { label: "Already expired", value: formatNumber(expired), tone: "critical" },
    ],
    table: assets.length
      ? {
          columns: ["Asset tag", "Name", "Model", "Manufacturer", "Department", "Expires"],
          rows: assets.map((a) => [
            a.assettag,
            a.assetname,
            a.model?.modelname ?? "—",
            a.manufacturer?.manufacturername ?? "—",
            a.department?.name ?? "Unassigned",
            a.warrantyExpires ? a.warrantyExpires.toISOString().slice(0, 10) : "—",
          ]),
        }
      : undefined,
    actions: [{ label: "Open assets", href: "/assets" }],
    footnote: `Window measured from today (${now.toISOString().slice(0, 10)}).`,
  };
}

async function resolveStockAlerts(
  organizationId: string,
  limit: number,
): Promise<FastCard> {
  const [consumables, licences] = await Promise.all([
    prisma.consumable.findMany({
      where: { organizationId },
      orderBy: { quantity: "asc" },
      take: limit * 3,
      select: {
        consumableid: true,
        consumablename: true,
        quantity: true,
        minQuantity: true,
        location: { select: { locationname: true } },
      },
    }),
    prisma.licence.findMany({
      where: { organizationId },
      take: limit,
      select: {
        licenceid: true,
        licenceCategoryType: { select: { licencecategorytypename: true } },
        seatCount: true,
        expirationdate: true,
        seatAssignments: {
          where: { unassignedAt: null },
          select: { id: true },
        },
      },
    }),
  ]);

  const lowStock = consumables.filter(
    (c) => c.quantity <= c.minQuantity,
  );

  const strained = licences
    .map((l) => {
      const used = l.seatAssignments.length;
      const free = Math.max(0, l.seatCount - used);
      return {
        id: l.licenceid,
        software: l.licenceCategoryType?.licencecategorytypename ?? "Uncategorised licence",
        seats: l.seatCount,
        used,
        free,
        expires: l.expirationdate
          ? l.expirationdate.toISOString().slice(0, 10)
          : null,
      };
    })
    .filter((l) => l.free <= Math.max(1, Math.floor(l.seats * 0.1)));

  const rows: (string | number | null)[][] = [
    ...lowStock.slice(0, limit).map((c) => [
      "Consumable",
      c.consumablename,
      c.quantity,
      c.minQuantity,
      c.location?.locationname ?? "Main Store",
    ]),
    ...strained.slice(0, limit).map((l) => [
      "Licence",
      l.software,
      `${l.free} free / ${l.seats}`,
      "≤ 10% free",
      l.expires ?? "Perpetual",
    ]),
  ];

  const total = lowStock.length + strained.length;

  return {
    intent: "assets.stockAlerts",
    title:
      total === 0
        ? "No stock or licence alerts"
        : `${formatNumber(total)} ${total === 1 ? "alert needs" : "alerts need"} attention`,
    summary:
      total === 0
        ? "Every consumable is above its reorder threshold and no licence is seat-constrained."
        : `${lowStock.length} consumable${lowStock.length === 1 ? "" : "s"} at or below the reorder threshold · ${strained.length} licence${strained.length === 1 ? "" : "s"} nearly out of seats`,
    stats: [
      { label: "Low stock", value: formatNumber(lowStock.length), tone: "caution" },
      { label: "Seats strained", value: formatNumber(strained.length), tone: "caution" },
    ],
    table: rows.length
      ? {
          columns: ["Type", "Item", "On hand", "Threshold", "Location / expiry"],
          rows,
          rowTones: rows.map((_, i) =>
            i < lowStock.length ? "caution" : "neutral",
          ),
        }
      : undefined,
    actions: [{ label: "Open inventory", href: "/consumables" }],
    footnote: "A consumable is low when on-hand quantity is at or below its minimum threshold.",
  };
}

async function resolveInspectionSummary(
  organizationId: string,
  onlyPending: boolean,
  limit: number,
): Promise<FastCard> {
  const where = {
    organizationId,
    ...(onlyPending ? { resolvedTo: null } : {}),
  };

  const [pending, total, rows] = await Promise.all([
    prisma.houseInspection.count({ where: { organizationId, resolvedTo: null } }),
    prisma.houseInspection.count({ where }),
    prisma.houseInspection.findMany({
      where,
      orderBy: { scheduledDate: "desc" },
      take: limit,
      select: {
        id: true,
        scheduledDate: true,
        resolvedTo: true,
        completedAt: true,
        conditionNote: true,
        checklistWindow: true,
        checklistDoor: true,
        checklistWaterPanel: true,
        checklistRoof: true,
        checklistWall: true,
        checklistElectricity: true,
        household: { select: { houseNumber: true, houseType: true } },
        allocation: {
          select: {
            employee: { select: { firstname: true, lastname: true } },
          },
        },
      },
    }),
  ]);

  const describe = (r: (typeof rows)[number]) => {
    const items: string[] = [];
    if (r.checklistWindow) items.push("Window");
    if (r.checklistDoor) items.push("Door");
    if (r.checklistWaterPanel) items.push("Water panel");
    if (r.checklistRoof) items.push("Roof");
    if (r.checklistWall) items.push("Wall");
    if (r.checklistElectricity) items.push("Electricity");
    return items.length ? items.join(", ") : "No damage recorded";
  };

  return {
    intent: "inspections.summary",
    title: onlyPending
      ? `${formatNumber(pending)} ${pending === 1 ? "house is" : "houses are"} on inspection hold`
      : `${formatNumber(total)} handback ${total === 1 ? "inspection" : "inspections"}`,
    summary: onlyPending
      ? "A house stays out of the allocation pool until its inspection resolves to Active or Under Maintenance."
      : `${pending} still unresolved, ${total - pending} resolved.`,
    stats: [
      { label: "Pending hold", value: formatNumber(pending), tone: pending > 0 ? "caution" : "positive" },
      { label: "Total inspections", value: formatNumber(total) },
    ],
    table: rows.length
      ? {
          columns: ["House", "Type", "Vacated by", "Scheduled", "Damages", "Status"],
          rows: rows.map((r) => [
            r.household.houseNumber,
            r.household.houseType,
            r.allocation?.employee
              ? `${r.allocation.employee.firstname} ${r.allocation.employee.lastname}`.trim()
              : "—",
            r.scheduledDate ? r.scheduledDate.toISOString().slice(0, 10) : "Unscheduled",
            describe(r),
            r.resolvedTo ? `Resolved → ${r.resolvedTo}` : "Pending",
          ]),
          rowTones: rows.map((r) => (r.resolvedTo ? "neutral" : "caution")),
        }
      : undefined,
    actions: [{ label: "Open inspections", href: "/houses/inspections" }],
    footnote: "Damage items come from the handback checklist captured at the worklist.",
  };
}

async function resolveTicketSummary(
  organizationId: string,
  limit: number,
): Promise<FastCard> {
  const summary = await getTicketSummary(organizationId, limit);
  const open = summary.byStatus
    .filter((s) => s.status !== "resolved" && s.status !== "closed")
    .reduce((sum, s) => sum + s.count, 0);
  const total = summary.byStatus.reduce((sum, s) => sum + s.count, 0);

  return {
    intent: "tickets.summary",
    title: `${formatNumber(open)} open ${open === 1 ? "ticket" : "tickets"} of ${formatNumber(total)}`,
    summary:
      open === 0
        ? "Nothing is outstanding — every ticket is resolved or closed."
        : `Prioritised: ${summary.byPriority
            .map((p) => `${p.count} ${p.priority}`)
            .join(" · ") || "no priority set"}.`,
    stats: [
      { label: "Open", value: formatNumber(open), tone: open > 0 ? "caution" : "positive" },
      { label: "Total", value: formatNumber(total) },
      ...summary.byStatus.slice(0, 3).map((s) => ({
        label: s.status,
        value: formatNumber(s.count),
      })),
    ],
    table: summary.recent.length
      ? {
          columns: ["Priority", "Title", "Raised by", "Status", "Opened"],
          rows: summary.recent.map((t) => [
            t.priority,
            t.title,
            t.user_tickets_createdByTouser
              ? `${t.user_tickets_createdByTouser.firstname} ${t.user_tickets_createdByTouser.lastname}`.trim()
              : "—",
            t.status,
            t.createdAt.toISOString().slice(0, 10),
          ]),
          rowTones: summary.recent.map((t) =>
            t.priority === "critical" || t.priority === "high" ? "caution" : "neutral",
          ),
        }
      : undefined,
    actions: [{ label: "Open tickets", href: "/tickets" }],
    footnote: "Scoped to tickets raised by users in your organization.",
  };
}

async function resolveEmployeeCounts(
  organizationId: string,
): Promise<FastCard> {
  const counts = await getEmployeeCounts(organizationId);
  const active = counts.byStatus.find((s) => s.status === "active")?.count ?? 0;

  return {
    intent: "employees.counts",
    title: `${formatNumber(counts.total)} ${counts.total === 1 ? "employee" : "employees"} on record`,
    summary: `${formatNumber(active)} currently active. Grades drive house eligibility through the queue engine.`,
    stats: [
      { label: "Total", value: formatNumber(counts.total) },
      { label: "Active", value: formatNumber(active), tone: "positive" },
      ...counts.byStatus
        .filter((s) => s.status !== "active")
        .slice(0, 2)
        .map((s) => ({ label: s.status, value: formatNumber(s.count) })),
    ],
    table: counts.byGrade.length
      ? {
          columns: ["Job grade", "Active employees"],
          rows: counts.byGrade.map((g) => [g.grade ?? "Ungraded", g.count]),
        }
      : undefined,
    actions: [{ label: "Open employees", href: "/employees" }],
    footnote: "Eligibility bands map job grade to a house category in the queue engine configuration.",
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface FastLaneAnswer {
  card: FastCard;
  ms: number;
  cached: boolean;
}

/**
 * The aggregate each intent leans on, so the caller can tell whether the answer
 * came out of the cache or off the database. Keyed by intent because that is the
 * unit the router actually resolved.
 */
const PRIMARY_AGGREGATE: Record<
  string,
  (organizationId: string, params: Record<string, unknown>) => string | null
> = {
  "housing.counts": (org) => HOUSING_OVERVIEW_KEY(org),
  "housing.registerStatus": (org) => HOUSING_OVERVIEW_KEY(org),
  "housing.breakdown": (org) => HOUSING_OVERVIEW_KEY(org),
  "queue.size": (org) => cacheKey(org, CACHE_DOMAIN.queue, "full"),
  "queue.byGrade": (org) => cacheKey(org, CACHE_DOMAIN.queue, "full"),
  "queue.position": (org) => cacheKey(org, CACHE_DOMAIN.queue, "full"),
  "assets.counts": (org) => cacheKey(org, CACHE_DOMAIN.assets, "overview"),
  "assets.estateValue": (org) => cacheKey(org, CACHE_DOMAIN.assets, "overview"),
  "employees.counts": (org) => cacheKey(org, CACHE_DOMAIN.people, "counts"),
  "tickets.summary": (org, p) =>
    cacheKey(org, CACHE_DOMAIN.tickets, `summary:${Math.min((p.limit as number) ?? 8, 8)}`),
};

/**
 * Try to answer a question without invoking the model.
 *
 * @returns The card plus timing, or `null` when the question needs the
 *          reasoning lane.
 */
export async function tryFastLane(
  organizationId: string,
  question: string,
): Promise<FastLaneAnswer | null> {
  const started = Date.now();
  const intent: RoutedIntent | null = routeIntent(question);
  if (!intent) return null;

  // Sampled before the resolver runs, so this reports the pre-existing entry
  // rather than whatever the resolver happened to populate on the way past.
  const primaryKey = PRIMARY_AGGREGATE[intent.id]?.(
    organizationId,
    intent.params,
  );
  const servedFromCache = primaryKey
    ? peekCache(primaryKey) !== undefined
    : false;

  const p = intent.params;
  let card: FastCard | null | undefined;

  switch (intent.id) {
    case "support.capabilities":
      card = await resolveCapabilities();
      break;
    case "housing.counts":
      card = await resolveHousingCounts(
        organizationId,
        (p.registerStatus as string | null) ?? null,
        (p.limit as number) ?? 10,
      );
      break;
    case "housing.statusCounts":
      card = await resolveHousingStatusCounts(
        organizationId,
        Boolean(p.wantVacant),
        Boolean(p.wantOccupied),
        Boolean(p.wantMaintenance),
        (p.limit as number) ?? 12,
      );
      break;
    case "housing.registerStatus":
      card = await resolveHousingRegisterStatus(
        organizationId,
        (p.status as "Active" | "Inactive") ?? "Active",
      );
      break;
    case "housing.breakdown":
      card = await resolveHousingBreakdown(organizationId);
      break;
    case "housing.occupantOf":
      card = await resolveOccupantOf(organizationId, p.houseRef as string);
      break;
    case "queue.size":
      card = await resolveQueueSize(organizationId);
      break;
    case "queue.byGrade":
      card = await resolveQueueByGrade(organizationId, p.grade as number);
      break;
    case "queue.position":
      card = await resolveQueuePosition(
        organizationId,
        (p.limit as number) ?? 5,
        (p.position as number | null) ?? null,
      );
      break;
    case "assets.counts":
      card = await resolveAssetCounts(organizationId, (p.limit as number) ?? 10);
      break;
    case "assets.estateValue":
      card = await resolveAssetEstateValue(organizationId);
      break;
    case "assets.expiringWarranties":
      card = await resolveExpiringWarranties(
        organizationId,
        (p.days as number) ?? 60,
        (p.limit as number) ?? 10,
      );
      break;
    case "assets.stockAlerts":
      card = await resolveStockAlerts(organizationId, (p.limit as number) ?? 10);
      break;
    case "inspections.summary":
      card = await resolveInspectionSummary(
        organizationId,
        Boolean(p.onlyPending),
        (p.limit as number) ?? 8,
      );
      break;
    case "tickets.summary":
      card = await resolveTicketSummary(organizationId, (p.limit as number) ?? 8);
      break;
    case "employees.counts":
      card = await resolveEmployeeCounts(organizationId);
      break;
    default:
      return null;
  }

  // A recognised intent that resolved to "no such record" (e.g. an unknown house
  // number) falls through so the model can explain it properly.
  if (!card) return null;

  return {
    card,
    ms: Date.now() - started,
    cached: servedFromCache,
  };
}

/** Quick actions that the fast lane can satisfy, for UI highlighting. */
export function fastLaneQuickActionIds(): string[] {
  return QUICK_ACTIONS.filter((a) => a.id !== "capabilities").map((a) => a.id);
}

export type { FastCardResult };
