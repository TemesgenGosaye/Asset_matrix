// Seed household records following the strict rules:
// - House types: Staff (categories A-E -> SA#-SE#) and A-E (categories A-E -> A#-E#)
// - HID: canonical 106-90-XXX format (001, 002, ...)
// - RG Type: Regular, Guest
// - Staff Category: A, B, C, D, E (required for Staff houses, null for others)
const pg = require("pg");

const isCloudDatabase =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_URL?.includes("supabase") ||
  process.env.DATABASE_URL?.includes("pooler.supabase");

const dbSchema = process.env.DB_SCHEMA || "public";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
});

const locationNames = [
  "Wonji", "Shoa", "Merti", "Abadir", "Awash", "Metehara", "Wonji-Shoa",
  "North Estate", "South Estate", "East Estate", "West Estate", "Central Block",
  "Staff Colony A", "Staff Colony B", "Staff Colony C", "Executive Block",
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFurnitureCount() {
  return Math.floor(Math.random() * 5);
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query(`SET search_path TO "${dbSchema}", public`);
    console.log(`Using schema: ${dbSchema}`);

    const orgResult = await client.query(
      `SELECT id FROM organizations ORDER BY "createdAt" LIMIT 1`
    );

    if (orgResult.rows.length === 0) {
      throw new Error("No organization found. Please create an organization first.");
    }

    const organizationId = orgResult.rows[0].id;
    console.log(`Using organization: ${organizationId}`);

    let locationIds = [];
    try {
      const locResult = await client.query(
        `SELECT id FROM location WHERE "organizationId" = $1 LIMIT 20`,
        [organizationId]
      );
      locationIds = locResult.rows.map((r) => r.id);
      console.log(`Found ${locationIds.length} locations`);
    } catch {
      console.log("Location table not found, households will be created without location IDs");
    }

    // Build the list of valid households to seed:
    // 1. Staff houses across categories A-E (SA1-SA10, SB1-SB10, SC1-SC10, SD1-SD10, SE1-SE10) = 50
    // 2. Regular category houses A-E (A1-A10, B1-B10, C1-C10, D1-D10, E1-E10) = 50
    // Total = 100 households, strictly valid under the domain rules.
    const plans = [];

    const staffCategories = ["A", "B", "C", "D", "E"];
    for (const cat of staffCategories) {
      for (let n = 1; n <= 10; n++) {
        plans.push({
          houseType: "Staff",
          staffCategory: cat,
          houseNumber: `S${cat}${n}`,
        });
      }
    }

    const regularTypes = ["A", "B", "C", "D", "E"];
    for (const type of regularTypes) {
      for (let n = 1; n <= 10; n++) {
        plans.push({
          houseType: type,
          staffCategory: null,
          houseNumber: `${type}${n}`,
        });
      }
    }

    console.log(`Prepared ${plans.length} strictly valid households to insert.`);

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const hid = `106-90-${String(i + 1).padStart(3, "0")}`;
      const rgType = i % 5 === 0 ? "Guest" : "Regular";
      const locationName = getRandomItem(locationNames);
      const locationId = locationIds.length > 0 ? getRandomItem(locationIds) : null;

      const bedCount = generateFurnitureCount();
      const chairsCount = generateFurnitureCount() + 1;
      const lockerCount = generateFurnitureCount();
      const tablesCount = generateFurnitureCount();

      const status = Math.random() > 0.1 ? "Active" : "Inactive";
      let damageWindow = false;
      let damageDoor = false;
      let damageWaterPanel = false;
      let damageRoof = false;
      let damageWall = false;
      let damageElectricity = false;
      let damageNotes = null;

      if (status === "Inactive") {
        damageWindow = Math.random() > 0.5;
        damageDoor = Math.random() > 0.5;
        damageWaterPanel = Math.random() > 0.7;
        damageRoof = Math.random() > 0.6;
        damageWall = Math.random() > 0.5;
        damageElectricity = Math.random() > 0.7;

        if (damageWindow || damageDoor || damageRoof || damageElectricity) {
          damageNotes = "Minor damages reported during inspection";
        }
      }

      try {
        await client.query(
          `INSERT INTO households (
            id, hid, "houseType", "staffCategory", "houseNumber", "rgType",
            "locationId", "locationName", status, "bedCount", "chairsCount",
            "lockerCount", "tablesCount", "damageWindow", "damageDoor",
            "damageWaterPanel", "damageRoof", "damageWall", "damageElectricity",
            "damageNotes", "organizationId", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()
          )`,
          [
            hid,
            plan.houseType,
            plan.staffCategory,
            plan.houseNumber,
            rgType,
            locationId,
            locationName,
            status,
            bedCount,
            chairsCount,
            lockerCount,
            tablesCount,
            damageWindow,
            damageDoor,
            damageWaterPanel,
            damageRoof,
            damageWall,
            damageElectricity,
            damageNotes,
            organizationId,
          ]
        );
        inserted++;
      } catch (err) {
        if (err.code === "23505") {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    console.log(`✓ Inserted: ${inserted}`);
    console.log(`✓ Skipped duplicates: ${skipped}`);
    console.log("Strict household seeding finished.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
