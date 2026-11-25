CREATE INDEX IF NOT EXISTS "asset_organizationId_condition2Raw_idx" ON "asset"("organizationId", "condition2Raw");
CREATE INDEX IF NOT EXISTS "asset_organizationId_sourceDepartment_categoryCode_idx" ON "asset"("organizationId", "sourceDepartment", "categoryCode");
CREATE INDEX IF NOT EXISTS "asset_organizationId_reviewDate1_idx" ON "asset"("organizationId", "reviewDate1");
CREATE INDEX IF NOT EXISTS "asset_organizationId_location1_idx" ON "asset"("organizationId", "location1");
