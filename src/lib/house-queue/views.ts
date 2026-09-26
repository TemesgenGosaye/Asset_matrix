/**
 * Read model for the Allocated / Terminated house views.
 *
 * Read-only: these queries never write the ledger. They render the decision
 * state produced by the House Queue service (the single decision-making
 * authority). Dates are serialized to ISO strings so the payloads can flow
 * through RSC to client components unchanged.
 */

import prisma from "@/lib/prisma";
import type { HouseTerminationReason } from "@prisma/client";

const employeeViewSelect = {
  id: true,
  employeeNumber: true,
  firstname: true,
  lastname: true,
  jobGrade: true,
  gender: true,
  maritalStatus: true,
  familySize: true,
  phone: true,
  department: { select: { name: true, code: true } },
} as const;

const householdViewSelect = {
  id: true,
  hid: true,
  houseNumber: true,
  houseType: true,
  rgType: true,
  locationName: true,
  status: true,
  occupancyStatus: true,
  bedCount: true,
  chairsCount: true,
  lockerCount: true,
  tablesCount: true,
} as const;

export interface AllocationEmployeeView {
  id: string;
  employeeNumber: string;
  firstname: string;
  lastname: string;
  jobGrade: number | null;
  gender: string | null;
  maritalStatus: string | null;
  familySize: number | null;
  phone: string | null;
  department: { name: string; code: string | null } | null;
}

export interface AllocationHouseView {
  id: string;
  hid: string;
  houseNumber: string;
  houseType: string;
  rgType: string;
  locationName: string | null;
  status: string;
  occupancyStatus: string;
  bedCount: number;
  chairsCount: number;
  lockerCount: number;
  tablesCount: number;
}

export interface AllocatedHouseView {
  allocationId: string;
  mcdScore: number | null;
  priorityRank: number | null;
  decidedAt: string | null;
  decidedByName: string | null;
  house: AllocationHouseView | null;
  employee: AllocationEmployeeView;
}

export interface TerminatedHouseView {
  allocationId: string;
  terminationReason: HouseTerminationReason | null;
  terminatedAt: string | null;
  terminatedByName: string | null;
  note: string | null;
  house: AllocationHouseView | null;
  employee: AllocationEmployeeView;
}

export interface AllocationDetailInspectionView {
  id: string;
  scheduledDate: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  resolvedTo: string | null;
  completedAt: string | null;
  conditionNote: string | null;
  checklistWindow: boolean;
  checklistDoor: boolean;
  checklistWaterPanel: boolean;
  checklistRoof: boolean;
  checklistWall: boolean;
  checklistElectricity: boolean;
  photoUrls: string[];
}

export interface AllocationDetailView {
  allocationId: string;
  status: string;
  reason: string | null;
  mcdScore: number | null;
  priorityRank: number | null;
  decidedAt: string | null;
  decidedByName: string | null;
  createdAt: string | null;
  terminationReason: HouseTerminationReason | null;
  terminatedAt: string | null;
  terminatedByName: string | null;
  /** Relocation history — true after at least one house move (reassignment). */
  transferred: boolean;
  previousHid: string | null;
  previousHouseNumber: string | null;
  movedAt: string | null;
  moveCount: number;
  house: AllocationHouseView | null;
  employee: AllocationEmployeeView;
  /** 1:1 handback inspection raised when this release terminated the house. */
  inspection: AllocationDetailInspectionView | null;
}

export interface InspectionWorklistView {
  inspectionId: string;
  householdId: string;
  hid: string;
  houseNumber: string;
  houseType: string;
  rgType: string;
  locationName: string | null;
  houseStatus: string;
  occupancyStatus: string;
  vacatedAt: string | null;
  terminationReason: HouseTerminationReason | null;
  inspectorId: string | null;
  inspectorName: string | null;
  scheduledDate: string | null;
  resolvedTo: string | null;
  completedAt: string | null;
  conditionNote: string | null;
  photoCount: number;
  employee: AllocationEmployeeView | null;
}

