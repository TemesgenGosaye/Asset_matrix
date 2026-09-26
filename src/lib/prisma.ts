import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// Determine SSL configuration based on environment
// Managed providers (Neon, Supabase) terminate TLS and require it.
const isCloudDatabase =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_URL?.includes("supabase") ||
  process.env.DATABASE_URL?.includes("pooler.supabase") ||
  process.env.DATABASE_URL?.includes(".neon.tech");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
  // Serverless-optimized pool settings:
  // Keep pool small — each Vercel function gets its own pool,
  // so 50 concurrent invocations × max = total DB connections.
  max: process.env.NODE_ENV === "production" ? 3 : 10,
  // Return idle connections quickly in serverless
  idleTimeoutMillis: process.env.NODE_ENV === "production" ? 10_000 : 30_000,
  // Don't wait forever for a connection
  connectionTimeoutMillis: 5_000,
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
