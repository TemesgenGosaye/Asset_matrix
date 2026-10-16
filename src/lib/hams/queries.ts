import prisma from "@/lib/prisma";
import { computeHouseQueueWithActiveConfig } from "@/lib/house-queue/engine";
import { AUDIT_ENTITIES } from "@/lib/audit-log";
import type { HouseCategory } from "@/lib/house-queue/types";

export interface HouseTypeBreakdown {
  type: string;
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
}

export interface HamsKpiData {
  totalHouses: number;
  housesByType: Record<string, number>;
  occupiedCount: number;
  vacantCount: number;
  maintenanceCount: number;
  occupancyRate: number;
  activeQueueSize: number;
  pendingInspectionCount: number;
  thisMonthAllocations: number;
  lastMonthAllocations: number;
  allocationDelta: number;
  inactiveDamagedCount: number;
}

export interface HamsOccupancyItem {
  category: string;
  occupied: number;
  vacant: number;
  maintenance: number;
  total: number;
}

export interface HamsActivityItem {
  id: string;
  action: string;
  timestamp: string;
  actorName: string;
  actorEmail?: string | null;
  employeeId: string | null;
  employeeName: string;
  employeeNumber: string;
  houseId: string | null;
  houseNumber: string;
  hid: string;
  targetHref: string;
  details?: Record<string, unknown> | null;
}

export interface HamsCohortAlert {
  grade: number | null;
  category: HouseCategory | string | null;
  waitingCount: number;
  availableHouses: number;
}

/**
 * Fetch all high-level KPIs for the HAMS dashboard in parallel using Prisma DB aggregates
 * and authoritative engine computations.
 */
export async function getHamsKpis(
  organizationId: string,
): Promise<HamsKpiData> {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    houseGroupByType,
    houseGroupByOccupancy,
    inactiveDamagedCount,
    pendingInspectionCount,
    thisMonthAllocations,
    lastMonthAllocations,
    queueResult,
  ] = await Promise.all([
    // 1. Total houses grouped by type
    prisma.household.groupBy({
      by: ["houseType"],
      where: { organizationId },
      _count: { id: true },
    }),

    // 2. Physical occupancy grouping (Vacant, Occupied, Maintenance)
    prisma.household.groupBy({
      by: ["occupancyStatus"],
      where: { organizationId },
      _count: { id: true },
    }),

    // 3. Houses flagged Inactive or having damage flags
    prisma.household.count({
      where: {
        organizationId,
        OR: [
          { status: "Inactive" },
          { damageWindow: true },
          { damageDoor: true },
          { damageWaterPanel: true },
          { damageRoof: true },
          { damageWall: true },
          { damageElectricity: true },
        ],
      },
    }),

    // 4. Pending house-inspection holds (unresolved inspections)
    prisma.houseInspection.count({
      where: {
        organizationId,
        resolvedTo: null,
      },
    }),

    // 5. Allocations made this month
    prisma.houseAllocation.count({
      where: {
        organizationId,
        status: "allocated",
        createdAt: { gte: startOfThisMonth },
      },
    }),

    // 6. Allocations made last month
    prisma.houseAllocation.count({
      where: {
        organizationId,
        status: "allocated",
        createdAt: {
          gte: startOfLastMonth,
          lt: startOfThisMonth,
        },
      },
    }),

    // 7. Authoritative queue engine result
    computeHouseQueueWithActiveConfig(organizationId),
  ]);

  // Aggregate breakdown
  const housesByType: Record<string, number> = {};
  let totalHouses = 0;
  for (const group of houseGroupByType) {
    housesByType[group.houseType] = group._count.id;
    totalHouses += group._count.id;
  }

  let occupiedCount = 0;
  let vacantCount = 0;
  let maintenanceCount = 0;

  for (const group of houseGroupByOccupancy) {
    if (group.occupancyStatus === "Occupied") {
      occupiedCount += group._count.id;
    } else if (group.occupancyStatus === "Vacant") {
      vacantCount += group._count.id;
    } else if (group.occupancyStatus === "Maintenance") {
      maintenanceCount += group._count.id;
    }
  }

  const occupancyRate =
    totalHouses > 0 ? Math.round((occupiedCount / totalHouses) * 100) : 0;
  const activeQueueSize = queueResult.summary.readyCount;
  const allocationDelta = thisMonthAllocations - lastMonthAllocations;

  return {
    totalHouses,
    housesByType,
    occupiedCount,
    vacantCount,
    maintenanceCount,
    occupancyRate,
    activeQueueSize,
    pendingInspectionCount,
    thisMonthAllocations,
    lastMonthAllocations,
    allocationDelta,
    inactiveDamagedCount,
  };
}

/**
 * Fetch occupancy distribution broken down by house type (Staff, A, B, C, D, E)
 * for the Recharts visualization.
 */
