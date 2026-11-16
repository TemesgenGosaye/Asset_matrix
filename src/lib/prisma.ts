import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

// Determine SSL configuration based on environment
// Managed providers (Neon, Supabase) terminate TLS and require it.
const databaseUrl = getDatabaseUrl();
const isCloudDatabase =
  process.env.DATABASE_SSL === "true" ||
  databaseUrl.includes("supabase") ||
  databaseUrl.includes("pooler.supabase") ||
  databaseUrl.includes(".neon.tech") ||
  databaseUrl.includes("prisma.io");

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
  // Serverless-optimized pool settings:
  // Keep pool small — each Vercel function gets its own pool,
  // so 50 concurrent invocations × max = total DB connections.
  max: process.env.NODE_ENV === "production" ? 3 : 10,
  // Return idle connections quickly in serverless
  idleTimeoutMillis: process.env.NODE_ENV === "production" ? 10_000 : 30_000,
  // Don't wait forever for a connection. Production runs on managed Postgres,
  // where a 5s budget fails fast on a genuinely unreachable database. In
  // development the database is local and the bottleneck is host load, not
  // latency: a 5s budget aborts healthy localhost handshakes whenever the
  // event loop stalls under Turbopack work, which then surfaces as
  // BetterAuth's masked "Failed to get session". Give dev more headroom.
  connectionTimeoutMillis:
    process.env.NODE_ENV === "production" ? 5_000 : 30_000,
  // Prevent runaway queries
  statement_timeout: 30_000,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({ adapter });
} else {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  prisma = globalForPrisma.prisma;
}

export default prisma;
