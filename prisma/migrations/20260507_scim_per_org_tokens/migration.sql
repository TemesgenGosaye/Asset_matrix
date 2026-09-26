-- Create per-org SCIM token table
CREATE TABLE "assettool"."scim_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token" VARCHAR(255) NOT NULL,
  "organizationId" UUID NOT NULL,
  "description" VARCHAR(255),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID,

  CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scim_tokens_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "assettool"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "scim_tokens_organizationId_idx" ON "assettool"."scim_tokens"("organizationId");

-- Migrate existing global SCIM token to per-org table (assign to first org)
INSERT INTO "assettool"."scim_tokens" ("token", "organizationId", "description")
SELECT
  s."settingValue",
  (SELECT id FROM "assettool"."organizations" LIMIT 1),
  'Migrated from global SCIM config'
FROM "assettool"."system_settings" s
WHERE s."settingKey" = 'scim.bearerToken'
  AND s."settingValue" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "assettool"."organizations");
