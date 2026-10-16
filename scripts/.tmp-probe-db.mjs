import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const users = await prisma.user.findMany({
  take: 10,
  select: { userid: true, username: true, email: true, isadmin: true, isActive: true, organizationId: true, authProvider: true },
});
console.log(JSON.stringify(users, null, 2));

const emps = await prisma.employee.findMany({
  where: { organizationId: users[0]?.organizationId ?? undefined },
  take: 6,
  select: { employeeNumber: true, firstname: true, lastname: true, jobGrade: true, employmentStatus: true, houseCategory: true },
});
console.log("employees:", JSON.stringify(emps, null, 2));

await pool.end();