-- Show current state
SELECT 
  "srNo",
  "houseNumber", 
  "houseType",
  "rgType", 
  "bedCount",
  status
FROM households
ORDER BY "srNo"
LIMIT 50;
