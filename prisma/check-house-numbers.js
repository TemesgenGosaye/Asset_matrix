// Check existing house numbers in the database
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

    console.log("Checking existing house numbers in households table...");

    const result = await client.query(
      `SELECT "houseNumber", hid, "houseType" FROM households LIMIT 10`
    );

    console.log("Existing house numbers:");
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.houseNumber} (HID: ${row.hid}, Type: ${row.houseType})`);
    });

    if (result.rows.length === 0) {
      console.log("No existing households found.");
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});