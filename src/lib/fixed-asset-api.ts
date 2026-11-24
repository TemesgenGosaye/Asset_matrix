import prisma from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/organization-context";
import type { AuthUser } from "@/lib/api-auth";
import type { FixedAssetListParams } from "@/lib/fixed-asset-register";

export interface FixedAssetContext {
  organizationId: string;
  isAdmin: boolean;
  assignedAssetIds: string[];
  availableStatusIds: string[];
}

export async function getFixedAssetContext(
  user: AuthUser,
): Promise<FixedAssetContext> {
  const ctx = await getOrganizationContext();
  const organizationId = user.organizationId ?? ctx?.organization?.id ?? "";
  if (!organizationId) throw new Error("Organization context required");

  const isAdmin = Boolean(user.isAdmin || ctx?.isAdmin);
  const assignedAssetIds: string[] = [];
  const availableStatusIds: string[] = [];
  if (!isAdmin && user.id) {
    const [assignments, statuses] = await Promise.all([
      prisma.userAssets.findMany({
        where: { userid: user.id },
        select: { assetid: true },
      }),
      prisma.statusType.findMany({
        where: {
          OR: [{ organizationId }, { organizationId: null }],
        },
        select: { statustypeid: true, statustypename: true },
      }),
    ]);
    assignedAssetIds.push(...assignments.map((a) => a.assetid));
    availableStatusIds.push(
      ...statuses
        .filter((s) => s.statustypename.toLowerCase().includes("available"))
        .map((s) => s.statustypeid),
    );
  }

  return { organizationId, isAdmin, assignedAssetIds, availableStatusIds };
}

function csv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function bool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

export function parseFixedAssetParams(
  params: URLSearchParams,
): FixedAssetListParams {
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "25");
  const sortOrder = params.get("sortOrder")?.toLowerCase();
  return {
    search: params.get("search") ?? undefined,
    departments: csv(params.get("departments")),
    categoryCodes: csv(params.get("categoryCodes")),
    conditions: csv(params.get("conditions")),
    locations: params.get("locations") ?? undefined,
    reviewFrom: params.get("reviewFrom") ?? undefined,
    reviewTo: params.get("reviewTo") ?? undefined,
    missingProperty: bool(params.get("missingProperty")),
    hidden: bool(params.get("hidden")),
    needsReview: bool(params.get("needsReview")),
    batch: params.get("batch") ?? undefined,
    sortBy: params.get("sortBy") ?? "department",
    sortOrder: sortOrder === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.min(Math.max(Math.floor(pageSize), 1), 25_000)
      : 25,
    groupBy:
      (params.get("groupBy") as FixedAssetListParams["groupBy"]) ?? "none",
  };
}

export function serializeFixedAsset(asset: unknown): Record<string, unknown> {
  const source = asset as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { toNumber?: () => number }).toNumber === "function"
    ) {
      output[key] = (value as { toNumber: () => number }).toNumber();
    } else if (value instanceof Date) {
      output[key] = value.toISOString();
    } else {
      output[key] = value;
    }
  }
  return output;
}
