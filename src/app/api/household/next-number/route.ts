import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { requireOrgId } from "@/lib/api-route";
import { generateNextHouseNumber, getHouseNumberPrefix } from "@/lib/household";
import { logger } from "@/lib/logger";

// GET /api/household/next-number?houseType=Staff&staffCategory=A
export async function GET(req: NextRequest) {
  try {
    await requireApiAuth();
    const orgId = await requireOrgId();

    const searchParams = req.nextUrl.searchParams;
    const houseType = searchParams.get("houseType");
    const staffCategory = searchParams.get("staffCategory");

    if (!houseType) {
      return NextResponse.json(
        { error: "houseType is required" },
        { status: 400 },
      );
    }

    if (houseType === "Staff" && !staffCategory) {
      return NextResponse.json(
        { error: "staffCategory is required for Staff house type" },
        { status: 400 },
      );
    }

    const prefix = getHouseNumberPrefix(houseType, staffCategory);
    const nextNumber = await generateNextHouseNumber(
      orgId,
      houseType,
      staffCategory,
    );

    return NextResponse.json({ prefix, nextNumber }, { status: 200 });
  } catch (e) {
    logger.error("GET /api/household/next-number error", { error: e });
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate next house number" },
      { status: 400 },
    );
  }
}

export const dynamic = "force-dynamic";