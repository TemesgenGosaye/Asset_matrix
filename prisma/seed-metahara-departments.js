/**
 * Metahara Sugar Factory - Department Master Seed
 * 
 * This script seeds the real production database with official Metahara Sugar Factory departments.
 * Uses raw PostgreSQL for production-grade reliability.
 * 
 * Run with: node prisma/seed-metahara-departments.js
 */

const pg = require("pg");

const isCloudDatabase =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_URL?.includes("supabase") ||
  process.env.DATABASE_URL?.includes("pooler.supabase");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
});

/**
 * Official Metahara Sugar Factory Department Master Book
 * Source: Official organizational structure document
 */
const DEPARTMENTS = [
  // TOP LEVEL MANAGEMENT
  { code: "BOM", name: "Board of Management", parent: null },
  { code: "GM", name: "General Manager / CEO", parent: null },
  
  // MANAGER OFFICE (23) AND SERVICES
  { code: "23", name: "Manager Office", parent: null },
  { code: "23.1", name: "Legal Service", parent: "23" },
  { code: "23.2", name: "Management Service", parent: "23" },
  { code: "23.2.1", name: "Organization and Methods", parent: "23.2" },
  { code: "23.2.2", name: "Planning Business Development and Budget Preparation", parent: "23.2" },
  { code: "23.2.3", name: "Management Information System", parent: "23.2" },
  { code: "23.3", name: "Estate Service", parent: "23" },
  { code: "23.3.1", name: "General Service", parent: "23.3" },
  { code: "23.3.2", name: "Public Relation", parent: "23.3" },
  { code: "23.4", name: "Board of Directors", parent: "23" },
  
  // INDEPENDENT SERVICES
  { code: "55", name: "Audit Service", parent: null },
  { code: "56", name: "Project and Productivity Improvement Office", parent: null },
  
  // SURVEY & CIVIL (12-14)
  { code: "12", name: "Survey", parent: null },
  { code: "13", name: "Civil Work", parent: null },
  { code: "14", name: "L.P.C.D", parent: null },
  { code: "14.1", name: "Cultivation", parent: "14" },
  { code: "14.2", name: "Tillage", parent: "14" },
  
  // PLANTATION (15)
  { code: "15", name: "Plantation", parent: null },
  { code: "15.1", name: "Abadir A", parent: "15" },
  { code: "15.2", name: "Abadir B", parent: "15" },
  { code: "15.3", name: "Abadir C", parent: "15" },
  { code: "15.4", name: "Abadir Extension", parent: "15" },
  { code: "15.5", name: "Abadir Fruit", parent: "15" },
  { code: "15.6", name: "Merti 1st East", parent: "15" },
  { code: "15.7", name: "Merti 1st Awash", parent: "15" },
  { code: "15.8", name: "Merti 2nd Chore", parent: "15" },
  { code: "15.9", name: "Merti 2nd G/Golla", parent: "15" },
  { code: "15.10", name: "Merti 2nd Kenifa", parent: "15" },
  { code: "15.11", name: "Merti 3rd Kikan", parent: "15" },
  { code: "15.12", name: "Merti 3rd South", parent: "15" },
  { code: "15.13", name: "Merti 3rd R.Land", parent: "15" },
  { code: "15.14", name: "North", parent: "15" },
  { code: "15.15", name: "Railway Culture", parent: "15" },
  
  // AGRICULTURE RESEARCH & HARVESTING (16-17)
  { code: "16", name: "Agriculture Research", parent: null },
  { code: "17", name: "Harvesting", parent: null },
  { code: "17.1", name: "Seed Cane & Irrigation", parent: "17" },
  { code: "17.2", name: "Cane Cutting", parent: "17" },
  { code: "17.3", name: "Haulage", parent: "17" },
  
  // FIELD EQUIPMENT SERVICE (18)
  { code: "18", name: "F.E.S", parent: null },
  { code: "18.1", name: "Estate Car & Motor Cycle", parent: "18" },
  { code: "18.2", name: "Heavy Equipment", parent: "18" },
  { code: "18.3", name: "Wheel Tractor", parent: "18" },
  
  // TECHNICAL DEPARTMENT (21)
  { code: "21", name: "Technical", parent: null },
  { code: "21.1", name: "Preventive Maintenance, Extraction and Power Plant", parent: "21" },
  { code: "21.2", name: "Instrument Workshop", parent: "21" },
  { code: "21.3", name: "Electrical Workshop", parent: "21" },
  { code: "21.4", name: "Mechanical Workshop", parent: "21" },
  { code: "21.5", name: "Fabrication Workshop", parent: "21" },
  
  // PRODUCTION (22)
  { code: "22", name: "Production", parent: null },
  
  // FINANCE DEPARTMENT (24)
  { code: "24", name: "Finance Department", parent: null },
  { code: "24.1", name: "General Accounting", parent: "24" },
  { code: "24.2", name: "Cost Accounting", parent: "24" },
  { code: "24.3", name: "Budget Control and Financial Analysis", parent: "24" },
  
  // LOGISTICS (25)
  { code: "25", name: "Logistics", parent: null },
  { code: "25.1", name: "Material Requirement Planning", parent: "25" },
  { code: "25.2", name: "Store Administration", parent: "25" },
  
  // HUMAN RESOURCE DEPARTMENT (26)
  { code: "26", name: "Human Resource Department", parent: null },
  { code: "26.2", name: "Manpower Planning and Training", parent: "26" },
  { code: "26.3", name: "Employment and Administration", parent: "26" },
  { code: "26.4", name: "Employee Relation", parent: "26" },
  
  // FACILITIES (27-29)
  { code: "27", name: "Guest House", parent: null },
  { code: "28", name: "Building", parent: null },
  { code: "29", name: "Park and Lanse", parent: null },
  
  // MEDICAL SERVICE (30)
  { code: "30", name: "Medical Service", parent: null },
  { code: "30.1", name: "Medical Section", parent: "30" },
  { code: "30.2", name: "Public Health", parent: "30" },
  
  // UNIONS & COMMITTEES (31-33)
  { code: "31", name: "W.P.E (Worker Party of Ethiopia)", parent: null },
  { code: "32", name: "Labour Union", parent: null },
  { code: "33", name: "Workers Control Committee", parent: null },
  { code: "33.1", name: "Anti Corruption Office", parent: "33" },
  
  // SECURITY & ENFORCEMENT (34-40)
  { code: "34", name: "Security", parent: null },
  { code: "35", name: "T.D.C.", parent: null },
  { code: "36", name: "REWA", parent: null },
  { code: "36.1", name: "Commercial Department", parent: "36" },
  { code: "37", name: "REYA", parent: null },
  { code: "38", name: "Police", parent: null },
  { code: "39", name: "Fruit", parent: null },
  { code: "40", name: "Customes", parent: null },
  
  // CLUBS & COMMUNITY (50-54)
  { code: "50", name: "Worker Club", parent: null },
  { code: "51", name: "Family Club", parent: null },
  { code: "52", name: "Community Center", parent: null },
  { code: "53", name: "Co-operative Shop", parent: null },
  { code: "54", name: "Wonji – Shoa Training Center", parent: null },
  
  // ADDITIONAL DEPARTMENTS
  { code: "57", name: "Awash Food", parent: null },
];

