-- Migration: Update house_allocations table to new simplified structure
-- This preserves existing data while transitioning to the new schema

-- Step 1: Rename old table as backup
ALTER TABLE IF EXISTS public.house_allocations RENAME TO house_allocations_old;

-- Step 2: Create new table with correct structure
CREATE TABLE public.house_allocations (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "householdId" UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'ready_for_allocation',
    "recommendedHouseId" UUID,
    "mcdScore" DOUBLE PRECISION,
    "priorityRank" INTEGER,
    reason VARCHAR(500),
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT house_allocations_pkey PRIMARY KEY (id)
);

-- Step 3: Migrate data from old table to new structure (if old table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'house_allocations_old') THEN
        INSERT INTO public.house_allocations (
            id,
            "organizationId",
            "employeeId",
            "householdId",
            status,
            "mcdScore",
            "priorityRank",
            reason,
            "decidedBy",
            "decidedAt",
            "createdAt",
            "updatedAt"
        )
        SELECT 
            id,
            "organizationId",
            "employeeId",
            "householdId",
            CASE 
                WHEN "lifecycleStatus" = 'allocated' THEN 'allocated'
                WHEN "lifecycleStatus" = 'released' THEN 'released'
                ELSE 'ready_for_allocation'
            END as status,
            "mcdaScore"::DOUBLE PRECISION as "mcdScore",
            "rankAtAllocation" as "priorityRank",
            COALESCE(notes, reason) as reason,
            "allocatedBy" as "decidedBy",
            "approvedAt" as "decidedAt",
            "createdAt",
            COALESCE("releasedAt", "createdAt") as "updatedAt"
        FROM public.house_allocations_old
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Step 4: Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS house_allocations_organizationId_employeeId_key 
    ON public.house_allocations("organizationId", "employeeId");

CREATE INDEX IF NOT EXISTS house_allocations_organizationId_idx 
    ON public.house_allocations("organizationId");

CREATE INDEX IF NOT EXISTS house_allocations_employeeId_idx 
    ON public.house_allocations("employeeId");

CREATE INDEX IF NOT EXISTS house_allocations_householdId_idx 
    ON public.house_allocations("householdId");

CREATE INDEX IF NOT EXISTS house_allocations_status_idx 
    ON public.house_allocations(status);

-- Step 5: Add foreign keys
ALTER TABLE public.house_allocations 
    ADD CONSTRAINT house_allocations_organizationId_fkey 
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.house_allocations 
    ADD CONSTRAINT house_allocations_employeeId_fkey 
    FOREIGN KEY ("employeeId") REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.house_allocations 
    ADD CONSTRAINT house_allocations_householdId_fkey 
    FOREIGN KEY ("householdId") REFERENCES public.households(id) 
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Drop old table (uncomment when data migration is verified)
-- DROP TABLE IF EXISTS public.house_allocations_old;
