#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function fixAdminLogin() {
  try {
    const username = 'admin';
    const password = 'admin123';
    
    console.log('Fixing admin user for login...\n');
    
    const user = await prisma.user.findFirst({
      where: { username },
    });

    if (!user) {
      console.log(`User '${username}' not found`);
      return;
    }

    console.log(`User found: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`Email Verified: ${user.emailVerified}`);
    console.log(`Active: ${user.isActive}`);

    // Ensure emailVerified is true
    if (!user.emailVerified) {
      await prisma.user.update({
        where: { userid: user.userid },
        data: { emailVerified: true },
      });
      console.log('✓ Set emailVerified to true');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Update user password
    await prisma.user.update({
      where: { userid: user.userid },
      data: { password: hashedPassword },
    });
    console.log('✓ Updated user password');

    // Ensure credential account exists
    const account = await prisma.accounts.findFirst({
      where: {
        userId: user.userid,
        providerId: 'credential',
      },
    });

    if (!account) {
      await prisma.accounts.create({
        data: {
          userId: user.userid,
          providerId: 'credential',
          accountId: user.userid,
          issuer: 'local:credential',
          password: hashedPassword,
        },
      });
      console.log('✓ Created credential account');
    } else {
      await prisma.accounts.update({
        where: { id: account.id },
        data: { password: hashedPassword, issuer: 'local:credential' },
      });
      console.log('✓ Updated credential account password');
    }

    console.log('\n=== Admin User Ready ===');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Email: ${user.email}`);
    console.log('\nYou can now log in with these credentials.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

fixAdminLogin();
