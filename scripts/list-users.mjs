import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function listUsers() {
  try {
    console.log("\n📋 Listing all users in database...\n");
    
    const users = await prisma.user.findMany({
      select: {
        userid: true,
        username: true,
        email: true,
        firstname: true,
        lastname: true,
        isadmin: true,
        isActive: true,
        authProvider: true,
        organizationId: true,
        creation_date: true,
      },
      orderBy: {
        creation_date: 'desc'
      }
    });

    if (users.length === 0) {
      console.log("❌ No users found in database!");
      return;
    }

    console.log(`✅ Found ${users.length} user(s):\n`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.firstname} ${user.lastname}`);
      console.log(`   Username:     ${user.username}`);
      console.log(`   Email:        ${user.email}`);
      console.log(`   Role:         ${user.isadmin ? '🔑 Admin' : '👤 User'}`);
      console.log(`   Status:       ${user.isActive ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   Auth:         ${user.authProvider}`);
      console.log(`   Created:      ${user.creation_date?.toISOString().split('T')[0] || 'N/A'}`);
    });
    
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`\n💡 Total: ${users.length} user(s)`);
    console.log(`   Admins: ${users.filter(u => u.isadmin).length}`);
    console.log(`   Active: ${users.filter(u => u.isActive).length}\n`);

  } catch (error) {
    console.error("❌ Error listing users:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();
