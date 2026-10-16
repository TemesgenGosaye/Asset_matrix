/**
 * Test-database environment loader.
 *
 * Import this as the FIRST import in any test that touches a real database.
 *
 * WHY a separate module: ES module imports are hoisted and evaluated before any
 * statement in the importing module's body. Calling `dotenv.config()` inline
 * before `import prisma from "@/lib/prisma"` does NOT work, because the prisma
 * module (and therefore the `pg.Pool` it builds) is evaluated first and captures
 * an empty `process.env.DATABASE_URL`. A dedicated module imported first fixes
 * the ordering, because ESM evaluates imports in source order.
 *
 * Nothing in the production build imports this file.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Prefer a dedicated test database when one is configured, so an integration run
 * can never touch development data. Falls back to `.env` so the suite is usable
 * out of the box on a developer machine.
 */
export function loadTestEnv(): void {
  if (loaded) return;
  loaded = true;

  // `dotenv` is imported lazily through require so this module stays free of a
  // hard dependency for consumers that do not need it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require("dotenv") as typeof import("dotenv");

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    resolve(process.cwd(), ".env.test"),
    resolve(process.cwd(), ".env"),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    config({ path, override: false });
  }
}

/** True when a database URL is available for integration tests. */
export function hasTestDatabase(): boolean {
  loadTestEnv();
  return Boolean(process.env.DATABASE_URL);
}

loadTestEnv();
