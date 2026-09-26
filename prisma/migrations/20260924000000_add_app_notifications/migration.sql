-- Migration: Enterprise in-app notification hub
--
-- The in-app ("pull") notification feed — the bell and the Notification
-- Center — moves onto a dedicated table, fully decoupled from the email
-- queue (`notification_queue`). Every system event emits typed, categorized
-- rows through the unified notifier (`src/lib/notify.ts`) so the platform can
-- surface ALL system notifications in one professional feed.
--
-- Idempotent so it can be re-run safely.

-- ── CreateTable app_notification ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."app_notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "category" VARCHAR(30) NOT NULL DEFAULT 'system',
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "icon" TEXT,
    "link" TEXT,
    "metadata" TEXT,
    "readAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "app_notification_userId_readAt_idx" ON "public"."app_notification" ("userId", "readAt");
CREATE INDEX IF NOT EXISTS "app_notification_userId_createdAt_idx" ON "public"."app_notification" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "app_notification_userId_category_idx" ON "public"."app_notification" ("userId", "category");
CREATE INDEX IF NOT EXISTS "app_notification_userId_type_idx" ON "public"."app_notification" ("userId", "type");

ALTER TABLE "public"."app_notification" DROP CONSTRAINT IF EXISTS "app_notification_userId_fkey";
ALTER TABLE "public"."app_notification"
    ADD CONSTRAINT "app_notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."user" ("userid")
    ON DELETE CASCADE ON UPDATE CASCADE;