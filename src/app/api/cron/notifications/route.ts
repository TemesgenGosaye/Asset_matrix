import { NextResponse } from "next/server";
import { runNotificationChecks } from "@/lib/notifications";
import { processEmailQueue } from "@/lib/email";
import { pruneNotifications } from "@/lib/notify";
import { logger } from "@/lib/logger";

/**
 * Cron endpoint for running notification checks and processing the email queue.
 * Secured by CRON_SECRET header (for external cron services like Vercel Cron).
 *
 * Usage: GET /api/cron/notifications
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [notifications, emailQueue] = await Promise.all([
      runNotificationChecks(),
      processEmailQueue(),
    ]);
    const pruned = await pruneNotifications();

    return NextResponse.json(
      {
        success: true,
        notifications,
        emailQueue,
        pruned,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Cron notifications error", { error });
    return NextResponse.json(
      { error: "Failed to run notifications" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
