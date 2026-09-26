// Analyze existing household data to understand house number and house type relationship
const pg = require("pg");

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:5683@localhost:5432/assetsup",
  ssl: false,
});

async function main() {
  const client = await pool.connect();

  try {
    // Set search_path to public
    await client.query(`SET search_path TO "public"`);

    console.log("Analyzing existing household data for house number and house type patterns...");

    // Get all households with their types and numbers
    const result = await client.query(
      `SELECT "houseNumber", "houseType", hid, "staffCategory" FROM households ORDER BY "houseNumber"`
    );

    console.log(`\nFound ${result.rows.length} household records:\n`);

    // Group by house type to see patterns
    const typeGroups = {};
    result.rows.forEach(row => {
      if (!typeGroups[row.houseType]) {
        typeGroups[row.houseType] = [];
      }
      typeGroups[row.houseType].push(row);
    });

    console.log("=== HOUSE TYPE GROUPS ===");
    Object.keys(typeGroups).sort().forEach(type => {
      console.log(`\n${type} (${typeGroups[type].length} houses):`);
      typeGroups[type].forEach(house => {
        console.log(`  - ${house.houseNumber} (HID: ${house.hid}, Staff: ${house.staffCategory})`);
      });
    });

    // Analyze house number patterns
    console.log("\n=== HOUSE NUMBER PATTERN ANALYSIS ===");
    const numberPatterns = {};
    result.rows.forEach(row => {
      const firstChar = row.houseNumber.charAt(0);
      if (!numberPatterns[firstChar]) {
        numberPatterns[firstChar] = { types: new Set(), count: 0 };
      }
      numberPatterns[firstChar].types.add(row.houseType);
      numberPatterns[firstChar].count++;
    });

    Object.keys(numberPatterns).sort().forEach(char => {
      const types = Array.from(numberPatterns[char].types).join(', ');
      console.log(`Letter '${char}': ${numberPatterns[char].count} houses, types: [${types}]`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});