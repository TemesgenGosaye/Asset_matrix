/**
 * scripts/build-and-backfill-masters.ts
 *
 * High-performance, idempotent master builder and backfill script.
 * Reads SELECT DISTINCT values from the `asset` table in PostgreSQL.
 *
 * Safe to run multiple times:
 * - Uses ON CONFLICT on (organizationId, normalizedName)
 * - Chunks batch inserts of 100 items per roundtrip
 * - Groups values differing only by spacing or capitalization into one master entry
 * - Sets the most frequent spelling as the display name
 * - Preserves all raw text columns (location1, location2Raw, condition1Raw, condition2Raw, sourceDepartment, categoryCode)
 * - Sets additive foreign keys (location1Id, locationid, condition1StatusId, statustypeid, assetcategorytypeid, departmentId)
 * - Reports exact matched and unmatched counts
 */

import { config } from "dotenv";
config();
import { Client } from "pg";

const dbUrl = process.env.DATABASE_NEOND_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("No database URL found in environment.");
  process.exit(1);
}

function normalize(val: string | null | undefined): string {
  if (!val) return "";
  return val.trim().replace(/\s+/g, " ").toLowerCase();
}

// Approved condition mappings
const CONDITION_MAPPING: Record<string, string> = {
  // Good variants
  "good": "Good",
  "goood": "Good",
  "god": "Good",
  "dood": "Good",
  "g": "Good",

  // N/F variants
  "n/f": "N/F",
  "n.f": "N/F",
  "n": "N/F",

  // Scrap
  "scrap": "Scrap",

  // Demolished
  "demonshed": "Demolished",
  "demolished": "Demolished",
};

