-- REVERT: Restore original descriptive houseType names
BEGIN;

-- Revert Staff → Staff Quarter / Senior Staff
-- We'll use the most common/generic name for each
UPDATE households
SET "houseType" = 'Senior Staff'
WHERE "houseType" = 'Staff';

-- Revert A → Executive Suite
UPDATE households
SET "houseType" = 'Executive Suite'
WHERE "houseType" = 'A';

-- Revert B → Four Bedroom (most common)
UPDATE households
SET "houseType" = 'Four Bedroom'
WHERE "houseType" = 'B';

-- Revert C → Three Bedroom
UPDATE households
SET "houseType" = 'C'
WHERE "houseType" = 'C';

-- Revert D → Two Bedroom
UPDATE households
SET "houseType" = 'Two Bedroom'
WHERE "houseType" = 'D';

-- Revert E → Bachelor Unit (most common)
UPDATE households
SET "houseType" = 'Bachelor Unit'
WHERE "houseType" = 'E';

COMMIT;

-- Show the reverted names
SELECT 
  "houseType",
  "rgType",
  status,
  COUNT(*) as count
FROM households
GROUP BY "houseType", "rgType", status
ORDER BY "houseType", status;
