import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  listNotifications,
  deleteAllNotifications,
} from "@/lib/notify";

const VALID_STATUSES = ["unread", "read", "all"];

// GET /api/notifications - Fetch in-app notifications for the current user.
// Supports: status=unread|read|all (default all), category=<slug>|all,
// search=<q>, limit, offset|page, sort.
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") || "all";
    const status = VALID_STATUSES.includes(statusParam)
      ? (statusParam as "unread" | "read" | "all")
      : "all";

    const category = searchParams.get("category") || "all";
    const search = searchParams.get("search") || "";
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;
    const page =
      Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const result = await listNotifications({
      userId: session.user.id,
      status,
      category,
      search,
      limit,
      offset: (page - 1) * limit,
    });

    return NextResponse.json({
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unread, // backward compat key for the bell badge
      unread: result.unread,
      byCategory: result.byCategory,
      page,
      limit,
    });
  } catch (error) {
    logger.error("Error fetching notifications", { error });
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}

// DELETE /api/notifications - Delete all (optionally category-scoped)
// notifications for the current user.
export async function DELETE(request: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "all";

    const deleted = await deleteAllNotifications(
      session.user.id,
      category,
    );

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    logger.error("Error deleting notifications", { error });
    return NextResponse.json(
      { error: "Failed to delete notifications" },
      { status: 500 },
    );
  }
}