import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getOrganizationContext } from "@/lib/organization-context";
import { previewNextPid } from "@/lib/asset-pid";
import { logger } from "@/lib/logger";

// GET /api/asset/nextPid?categoryId=<uuid>&departmentId=<uuid>
export async function GET(req: NextRequest) {
  try {
    await requireApiAuth();
    const orgCtx = await getOrganizationContext();
    const orgId = orgCtx?.organization?.id;

    const searchParams = req.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const departmentId = searchParams.get("departmentId");

    if (!categoryId || !departmentId) {
      return NextResponse.json(
        { error: "Both categoryId and departmentId are required to preview the PID" },
        { status: 400 },
      );
    }

    const result = await previewNextPid({
      categoryId,
      departmentId,
      orgId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("GET /api/asset/nextPid error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to generate next PID";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";