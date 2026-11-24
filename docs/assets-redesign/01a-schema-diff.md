# 01a — Additive Schema Diff (proposed, NOT applied)

Status: **proposal only**. No migration has been created or run. Apply only after your explicit confirmation (risky point b). All changes are additive/nullable; no existing column, constraint, row, or unique index is removed or weakened.

Baseline: `prisma/schema.prisma`, `prisma/migrations/00000000000000_baseline/migration.sql`, PostgreSQL 16, `pg_trgm` extension already installed (`baseline:5`).

## 1. Prisma schema diff (target)

```prisma
// model asset (prisma/schema.prisma:485-546) — ADD ONLY
model asset {
  // ... all existing fields unchanged, including:
  // assettag   String @unique
  // serialnumber String @unique   <- Property No; uniqueness preserved
  // ...

  // Master List fidelity (all nullable / safe defaults)
  sourceDepartment      String?   @db.VarChar(255)
  categoryCode          String?   @db.VarChar(100)
  serialNo              String?   @db.VarChar(100)
  assetnameRaw          String?
  propertyKey           String?   @db.VarChar(255)   // normalized duplicate-detection key, NOT unique
  financeNo1            String?   @db.VarChar(255)
  condition1            String?   @db.VarChar(50)
  condition1Raw         String?   @db.VarChar(255)
  location1             String?   @db.VarChar(500)
  reviewDate1           DateTime? @db.Date
  reviewDate1Raw        String?   @db.VarChar(255)
  reviewDate1Ambiguous  Boolean   @default(false)
  financeNo2            String?   @db.VarChar(255)
  condition2Raw         String?   @db.VarChar(255)
  location2Raw          String?   @db.VarChar(500)
  reviewDate2Raw        String?   @db.VarChar(255)
  reviewDate2Ambiguous  Boolean   @default(false)
  additionalData        String?
  additionalDataJson    Json?
  sourceRow             Int?
  hiddenInSource        Boolean   @default(false)

  // unchanged: @@index(...) list; new composite/search indexes added below via migration SQL
}

// Extend the existing import job (do NOT introduce a competing batch table)
model ImportJob {
  // ... existing fields unchanged ...
  organizationId String?  @db.Uuid
  fileHash       String?  @db.VarChar(64)    // SHA-256
  mode           String?  @db.VarChar(20)    // "dry-run" | "commit"
  options        Json?
  finishedAt     DateTime? @db.Timestamp(6)  // completedAt remains for compatibility

  rows ImportRowResult[]
}

// Per-row import traceability & rollback data
model ImportRowResult {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  batchId       String   @db.Uuid
  batch         ImportJob @relation(fields: [batchId], references: [id], onDelete: Cascade)
  organizationId String? @db.Uuid
  sheet         String   @db.VarChar(255)
  rowNumber     Int
  status        String   @db.VarChar(20)   // new | update | unchanged | warning | error | skipped
  action        String?  @db.VarChar(20)
  matchKey      String?  @db.VarChar(30)   // propertyNo | fallback
  assetId       String?  @db.Uuid
  propertyKey   String?  @db.VarChar(255)
  warnings      Json?
  errors        Json?
  diff          Json?
  previousValues Json?                      // rollback support for updates
  raw           Json?                       // exact source values, incl. Amharic
  createdAt     DateTime @default(now()) @db.Timestamp(6)

  @@index([batchId])
  @@index([organizationId, batchId])
  @@index([batchId, status])
  @@index([assetId])
  @@map("import_row_results")
  @@schema("public")
}

// Legacy sheet-name → canonical department mapping (auditable, org-scoped)
model DepartmentAlias {
  id              String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String     @db.Uuid
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  alias           String     @db.VarChar(255)   // exact source name, e.g. "Logestic"
  normalizedAlias String     @db.VarChar(255)   // case/space/punctuation folded
  departmentId    String?    @db.Uuid
  department      Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  createdBy       String?    @db.Uuid
  createdAt       DateTime   @default(now()) @db.Timestamp(6)

  @@unique([organizationId, normalizedAlias])
  @@index([organizationId])
  @@index([departmentId])
  @@map("department_aliases")
  @@schema("public")
}
```

`Department` needs the back-reference `aliases DepartmentAlias[]` (no column change). `user` / `Organization` need the standard relation back-references for the new FKs; add only those.

## 2. Migration SQL (to be generated as an additive Prisma migration)

Filename proposal: `prisma/migrations/<timestamp>_fixed_asset_register/migration.sql`.

