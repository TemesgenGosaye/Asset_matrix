import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { markAllRead } from "@/lib/notify";

// POST /api/notifications/read-all - Mark all (optionally category-scoped)
// notifications as read. Body: { category?: "all"|slug }
export async function POST(request: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const category =
      typeof body.category === "string" && body.category !== "all"
        ? (body.category as Parameters<typeof markAllRead>[1])
        : undefined;

    const updated = await markAllRead(session.user.id, category);

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    logger.error("Error marking all notifications read", { error });
    return NextResponse.json(
      { error: "Failed to mark notifications as read" },
      { status: 500 },
    );
  }
}