async function seedDepartments() {
  const client = await pool.connect();
  
  try {
    console.log("🏭 Seeding Metahara Sugar Factory Department Master...\n");
    
    // Get organization
    const orgResult = await client.query(
      'SELECT id, name FROM organizations ORDER BY "createdAt" LIMIT 1'
    );
    
    if (orgResult.rows.length === 0) {
      console.error("❌ No organization found. Create an organization first.");
      process.exit(1);
    }
    
    const org = orgResult.rows[0];
    console.log(`✅ Organization: ${org.name} (${org.id})\n`);
    
    // Build department lookup for parent resolution
    const deptIdMap = new Map();
    let created = 0;
    let updated = 0;
    
    // First pass: Create/update all departments without parent links
    for (const dept of DEPARTMENTS) {
      const checkResult = await client.query(
        'SELECT id FROM departments WHERE code = $1 AND "organizationId" = $2',
        [dept.code, org.id]
      );
      
      if (checkResult.rows.length > 0) {
        // Update existing
        await client.query(
          `UPDATE departments 
           SET name = $1, "updatedAt" = NOW() 
           WHERE code = $2 AND "organizationId" = $3
           RETURNING id`,
          [dept.name, dept.code, org.id]
        );
        deptIdMap.set(dept.code, checkResult.rows[0].id);
        updated++;
        console.log(`  ⊘ ${dept.code.padEnd(10)} - ${dept.name}`);
      } else {
        // Insert new
        const result = await client.query(
          `INSERT INTO departments (id, name, code, "organizationId", "isActive", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())
           RETURNING id`,
          [dept.name, dept.code, org.id]
        );
        deptIdMap.set(dept.code, result.rows[0].id);
        created++;
        console.log(`  ✓ ${dept.code.padEnd(10)} - ${dept.name}`);
      }
    }
    
    console.log("\n🔗 Setting up hierarchical relationships...\n");
    
    // Second pass: Set parent relationships
    let relationships = 0;
    for (const dept of DEPARTMENTS) {
      if (dept.parent) {
        const deptId = deptIdMap.get(dept.code);
        const parentId = deptIdMap.get(dept.parent);
        
        if (deptId && parentId) {
          await client.query(
            'UPDATE departments SET "parentId" = $1 WHERE id = $2',
            [parentId, deptId]
          );
          relationships++;
          console.log(`  🔗 ${dept.code} → ${dept.parent}`);
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⊘ Updated: ${updated}`);
    console.log(`   🔗 Relationships: ${relationships}`);
    console.log(`   📦 Total Departments: ${DEPARTMENTS.length}\n`);
    console.log("✨ Department Master seeded successfully!\n");
    
  } catch (error) {
    console.error("❌ Error seeding departments:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seeder
seedDepartments().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