```sql
-- BEGIN additive changes only
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
  CONSTRAINT "department_aliases_org_alias_key" UNIQUE ("organizationId", "normalizedAlias")
);

-- Indexes needed for 20k+ rows (all IF NOT EXISTS, no locks beyond CREATE INDEX)
CREATE INDEX IF NOT EXISTS "asset_org_department_idx" ON "asset" ("organizationId", "departmentId");
CREATE INDEX IF NOT EXISTS "asset_org_condition_idx" ON "asset" ("organizationId", "statustypeid");
CREATE INDEX IF NOT EXISTS "asset_org_condition1_idx" ON "asset" ("organizationId", "condition1");
CREATE INDEX IF NOT EXISTS "asset_org_categoryCode_idx" ON "asset" ("organizationId", "categoryCode");
CREATE INDEX IF NOT EXISTS "asset_org_propertyKey_idx" ON "asset" ("organizationId", "propertyKey");
CREATE INDEX IF NOT EXISTS "asset_org_sourceDepartment_idx" ON "asset" ("organizationId", "sourceDepartment");
CREATE INDEX IF NOT EXISTS "asset_hidden_source_idx" ON "asset" ("hiddenInSource") WHERE "hiddenInSource" = true;
CREATE INDEX IF NOT EXISTS "asset_financeNo1_trgm_idx" ON "asset" USING gin ("financeNo1" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "asset_financeNo2_trgm_idx" ON "asset" USING gin ("financeNo2" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "asset_additionalData_trgm_idx" ON "asset" USING gin ("additionalData" gin_trgm_ops);
-- assetname/serialnumber trigram indexes are optional: existing plain btree indexes
-- plus the API's ILIKE fallback cover exact/prefix search; add only if profiling shows need.

CREATE INDEX IF NOT EXISTS "import_row_results_batch_idx" ON "import_row_results" ("batchId");
CREATE INDEX IF NOT EXISTS "import_row_results_org_batch_idx" ON "import_row_results" ("organizationId", "batchId");
CREATE INDEX IF NOT EXISTS "import_row_results_batch_status_idx" ON "import_row_results" ("batchId", "status");
CREATE INDEX IF NOT EXISTS "import_row_results_asset_idx" ON "import_row_results" ("assetId");
CREATE INDEX IF NOT EXISTS "department_aliases_org_idx" ON "department_aliases" ("organizationId");
CREATE INDEX IF NOT EXISTS "department_aliases_dept_idx" ON "department_aliases" ("departmentId");

ALTER TABLE "import_row_results"
  ADD CONSTRAINT "import_row_results_batch_fkey"
  FOREIGN KEY ("batchId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_row_results"
  ADD CONSTRAINT "import_row_results_asset_fkey"
  FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "department_aliases"
  ADD CONSTRAINT "department_aliases_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_aliases"
  ADD CONSTRAINT "department_aliases_dept_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- END additive changes only
```

Notes:

- `asset.serialnumber` / `asset.assettag` remain globally `@unique`. Duplicate Property No rows from the Excel are detected and reported by the importer, never auto-merged and never bypass the constraint.
- No `search_vector` generated column is proposed: `/api/asset` already falls back to ILIKE when it is absent, and `pg_trgm` indexes make that path fast. Adding a generated tsvector column would change query semantics and needs separate profiling/approval.
- `ImportJob` is reused; no new "ImportBatch" table competes with it.
- `hiddenInSource BOOLEAN NOT NULL DEFAULT false` is safe: PostgreSQL stores a constant default without rewriting existing rows.

## 3. Backfill note (after migration, before/with import)

- Existing rows: new columns stay `NULL` / `false`; the UI renders blanks for the (1st) group as specified. No destructive or speculative backfill.
- On import of the Excel: each row populates the new columns, sets `sourceRow`, `hiddenInSource`, `propertyKey` (normalized key only), and creates an `ImportRowResult` with the exact raw cell JSON.
- Department aliases are written only after the admin confirms the mapping step; the unique `(organizationId, normalizedAlias)` keeps mappings deterministic.
- Rollback of a committed batch uses `ImportRowResult.previousValues`, is permission-gated and audit-logged, and is disabled when later edits make it unsafe.

## 4. Rollback (reversible)

```sql
DROP TABLE IF EXISTS "department_aliases";
DROP TABLE IF EXISTS "import_row_results";
ALTER TABLE "import_jobs"
  DROP COLUMN IF EXISTS "finishedAt",
  DROP COLUMN IF EXISTS "options",
  DROP COLUMN IF EXISTS "mode",
  DROP COLUMN IF EXISTS "fileHash",
  DROP COLUMN IF EXISTS "organizationId";
ALTER TABLE "asset"
  DROP COLUMN IF EXISTS "hiddenInSource",
  DROP COLUMN IF EXISTS "sourceRow",
  DROP COLUMN IF EXISTS "additionalDataJson",
  DROP COLUMN IF EXISTS "additionalData",
  DROP COLUMN IF EXISTS "reviewDate2Ambiguous",
  DROP COLUMN IF EXISTS "reviewDate2Raw",
  DROP COLUMN IF EXISTS "location2Raw",
  DROP COLUMN IF EXISTS "condition2Raw",
  DROP COLUMN IF EXISTS "financeNo2",
  DROP COLUMN IF EXISTS "reviewDate1Ambiguous",
  DROP COLUMN IF EXISTS "reviewDate1Raw",
  DROP COLUMN IF EXISTS "reviewDate1",
  DROP COLUMN IF EXISTS "location1",
  DROP COLUMN IF EXISTS "condition1Raw",
  DROP COLUMN IF EXISTS "condition1",
  DROP COLUMN IF EXISTS "financeNo1",
  DROP COLUMN IF EXISTS "propertyKey",
  DROP COLUMN IF EXISTS "assetnameRaw",
  DROP COLUMN IF EXISTS "serialNo",
  DROP COLUMN IF EXISTS "categoryCode",
  DROP COLUMN IF EXISTS "sourceDepartment";
```

Indexes are dropped implicitly with their columns/tables; the explicitly-created standalone indexes should also be dropped if the columns remain (e.g. `DROP INDEX IF EXISTS "asset_org_condition1_idx";`).

## 5. Stop point

This is risky point **(a)**: discovery, inventory, field mapping and schema diff complete. I will not create the migration or change application code until you confirm.
