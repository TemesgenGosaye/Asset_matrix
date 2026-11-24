ALTER TABLE "asset"
  ADD COLUMN IF NOT EXISTS "sourceDepartment" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "categoryCode" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "serialNo" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "assetnameRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "propertyKey" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "financeNo1" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "condition1" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "condition1Raw" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "location1" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "reviewDate1" DATE,
  ADD COLUMN IF NOT EXISTS "reviewDate1Raw" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "reviewDate1Ambiguous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "financeNo2" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "condition2Raw" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "location2Raw" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "reviewDate2Raw" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "reviewDate2Ambiguous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "additionalData" TEXT,
  ADD COLUMN IF NOT EXISTS "additionalDataJson" JSONB,
  ADD COLUMN IF NOT EXISTS "sourceRow" INTEGER,
  ADD COLUMN IF NOT EXISTS "hiddenInSource" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "organizationId" UUID,
  ADD COLUMN IF NOT EXISTS "fileHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "mode" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "options" JSONB,
  ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "import_row_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batchId" UUID NOT NULL,
  "organizationId" UUID,
  "sheet" VARCHAR(255) NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "action" VARCHAR(20),
  "matchKey" VARCHAR(30),
  "assetId" UUID,
  "propertyKey" VARCHAR(255),
  "warnings" JSONB,
  "errors" JSONB,
  "diff" JSONB,
  "previousValues" JSONB,
  "raw" JSONB,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT "import_row_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "department_aliases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "alias" VARCHAR(255) NOT NULL,
  "normalizedAlias" VARCHAR(255) NOT NULL,
  "departmentId" UUID,
  "createdBy" UUID,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT "department_aliases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_aliases_organizationId_normalizedAlias_key" UNIQUE ("organizationId", "normalizedAlias")
);

CREATE INDEX IF NOT EXISTS "asset_organizationId_departmentId_idx" ON "asset" ("organizationId", "departmentId");
CREATE INDEX IF NOT EXISTS "asset_organizationId_statustypeid_idx" ON "asset" ("organizationId", "statustypeid");
CREATE INDEX IF NOT EXISTS "asset_organizationId_condition1_idx" ON "asset" ("organizationId", "condition1");
CREATE INDEX IF NOT EXISTS "asset_organizationId_categoryCode_idx" ON "asset" ("organizationId", "categoryCode");
CREATE INDEX IF NOT EXISTS "asset_organizationId_propertyKey_idx" ON "asset" ("organizationId", "propertyKey");
CREATE INDEX IF NOT EXISTS "asset_organizationId_sourceDepartment_idx" ON "asset" ("organizationId", "sourceDepartment");
CREATE INDEX IF NOT EXISTS "asset_hiddenInSource_idx" ON "asset" ("hiddenInSource") WHERE "hiddenInSource" = true;
CREATE INDEX IF NOT EXISTS "asset_financeNo1_trgm_idx" ON "asset" USING gin ("financeNo1" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "asset_financeNo2_trgm_idx" ON "asset" USING gin ("financeNo2" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "asset_additionalData_trgm_idx" ON "asset" USING gin ("additionalData" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "import_row_results_batch_idx" ON "import_row_results" ("batchId");
CREATE INDEX IF NOT EXISTS "import_row_results_org_batch_idx" ON "import_row_results" ("organizationId", "batchId");
CREATE INDEX IF NOT EXISTS "import_row_results_batch_status_idx" ON "import_row_results" ("batchId", "status");
CREATE INDEX IF NOT EXISTS "import_row_results_asset_idx" ON "import_row_results" ("assetId");
CREATE INDEX IF NOT EXISTS "department_aliases_organizationId_idx" ON "department_aliases" ("organizationId");
CREATE INDEX IF NOT EXISTS "department_aliases_departmentId_idx" ON "department_aliases" ("departmentId");

ALTER TABLE "import_row_results"
  ADD CONSTRAINT "import_row_results_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_row_results"
  ADD CONSTRAINT "import_row_results_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "import_row_results"
  ADD CONSTRAINT "import_row_results_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_aliases"
  ADD CONSTRAINT "department_aliases_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_aliases"
  ADD CONSTRAINT "department_aliases_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