/** Resolve actor display names for `decidedBy` / `terminatedBy` uuid refs. */
async function resolveUserNames(
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { userid: { in: unique } },
    select: { userid: true, firstname: true, lastname: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.userid, `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim());
  }
  return map;
}

/** All current live allocations, highest priority first. */
export async function listAllocatedHouses(
  organizationId: string,
): Promise<AllocatedHouseView[]> {
  const rows = await prisma.houseAllocation.findMany({
    where: { organizationId, status: "allocated" },
    orderBy: [{ priorityRank: "asc" }, { employee: { lastname: "asc" } }],
    select: {
      id: true,
      mcdScore: true,
      priorityRank: true,
      decidedAt: true,
      decidedBy: true,
      household: { select: householdViewSelect },
      employee: { select: employeeViewSelect },
    },
  });
  const names = await resolveUserNames(rows.map((r) => r.decidedBy));

  return rows.map((r) => ({
    allocationId: r.id,
    mcdScore: r.mcdScore,
    priorityRank: r.priorityRank,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedByName: r.decidedBy ? (names.get(r.decidedBy) ?? null) : null,
    house: r.household,
    employee: r.employee,
  }));
}

/** Terminated (reason-coded release) archive, most recent first. */
export async function listTerminatedHouses(
  organizationId: string,
  terminationReason?: HouseTerminationReason | null,
): Promise<TerminatedHouseView[]> {
  const rows = await prisma.houseAllocation.findMany({
    where: {
      organizationId,
      status: "terminated",
      ...(terminationReason ? { terminationReason } : {}),
    },
    orderBy: [{ terminatedAt: "desc" }, { employee: { lastname: "asc" } }],
    select: {
      id: true,
      terminationReason: true,
      terminatedAt: true,
      terminatedBy: true,
      reason: true,
      household: { select: householdViewSelect },
      employee: { select: employeeViewSelect },
    },
  });
  const names = await resolveUserNames(rows.map((r) => r.terminatedBy));

  return rows.map((r) => ({
    allocationId: r.id,
    terminationReason: r.terminationReason,
    terminatedAt: r.terminatedAt?.toISOString() ?? null,
    terminatedByName: r.terminatedBy ? (names.get(r.terminatedBy) ?? null) : null,
    note: r.reason,
    house: r.household,
    employee: r.employee,
  }));
}

/** Full record behind a single allocation (allocated or terminated). */
export async function getAllocationDetail(
  organizationId: string,
  allocationId: string,
): Promise<AllocationDetailView | null> {
  const row = await prisma.houseAllocation.findFirst({
    where: { id: allocationId, organizationId },
    select: {
      id: true,
      status: true,
      reason: true,
      mcdScore: true,
      priorityRank: true,
      decidedAt: true,
      decidedBy: true,
      createdAt: true,
      terminationReason: true,
      terminatedAt: true,
      terminatedBy: true,
      household: { select: householdViewSelect },
      householdPrev: { select: { hid: true, houseNumber: true } },
      previousHouseholdId: true,
      movedAt: true,
      moveCount: true,
      employee: { select: employeeViewSelect },
      inspection: {
        select: {
          id: true,
          scheduledDate: true,
          inspectorId: true,
          resolvedTo: true,
          completedAt: true,
          conditionNote: true,
          checklistWindow: true,
          checklistDoor: true,
          checklistWaterPanel: true,
          checklistRoof: true,
          checklistWall: true,
          checklistElectricity: true,
          photoUrls: true,
        },
      },
    },
  });
  if (!row) return null;

  const names = await resolveUserNames([
    row.decidedBy,
    row.terminatedBy,
    row.inspection?.inspectorId ?? null,
  ]);

  return {
    allocationId: row.id,
    status: row.status,
    reason: row.reason,
    mcdScore: row.mcdScore,
    priorityRank: row.priorityRank,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedBy ? (names.get(row.decidedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    terminationReason: row.terminationReason,
    terminatedAt: row.terminatedAt?.toISOString() ?? null,
    terminatedByName: row.terminatedBy
      ? (names.get(row.terminatedBy) ?? null)
      : null,
    transferred: Boolean(row.moveCount > 0),
    previousHid: row.householdPrev?.hid ?? null,
    previousHouseNumber: row.householdPrev?.houseNumber ?? null,
    movedAt: row.movedAt?.toISOString() ?? null,
    moveCount: row.moveCount,
    house: row.household,
    employee: row.employee,
    inspection: row.inspection
      ? {
          id: row.inspection.id,
          scheduledDate:
            row.inspection.scheduledDate?.toISOString().slice(0, 10) ?? null,
          inspectorId: row.inspection.inspectorId,
          inspectorName: row.inspection.inspectorId
            ? (names.get(row.inspection.inspectorId) ?? null)
            : null,
          resolvedTo: row.inspection.resolvedTo,
          completedAt:
            row.inspection.completedAt?.toISOString() ?? null,
          conditionNote: row.inspection.conditionNote,
          checklistWindow: row.inspection.checklistWindow,
          checklistDoor: row.inspection.checklistDoor,
          checklistWaterPanel: row.inspection.checklistWaterPanel,
          checklistRoof: row.inspection.checklistRoof,
          checklistWall: row.inspection.checklistWall,
          checklistElectricity: row.inspection.checklistElectricity,
          photoUrls: row.inspection.photoUrls,
        }
      : null,
  };
}

/**
 * Facility handback-inspection worklist (awaiting / performed inspections).
 * Each inspection links the vacated house with the employee whose release
 * created it, plus the assigned inspector. `status` filters open vs resolved.
 */
export async function listInspections(
  organizationId: string,
  query: { status?: "all" | "open" | "resolved"; search?: string } = {},
): Promise<InspectionWorklistView[]> {
  const rows = await prisma.houseInspection.findMany({
    where: {
      organizationId,
      ...(query.status === "open" ? { resolvedTo: null } : {}),
      ...(query.status === "resolved" ? { resolvedTo: { not: null } } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      householdId: true,
      inspectorId: true,
      scheduledDate: true,
      resolvedTo: true,
      completedAt: true,
      conditionNote: true,
      photoUrls: true,
      household: {
        select: {
          hid: true,
          houseNumber: true,
          houseType: true,
          rgType: true,
          locationName: true,
          status: true,
          occupancyStatus: true,
        },
      },
      allocation: {
        select: {
          terminationReason: true,
          terminatedAt: true,
          employee: { select: employeeViewSelect },
        },
      },
    },
  });

  const names = await resolveUserNames(rows.map((r) => r.inspectorId));

  let view: InspectionWorklistView[] = rows.map((r) => ({
    inspectionId: r.id,
    householdId: r.householdId,
    hid: r.household?.hid ?? "",
    houseNumber: r.household?.houseNumber ?? "",
    houseType: r.household?.houseType ?? "",
    rgType: r.household?.rgType ?? "",
    locationName: r.household?.locationName ?? null,
    houseStatus: r.household?.status ?? "",
    occupancyStatus: r.household?.occupancyStatus ?? "",
    vacatedAt: r.allocation?.terminatedAt?.toISOString() ?? null,
    terminationReason: r.allocation?.terminationReason ?? null,
    inspectorId: r.inspectorId,
    inspectorName: r.inspectorId ? (names.get(r.inspectorId) ?? null) : null,
    scheduledDate: r.scheduledDate?.toISOString().slice(0, 10) ?? null,
    resolvedTo: r.resolvedTo,
    completedAt: r.completedAt?.toISOString() ?? null,
    conditionNote: r.conditionNote,
    photoCount: r.photoUrls.length,
    employee: r.allocation?.employee ?? null,
  }));

  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (needle) {
      view = view.filter(
        (r) =>
          r.houseNumber.toLowerCase().includes(needle) ||
          r.hid.toLowerCase().includes(needle) ||
          r.houseType.toLowerCase().includes(needle) ||
          (r.employee &&
            `${r.employee.firstname} ${r.employee.lastname}`
              .toLowerCase()
              .includes(needle)),
      );
    }
  }

  return view;
}