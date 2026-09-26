-- Migration: House Queue engine configuration (versioned draft/publish) + field-level
-- config audit trail + cold inspection archive + photo rollup count.
--
-- Lifecycle guarantees implemented here (DB-level, because Prisma cannot express
-- partial unique indexes):
--   1. At most ONE EngineConfigVersion per organization with status 'active'.
--   2. At most ONE EngineConfigVersion per organization with status 'draft'.
--      (any number of 'archived' rows survive as history for rollback)
--   3. `house_inspections.photoCount` — snapshot of the number of photos before
--      the retention job rolls the URLs up.
-- Idempotent so it can be re-run safely.

-- ── 1. CreateTable engine_config_versions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."engine_config_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "weights" JSONB NOT NULL,
    "eligibilityBands" JSONB NOT NULL,
    "recommendationRules" JSONB NOT NULL,
    "scheduling" JSONB NOT NULL,
    "retentionPolicy" JSONB NOT NULL,
    "changeSummary" VARCHAR(1000),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" UUID,
    "publishedAt" TIMESTAMP(6),
    "supersededById" UUID,

    CONSTRAINT "engine_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "engine_config_versions_organizationId_versionNumber_key" ON "public"."engine_config_versions"("organizationId", "versionNumber");
CREATE INDEX IF NOT EXISTS "engine_config_versions_organizationId_status_idx" ON "public"."engine_config_versions"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "engine_config_versions_organizationId_createdAt_idx" ON "public"."engine_config_versions"("organizationId", "createdAt");

-- At most one ACTIVE and one DRAFT version per organization.
CREATE UNIQUE INDEX IF NOT EXISTS "engine_config_org_active_key"
    ON "public"."engine_config_versions"("organizationId")
    WHERE "status" = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS "engine_config_org_draft_key"
    ON "public"."engine_config_versions"("organizationId")
    WHERE "status" = 'draft';

-- ── 2. CreateTable config_audit_entries ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."config_audit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "fieldPath" VARCHAR(200) NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "action" VARCHAR(30) NOT NULL,
    "changedBy" UUID,
    "changedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(64),
    "changeSummary" VARCHAR(1000),

    CONSTRAINT "config_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "config_audit_entries_organizationId_versionId_idx" ON "public"."config_audit_entries"("organizationId", "versionId");
CREATE INDEX IF NOT EXISTS "config_audit_entries_organizationId_changedAt_idx" ON "public"."config_audit_entries"("organizationId", "changedAt");
CREATE INDEX IF NOT EXISTS "config_audit_entries_action_idx" ON "public"."config_audit_entries"("action");

-- ── 3. house_inspections: photo count snapshot for retention rollup ─────────
ALTER TABLE "public"."house_inspections" ADD COLUMN IF NOT EXISTS "photoCount" INTEGER NOT NULL DEFAULT 0;

-- ── 4. CreateTable house_inspection_archives ───────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."house_inspection_archives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "inspectorId" UUID,
    "scheduledDate" DATE,
    "checklistWindow" BOOLEAN NOT NULL DEFAULT false,
    "checklistDoor" BOOLEAN NOT NULL DEFAULT false,
    "checklistWaterPanel" BOOLEAN NOT NULL DEFAULT false,
    "checklistRoof" BOOLEAN NOT NULL DEFAULT false,
    "checklistWall" BOOLEAN NOT NULL DEFAULT false,
    "checklistElectricity" BOOLEAN NOT NULL DEFAULT false,
    "conditionNote" VARCHAR(1000),
    "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedTo" VARCHAR(20),
    "completedAt" TIMESTAMP(6),
    "completedBy" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coldCompression" VARCHAR(20) NOT NULL DEFAULT 'none',
    "archivedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_inspection_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "house_inspection_archives_organizationId_idx" ON "public"."house_inspection_archives"("organizationId");
CREATE INDEX IF NOT EXISTS "house_inspection_archives_householdId_idx" ON "public"."house_inspection_archives"("householdId");
CREATE INDEX IF NOT EXISTS "house_inspection_archives_archivedAt_idx" ON "public"."house_inspection_archives"("archivedAt");

-- ── 5. Foreign keys (idempotent) ───────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'engine_config_versions_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."engine_config_versions" ADD CONSTRAINT "engine_config_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'config_audit_entries_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."config_audit_entries" ADD CONSTRAINT "config_audit_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'config_audit_entries_versionId_fkey'
    ) THEN
        ALTER TABLE "public"."config_audit_entries" ADD CONSTRAINT "config_audit_entries_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."engine_config_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'house_inspection_archives_organizationId_fkey'
    ) THEN
        ALTER TABLE "public"."house_inspection_archives" ADD CONSTRAINT "house_inspection_archives_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;