export async function runMasterBuilderAndBackfill() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log("================================================================================");
  console.log("STARTING IDEMPOTENT MASTER BUILDER & BACKFILL (BATCH MODE)");
  console.log("Database:", dbUrl.replace(/:[^:@]+@/, ":***@"));
  console.log("================================================================================");

  // Ensure unique indexes exist for fast ON CONFLICT upserts
  console.log("Ensuring unique indexes on (organizationId, normalizedName)...");
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "location_org_norm_unique_idx" 
    ON "location"("organizationId", "normalizedName") 
    WHERE "normalizedName" IS NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "statusType_org_norm_unique_idx" 
    ON "statusType"("organizationId", "normalizedName") 
    WHERE "normalizedName" IS NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "assetCategoryType_org_norm_unique_idx" 
    ON "assetCategoryType"("organizationId", "normalizedName") 
    WHERE "normalizedName" IS NOT NULL;
  `);

  // 1. Get primary organizationId
  const orgRes = await client.query(`
    SELECT "organizationId", count(*) as count 
    FROM asset 
    WHERE "organizationId" IS NOT NULL 
    GROUP BY "organizationId" 
    ORDER BY count DESC 
    LIMIT 1;
  `);

  if (!orgRes.rows.length) {
    throw new Error("No organization found with assets.");
  }

  const organizationId = orgRes.rows[0].organizationId;
  console.log(`Target Organization ID: ${organizationId} (${orgRes.rows[0].count} assets)\n`);

  // ============================================================================
  // 1. BUILD LOCATION MASTERS (Combined distincts from location1 and location2Raw)
  // ============================================================================
  console.log("--- 1. Building Location Masters from location1 and location2Raw ---");

  const locRawQuery = `
    WITH combined AS (
      SELECT location1 AS raw_val, 1 AS is_loc1, 0 AS is_loc2
      FROM asset
      WHERE location1 IS NOT NULL AND TRIM(location1) != ''
      UNION ALL
      SELECT "location2Raw" AS raw_val, 0 AS is_loc1, 1 AS is_loc2
      FROM asset
      WHERE "location2Raw" IS NOT NULL AND TRIM("location2Raw") != ''
    )
    SELECT 
      raw_val,
      COUNT(*) AS total_count,
      SUM(is_loc1) AS loc1_count,
      SUM(is_loc2) AS loc2_count
    FROM combined
    GROUP BY raw_val;
  `;
  const locRawRes = await client.query(locRawQuery);
  console.log(`Found ${locRawRes.rows.length} total distinct raw location spellings across columns.`);

  interface LocationGroup {
    normalizedName: string;
    displaySpellings: Map<string, number>;
    totalCount: number;
    loc1Count: number;
    loc2Count: number;
  }
  const locationGroups = new Map<string, LocationGroup>();

  for (const row of locRawRes.rows) {
    const rawVal = row.raw_val as string;
    const norm = normalize(rawVal);
    if (!norm) continue;

    let group = locationGroups.get(norm);
    if (!group) {
      group = {
        normalizedName: norm,
        displaySpellings: new Map(),
        totalCount: 0,
        loc1Count: 0,
        loc2Count: 0,
      };
      locationGroups.set(norm, group);
    }
    const cnt = Number(row.total_count);
    group.totalCount += cnt;
    group.loc1Count += Number(row.loc1_count);
    group.loc2Count += Number(row.loc2_count);
    const cleanedSpelling = rawVal.trim().replace(/\s+/g, " ");
    group.displaySpellings.set(cleanedSpelling, (group.displaySpellings.get(cleanedSpelling) || 0) + cnt);
  }

  console.log(`Grouped into ${locationGroups.size} unique normalized location master entries.`);

  // Batch insert into `location` in chunks of 100
  const locList = Array.from(locationGroups.values()).map((g) => {
    let bestSpelling = "";
    let maxFreq = -1;
    for (const [spelling, freq] of g.displaySpellings.entries()) {
      if (freq > maxFreq) {
        maxFreq = freq;
        bestSpelling = spelling;
      }
    }
    return {
      name: bestSpelling,
      normalized: g.normalizedName,
      usageCount: g.totalCount,
    };
  });

  const BATCH_SIZE = 100;
  for (let i = 0; i < locList.length; i += BATCH_SIZE) {
    const batch = locList.slice(i, i + BATCH_SIZE);
    const valueClauses: string[] = [];
    const params: (string | number)[] = [organizationId];

    batch.forEach((item, idx) => {
      const baseIdx = idx * 3 + 2;
      valueClauses.push(`(gen_random_uuid(), $${baseIdx}, $${baseIdx + 1}, true, $${baseIdx + 2}, $1, NOW(), NOW())`);
      params.push(item.name, item.normalized, item.usageCount);
    });

    const insertSql = `
      INSERT INTO location (
        locationid, locationname, "normalizedName", "isActive", "usageCount", 
        "organizationId", creation_date, change_date
      )
      VALUES ${valueClauses.join(", ")}
      ON CONFLICT ("organizationId", "normalizedName") WHERE "normalizedName" IS NOT NULL
      DO UPDATE SET 
        "usageCount" = EXCLUDED."usageCount",
        "isActive" = true,
        change_date = NOW();
    `;
    await client.query(insertSql, params);
  }

  const locCountRes = await client.query(`SELECT COUNT(*) FROM location WHERE "organizationId" = $1;`, [organizationId]);
  console.log(`Total Location rows in master table: ${locCountRes.rows[0].count}`);

  // ============================================================================
  // 2. BUILD CONDITION / STATUS MASTERS (Good, N/F, Scrap, Demolished)
  // ============================================================================
  console.log("\n--- 2. Building Condition / Status Masters (statusType) ---");

  const statusConfigs = [
    { name: "Good", color: "#10b981", isDefault: true },
    { name: "N/F", color: "#ef4444", isDefault: false },
    { name: "Scrap", color: "#6b7280", isDefault: false },
    { name: "Demolished", color: "#f97316", isDefault: false },
  ];

  const statusIdMap = new Map<string, string>(); // master name -> statusId

  for (const st of statusConfigs) {
    const norm = normalize(st.name);
    const res = await client.query(`
      INSERT INTO "statusType" (
        statustypeid, statustypename, "normalizedName", color, "isDefault", "isActive", "usageCount", "organizationId"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, true, 0, $5
      )
      ON CONFLICT ("organizationId", "normalizedName") WHERE "normalizedName" IS NOT NULL
      DO UPDATE SET
        statustypename = EXCLUDED.statustypename,
        color = EXCLUDED.color,
        "isDefault" = EXCLUDED."isDefault",
        "isActive" = true
      RETURNING statustypeid;
    `, [st.name, norm, st.color, st.isDefault, organizationId]);

    const id = res.rows[0].statustypeid;
    statusIdMap.set(st.name, id);
    console.log(`Status Master: ${st.name} -> ID ${id}`);
  }

  // ============================================================================
  // 3. BUILD CATEGORY CODE MASTERS (assetCategoryType)
  // ============================================================================
  console.log("\n--- 3. Building Category Code Masters (assetCategoryType) ---");

  const catRawRes = await client.query(`
    SELECT 
      "categoryCode" as raw_val, 
      COUNT(*) as count 
    FROM asset 
    WHERE "categoryCode" IS NOT NULL AND TRIM("categoryCode") != ''
    GROUP BY "categoryCode";
  `);
  console.log(`Found ${catRawRes.rows.length} distinct category codes in asset.`);

  const catList = catRawRes.rows.map((r) => {
    const raw = (r.raw_val as string).trim();
    return {
      name: raw,
      code: raw,
      normalized: normalize(raw),
      count: Number(r.count),
    };
  });

  for (let i = 0; i < catList.length; i += BATCH_SIZE) {
    const batch = catList.slice(i, i + BATCH_SIZE);
    const valueClauses: string[] = [];
    const params: (string | number)[] = [organizationId];

    batch.forEach((item, idx) => {
      const baseIdx = idx * 4 + 2;
      valueClauses.push(`(gen_random_uuid(), $${baseIdx}, $${baseIdx + 1}, $${baseIdx + 2}, true, $${baseIdx + 3}, $1)`);
      params.push(item.name, item.code, item.normalized, item.count);
    });

    const insertSql = `
      INSERT INTO "assetCategoryType" (
        assetcategorytypeid, assetcategorytypename, "assetTypeCode", "normalizedName", 
        "isActive", "usageCount", "organizationId"
      )
      VALUES ${valueClauses.join(", ")}
      ON CONFLICT ("organizationId", "normalizedName") WHERE "normalizedName" IS NOT NULL
      DO UPDATE SET 
        "assetTypeCode" = EXCLUDED."assetTypeCode",
        "usageCount" = EXCLUDED."usageCount",
        "isActive" = true;
    `;
    await client.query(insertSql, params);
  }

  const catCountRes = await client.query(`SELECT COUNT(*) FROM "assetCategoryType" WHERE "organizationId" = $1;`, [organizationId]);
  console.log(`Total Category rows in master table: ${catCountRes.rows[0].count}`);

  // ============================================================================
  // 4. BACKFILL ASSETS
  // ============================================================================
  console.log("\n--- 4. Running Backfill on 20,715 Assets ---");

  // 4a. Backfill Location 1st (location1Id)
  console.log("Backfilling location1Id...");
  const loc1BackfillRes = await client.query(`
    UPDATE asset a
    SET "location1Id" = l.locationid
    FROM location l
    WHERE l."organizationId" = a."organizationId"
      AND l."normalizedName" = LOWER(TRIM(REGEXP_REPLACE(a.location1, '\\s+', ' ', 'g')))
      AND a.location1 IS NOT NULL 
      AND TRIM(a.location1) != '';
  `);
  console.log(`location1Id backfilled: ${loc1BackfillRes.rowCount} assets matched.`);

  // 4b. Backfill Location 2nd (locationid)
  console.log("Backfilling locationid (Location 2nd)...");
  const loc2BackfillRes = await client.query(`
    UPDATE asset a
    SET locationid = l.locationid
    FROM location l
    WHERE l."organizationId" = a."organizationId"
      AND l."normalizedName" = LOWER(TRIM(REGEXP_REPLACE(a."location2Raw", '\\s+', ' ', 'g')))
      AND a."location2Raw" IS NOT NULL 
      AND TRIM(a."location2Raw") != '';
  `);
  console.log(`locationid (Location 2nd) backfilled: ${loc2BackfillRes.rowCount} assets matched.`);

  // 4c. Backfill Category (assetcategorytypeid)
  console.log("Backfilling assetcategorytypeid...");
  const catBackfillRes = await client.query(`
    UPDATE asset a
    SET assetcategorytypeid = c.assetcategorytypeid
    FROM "assetCategoryType" c
    WHERE c."organizationId" = a."organizationId"
      AND c."normalizedName" = LOWER(TRIM(a."categoryCode"))
      AND a."categoryCode" IS NOT NULL 
      AND TRIM(a."categoryCode") != '';
  `);
  console.log(`assetcategorytypeid backfilled: ${catBackfillRes.rowCount} assets matched.`);

  // 4d. Backfill Condition 1st (condition1StatusId) & Condition 2nd (statustypeid)
  console.log("Backfilling Condition 1st and Condition 2nd...");
  for (const [rawPattern, standardName] of Object.entries(CONDITION_MAPPING)) {
    const targetStatusId = statusIdMap.get(standardName);
    if (!targetStatusId) continue;

    // Condition 1st
    await client.query(`
      UPDATE asset
      SET "condition1StatusId" = $1,
          condition1 = $2
      WHERE "organizationId" = $3
        AND LOWER(TRIM(COALESCE("condition1Raw", condition1))) = $4;
    `, [targetStatusId, standardName, organizationId, rawPattern]);

    // Condition 2nd
    await client.query(`
      UPDATE asset
      SET statustypeid = $1
      WHERE "organizationId" = $2
        AND LOWER(TRIM("condition2Raw")) = $3;
    `, [targetStatusId, organizationId, rawPattern]);
  }

  // 4e. Backfill Department (departmentId) where sourceDepartment matches department name or code
  console.log("Backfilling departmentId for matched sourceDepartment...");
  const deptBackfillRes = await client.query(`
    UPDATE asset a
    SET "departmentId" = d.id,
        "departmentCode" = d.code
    FROM departments d
    WHERE d."organizationId" = a."organizationId"
      AND (
        LOWER(TRIM(d.name)) = LOWER(TRIM(a."sourceDepartment"))
        OR LOWER(TRIM(COALESCE(d.code, ''))) = LOWER(TRIM(a."sourceDepartment"))
      )
      AND (a."departmentId" IS NULL OR a."departmentCode" IS NULL);
  `);
  console.log(`departmentId backfilled: ${deptBackfillRes.rowCount} additional assets updated.`);

  // Recalculate status usageCount
  for (const [name, id] of statusIdMap.entries()) {
    const cntRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM asset 
      WHERE "condition1StatusId" = $1 OR statustypeid = $1;
    `, [id]);
    await client.query(
      `UPDATE "statusType" SET "usageCount" = $1 WHERE statustypeid = $2;`,
      [Number(cntRes.rows[0].count), id]
    );
  }

  // Recalculate department usageCount
  await client.query(`
    WITH counts AS (
      SELECT "departmentId", COUNT(*) as cnt
      FROM asset
      WHERE "departmentId" IS NOT NULL
      GROUP BY "departmentId"
    )
    UPDATE departments d
    SET "sortOrder" = COALESCE(c.cnt, 0)
    FROM counts c
    WHERE d.id = c."departmentId";
  `);

  // ============================================================================
  // 5. AUDIT AND VERIFICATION SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  console.log("FINAL AUDIT & VERIFICATION SUMMARY");
  console.log("================================================================================");

  const auditQuery = `
    SELECT
      COUNT(*) AS total_assets,
      COUNT(location1) AS raw_loc1_present,
      COUNT("location1Id") AS loc1_id_linked,
      COUNT(CASE WHEN location1 IS NOT NULL AND TRIM(location1) != '' AND "location1Id" IS NULL THEN 1 END) AS loc1_unmatched,
      COUNT("location2Raw") AS raw_loc2_present,
      COUNT(locationid) AS loc2_id_linked,
      COUNT(CASE WHEN "location2Raw" IS NOT NULL AND TRIM("location2Raw") != '' AND locationid IS NULL THEN 1 END) AS loc2_unmatched,
      COUNT(COALESCE("condition1Raw", condition1)) AS cond1_present,
      COUNT("condition1StatusId") AS cond1_linked,
      COUNT("condition2Raw") AS cond2_present,
      COUNT(statustypeid) AS cond2_linked,
      COUNT("categoryCode") AS cat_present,
      COUNT(assetcategorytypeid) AS cat_linked,
      COUNT("sourceDepartment") AS dept_raw_present,
      COUNT("departmentId") AS dept_linked
    FROM asset
    WHERE "organizationId" = $1;
  `;
  const auditRes = await client.query(auditQuery, [organizationId]);
  const a = auditRes.rows[0];

  console.table({
    "Location 1st": {
      rawPresent: a.raw_loc1_present,
      linkedToMaster: a.loc1_id_linked,
      unmatched: a.loc1_unmatched,
      coverage: `${((a.loc1_id_linked / a.raw_loc1_present) * 100).toFixed(2)}%`,
    },
    "Location 2nd": {
      rawPresent: a.raw_loc2_present,
      linkedToMaster: a.loc2_id_linked,
      unmatched: a.loc2_unmatched,
      coverage: `${((a.loc2_id_linked / a.raw_loc2_present) * 100).toFixed(2)}%`,
    },
    "Condition 1st": {
      rawPresent: a.cond1_present,
      linkedToMaster: a.cond1_linked,
      unmatched: Number(a.cond1_present) - Number(a.cond1_linked),
      coverage: `${((a.cond1_linked / a.cond1_present) * 100).toFixed(2)}%`,
    },
    "Condition 2nd": {
      rawPresent: a.cond2_present,
      linkedToMaster: a.cond2_linked,
      unmatched: Number(a.cond2_present) - Number(a.cond2_linked),
      coverage: `${((a.cond2_linked / a.cond2_present) * 100).toFixed(2)}%`,
    },
    "Category Code": {
      rawPresent: a.cat_present,
      linkedToMaster: a.cat_linked,
      unmatched: Number(a.cat_present) - Number(a.cat_linked),
      coverage: `${((a.cat_linked / a.cat_present) * 100).toFixed(2)}%`,
    },
    "Department": {
      rawPresent: a.dept_raw_present,
      linkedToMaster: a.dept_linked,
      unmatched: Number(a.dept_raw_present) - Number(a.dept_linked),
      coverage: `${((a.dept_linked / a.dept_raw_present) * 100).toFixed(2)}%`,
    },
  });

  await client.end();
  console.log("Master builder and backfill finished successfully.");
}

// Execute if run directly
if (process.argv[1]?.endsWith("build-and-backfill-masters.ts") || process.argv[1]?.endsWith("build-and-backfill-masters.cjs")) {
  runMasterBuilderAndBackfill().catch((err) => {
    console.error("FATAL ERROR in master builder:", err);
    process.exit(1);
  });
}
