import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/organization-context";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

// Check for common abbreviation patterns (e.g. "G/House" vs "Guest House", "Admin" vs "Administration")
function isAbbreviationMatch(a: string, b: string): boolean {
  const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) {
    return Math.min(cleanA.length, cleanB.length) >= 4;
  }
  return false;
}

// GET /api/master-data/duplicates?type=location
export async function GET(req: NextRequest) {
  try {
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") || "location";

    if (type === "location") {
      const locations = await prisma.location.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { locationid: true, locationname: true, normalizedName: true, usageCount: true },
        orderBy: { usageCount: "desc" },
        take: 500, // Top 500 active locations
      });

      const duplicateClusters: {
        primary: { id: string; name: string; usageCount: number };
        candidates: { id: string; name: string; usageCount: number; reason: string }[];
      }[] = [];

      const visited = new Set<string>();

      for (let i = 0; i < locations.length; i++) {
        const item = locations[i];
        if (visited.has(item.locationid)) continue;

        const cluster = [];
        const normA = item.normalizedName || item.locationname?.toLowerCase() || "";

        for (let j = i + 1; j < locations.length; j++) {
          const other = locations[j];
          if (visited.has(other.locationid)) continue;

          const normB = other.normalizedName || other.locationname?.toLowerCase() || "";

          // Check 1: Levenshtein distance <= 2
          const dist = levenshtein(normA, normB);
          if (dist > 0 && dist <= 2 && Math.min(normA.length, normB.length) > 3) {
            cluster.push({
              id: other.locationid,
              name: other.locationname || "",
              usageCount: other.usageCount,
              reason: `Differ by ${dist} letter(s)`,
            });
            visited.add(other.locationid);
            continue;
          }

          // Check 2: Abbreviation match
          if (isAbbreviationMatch(normA, normB)) {
            cluster.push({
              id: other.locationid,
              name: other.locationname || "",
              usageCount: other.usageCount,
              reason: "Possible abbreviation / prefix match",
            });
            visited.add(other.locationid);
          }
        }

        if (cluster.length > 0) {
          visited.add(item.locationid);
          duplicateClusters.push({
            primary: {
              id: item.locationid,
              name: item.locationname || "",
              usageCount: item.usageCount,
            },
            candidates: cluster,
          });
        }
      }

      return NextResponse.json({ clusters: duplicateClusters });
    }

    return NextResponse.json({ clusters: [] });
  } catch (error) {
    logger.error("Failed to find duplicates", { error });
    return NextResponse.json(
      { error: "Failed to detect duplicates", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
