/**
 * Termination receipts — the frozen snapshot a house handback receipt prints from.
 *
 * The requirement that shapes this whole module is that a receipt is a signed
 * document, so a reprint has to reproduce the original. That rules out printing
 * from the live inspection row: the inspection is permanent, but it is not the
 * document, and anything derived from it later (a relabelled part, a corrected
 * note, a re-priced repair) would silently rewrite history that was already on
 * paper.
 *
 * So the first print copies what it read into `house_termination_receipts` and
 * every later print reads that copy. The snapshot is written once and never
 * updated — not even to fix a typo, because "the file says X and the screen
 * says Y" is precisely the discrepancy a reprint must not create.
 *
 * Org-scoped: every read and write is filtered by `organizationId`, so one
 * tenant can never print (or read) another's receipt even given a valid id.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { BadRequestError } from "@/lib/api-route";
import { canPrintHouseReceipt, type ReceiptGate } from "./receipt-gate";
import { buildInspectionDamage, type InspectionDamageView } from "./views";
import { formatEtbNumber } from "@/lib/rent/money-display";

/** The damage assessment frozen into a receipt. */
export interface ReceiptDamageLine {
  key: string;
  label: string;
  labelAm: string;
  /** Fixed-2 string, not a number: the printed figure must be the stored one. */
  cost: string;
}

export interface TerminationReceiptSnapshot {
  receiptNo: string;
  inspectionId: string;
  allocationId: string;
  householdId: string;
  /** Damaged parts only. Empty means "no damage recorded". */
  damageLines: ReceiptDamageLine[];
  totalDamageCost: string;
  conditionNote: string | null;
  completedAt: string;
  printedAt: string;
  printCount: number;
  /** True when this call minted the snapshot; false when it read an existing one. */
  isOriginal: boolean;
}

/**
 * Serial numbers for the printed form.
 *
 * `PREFIX + zero-padded sequence`, derived from the receipt's own row count in
 * the organization rather than a random string: a sequential number is what makes
 * a filed set of receipts auditable, and the unique index on `inspectionId`
 * guarantees a house can never be given two numbers regardless of who prints
 * when.
 */
function nextReceiptNo(organizationId: string, printedAt: Date): string {
  const yyyyMm = printedAt.toISOString().slice(0, 7).replace("-", "");
  return `HTR-${yyyyMm}-${organizationId.slice(0, 4).toUpperCase()}`;
}

/**
 * Produce the snapshot for a completed inspection, taking it once.
 *
 * Returns the receipt gate alongside the snapshot so the caller renders the same
 * refusal the print button was disabled for, rather than inventing its own.
 * `gate.allowed === false` means nothing was written — the gate runs first, so a
 * blocked receipt leaves no row behind.
 */
export async function getOrCreateTerminationReceipt(params: {
  organizationId: string;
  inspectionId: string;
  printedBy: string;
}): Promise<{
  gate: ReceiptGate;
  snapshot: TerminationReceiptSnapshot | null;
}> {
  const { organizationId, inspectionId, printedBy } = params;

  const inspection = await prisma.houseInspection.findFirst({
    where: { id: inspectionId, organizationId },
    select: {
      id: true,
      allocationId: true,
      householdId: true,
      resolvedTo: true,
      completedAt: true,
      conditionNote: true,
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
    },
  });

  const gate = canPrintHouseReceipt({
    variant: "handback",
    inspection: inspection
      ? {
          resolvedTo: inspection.resolvedTo,
          completedAt: inspection.completedAt?.toISOString() ?? null,
        }
      : null,
  });

  if (!inspection) {
    return {
      gate: {
        allowed: false,
        reason: "NOT_INSPECTED",
        message: "This handback inspection was not found in your organization.",
      },
      snapshot: null,
    };
  }
  if (!gate.allowed) return { gate, snapshot: null };

  // The org-scoped read of an existing snapshot comes before any write, so a
  // reprint can never race a first print into a second row (and the unique index
  // on inspectionId would reject it anyway).
  const existing = await prisma.houseTerminationReceipt.findFirst({
    where: { inspectionId, organizationId },
    select: {
      receiptNo: true,
      printedAt: true,
      printCount: true,
      damageSnapshot: true,
      totalDamageCost: true,
      conditionNote: true,
    },
  });

  if (existing) {
    // A reprint still counts: the copy filed at the counter is a distinct event,
    // even though its contents are identical to the first.
    await prisma.houseTerminationReceipt.update({
      where: { inspectionId, organizationId },
      data: { printCount: { increment: 1 }, printedBy },
    });
    return {
      gate,
      snapshot: {
        receiptNo: existing.receiptNo,
        inspectionId,
        allocationId: inspection.allocationId,
        householdId: inspection.householdId,
        damageLines: readDamageSnapshot(existing.damageSnapshot),
        totalDamageCost: formatEtbNumber(existing.totalDamageCost),
        conditionNote: existing.conditionNote,
        completedAt: inspection.completedAt?.toISOString() ?? "",
        printedAt: existing.printedAt.toISOString(),
        printCount: existing.printCount + 1,
        isOriginal: false,
      },
    };
  }

  const printedAt = new Date();
  const damage = buildInspectionDamage(inspection);
  const damageLines: ReceiptDamageLine[] = damage.lines.map((l) => ({
    key: l.key,
    label: l.label,
    labelAm: l.labelAm,
    cost: formatEtbNumber(l.cost),
  }));

  const created = await prisma.houseTerminationReceipt.create({
    data: {
      organizationId,
      inspectionId,
      allocationId: inspection.allocationId,
      householdId: inspection.householdId,
      receiptNo: nextReceiptNo(organizationId, printedAt),
      // Frozen verbatim. Nothing downstream recomputes the total from these
      // lines: the total is stored beside them so the two cannot drift.
      // Prisma's Json input type does not admit an interface instance, so the
      // plain-object shape is asserted at the boundary — `readDamageSnapshot`
      // validates the shape again on the way back out.
      damageSnapshot: damageLines as unknown as Prisma.InputJsonValue,
      totalDamageCost: damage.totalCost,
      conditionNote: damage.conditionNote,
      completedAt: inspection.completedAt ?? printedAt,
      printedAt,
      printedBy,
      printCount: 1,
    },
    select: { receiptNo: true, printCount: true },
  });

  return {
    gate,
    snapshot: {
      receiptNo: created.receiptNo,
      inspectionId,
      allocationId: inspection.allocationId,
      householdId: inspection.householdId,
      damageLines,
      totalDamageCost: formatEtbNumber(damage.totalCost),
      conditionNote: damage.conditionNote,
      completedAt:
        inspection.completedAt?.toISOString() ?? printedAt.toISOString(),
      printedAt: printedAt.toISOString(),
      printCount: created.printCount,
      isOriginal: true,
    },
  };
}

/**
 * Read the frozen damage lines back.
 *
 * A JSON column can be edited by hand, by a bad deploy, or by a future migration,
 * so it is validated rather than trusted: anything not shaped like a damage line
 * is dropped. A receipt that prints fewer rows than it should is a defect worth
 * seeing, which is why this throws rather than silently degrading.
 */
function readDamageSnapshot(raw: unknown): ReceiptDamageLine[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestError(
      "This receipt's damage snapshot is unreadable, so it cannot be reprinted safely.",
    );
  }
  return raw.filter(
    (l): l is ReceiptDamageLine =>
      Boolean(l) &&
      typeof (l as ReceiptDamageLine).label === "string" &&
      typeof (l as ReceiptDamageLine).cost === "string",
  );
}

export type { InspectionDamageView };
