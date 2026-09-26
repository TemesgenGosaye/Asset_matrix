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

async function unlockAccount() {
  try {
    const identifier = process.argv[2] || 'admin@admin.com';
    
    // Clear account lockout
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM public.account_lockouts WHERE "key" LIKE $1`,
      `%${identifier}%`,
    );
    
    console.log(`✓ Cleared ${result} lockout entries for: ${identifier}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

unlockAccount();
