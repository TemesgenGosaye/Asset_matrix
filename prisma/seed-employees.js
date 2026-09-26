// Seed 100 employees with Ethiopic names
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

// Ethiopic names
const ethiopicFirstNames = [
  "Abel", "Abraham", "Adam", "Addis", "Abebe", "Abebech", "Abeba", "Abera", "Abebe", "Abiy", "Abiyot", "Adane", "Adugna", "Alem", "Alemayehu", "Alemu", "Ali", "Almaz", "Amha", "Aman", "Ambaw", "Andualem", "Anteneh", "Arega", "Aregahegn", "Argaw", "Araya", "Ashenafi", "Asfaw", "Asrat", "Atsede", "Ayalew", "Ayalneh", "Ayana", "Ayantu", "Azmera", "Befikadu", "Belay", "Belaynesh", "Bereket", "Berhanu", "Bethelhem", "Birtukan", "Bizuayehu", "Dawit", "Demeke", "Demissie", "Dereje", "Debebe", "Elias", "Eleni", "Elfinesh", "Elizabeth", "Emebet", "Ephrem", "Eskinder", "Eyerusalem", "Fantaye", "Feleke", "Fikadu", "Fikre", "Gashaw", "Gebeyaw", "Gebremariam", "Gebremedhin", "Gebre", "Gebrehiwot", "Gedion", "Getachew", "Getu", "Girma", "Girmaw", "Gizachew", "Haile", "Hailemariam", "Hailu", "Hanna", "Hassen", "Haymanot", "Henok", "Hirut", "Kassa", "Kefyalew", "Kebede", "Kidan", "Kidist", "Kiros", "Lemma", "Lidya", "Mahalet", "Makkonen", "Mammo", "Marta", "Marta", "Mekdes", "Mekonnen", "Melaku", "Mekonnen", "Meseret", "Mihret", "Mulu", "Mulat", "Mulatu", "Mulugeta", "Nahom", "Nardos", "Natnael", "Nebiyat", "Netsanet", "Nigist", "Noah", "Rahel", "Rediet", "Sara", "Samuel", "Seble", "Seblewongel", "Selam", "Selamawit", "Sileshi", "Simon", "Solomon", "Sosina", "Tadese", "Tadesse", "Tamirat", "Tegene", "Teguest", "Temesgen", "Teshome", "Tigist", "Tsion", "Wendimagen", "Wondwosen", "Yared", "Yemane", "Yeshi", "Yodit", "Zelalem", "Zenebe", "Zewdu", "Zinash"
];

const ethiopicLastNames = [
  "Abera", "Abebe", "Abraham", "Adam", "Adane", "Adugna", "Alem", "Alemayehu", "Alemu", "Ali", "Almaw", "Amha", "Aman", "Ambaw", "Andualem", "Anteneh", "Arega", "Aregahegn", "Argaw", "Araya", "Ashenafi", "Asfaw", "Asrat", "Atsede", "Ayalew", "Ayalneh", "Ayana", "Ayantu", "Azmera", "Befikadu", "Belay", "Belaynesh", "Bereket", "Berhanu", "Bekele", "Birtukan", "Bizuayehu", "Dawit", "Demeke", "Demissie", "Dereje", "Elias", "Eleni", "Elfinesh", "Emebet", "Ephrem", "Eskinder", "Eyerusalem", "Fantaye", "Feleke", "Fikadu", "Fikre", "Gashaw", "Gebeyaw", "Gebremariam", "Gebremedhin", "Gebre", "Gebrehiwot", "Gedion", "Getachew", "Getu", "Girma", "Girmaw", "Gizachew", "Haile", "Hailemariam", "Hailu", "Hanna", "Hassen", "Haymanot", "Henok", "Hirut", "Kassa", "Kefyalew", "Kebede", "Kidan", "Kidist", "Kiros", "Lemma", "Lidya", "Mahalet", "Makkonen", "Mammo", "Marta", "Mekdes", "Mekonnen", "Melaku", "Meseret", "Mihret", "Mulu", "Mulat", "Mulatu", "Mulugeta", "Nahom", "Nardos", "Natnael", "Nebiyat", "Netsanet", "Nigist", "Rahel", "Rediet", "Sara", "Samuel", "Seble", "Seblewongel", "Selam", "Selamawit", "Sileshi", "Simon", "Solomon", "Sosina", "Tadese", "Tadesse", "Tamirat", "Tegene", "Teguest", "Temesgen", "Teshome", "Tigist", "Tsion", "Wendimagen", "Wondwosen", "Yared", "Yemane", "Yeshi", "Yodit", "Zelalem", "Zenebe", "Zewdu", "Zinash"
];

