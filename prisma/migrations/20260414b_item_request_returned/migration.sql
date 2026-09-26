-- Add returnedAt column to item_requests
ALTER TABLE "assettool"."item_requests" ADD COLUMN "returnedAt" TIMESTAMP(6);
