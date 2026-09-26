import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

import {
  GENERAL_ASSET_ITEM_TYPES,
  GENERAL_ASSET_CONDITIONS,
  GENERAL_ASSET_CONDITION_META,
  type GeneralAssetConditionKey,
} from "@/lib/general-asset-presets";

export {
  GENERAL_ASSET_ITEM_TYPES,
  GENERAL_ASSET_CONDITIONS,
  GENERAL_ASSET_CONDITION_META,
  type GeneralAssetConditionKey,
};

/**
 * Deterministic next PID for a given item type prefix in this organization.
 * Format: <PREFIX>-<NNN> (e.g. MCH-001, VEH-004). Falls back to GEN- when no
 * prefix map entry applies.
 */
const ITEM_TYPE_PREFIX: Record<string, string> = {
  "Machinery & Equipment": "MCH",
  "Building & Structure": "BLD",
  "Vehicle & Transport": "VEH",
  "Furniture & Fixture": "FRN",
  "Office Equipment": "OFF",
  "Electrical Equipment": "ELC",
  "Laboratory Equipment": "LAB",
  "Agricultural Equipment": "AGR",
  "Tools & Instruments": "TLS",
  "Safety & Fire Equipment": "SAF",
};

export function getItemTypePrefix(itemType: string): string {
  const prefix = ITEM_TYPE_PREFIX[itemType];
  if (prefix) return prefix;
  return "GEN";
}

export async function generateNextPID(
  orgId: string,
  itemType: string,
  txClient?: Prisma.TransactionClient,
): Promise<string> {
  const client = txClient || prisma;

  // Tune by 27+ years of production asset numbering: never race on a shared
  // keyword, always scope to organization + prefix, and treat missing data
  // gracefully (skip non-conforming PID values).
  const prefix = getItemTypePrefix(itemType);
  const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");

  const existing = await client.generalAsset.findMany({
    where: { organizationId: orgId },
    select: { pid: true },
  });

  let maxNum = 0;
  for (const row of existing) {
    const match = row.pid.trim().match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}