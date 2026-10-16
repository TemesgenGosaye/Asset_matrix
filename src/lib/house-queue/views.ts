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
import {
  DAMAGE_ITEMS,
  validateDamage,
  type DamageCosts,
  type DamageLine,
  type DamageState,
} from "./damage";
import { isReleasePending, LIVE_ALLOCATION_STATUSES } from "./state";

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
  /**
   * True while the handback is unfinished — the release has been raised but its
   * inspection is not complete yet. The employee still holds the house until
   * that inspection resolves, so these rows belong on this page, flagged rather
   * than silently omitted.
   */
  awaitingHandback: boolean;
  house: AllocationHouseView | null;
  employee: AllocationEmployeeView | null;
}

/**
 * The handback inspection behind an archived termination.
 *
 * Narrower than `AllocationDetailInspectionView` on purpose: the archive list
 * needs the lifecycle fields `canPrintHouseReceipt` consumes plus the inspection
 * id — which is what a receipt is requested by, and the archive prints receipts
 * from exactly the same endpoint the inspections page uses. It deliberately does
 * not carry the damage breakdown: that is read from the frozen snapshot at print
 * time, so listing it here would show figures the paper may not agree with.
 */
export interface TerminatedHouseInspectionView {
  id: string;
  resolvedTo: string | null;
  completedAt: string | null;
}

export interface TerminatedHouseView {
  allocationId: string;
  terminationReason: HouseTerminationReason | null;
  terminatedAt: string | null;
  terminatedByName: string | null;
  note: string | null;
  house: AllocationHouseView | null;
  employee: AllocationEmployeeView | null;
  inspection: TerminatedHouseInspectionView | null;
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
  /** Damaged parts with their costs, plus the total — the receipt's rows. */
  damage: InspectionDamageView;
}

/**
 * A completed inspection's damage assessment.
 *
 * Carries both the derived lines (what a receipt prints) and the raw per-part
 * state and costs (what a read-only checklist renders). The two views of the same
 * facts are computed together by `buildInspectionDamage`, so a row on a table
 * and a row on a printed receipt can never be built from different logic.
 */
export interface InspectionDamageView {
  /** Damaged parts only, in taxonomy order. Empty when nothing is damaged. */
  lines: DamageLine[];
  /** Sum of `lines`. 0 when nothing is damaged. */
  totalCost: number;
  damagedCount: number;
  /** Per-part OK/damaged state, keyed by `checklist*` column name. */
  state: DamageState;
  /** Per-part costs, keyed by `cost*` column name, as strings. */
  costs: DamageCosts;
  conditionNote: string | null;
}

/** Every damage column a completed inspection carries, read in one shape. */
const damageColumnsSelect = {
  checklistWindow: true,
  checklistDoor: true,
  checklistWaterPanel: true,
  checklistRoof: true,
  checklistWall: true,
  checklistElectricity: true,
  costWindow: true,
  costDoor: true,
  costWaterPanel: true,
  costRoof: true,
  costWall: true,
  costElectricity: true,
  totalDamageCost: true,
} as const;

/**
 * Derive the damage view from stored columns.
 *
 * The stored `totalDamageCost` is deliberately NOT trusted here: it is only ever
 * used as the printed figure on a receipt that was snapshotted at print time.
 * For everything else the total is recomputed from the per-part costs by
 * `validateDamage`, which is the same arithmetic the form performed — so a row
 * cannot display a total that disagrees with the items listed directly above it,
 * even if a legacy row's stored total drifted.
 */
export function buildInspectionDamage(row: {
  checklistWindow: boolean;
  checklistDoor: boolean;
  checklistWaterPanel: boolean;
  checklistRoof: boolean;
  checklistWall: boolean;
  checklistElectricity: boolean;
  costWindow: unknown;
  costDoor: unknown;
  costWaterPanel: unknown;
  costRoof: unknown;
  costWall: unknown;
  costElectricity: unknown;
  conditionNote?: string | null;
}): InspectionDamageView {
  const state: DamageState = {};
  const costs: DamageCosts = {};
  for (const item of DAMAGE_ITEMS) {
    state[item.stateKey] = Boolean(
      row[item.stateKey as keyof typeof row] as boolean,
    );
    const raw = row[item.costKey as keyof typeof row];
    // Serialised as a string: a Decimal crossing into a client component becomes
    // a number and loses its scale, and "1250" must not read as 1250 ETB while
    // the stored value is 1250.50.
    costs[item.costKey] =
      raw === null || raw === undefined ? null : String(raw);
  }

  const validated = validateDamage(state, costs);
  return {
    // A stored row can predate the cost columns, in which case a damaged part has
    // no usable cost. Falling back to the raw flags keeps those parts visible as
    // unpriced instead of hiding damage that was genuinely recorded.
    lines: validated.errors.length > 0 ? [] : validated.lines,
    totalCost: validated.errors.length > 0 ? 0 : validated.totalCost,
    damagedCount: DAMAGE_ITEMS.filter((i) => state[i.stateKey]).length,
    state,
    costs,
    conditionNote: row.conditionNote ?? null,
  };
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
  employee: AllocationEmployeeView | null;
  /** 1:1 handback inspection raised when this release terminated the house. */
  inspection: AllocationDetailInspectionView | null;
}

