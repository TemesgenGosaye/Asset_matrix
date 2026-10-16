#!/usr/bin/env node
/**
 * Create (or reset) the two throwaway accounts the Pay Rent smoke test needs:
 *
 *   1. an ADMIN, which bypasses RBAC and therefore always holds every rent
 *      permission including the elevated `rent:override_terms`;
 *   2. a LIMITED user holding `rent:view` + `rent:pay` + `rent:update` but
 *      deliberately NOT `rent:override_terms`, `rent:void`, `rent:terminate`,
 *      `rent:archive`, `rent:export` or `rent:sensitive_view`, so the suite can
 *      prove the server denies what the role does not grant;
 *   3. a VIEW-ONLY user holding just `rent:view`, which therefore must receive a
 *      MASKED National ID (`rent:update`/`rent:terminate` imply unmasked).
 *
 * Both are genuine BetterAuth credential logins, mirroring the credential layout
 * that `scripts/fix-admin-login.mjs` uses.
 *
 *   node scripts/smoke-test-user.mjs create
 *   node scripts/smoke-test-user.mjs delete
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "pay-rent-smoke@example.invalid";
const LIMITED_EMAIL = "pay-rent-limited@example.invalid";
const VIEWONLY_EMAIL = "pay-rent-viewonly@example.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "";

/** The limited role's grants: read + record money, but no elevated acts. */
const LIMITED_PERMISSIONS = ["rent:view", "rent:pay", "rent:update"];
const LIMITED_ROLE_NAME = "Pay Rent Smoke (limited)";
/** View-only role: `rent:view` and nothing else, so the National ID must be masked. */
const VIEWONLY_PERMISSIONS = ["rent:view"];
const VIEWONLY_ROLE_NAME = "Pay Rent Smoke (view only)";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/**
 * Refuse to run against anything that is not obviously a local dev database.
 *
 * `create` writes a known-password ADMINISTRATOR and attaches it to the oldest
 * organization in the target database. Pointed at a shared dev or staging
 * `DATABASE_URL` - and then abandoned before `delete` - that leaves a usable
 * admin behind. A deliberate opt-out is available for the unusual case:
 * `SMOKE_ALLOW_REMOTE=1`.
 */
function assertSafeTarget() {
  if (process.env.SMOKE_ALLOW_REMOTE === "1") return;
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1|::1/.test(url)) {
    console.error(
      "Refusing to run: smoke-test-user creates a known-password admin, so it\n" +
        "  only targets a local development database.\n" +
        `  DATABASE_URL is: ${url.replace(/:[^:@/]*@/, ":***@")}\n` +
        "  Set SMOKE_ALLOW_REMOTE=1 if you really mean a remote database.",
    );
    process.exit(2);
  }
}

if (!PASSWORD) {
  console.error(
    "Refusing to run: set SMOKE_PASSWORD to the throwaway password to use.\n" +
      "  It is deliberately not hardcoded here.",
  );
  process.exit(2);
}

/** Ensure a credential account exists with the given hash. */
async function ensureCredential(userid, hashed) {
  const account = await prisma.accounts.findFirst({
    where: { userId: userid, providerId: "credential" },
  });
  if (account) {
    await prisma.accounts.update({
      where: { id: account.id },
      data: { password: hashed, issuer: "local:credential" },
    });
  } else {
    await prisma.accounts.create({
      data: {
        userId: userid,
        providerId: "credential",
        accountId: userid,
        issuer: "local:credential",
        password: hashed,
      },
    });
  }
}

async function upsertUser({ email, username, isadmin, organizationId, hashed }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { userid: existing.userid },
      data: { password: hashed, isActive: true, emailVerified: true, isadmin },
    });
    await ensureCredential(existing.userid, hashed);
    return existing.userid;
  }
  const user = await prisma.user.create({
    data: {
      email,
      username,
      firstname: username,
      lastname: "Smoke",
      password: hashed,
      isadmin,
      canrequest: true,
      isActive: true,
      emailVerified: true,
      organizationId,
      creation_date: new Date(),
      mfaBackupCodes: [],
    },
  });
  await ensureCredential(user.userid, hashed);
  return user.userid;
}

const mode = process.argv[2] ?? "create";

/** Set during `delete` so the role cleanup can be scoped to one organization. */
let smokeOrgId = null;

assertSafeTarget();

