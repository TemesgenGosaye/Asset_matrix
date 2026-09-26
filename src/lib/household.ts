import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  HOUSE_NUMBER_FAMILY_REGEX,
  STAFF_CATEGORIES,
  getExpectedHouseNumberPrefix,
} from "@/lib/household-constants";

/**
 * Strictly validates a house-number family on its own, without needing the
 * house type/category context. Accepts only `SA#`–`SE#` and `A#`–`E#`.
 */
export function isValidHouseNumberFamily(houseNumber: string): boolean {
  return HOUSE_NUMBER_FAMILY_REGEX.test(houseNumber.trim());
}

/**
 * Extracts the family prefix (e.g. "SA" from "SA12", "B" from "B3") or
 * returns `null` when the number is not part of a valid family.
 */
export function getHouseNumberFamily(
  houseNumber: string,
): string | null {
  const match = houseNumber.trim().match(/^(S[A-E]|[A-E])/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Returns the expected prefix for a house type + staff category.
 * Throws for combinations outside Staff/SA–SE and A–E so the caller can
 * surface a clear error.
 */
export function getHouseNumberPrefix(
  houseType: string,
  staffCategory?: string | null,
): string {
  const prefix = getExpectedHouseNumberPrefix(houseType, staffCategory);
  if (!prefix) {
    if (houseType === "Staff") {
      if (!staffCategory || !STAFF_CATEGORIES.includes(staffCategory as (typeof STAFF_CATEGORIES)[number])) {
        throw new Error("Staff category (A, B, C, D, E) is required for Staff houses");
      }
    }
    throw new Error(`Invalid house type: ${houseType}`);
  }
  return prefix;
}

export function validateHouseNumberFormat(
  houseNumber: string,
  houseType: string,
  staffCategory?: string | null,
): { valid: boolean; expectedPrefix: string; error?: string } {
  const expectedPrefix = getHouseNumberPrefix(houseType, staffCategory);
  const regex = new RegExp(`^${expectedPrefix}(\\d+)$`);
  if (!regex.test(houseNumber.trim())) {
    return {
      valid: false,
      expectedPrefix,
      error: `House number must start with prefix '${expectedPrefix}' followed by digits (e.g. ${expectedPrefix}1, ${expectedPrefix}2)`,
    };
  }
  return { valid: true, expectedPrefix };
}

export async function generateNextHouseNumber(
  orgId: string,
  houseType: string,
  staffCategory?: string | null,
): Promise<string> {
  const prefix = getHouseNumberPrefix(houseType, staffCategory);

  const existingHouses = await prisma.household.findMany({
    where: {
      organizationId: orgId,
      houseNumber: {
        startsWith: prefix,
      },
    },
    select: { houseNumber: true },
  });

  let maxNum = 0;
  const regex = new RegExp(`^${prefix}(\\d+)$`);

  for (const house of existingHouses) {
    const match = house.houseNumber.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `${prefix}${maxNum + 1}`;
}

export function validateHouseIdFormat(hid: string): boolean {
  return /^106-90-\d{3,}$/.test(hid.trim());
}

export async function generateNextHID(
  orgId: string,
  txClient?: Prisma.TransactionClient,
): Promise<string> {
  const client = txClient || prisma;
  const existingHouses = await client.household.findMany({
    where: { organizationId: orgId },
    select: { hid: true },
  });

  let maxNum = -1;
  const regex = /^106-90-(\d+)$/;

  for (const house of existingHouses) {
    const match = house.hid.trim().match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  const numStr = String(nextNum).padStart(3, "0");
  return `106-90-${numStr}`;
}

