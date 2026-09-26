// Seed essential reference data for the app
// Ensures required status types and categories exist
// Safe to run multiple times — only creates missing entries
// Uses raw SQL to avoid Prisma schema-name mismatch issues
const pg = require("pg");

const isCloudDatabase =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_URL?.includes("supabase") ||
  process.env.DATABASE_URL?.includes("pooler.supabase");

const dbSchema = process.env.DB_SCHEMA || "assettool";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
});

// --- Status Types ---
const STATUS_TYPES = [
  "Active",
  "Available",
  "Pending",
  "Archived",
  "Out for Repair",
  "Lost/Stolen",
  "Retired",
  "Reserved",
  "In Transit",
  "Disposed",
];

// --- Asset Categories ---
const ASSET_CATEGORIES = [
  "Laptop",
  "Desktop",
  "Smartphone",
  "Tablet",
  "Display",
  "Phone",
  "Printer",
  "Server",
  "Network Equipment",
  "Storage Device",
  "Audio/Video Equipment",
  "Furniture",
  "Vehicle",
  "Other",
];

// --- Accessory Categories ---
const ACCESSORY_CATEGORIES = [
  "Keyboard",
  "Mouse",
  "Headset",
  "Webcam",
  "Cable",
  "Adapter",
  "Docking Station",
  "Bag/Case",
  "Charger",
  "Stand/Mount",
  "USB Drive",
  "Other",
];

// --- Consumable Categories ---
const CONSUMABLE_CATEGORIES = [
  "Ink Cartridge",
  "Toner",
  "Paper",
  "Label",
  "Battery",
  "Cleaning Supply",
  "Cable Tie/Velcro",
  "Thermal Paste",
  "Other",
];

// --- Licence Categories ---
const LICENCE_CATEGORIES = [
  "Operating System",
  "Productivity Software",
  "Development Tools",
  "Security Software",
  "Cloud Service",
  "Design Software",
  "Communication Software",
  "Database Software",
  "Other",
];

async function seedTable(client, table, column, values) {
  let created = 0;
  let skipped = 0;
  for (const name of values) {
    const check = await client.query(
      `SELECT 1 FROM "${table}" WHERE LOWER("${column}") = LOWER($1) LIMIT 1`,
      [name],
    );
    if (check.rows.length === 0) {
      await client.query(`INSERT INTO "${table}" ("${column}") VALUES ($1)`, [
        name,
      ]);
      created++;
    } else {
      skipped++;
    }
  }
  return { created, skipped };
}

async function main() {
  const client = await pool.connect();

  try {
    // Set search_path to the correct schema
    await client.query(`SET search_path TO "${dbSchema}", public`);

    console.log(`Using schema: ${dbSchema}`);

    console.log("Seeding status types...");
    const st = await seedTable(
      client,
      "statusType",
      "statustypename",
      STATUS_TYPES,
    );
    console.log(`  ✓ ${st.created} created, ${st.skipped} already existed`);

    console.log("Seeding asset categories...");
    const ac = await seedTable(
      client,
      "assetCategoryType",
      "assetcategorytypename",
      ASSET_CATEGORIES,
    );
    console.log(`  ✓ ${ac.created} created, ${ac.skipped} already existed`);

    console.log("Seeding accessory categories...");
    const acc = await seedTable(
      client,
      "accessorieCategoryType",
      "accessoriecategorytypename",
      ACCESSORY_CATEGORIES,
    );
    console.log(`  ✓ ${acc.created} created, ${acc.skipped} already existed`);

    console.log("Seeding consumable categories...");
    const cc = await seedTable(
      client,
      "consumableCategoryType",
      "consumablecategorytypename",
      CONSUMABLE_CATEGORIES,
    );
    console.log(`  ✓ ${cc.created} created, ${cc.skipped} already existed`);

    console.log("Seeding licence categories...");
    const lc = await seedTable(
      client,
      "licenceCategoryType",
      "licencecategorytypename",
      LICENCE_CATEGORIES,
    );
    console.log(`  ✓ ${lc.created} created, ${lc.skipped} already existed`);

    console.log("Seed complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
