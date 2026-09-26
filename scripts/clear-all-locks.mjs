#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function clearAllLocks() {
  try {
    // Clear all account lockouts
    const lockoutResult = await prisma.$executeRawUnsafe(`DELETE FROM public.account_lockouts`);
    console.log(`✓ Cleared ${lockoutResult} account lockout entries`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

clearAllLocks();
