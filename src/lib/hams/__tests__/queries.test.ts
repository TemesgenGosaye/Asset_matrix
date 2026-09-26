import { describe, it, expect, vi, beforeEach } from "vitest";

const client = vi.hoisted(() => ({
  household: {
    groupBy: vi.fn(),
    count: vi.fn(),
  },
  houseInspection: {
    count: vi.fn(),
  },
  houseAllocation: {
    count: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  employee: {
    findMany: vi.fn(),
  },
  audit_logs: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ default: client }));

// Mock computeHouseQueueWithActiveConfig
vi.mock("@/lib/house-queue/engine", () => ({
  computeHouseQueueWithActiveConfig: vi.fn().mockResolvedValue({
    rows: [
      {
        jobGrade: 12,
        queueStatus: "no_house_available",
        houseCategory: "B",
      },
      {
        jobGrade: 16,
        queueStatus: "ready_for_allocation",
        houseCategory: "A",
      },
    ],
    gradeGroups: [
      { grade: 16, category: "A", total: 1, ready: 1, allocated: 0 },
      { grade: 12, category: "B", total: 1, ready: 0, allocated: 0 },
    ],
    availability: [
      { category: "Staff", totalActive: 5, allocated: 3, available: 2 },
      { category: "A", totalActive: 4, allocated: 1, available: 3 },
      { category: "B", totalActive: 2, allocated: 2, available: 0 },
      { category: "C", totalActive: 0, allocated: 0, available: 0 },
      { category: "D", totalActive: 0, allocated: 0, available: 0 },
      { category: "E", totalActive: 0, allocated: 0, available: 0 },
    ],
    summary: {
      totalEmployees: 2,
      eligibleCount: 2,
      allocatedCount: 0,
      readyCount: 1,
      noHouseCount: 1,
      notEligibleCount: 0,
    },
  }),
}));

import {
  getHamsKpis,
  getHamsOccupancyByType,
  getHamsRecentActivity,
  getHamsCohortAlerts,
} from "../queries";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as any;

describe("HAMS queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getHamsKpis", () => {
    it("computes KPIs correctly with zero data (fresh org)", async () => {
      mockPrisma.household.groupBy
        .mockResolvedValueOnce([]) // houseGroupByType
        .mockResolvedValueOnce([]); // houseGroupByOccupancy
      mockPrisma.household.count.mockResolvedValue(0); // inactiveDamagedCount
      mockPrisma.houseInspection.count.mockResolvedValue(0); // pendingInspectionCount
      mockPrisma.houseAllocation.count
        .mockResolvedValueOnce(0) // thisMonthAllocations
        .mockResolvedValueOnce(0); // lastMonthAllocations

      const kpis = await getHamsKpis("org-fresh");

      expect(kpis.totalHouses).toBe(0);
      expect(kpis.occupiedCount).toBe(0);
      expect(kpis.vacantCount).toBe(0);
      expect(kpis.occupancyRate).toBe(0);
      expect(kpis.pendingInspectionCount).toBe(0);
      expect(kpis.allocationDelta).toBe(0);
      expect(kpis.inactiveDamagedCount).toBe(0);
    });

    it("computes KPIs correctly with seeded org data", async () => {
      mockPrisma.household.groupBy
        .mockResolvedValueOnce([
          { houseType: "Staff", _count: { id: 6 } },
          { houseType: "A", _count: { id: 4 } },
        ])
        .mockResolvedValueOnce([
          { occupancyStatus: "Occupied", _count: { id: 7 } },
          { occupancyStatus: "Vacant", _count: { id: 3 } },
        ]);
      mockPrisma.household.count.mockResolvedValue(1); // 1 damaged house
      mockPrisma.houseInspection.count.mockResolvedValue(2); // 2 inspection holds
      mockPrisma.houseAllocation.count
        .mockResolvedValueOnce(5) // this month = 5
        .mockResolvedValueOnce(2); // last month = 2 (delta = +3)

      const kpis = await getHamsKpis("org-123");

      expect(kpis.totalHouses).toBe(10);
      expect(kpis.housesByType["Staff"]).toBe(6);
      expect(kpis.housesByType["A"]).toBe(4);
      expect(kpis.occupiedCount).toBe(7);
      expect(kpis.vacantCount).toBe(3);
      expect(kpis.occupancyRate).toBe(70);
      expect(kpis.activeQueueSize).toBe(1); // from mocked engine readyCount
      expect(kpis.pendingInspectionCount).toBe(2);
      expect(kpis.thisMonthAllocations).toBe(5);
      expect(kpis.lastMonthAllocations).toBe(2);
      expect(kpis.allocationDelta).toBe(3);
      expect(kpis.inactiveDamagedCount).toBe(1);
    });
  });

  describe("getHamsOccupancyByType", () => {
    it("returns array across all categories Staff, A-E", async () => {
      mockPrisma.household.groupBy.mockResolvedValue([
        { houseType: "Staff", occupancyStatus: "Occupied", _count: { id: 3 } },
        { houseType: "Staff", occupancyStatus: "Vacant", _count: { id: 2 } },
        { houseType: "A", occupancyStatus: "Occupied", _count: { id: 1 } },
      ]);

      const result = await getHamsOccupancyByType("org-123");

      expect(result).toHaveLength(6);
      const staff = result.find((r) => r.category === "Staff");
      expect(staff).toBeDefined();
      expect(staff?.occupied).toBe(3);
      expect(staff?.vacant).toBe(2);
      expect(staff?.total).toBe(5);

      const catB = result.find((r) => r.category === "B");
      expect(catB).toBeDefined();
      expect(catB?.total).toBe(0);
    });
  });

  describe("getHamsRecentActivity", () => {
    it("scopes by org users/employees and maps decision details", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ userid: "u1" }]);
      mockPrisma.employee.findMany.mockResolvedValue([{ id: "e1" }]);
      mockPrisma.audit_logs.findMany.mockResolvedValue([
        {
          id: "log-1",
          action: "ALLOCATE",
          entity: "house_queue",
          entityId: "e1",
          details: JSON.stringify({
            employeeName: "John Doe",
            employeeNumber: "EMP-001",
            houseNumber: "A-12",
            hid: "HID-12",
          }),
          createdAt: new Date("2026-09-20T10:00:00Z"),
          user: {
            userid: "u1",
            firstname: "Admin",
            lastname: "User",
            email: "admin@msf.org",
          },
        },
      ]);

      const activities = await getHamsRecentActivity("org-123");

      expect(activities).toHaveLength(1);
      expect(activities[0].action).toBe("ALLOCATE");
      expect(activities[0].employeeName).toBe("John Doe");
      expect(activities[0].houseNumber).toBe("A-12");
      expect(activities[0].actorName).toBe("Admin User");
      expect(activities[0].targetHref).toBe("/houses/allocated");
    });
  });

  describe("getHamsCohortAlerts", () => {
    it("identifies cohorts with no house available", async () => {
      const alerts = await getHamsCohortAlerts("org-123");

      expect(alerts).toHaveLength(1);
      expect(alerts[0].grade).toBe(12);
      expect(alerts[0].category).toBe("B");
      expect(alerts[0].waitingCount).toBe(1);
      expect(alerts[0].availableHouses).toBe(0);
    });
  });
});
