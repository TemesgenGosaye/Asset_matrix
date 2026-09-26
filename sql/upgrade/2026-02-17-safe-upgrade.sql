-- Safe upgrade script for DBs behind codebase
-- Adds ticket system + multi-tenancy tables and columns if missing
-- Intended for PostgreSQL

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core column additions
ALTER TABLE "accessories" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "consumable" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "licence" ADD COLUMN IF NOT EXISTS "organizationId" UUID;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "departmentId" UUID;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organizationId" UUID;

-- Ticket system
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'new',
  "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
  "createdBy" UUID NOT NULL,
  "assignedTo" UUID,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ticket_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticketId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_createdBy_fkey') THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "user"("userid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_assignedTo_fkey') THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_assignedTo_fkey"
      FOREIGN KEY ("assignedTo") REFERENCES "user"("userid")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_comments_ticketId_fkey') THEN
    ALTER TABLE "ticket_comments"
      ADD CONSTRAINT "ticket_comments_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "tickets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_comments_userId_fkey') THEN
    ALTER TABLE "ticket_comments"
      ADD CONSTRAINT "ticket_comments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("userid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Multi-tenancy and related tables
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(50) NOT NULL,
  "description" TEXT,
  "settings" JSONB,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "departments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "organizationId" UUID NOT NULL,
  "parentId" UUID,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "permissions" TEXT[],
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "organizationId" UUID,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "grantedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" UUID,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "url" VARCHAR(500) NOT NULL,
  "secret" VARCHAR(255),
  "events" TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "retryAttempts" INTEGER NOT NULL DEFAULT 3,
  "organizationId" UUID,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "webhookId" UUID NOT NULL,
  "event" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "statusCode" INTEGER,
  "response" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "deliveredAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error" TEXT,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "asset_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assetId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "startDate" TIMESTAMP(6) NOT NULL,
  "endDate" TIMESTAMP(6) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "approvedBy" UUID,
  "approvedAt" TIMESTAMP(6),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "stock_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "consumableId" UUID NOT NULL,
  "minThreshold" INTEGER NOT NULL DEFAULT 10,
  "criticalThreshold" INTEGER NOT NULL DEFAULT 5,
  "emailNotify" BOOLEAN NOT NULL DEFAULT true,
  "webhookNotify" BOOLEAN NOT NULL DEFAULT false,
  "lastAlertSentAt" TIMESTAMP(6),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "entityType" VARCHAR(50) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "errors" JSONB,
  "startedAt" TIMESTAMP(6),
  "completedAt" TIMESTAMP(6),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_organizationId_key" ON "roles"("name", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_alerts_consumableId_key" ON "stock_alerts"("consumableId");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhookId_idx" ON "webhook_deliveries"("webhookId");
CREATE INDEX IF NOT EXISTS "asset_reservations_assetId_idx" ON "asset_reservations"("assetId");
CREATE INDEX IF NOT EXISTS "asset_reservations_userId_idx" ON "asset_reservations"("userId");
CREATE INDEX IF NOT EXISTS "import_jobs_userId_idx" ON "import_jobs"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_organizationId_fkey') THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_parentId_fkey') THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "departments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_organizationId_fkey') THEN
    ALTER TABLE "roles"
      ADD CONSTRAINT "roles_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_userId_fkey') THEN
    ALTER TABLE "user_roles"
      ADD CONSTRAINT "user_roles_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("userid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_roleId_fkey') THEN
    ALTER TABLE "user_roles"
      ADD CONSTRAINT "user_roles_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "roles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhooks_organizationId_fkey') THEN
    ALTER TABLE "webhooks"
      ADD CONSTRAINT "webhooks_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_webhookId_fkey') THEN
    ALTER TABLE "webhook_deliveries"
      ADD CONSTRAINT "webhook_deliveries_webhookId_fkey"
      FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_reservations_assetId_fkey') THEN
    ALTER TABLE "asset_reservations"
      ADD CONSTRAINT "asset_reservations_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "asset"("assetid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_reservations_userId_fkey') THEN
    ALTER TABLE "asset_reservations"
      ADD CONSTRAINT "asset_reservations_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("userid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_alerts_consumableId_fkey') THEN
    ALTER TABLE "stock_alerts"
      ADD CONSTRAINT "stock_alerts_consumableId_fkey"
      FOREIGN KEY ("consumableId") REFERENCES "consumable"("consumableid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_userId_fkey') THEN
    ALTER TABLE "import_jobs"
      ADD CONSTRAINT "import_jobs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("userid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accessories_organizationId_fkey') THEN
    ALTER TABLE "accessories"
      ADD CONSTRAINT "accessories_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_organizationId_fkey') THEN
    ALTER TABLE "asset"
      ADD CONSTRAINT "asset_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consumable_organizationId_fkey') THEN
    ALTER TABLE "consumable"
      ADD CONSTRAINT "consumable_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licence_organizationId_fkey') THEN
    ALTER TABLE "licence"
      ADD CONSTRAINT "licence_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