/**
 * Where the handback stands for this inspection.
 *
 * Completing the inspection IS the release gate: the same transaction archives
 * the allocation and returns the house to stock. So these three states are the
 * whole lifecycle, and the worklist needs nothing more to explain itself.
 */
export interface HandbackView {
  status: HandbackStatus;
  /**
   * When the release was finalised, or null while it is still in flight. Sourced
   * from the allocation's `terminatedAt`, which is the same fact that places the
   * house on the Terminated Houses page.
   */
  terminatedAt: string | null;
}

export interface InspectionWorklistView {
  inspectionId: string;
  /** The release row this inspection gates — the id the code is entered against. */
  allocationId: string;
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
  /** The handback damage assessment. Frozen once the inspection is completed. */
  damage: InspectionDamageView;
  handback: HandbackView;
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
    // Not just `allocated`: a release-pending thread still holds its house until
    // the handback inspection is completed. Filtering it out hid pending
    // releases from this page entirely.
    where: {
      organizationId,
      status: { in: [...LIVE_ALLOCATION_STATUSES] },
    },
    orderBy: [{ priorityRank: "asc" }, { employee: { lastname: "asc" } }],
    select: {
      id: true,
      status: true,
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
    awaitingHandback: isReleasePending(r.status),
    house: r.household,
    employee: r.employee ?? null,
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
      /**
       * Membership is decided by `terminatedAt`, never by `status`.
       *
       * `terminatedAt` is the immutable FACT of a termination: it is stamped in
       * the same transaction that archives the release and is never rewritten.
       * `status` is a mutable lifecycle field, and keying on it hid real
       * terminations twice over — rows written as `terminated` by the original
       * release path, and rows whose `status` was later overwritten by a
       * re-allocation. Both carried a complete termination record and neither
       * appeared on this page.
       *
       * This also excludes an in-flight release on its own: a release that has
       * been raised but not completed has chosen a reason yet has no
       * `terminatedAt`, so it stays off this page and remains on Inspections.
       */
      terminatedAt: { not: null },
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
      inspection: {
        select: {
          id: true,
          resolvedTo: true,
          completedAt: true,
        },
      },
    },
  });
  const names = await resolveUserNames(rows.map((r) => r.terminatedBy));

  return rows.map((r) => ({
    allocationId: r.id,
    terminationReason: r.terminationReason,
    terminatedAt: r.terminatedAt?.toISOString() ?? null,
    terminatedByName: r.terminatedBy
      ? (names.get(r.terminatedBy) ?? null)
      : null,
    note: r.reason,
    house: r.household,
    employee: r.employee ?? null,
    inspection: r.inspection
      ? {
          id: r.inspection.id,
          resolvedTo: r.inspection.resolvedTo,
          completedAt: r.inspection.completedAt?.toISOString() ?? null,
        }
      : null,
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
          photoUrls: true,
          ...damageColumnsSelect,
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
    employee: row.employee ?? null,
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
          completedAt: row.inspection.completedAt?.toISOString() ?? null,
          conditionNote: row.inspection.conditionNote,
          damage: buildInspectionDamage(row.inspection),
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
 * Where the handback stands for one inspection row.
 *
 * Derived, never stored: `resolvedTo`/`completedAt` describe the inspection and
 * the allocation's `terminatedAt` describes the release, so the lifecycle can be
 * read off the two facts that already exist. An inspection resolved *and* an
 * allocation archived is a finished release; anything less is still in flight.
 */
function handbackView(row: {
  resolvedTo: string | null;
  completedAt: Date | null;
  allocation: { terminatedAt: Date | null } | null;
}): HandbackView {
  const terminatedAt = row.allocation?.terminatedAt ?? null;
  if (terminatedAt) {
    return { status: "released", terminatedAt: terminatedAt.toISOString() };
  }
  if (row.resolvedTo && row.completedAt) {
    // Resolved but not yet archived: a release that is being finalised right now.
    return { status: "awaiting_release", terminatedAt: null };
  }
  return { status: "awaiting_inspection", terminatedAt: null };
}

/**
 * Where the handback stands for this inspection.
 *
 * Completing the inspection IS the release gate: the same transaction archives
 * the allocation and returns the house to stock. So these three states are the
 * whole lifecycle, and the worklist needs nothing more to explain itself.
 */
export type HandbackStatus =
  "awaiting_inspection" | "awaiting_release" | "released";

export interface InspectionHandbackView {
  status: HandbackStatus;
  /** When the release was finalised, if it has been. */
  terminatedAt: string | null;
}

/**
 * Facility handback-inspection worklist (awaiting / performed inspections).
 * Each inspection links the vacated house with the employee whose release
 * created it, plus the assigned inspector. `status` filters open vs resolved.
 */
export async function listInspections(
  organizationId: string,
  query: {
    status?: "all" | "open" | "resolved";
    search?: string;
  } = {},
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
      ...damageColumnsSelect,
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
          id: true,
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
    allocationId: r.allocation?.id ?? "",
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
    damage: buildInspectionDamage(r),
    handback: handbackView(r),
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
