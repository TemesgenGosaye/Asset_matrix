import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { setNotificationRead, deleteNotification } from "@/lib/notify";

// PATCH /api/notifications/[id] - Mark a notification read/unread.
// Body: { read: boolean } — supports legacy { status: "read"|"sent"|"pending" }.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    let read = true;
    if (typeof body.read === "boolean") {
      read = body.read;
    } else if (typeof body.status === "string") {
      read =
        body.status === "read" ||
        body.status === "sent" ||
        body.status === "pending" ? true : false;
    }

    const ok = await setNotificationRead(session.user.id, id, read);
    if (!ok) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      id,
      read,
      status: read ? "read" : "pending",
    });
  } catch (error) {
    logger.error("Error updating notification", { error });
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 },
    );
  }
}

// DELETE /api/notifications/[id] - Delete a specific notification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ok = await deleteNotification(session.user.id, id);
    if (!ok) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error deleting notification", { error });
    return NextResponse.json(
      { error: "Failed to delete notification" },
      { status: 500 },
    );
  }
}