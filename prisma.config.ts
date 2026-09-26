import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "prisma/config";

// Load .env manually since Prisma CLI doesn't auto-load it
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    // Prisma 7 removed `directUrl` from schema files entirely, so the CLI and
    // the runtime share this one URL. For Neon this means:
    //   - Use the DIRECT (non `-pooler`) host here, e.g.
    //       postgresql://user:pass@ep-xxx.<region>.aws.neon.tech/db?sslmode=require
    //   - Do NOT use the `-pooler` host: PgBouncer in transaction mode breaks
    //     Prisma's prepared statements and interactive transactions.
    //   - Connection volume is already bounded by src/lib/prisma.ts, which uses
    //     a `pg.Pool` driver adapter capped at max=3 per serverless instance.
    //   - The SSL handshake is handled in src/lib/prisma.ts, which enables
    //     `ssl` for any `*.neon.tech` host.
    url: process.env.DATABASE_URL ?? "",
  },
});