try {
  if (mode === "delete") {
    for (const email of [ADMIN_EMAIL, LIMITED_EMAIL, VIEWONLY_EMAIL]) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;
      // Remember which org the admin belonged to so the role delete below can
      // be scoped to it rather than matching by name alone.
      if (!smokeOrgId && user.organizationId) smokeOrgId = user.organizationId;
      await prisma.accounts.deleteMany({ where: { userId: user.userid } });
      // The Prisma model is `sessions` (plural), per prisma/schema.prisma.
      await prisma.sessions.deleteMany({ where: { userId: user.userid } });
      await prisma.userRole.deleteMany({ where: { userId: user.userid } });
      await prisma.user.delete({ where: { userid: user.userid } });
    }
    await prisma.role.deleteMany({
      where: {
        name: { in: [LIMITED_ROLE_NAME, VIEWONLY_ROLE_NAME] },
        // Scoped to the smoke org: an unscoped name delete would also remove a
        // same-named role belonging to a real tenant.
        ...(smokeOrgId ? { organizationId: smokeOrgId } : {}),
      },
    });
    console.log("smoke users deleted");
    process.exit(0);
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new Error("No organization exists to attach the smoke users to.");

  const hashed = await bcrypt.hash(PASSWORD, 12);

  await upsertUser({
    email: ADMIN_EMAIL,
    username: "pay-rent-smoke",
    isadmin: true,
    organizationId: org.id,
    hashed,
  });

  // Org-scoped so the compound unique key (name, organizationId) is usable for
  // the lookup below - Prisma cannot match NULL in a compound-unique `where`.
  const limitedRole = await prisma.role
    .findFirst({
      where: { name: LIMITED_ROLE_NAME, organizationId: org.id },
    })
    .then(async (found) =>
      found
        ? prisma.role.update({
            where: { id: found.id },
            data: { permissions: LIMITED_PERMISSIONS },
          })
        : prisma.role.create({
            data: {
              name: LIMITED_ROLE_NAME,
              description: "Smoke-test role: can view and record rent, nothing else.",
              permissions: LIMITED_PERMISSIONS,
              isSystem: false,
              organizationId: org.id,
            },
          }),
    );

  const limitedUserid = await upsertUser({
    email: LIMITED_EMAIL,
    username: "pay-rent-limited",
    isadmin: false,
    organizationId: org.id,
    hashed,
  });

  const hasRole = await prisma.userRole.findFirst({
    where: { userId: limitedUserid, roleId: limitedRole.id },
  });
  if (!hasRole) {
    await prisma.userRole.create({
      data: { userId: limitedUserid, roleId: limitedRole.id },
    });
  }

  const viewOnlyRole = await prisma.role
    .findFirst({ where: { name: VIEWONLY_ROLE_NAME, organizationId: org.id } })
    .then(async (found) =>
      found
        ? prisma.role.update({
            where: { id: found.id },
            data: { permissions: VIEWONLY_PERMISSIONS },
          })
        : prisma.role.create({
            data: {
              name: VIEWONLY_ROLE_NAME,
              description: "Smoke-test role: view rent only, National ID must be masked.",
              permissions: VIEWONLY_PERMISSIONS,
              isSystem: false,
              organizationId: org.id,
            },
          }),
    );

  const viewOnlyUserid = await upsertUser({
    email: VIEWONLY_EMAIL,
    username: "pay-rent-viewonly",
    isadmin: false,
    organizationId: org.id,
    hashed,
  });

  const hasViewRole = await prisma.userRole.findFirst({
    where: { userId: viewOnlyUserid, roleId: viewOnlyRole.id },
  });
  if (!hasViewRole) {
    await prisma.userRole.create({
      data: { userId: viewOnlyUserid, roleId: viewOnlyRole.id },
    });
  }

  console.log(`SMOKE_EMAIL=${ADMIN_EMAIL}`);
  console.log(`SMOKE_LIMITED_EMAIL=${LIMITED_EMAIL}`);
  console.log(`SMOKE_VIEWONLY_EMAIL=${VIEWONLY_EMAIL}`);
  console.log(`SMOKE_PASSWORD=(the value of $env:SMOKE_PASSWORD you set)`);
  console.log(`organization=${org.name}`);
  console.log(`limited role permissions=${LIMITED_PERMISSIONS.join(",")}`);
  console.log(`view-only role permissions=${VIEWONLY_PERMISSIONS.join(",")}`);
} catch (error) {
  console.error("Error:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await pool.end();
}
