import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const PASSWORD = "SmokeTest!2026";

const ORG_ID = "9c0ea419-d7fb-48bf-be11-64b8fc47927f";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.update({
    where: { userid: "4922c53f-9492-4c73-a126-f2d87bbdf0a7" },
    data: { password: hash, isActive: true },
    select: { userid: true, username: true, email: true, isadmin: true },
  });
  console.log("user:", user);

  await prisma.accounts.deleteMany({
    where: { userId: user.userid, providerId: "credential" },
  });
  await prisma.accounts.create({
    data: {
      userId: user.userid,
      providerId: "credential",
      accountId: user.userid,
      issuer: "local:credential",
      password: hash,
    },
  });

  await prisma.userRole.deleteMany({ where: { userId: user.userid } });
  const existing = await prisma.role.findFirst({ where: { name: "Smoke Super Admin" } });
  const role = existing
    ? await prisma.role.update({
        where: { id: existing.id },
        data: {
          permissions: [
            "house_request:create",
            "house_request:manage",
            "house_queue:view",
            "house_queue:manage",
            "house_queue:allocate",
            "employee:view",
            "employee:sensitive_view",
          ],
        },
      })
    : await prisma.role.create({
        data: {
          name: "Smoke Super Admin",
          organizationId: ORG_ID,
          isSystem: false,
          permissions: [
            "house_request:create",
            "house_request:manage",
            "house_queue:view",
            "house_queue:manage",
            "house_queue:allocate",
            "employee:view",
            "employee:sensitive_view",
          ],
        },
      });
  await prisma.userRole.create({ data: { userId: user.userid, roleId: role.id } });

  const emps = await prisma.employee.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    take: 10,
    orderBy: { employeeNumber: "asc" },
    select: {
      employeeNumber: true,
      firstname: true,
      lastname: true,
      jobGrade: true,
      employmentStatus: true,
    },
  });
  console.log("employees:", JSON.stringify(emps, null, 2));
  await pool.end();
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });