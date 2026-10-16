import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getHamsKpis } from "@/lib/hams/queries";
import { computeHouseQueueWithActiveConfig } from "@/lib/house-queue/engine";
import { CACHE_TTL, cached, orgScope } from "../cache";
import { getActiveConfig } from "@/lib/house-queue/config/service";
import {
  eligibilityBandsToJobGradeRules,
  houseCategoryForJobGrade,
} from "@/lib/house-queue/eligibility";

/**
 * The full queue engine recomputes MCDA across every active employee. Caching
 * it means a burst of assistant questions — or several users on the dashboard
 * at once — costs one computation instead of one per question.
 */
function getCachedQueue(organizationId: string) {
  return cached(`${orgScope(organizationId)}:queue:full`, CACHE_TTL.queue, () =>
    computeHouseQueueWithActiveConfig(organizationId),
  );
}

export function createHousingTools(organizationId: string) {
  return {
    getHousingKpis: tool({
      description:
        "Get high-level housing statistics: total houses, occupancy rate, breakdown by house type, count of vacant/occupied/maintenance houses, and active queue size. Prefer this for any 'how many / what is the breakdown' housing question. It is more expensive than getHouseCounts — use that one when only counts are needed.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const kpis = await getHamsKpis(organizationId);
          return {
            totalHouses: kpis.totalHouses,
            occupancyRate: `${kpis.occupancyRate.toFixed(1)}%`,
            occupiedCount: kpis.occupiedCount,
            vacantCount: kpis.vacantCount,
            maintenanceCount: kpis.maintenanceCount,
            housesByType: kpis.housesByType,
            activeQueueWaitingCount: kpis.activeQueueSize,
            pendingInspectionsHold: kpis.pendingInspectionCount,
            allocationsThisMonth: kpis.thisMonthAllocations,
            allocationsLastMonth: kpis.lastMonthAllocations,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to compute HAMS KPIs: ${message}` };
        }
      },
    }),

    getHouseCounts: tool({
      description:
        "Cheapest housing tool. Returns register totals (Active / Inactive) and occupancy totals (Vacant / Occupied / Maintenance) plus a per-house-type matrix. Use for any 'how many houses' question. Note: 'active' means register status Active; 'vacant' means occupancyStatus Vacant among register-active houses.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await cached(
            `${orgScope(organizationId)}:housing:overview`,
            CACHE_TTL.aggregates,
            async () => {
              const [status, byType] = await Promise.all([
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
                    COUNT(*)::int                                                  AS total,
                    COUNT(*) FILTER (WHERE status = 'Active')::int                 AS active,
                    COUNT(*) FILTER (WHERE status = 'Inactive')::int               AS inactive,
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

              const base = status[0] ?? {
                total: 0,
                active: 0,
                inactive: 0,
                vacant: 0,
                occupied: 0,
                maintenance: 0,
              };

              const matrix = new Map<
                string,
                { occupied: number; vacant: number; maintenance: number }
              >();
              for (const row of byType) {
                const bucket = matrix.get(row.houseType) ?? {
                  occupied: 0,
                  vacant: 0,
                  maintenance: 0,
                };
                if (row.occupancyStatus === "Occupied")
                  bucket.occupied += row._count.id;
                else if (row.occupancyStatus === "Maintenance")
                  bucket.maintenance += row._count.id;
                else bucket.vacant += row._count.id;
                matrix.set(row.houseType, bucket);
              }

              return {
                ...base,
                occupancyRate:
                  base.total > 0
                    ? `${Math.round((base.occupied / base.total) * 100)}%`
                    : "0%",
                activeHousesByType: [...matrix.entries()].map(
                  ([type, counts]) => ({
                    houseType: type,
                    total: counts.occupied + counts.vacant + counts.maintenance,
                    occupied: counts.occupied,
                    vacant: counts.vacant,
                    maintenance: counts.maintenance,
                  }),
                ),
              };
            },
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to count houses: ${message}` };
        }
      },
    }),

    queryHouseQueue: tool({
      description:
        "Query the authoritative live House Queue engine to view top waiting candidates, MCDA priority scores, service years, and recommended houses. Use for anything about who is waiting, who ranks where, or which house a candidate would get.",
      inputSchema: z.object({
        grade: z
          .number()
          .optional()
          .describe("Filter by job grade number (e.g. 7, 8, 9)"),
        status: z
          .enum([
            "ready_for_allocation",
            "no_house_available",
            "allocated",
            "not_eligible",
          ])
          .optional()
          .describe("Filter by queue status"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum candidate rows to return (default 10)"),
      }),
      execute: async ({ grade, status, limit }) => {
        try {
          const queue = await getCachedQueue(organizationId);
          let rows = queue.rows;

          if (grade !== undefined) {
            rows = rows.filter((r) => r.jobGrade === grade);
          }
          if (status) {
            rows = rows.filter((r) => r.queueStatus === status);
          }

          const topRows = rows.slice(0, limit);

          return {
            totalEmployees: queue.summary.totalEmployees,
            totalEligible: queue.summary.eligibleCount,
            returnedCount: topRows.length,
            readyForAllocation: queue.summary.readyCount,
            blockedNoHouse: queue.summary.noHouseCount,
            availableHousesInPool: queue.availability.reduce(
              (sum, a) => sum + a.available,
              0,
            ),
            gradeGroups: queue.gradeGroups,
            availability: queue.availability,
            candidates: topRows.map((r) => ({
              rank: r.priorityRank,
              employeeName: `${r.firstname} ${r.lastname}`.trim(),
              employeeNumber: r.employeeNumber,
              jobGrade: r.jobGrade,
              serviceYears: r.serviceYears,
              priorityScore: r.mcdScore !== null ? r.mcdScore.toFixed(2) : null,
              familySize: r.familySize,
              recommendedHouse: r.recommendedHouseNumber
                ? `${r.recommendedHouseNumber} (${r.houseCategory ?? "untyped"})`
                : "None currently available",
              status: r.queueStatus,
            })),
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to query House Queue: ${message}` };
        }
      },
    }),

    explainEligibility: tool({
      description:
        "Explain the house eligibility rule for a given job grade: which house category the grade maps to, whether the grade is eligible at all, and how many houses of that category are free right now. Use for 'why is X not eligible' and 'what grade gets which house' questions.",
      inputSchema: z.object({
        grade: z.number().describe("The job grade to explain (e.g. 7, 8, 9)"),
      }),
      execute: async ({ grade }) => {
        try {
          const [config, queue] = await Promise.all([
            getActiveConfig(organizationId),
            getCachedQueue(organizationId),
          ]);
          const bands = eligibilityBandsToJobGradeRules(
            config.payload.eligibilityBands,
          );
          const category = houseCategoryForJobGrade(grade, bands);
          const availability = category
            ? queue.availability.find((a) => a.category === category)
            : undefined;
          const group = queue.gradeGroups.find((g) => g.grade === grade);
          const members = queue.rows.filter((r) => r.jobGrade === grade);

          if (!category) {
            return {
              grade,
              eligible: false,
              reason: `Job grade ${grade} does not fall inside any configured eligibility band, so employees at this grade are not eligible for housing allocation under the active configuration (version ${config.versionNumber}).`,
              configuredBands: config.payload.eligibilityBands,
            };
          }

          return {
            grade,
            eligible: true,
            houseCategory: category,
            reason: `Job grade ${grade} maps to the ${category} house category.`,
            employeesAtGrade: members.length,
            readyNow: members.filter(
              (r) => r.queueStatus === "ready_for_allocation",
            ).length,
            blockedNoHouse: members.filter(
              (r) => r.queueStatus === "no_house_available",
            ).length,
            housesInCategory: {
              totalActive: availability?.totalActive ?? 0,
              allocated: availability?.allocated ?? 0,
              available: availability?.available ?? 0,
            },
            configuredBands: config.payload.eligibilityBands,
            configVersion: config.versionNumber,
            weights: config.payload.weights,
            note: group
              ? `${group.total} active employees at grade ${grade}.`
              : "No active employees currently sit at this grade.",
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to explain eligibility: ${message}` };
        }
      },
    }),

    searchHouseholds: tool({
      description:
        "Search houses in the House Hold Register by house number, HID, house type, or occupancy status (Vacant, Occupied, Maintenance).",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("House number or HID (e.g. 'H-104' or 'HID-001')"),
        occupancyStatus: z
          .enum(["Vacant", "Occupied", "Maintenance"])
          .optional()
          .describe("Filter by occupancy status"),
        houseType: z
          .string()
          .optional()
          .describe("Filter by house type (e.g. 'Type A', 'Type B')"),
        limit: z
          .number()
          .optional()
          .default(8)
          .describe("Maximum results to return"),
      }),
      execute: async ({ query, occupancyStatus, houseType, limit }) => {
        const whereClause: Record<string, unknown> = {
          organizationId,
        };

        if (occupancyStatus) {
          whereClause.occupancyStatus = occupancyStatus;
        }

        if (houseType) {
          whereClause.houseType = { contains: houseType, mode: "insensitive" };
        }

        if (query) {
          whereClause.OR = [
            { houseNumber: { contains: query, mode: "insensitive" } },
            { hid: { contains: query, mode: "insensitive" } },
          ];
        }

        const households = await prisma.household.findMany({
          where: whereClause,
          take: limit,
          include: {
            location: { select: { locationname: true } },
            allocations: {
              where: { status: "allocated" },
              take: 1,
              include: {
                employee: {
                  select: {
                    firstname: true,
                    lastname: true,
                    employeeNumber: true,
                    jobTitle: true,
                  },
                },
              },
            },
          },
          orderBy: { houseNumber: "asc" },
        });

        return {
          totalFound: households.length,
          houses: households.map((h) => {
            const currentTenant = h.allocations[0]?.employee;
            return {
              id: h.id,
              houseNumber: h.houseNumber,
              hid: h.hid,
              houseType: h.houseType,
              occupancyStatus: h.occupancyStatus,
              location: h.location?.locationname || h.locationName || "Default",
              inventory: {
                beds: h.bedCount,
                chairs: h.chairsCount,
                lockers: h.lockerCount,
                tables: h.tablesCount,
              },
              currentTenant: currentTenant
                ? `${currentTenant.firstname} ${currentTenant.lastname} (${currentTenant.employeeNumber})`
                : null,
              hasDamage:
                h.damageWindow ||
                h.damageDoor ||
                h.damageWaterPanel ||
                h.damageRoof ||
                h.damageWall ||
                h.damageElectricity,
              damageNotes: h.damageNotes || null,
            };
          }),
        };
      },
    }),

    getInspectionSummary: tool({
      description:
        "Check recent handback inspection reports, damage checklists, and repair hold statuses for vacated houses.",
      inputSchema: z.object({
        houseNumber: z
          .string()
          .optional()
          .describe("Specific house number to query"),
        onlyPending: z
          .boolean()
          .optional()
          .default(false)
          .describe("Only show unresolved inspections"),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe("Max inspections to fetch"),
      }),
      execute: async ({ houseNumber, onlyPending, limit }) => {
        const whereClause: Record<string, unknown> = {
          organizationId,
        };

        if (onlyPending) {
          whereClause.resolvedTo = null;
        }

        const inspections = await prisma.houseInspection.findMany({
          where: whereClause,
          take: limit,
          orderBy: { scheduledDate: "desc" },
          include: {
            allocation: {
              include: {
                household: {
                  select: { houseNumber: true, houseType: true },
                },
                employee: {
                  select: {
                    firstname: true,
                    lastname: true,
                    employeeNumber: true,
                  },
                },
              },
            },
          },
        });

        // Filter by houseNumber in memory if specified
        let filtered = inspections;
        if (houseNumber) {
          const cleanNum = houseNumber.toLowerCase();
          filtered = inspections.filter((i) =>
            i.allocation.household?.houseNumber
              .toLowerCase()
              .includes(cleanNum),
          );
        }

        return {
          count: filtered.length,
          inspections: filtered.map((i) => {
            const damageItems: string[] = [];
            if (i.checklistWindow) damageItems.push("Window");
            if (i.checklistDoor) damageItems.push("Door");
            if (i.checklistWaterPanel) damageItems.push("Water Panel");
            if (i.checklistRoof) damageItems.push("Roof");
            if (i.checklistWall) damageItems.push("Wall");
            if (i.checklistElectricity) damageItems.push("Electricity");

            return {
              id: i.id,
              houseNumber:
                i.allocation.household?.houseNumber || "Unknown House",
              houseType: i.allocation.household?.houseType || "Unknown",
              vacatedBy: i.allocation.employee
                ? `${i.allocation.employee.firstname} ${i.allocation.employee.lastname}`
                : "Unknown",
              scheduledDate: i.scheduledDate
                ? i.scheduledDate.toISOString().split("T")[0]
                : "Pending schedule",
              status: i.resolvedTo
                ? `Resolved (${i.resolvedTo})`
                : "Pending Hold",
              damagesFound:
                damageItems.length > 0
                  ? damageItems
                  : ["None (Good condition)"],
              conditionNotes: i.conditionNote || "No notes",
              photoCount: i.photoCount || i.photoUrls.length,
            };
          }),
        };
      },
    }),
  };
}
