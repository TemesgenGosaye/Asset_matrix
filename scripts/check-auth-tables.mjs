/**
 * Check and create auth-related tables (account_lockouts)
 * This table is used by BetterAuth security features but is not in Prisma schema
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SCHEMA = process.env.DB_SCHEMA || 'public';

async function checkAndCreateTables() {
  console.log('Checking auth tables...');
  
  try {
    // Check account_lockouts table
    const lockoutCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = '${SCHEMA}' 
        AND table_name = 'account_lockouts'
      );
    `);
    
    if (lockoutCheck[0].exists) {
      console.log('✓ account_lockouts table exists');
    } else {
      console.log('✗ account_lockouts table missing, creating...');
      await prisma.$executeRawUnsafe(`
        CREATE UNLOGGED TABLE IF NOT EXISTS "${SCHEMA}"."account_lockouts" (
          "key" VARCHAR(255) PRIMARY KEY,
          "failed_attempts" INTEGER NOT NULL DEFAULT 0,
          "locked_until" TIMESTAMPTZ,
          "last_attempt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log('✓ account_lockouts table created');
    }

    console.log('\nAll auth tables are ready!');
  } catch (error) {
    console.error('Error checking/creating tables:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkAndCreateTables().catch(console.error);
