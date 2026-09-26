import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { computeHouseQueueWithActiveConfig } from "@/lib/house-queue/engine";
import { JOB_GRADE_HOUSE_RULES } from "@/lib/house-queue/eligibility";

// GET /api/house-queue?grade=12&search=john&status=ready_for_allocation
// Live engine output. grade/search/status are display filters only — ranks and
// recommendations are always computed against the full cohort.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("house_queue:view");

    const orgId = await requireOrgId();
    const params = req.nextUrl.searchParams;

    const grades = JOB_GRADE_HOUSE_RULES.map((rule) =>
      Array.from(
        { length: (rule.maxGrade ?? 50) - rule.minGrade + 1 },
        (_, i) => rule.minGrade + i,
      ),
    ).flat();

    const rawGrade = params.get("grade");
    const grade =
      rawGrade && rawGrade !== "all"
        ? Number.parseInt(rawGrade, 10)
        : undefined;
    if (grade !== undefined && !grades.includes(grade)) {
      return NextResponse.json(
        { error: `Invalid grade. Must be one of: ${grades.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await computeHouseQueueWithActiveConfig(orgId, {
      grade: Number.isFinite(grade) ? grade : undefined,
      search: params.get("search") ?? undefined,
      status: params.get("status") ?? undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue",
      message: "Failed to load the house queue",
    });
  }
}