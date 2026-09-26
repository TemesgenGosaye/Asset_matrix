-- CreateTable
CREATE TABLE "assettool"."item_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" VARCHAR(30) NOT NULL,
    "entityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "item_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_requests_userId_idx" ON "assettool"."item_requests"("userId");
CREATE INDEX "item_requests_status_idx" ON "assettool"."item_requests"("status");
CREATE INDEX "item_requests_entityType_entityId_idx" ON "assettool"."item_requests"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "assettool"."item_requests" ADD CONSTRAINT "item_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "assettool"."user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assettool"."item_requests" ADD CONSTRAINT "item_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "assettool"."user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;