export async function getHamsOccupancyByType(
  organizationId: string,
): Promise<HamsOccupancyItem[]> {
  const categories = ["Staff", "A", "B", "C", "D", "E"];

  const raw = await prisma.household.groupBy({
    by: ["houseType", "occupancyStatus"],
    where: { organizationId },
    _count: { id: true },
  });

  const matrix = new Map<
    string,
    { occupied: number; vacant: number; maintenance: number }
  >();
  for (const cat of categories) {
    matrix.set(cat, { occupied: 0, vacant: 0, maintenance: 0 });
  }

  for (const row of raw) {
    const cat = row.houseType;
    if (!matrix.has(cat)) {
      matrix.set(cat, { occupied: 0, vacant: 0, maintenance: 0 });
    }
    const bucket = matrix.get(cat)!;
    if (row.occupancyStatus === "Occupied") bucket.occupied += row._count.id;
    else if (row.occupancyStatus === "Vacant") bucket.vacant += row._count.id;
    else if (row.occupancyStatus === "Maintenance")
      bucket.maintenance += row._count.id;
  }

  return categories.map((cat) => {
    const stats = matrix.get(cat) || { occupied: 0, vacant: 0, maintenance: 0 };
    return {
      category: cat,
      occupied: stats.occupied,
      vacant: stats.vacant,
      maintenance: stats.maintenance,
      total: stats.occupied + stats.vacant + stats.maintenance,
    };
  });
}

/**
 * Fetch last N allocation-engine decisions from audit logs.
 */
export async function getHamsRecentActivity(
  organizationId: string,
  limit = 10,
): Promise<HamsActivityItem[]> {
  const [orgUsers, orgEmployees] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId },
      select: { userid: true },
    }),
    prisma.employee.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    }),
  ]);

  const userIds = orgUsers.map((u) => u.userid);
  const employeeIds = orgEmployees.map((e) => e.id);

  if (userIds.length === 0 && employeeIds.length === 0) {
    return [];
  }

  const logs = await prisma.audit_logs.findMany({
    where: {
      entity: AUDIT_ENTITIES.HOUSE_QUEUE,
      OR: [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        ...(employeeIds.length > 0 ? [{ entityId: { in: employeeIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          userid: true,
          firstname: true,
          lastname: true,
          email: true,
        },
      },
    },
  });

  return logs.map((log) => {
    let parsed: Record<string, unknown> = {};
    if (log.details) {
      try {
        parsed = JSON.parse(log.details);
      } catch {
        parsed = {};
      }
    }

    const employeeName =
      (parsed.employeeName as string) || (parsed.name as string) || "—";
    const employeeNumber = (parsed.employeeNumber as string) || "";
    const houseNumber = (parsed.houseNumber as string) || "";
    const hid = (parsed.hid as string) || "";
    const employeeId =
      (log.entityId as string) || (parsed.employeeId as string) || null;
    const houseId = (parsed.householdId as string) || null;

    // Determine target link based on decision action
    let targetHref = "/house-queue";
    if (log.action === "ALLOCATE" || log.action === "REASSIGN") {
      targetHref = "/houses/allocated";
    } else if (log.action === "RELEASE") {
      targetHref = "/houses/terminated";
    } else if (parsed.step === "inspection_completed" || parsed.inspectionId) {
      targetHref = "/houses/inspections";
    }

    const actorName = log.user
      ? `${log.user.firstname || ""} ${log.user.lastname || ""}`.trim() ||
        log.user.email ||
        "System"
      : "System";

    return {
      id: log.id,
      action: log.action,
      timestamp: log.createdAt.toISOString(),
      actorName,
      actorEmail: log.user?.email ?? null,
      employeeId,
      employeeName,
      employeeNumber,
      houseId,
      houseNumber,
      hid,
      targetHref,
      details: parsed,
    };
  });
}

/**
 * Fetch cohorts with eligible employees having no house available (`no_house_available` state).
 */
export async function getHamsCohortAlerts(
  organizationId: string,
): Promise<HamsCohortAlert[]> {
  const result = await computeHouseQueueWithActiveConfig(organizationId);

  const alerts: HamsCohortAlert[] = [];
  for (const group of result.gradeGroups) {
    // Count how many in this grade are in 'no_house_available' state
    const blockedRows = result.rows.filter(
      (r) =>
        r.jobGrade === group.grade &&
        r.queueStatus === "no_house_available" &&
        r.houseCategory !== null,
    );

    if (blockedRows.length > 0) {
      // Find how many available houses exist for this category
      const avail = result.availability.find(
        (a) => a.category === group.category,
      );
      alerts.push({
        grade: group.grade,
        category: group.category,
        waitingCount: blockedRows.length,
        availableHouses: avail?.available ?? 0,
      });
    }
  }

  return alerts;
}
