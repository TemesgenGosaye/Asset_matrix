/**
 * Align system roles with rbac.ts.
 *
 * Run: node scripts/sync-house-permissions.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL environment variable is not set!");
  process.exit(1);
}

const isCloudDatabase =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_URL?.includes("supabase") ||
  process.env.DATABASE_URL?.includes("pooler.supabase");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ALL_PERMISSIONS = [
  "asset:view",
  "asset:create",
  "asset:edit",
  "asset:delete",
  "asset:assign",
  "user:view",
  "user:create",
  "user:edit",
  "user:delete",
  "accessory:view",
  "accessory:create",
  "accessory:edit",
  "accessory:delete",
  "license:view",
  "license:create",
  "license:edit",
  "license:delete",
  "license:assign",
  "consumable:view",
  "consumable:create",
  "consumable:edit",
  "consumable:delete",
  "org:view",
  "org:manage",
  "dept:view",
  "dept:manage",
  "reservation:view",
  "reservation:create",
  "reservation:approve",
  "settings:view",
  "settings:edit",
  "report:view",
  "report:export",
  "audit:view",
  "webhook:view",
  "webhook:manage",
  "import:execute",
  "procurement:view",
  "procurement:create",
  "procurement:approve",
  "procurement:manage_orders",
  "procurement:receive",
  "component:view",
  "component:create",
  "component:edit",
  "component:delete",
  "eula:view",
  "eula:manage",
  "kit:view",
  "kit:create",
  "kit:edit",
  "kit:delete",
  "kit:checkout",
  "audit_campaign:view",
  "audit_campaign:create",
  "audit_campaign:edit",
  "audit_campaign:scan",
  "employee:view",
  "employee:create",
  "employee:edit",
  "employee:delete",
  "household:view",
  "household:create",
  "household:edit",
  "household:delete",
  "general_asset:view",
  "general_asset:create",
  "general_asset:edit",
  "general_asset:delete",
];

const MANAGER_BASE = [
  "asset:view",
  "asset:create",
  "asset:edit",
  "asset:assign",
  "accessory:view",
  "accessory:create",
  "accessory:edit",
  "license:view",
  "license:assign",
  "consumable:view",
  "component:view",
  "component:create",
  "component:edit",
  "kit:view",
  "kit:checkout",
  "employee:view",
  "household:view",
  "household:create",
  "household:edit",
  "general_asset:view",
  "general_asset:create",
  "general_asset:edit",
  "audit_campaign:view",
  "audit_campaign:scan",
  "reservation:view",
  "reservation:approve",
  "report:view",
  "report:export",
];

async function main() {
  const roles = await prisma.role.findMany();
  for (const role of roles) {
    let target;
    if (role.name === "Administrator") {
      target = ALL_PERMISSIONS;
    } else if (role.name === "Asset Manager") {
      target = MANAGER_BASE;
    } else {
      // Standard User and custom roles keep their existing permissions.
      continue;
    }
    if (target.length !== role.permissions.length) {
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: target },
      });
      console.log(
        `+ Updated role "${role.name}": ${role.permissions.length} -> ${target.length} permissions`,
      );
    } else {
      console.log(`= Role "${role.name}": permissions already in sync (${target.length})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());