const jobTitles = [
  "Software Engineer", "Accountant", "Human Resources Manager", "Mechanical Engineer",
  "Electrical Engineer", "Civil Engineer", "Agricultural Engineer", "Finance Manager",
  "Procurement Officer", "Logistics Coordinator", "Medical Doctor", "Nurse",
  "Technical Support", "Maintenance Supervisor", "Administrative Assistant", "Project Manager",
  "Quality Assurance Officer", "Security Officer", "Warehouse Manager", "Farm Supervisor",
  "Production Manager", "Research Scientist", "Training Coordinator", "Legal Advisor",
  "Communications Officer", "Auditor", "Business Analyst", "Operations Manager"
];

const employmentTypes = ["full_time", "part_time", "contract", "intern"];
const employmentStatuses = ["active", "inactive", "on_leave", "terminated"];
const genders = ["Male", "Female"];

// Helper function to get random item from array
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper function to generate random date
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper function to generate employee number
function generateEmployeeNumber(index) {
  return `EMP${String(index + 1).padStart(4, '0')}`;
}

// Helper function to generate email
function generateEmail(firstname, lastname) {
  return `${firstname.toLowerCase()}.${lastname.toLowerCase()}@example.com`;
}

async function main() {
  const client = await pool.connect();

  try {
    // Set search_path to the correct schema
    await client.query(`SET search_path TO "${dbSchema}", public`);

    console.log(`Using schema: ${dbSchema}`);

    // Get organization ID
    const orgResult = await client.query(
      `SELECT id FROM organizations ORDER BY "createdAt" LIMIT 1`
    );

    if (orgResult.rows.length === 0) {
      throw new Error('No organization found. Please create an organization first.');
    }

    const organizationId = orgResult.rows[0].id;
    console.log(`Using organization: ${organizationId}`);

    // Get department IDs for random assignment (optional)
    let departmentIds = [];
    try {
      const deptResult = await client.query(
        `SELECT id FROM department WHERE "organizationId" = $1 LIMIT 20`,
        [organizationId]
      );
      departmentIds = deptResult.rows.map(row => row.id);
      console.log(`Found ${departmentIds.length} departments`);
    } catch (err) {
      console.log('Department table not found, employees will be created without departments');
    }

    // Generate 100 employees
    console.log("Inserting 100 employees with Ethiopic names...");

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < 100; i++) {
      const firstname = getRandomItem(ethiopicFirstNames);
      const lastname = getRandomItem(ethiopicLastNames);
      const employeeNumber = generateEmployeeNumber(i);
      const email = generateEmail(firstname, lastname);
      const jobTitle = getRandomItem(jobTitles);
      const employmentType = getRandomItem(employmentTypes);
      const employmentStatus = getRandomItem(employmentStatuses);
      const gender = getRandomItem(genders);
      const departmentId = departmentIds.length > 0 ? getRandomItem(departmentIds) : null;

      // Generate random hire date between 5-20 years ago
      const hireDate = randomDate(
        new Date(2006, 0, 1),
        new Date(2021, 0, 1)
      );

      // Generate random date of birth between 25-60 years ago
      const dateOfBirth = randomDate(
        new Date(1966, 0, 1),
        new Date(2001, 0, 1)
      );

      // Generate random job grade between 1-15
      const jobGrade = Math.floor(Math.random() * 15) + 1;

      // Check if employee number already exists
      const checkResult = await client.query(
        `SELECT 1 FROM "Employee" WHERE "employeeNumber" = $1 LIMIT 1`,
        [employeeNumber]
      );

      if (checkResult.rows.length === 0) {
        await client.query(
          `INSERT INTO "Employee" (
            "id", "organizationId", "employeeNumber", "firstname", "lastname", 
            "email", "jobTitle", "employmentType", "employmentStatus", "gender",
            "departmentId", "hireDate", "dateOfBirth", "jobGrade", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
          )`,
          [
            organizationId,
            employeeNumber,
            firstname,
            lastname,
            email,
            jobTitle,
            employmentType,
            employmentStatus,
            gender,
            departmentId,
            hireDate,
            dateOfBirth,
            jobGrade
          ]
        );
        inserted++;
      } else {
        skipped++;
      }
    }

    console.log(`✓ Successfully inserted ${inserted} employees`);
    console.log(`✓ Skipped ${skipped} duplicate employee numbers`);
    console.log("Employee seeding complete!");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});