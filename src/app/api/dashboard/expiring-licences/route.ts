import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAuth } from "@/lib/api-auth";
import { scopeToOrganization } from "@/lib/organization-context";
import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EXPIRY_WINDOW_DAYS = 90;

// Returns only licences expiring within the window, computed server-side using
// the (organizationId, expirationdate) index. Previously the widget fetched the
// entire licence table and filtered client-side.
export async function GET() {
  try {
    const user = await requireApiAuth();
    const orgId = user.organizationId;

    const cacheKey = `expiring_licences:${orgId ?? "global"}`;

    const licences = await cached(cacheKey, async () => {
      const now = new Date();
      const windowEnd = new Date(
        now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );

      const where = {
        ...scopeToOrganization({}, orgId),
        expirationdate: {
          gte: now,
          lte: windowEnd,
        },
      };

      return prisma.licence.findMany({
        where,
        orderBy: { expirationdate: "asc" },
        take: 20,
        select: {
          licenceid: true,
          licencekey: true,
          licensedtoemail: true,
          expirationdate: true,
        },
      });
    });

    const nowForExpiry = new Date();
    const items = licences.map((l) => {
      const exp = l.expirationdate!.getTime();
      const daysUntilExpiry = Math.ceil(
        (exp - nowForExpiry.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        licenceid: l.licenceid,
        licencekey: l.licencekey,
        licensedtoemail: l.licensedtoemail,
        expirationdate: l.expirationdate,
        daysUntilExpiry,
      };
    });

    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/dashboard/expiring-licences error", { error });
    return NextResponse.json(
      { error: "Failed to fetch expiring licences" },
      { status: 500 },
    );
  }
}
