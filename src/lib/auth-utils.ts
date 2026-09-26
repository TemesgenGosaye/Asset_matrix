import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Synthetic issuer used by BetterAuth for local (email/password) credential
 * accounts. BetterAuth 1.7+ matches the credential account during sign-in via
 * `account.issuer === "local:credential"` — without this set, every login fails.
 */
export const CREDENTIAL_ISSUER = "local:credential";

/**
 * Hash a password using bcrypt with 12 rounds
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hashed password
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

/**
 * Verify a user's password by reading the canonical hash from `accounts.password`
 * (the column BetterAuth uses for credential verification). Falls back to the legacy
 * `user.password` column for accounts that haven't yet been migrated by the BetterAuth
 * `before` hook.
 *
 * Use this anywhere you need to confirm "is this the user's current password?" —
 * for example, password change, MFA disable, or any sensitive re-authentication.
 *
 * @returns true if the password matches the stored hash, false otherwise
 *          (also false if the user has no password set at all)
 */
export async function verifyUserPassword(
  userId: string,
  plaintextPassword: string,
): Promise<boolean> {
  const account = await prisma.accounts.findUnique({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: userId,
      },
    },
    select: { password: true },
  });

  // Prefer accounts.password (BetterAuth's source of truth)
  if (account?.password) {
    return bcrypt.compare(plaintextPassword, account.password);
  }

  // Legacy fallback: user.password column
  const user = await prisma.user.findUnique({
    where: { userid: userId },
    select: { password: true },
  });

  if (!user?.password) {
    return false;
  }

  return bcrypt.compare(plaintextPassword, user.password);
}

/**
 * Atomically set a user's password in both `user.password` (legacy column)
 * and `accounts.password` for the BetterAuth credential provider.
 *
 * BetterAuth verifies passwords against `accounts.password` (see
 * `auth-server.ts` `account.fields.password`). Writing only to `user.password`
 * is silently ignored — the legacy column exists only for backward compatibility
 * with the migration path in the auth `before` hook.
 *
 * Always use this helper instead of writing to either column directly. It hashes
 * the password internally so callers cannot accidentally store plaintext.
 *
 * @param userId  The userid of the user whose password is being set
 * @param plaintextPassword  The new password in plaintext (minimum length is enforced
 *                           by callers via Zod schemas — this function does not validate length)
 * @param tx  Optional Prisma transaction client. If provided, the writes happen
 *            inside the caller's transaction. If omitted, a new transaction is opened.
 */
export async function setUserPassword(
  userId: string,
  plaintextPassword: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const hashedPassword = await hashPassword(plaintextPassword);
  await writeCredentialPassword(userId, hashedPassword, tx);
}

/**
 * Lower-level variant for callers that already hold a hashed password — used by
 * cron seeders and bulk imports that hash a single password and reuse it across
 * many user creates. Prefer `setUserPassword` for normal flows.
 */
export async function setUserPasswordHashed(
  userId: string,
  hashedPassword: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  await writeCredentialPassword(userId, hashedPassword, tx);
}

async function writeCredentialPassword(
  userId: string,
  hashedPassword: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const run = async (client: Prisma.TransactionClient | PrismaClient) => {
    await client.user.update({
      where: { userid: userId },
      data: { password: hashedPassword, change_date: new Date() },
    });
    await client.accounts.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: userId,
        },
      },
      update: { password: hashedPassword, updatedAt: new Date() },
      create: {
        userId,
        providerId: "credential",
        accountId: userId,
        issuer: CREDENTIAL_ISSUER,
        password: hashedPassword,
      },
    });
  };

  if (tx) {
    await run(tx);
  } else {
    await prisma.$transaction(run);
  }
}
