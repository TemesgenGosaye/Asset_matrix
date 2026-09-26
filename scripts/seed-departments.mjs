#!/usr/bin/env node
/**
 * MSF Asset and House Portal - Department Master Book Seeder
 * 
 * This script seeds the database with all official departments from the master book.
 * Run with: node scripts/seed-departments.mjs
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

const departments = [
  // TOP LEVEL MANAGEMENT
  { name: 'Board of Management', code: 'BOM' },
  { name: 'General Manager / CEO', code: 'GM' },
  { name: 'Board of Directors', code: '23.4' },
  
  // SERVICES & OFFICES
  { name: 'Audit Service', code: '55' },
  { name: 'Legal Service', code: '23.1' },
  { name: 'Public Relations & Communication Service', code: 'PRCS' },
  { name: 'Change Management Service', code: 'CMS' },
  { name: 'Office of the General Manager', code: 'OGM' },
  { name: 'Performance Monitoring Service', code: 'PMS' },
  { name: 'Public Relations Service', code: '23.3.2' },
  { name: 'General Welfare Service', code: 'GWS' },
  { name: 'Estate Service', code: '23.3' },
  { name: 'General Service', code: '23.3.1' },
  { name: 'Management Service', code: '23.2' },
  { name: 'Organization and Methods', code: '23.2.1' },
  { name: 'Planning Business Development and Budget Preparation', code: '23.2.2' },
  { name: 'Management Information System', code: '23.2.3' },
  { name: 'Project and Productivity Improvement Office', code: '56' },
  { name: 'Anti Corruption Office', code: '33.1' },
  
  // FINANCE DEPARTMENT
  { name: 'Finance Department', code: '24' },
  { name: 'Cost & Budget Team', code: 'FD-CBT' },
  { name: 'General Accounts Team', code: 'FD-GAT' },
  { name: 'General Accounting', code: '24.1' },
  { name: 'Cost Accounting', code: '24.2' },
  { name: 'Budget Control and Financial Analysis', code: '24.3' },
  
  // FARM OPERATIONS SECTOR
  { name: 'Farm Operations Sector', code: 'FOS' },
  { name: 'Farm Department', code: 'FD' },
  { name: 'Cane Planting & Growth Team A', code: 'FD-CPGA' },
  { name: 'Cane Planting & Growth Team B', code: 'FD-CPGB' },
  { name: 'Cane Harvesting & Weighing Team', code: 'FD-CHWT' },
  { name: 'Weed & Chemical Coordination Team', code: 'FD-WCCT' },
  { name: 'Survey', code: '12' },
  { name: 'Civil Work', code: '13' },
  { name: 'L.P.C.D', code: '14' },
  { name: 'Cultivation', code: '14.1' },
  { name: 'Tillage', code: '14.2' },
  
  // PLANTATION
  { name: 'Plantation', code: '15' },
  { name: 'Abadir A', code: '15.1' },
  { name: 'Abadir B', code: '15.2' },
  { name: 'Abadir C', code: '15.3' },
  { name: 'Abadir Extension', code: '15.4' },
  { name: 'Abadir Fruit', code: '15.5' },
  { name: 'Merti 1st East', code: '15.6' },
  { name: 'Merti 1st Awash', code: '15.7' },
  { name: 'Merti 2nd Chore', code: '15.8' },
  { name: 'Merti 2nd G/Golla', code: '15.9' },
  { name: 'Merti 2nd Kenifa', code: '15.10' },
  { name: 'Merti 3rd Kikan', code: '15.11' },
  { name: 'Merti 3rd South', code: '15.12' },
  { name: 'Merti 3rd R.Land', code: '15.13' },
  { name: 'North', code: '15.14' },
  { name: 'Railway Culture', code: '15.15' },
  
  // AGRICULTURE & HARVESTING
  { name: 'Agriculture Research', code: '16' },
  { name: 'Harvesting', code: '17' },
  { name: 'Seed Cane & Irrigation', code: '17.1' },
  { name: 'Cane Cutting', code: '17.2' },
  { name: 'Haulage', code: '17.3' },
  { name: 'Fruit', code: '39' },
  
  // FIELD EQUIPMENT SERVICE
  { name: 'Field Equipment Maintenance Department', code: 'FEMD' },
  { name: 'Wheel Tractor & Equipment Team', code: 'FEMD-WTET' },
  { name: 'Heavy Machinery / Transport Vehicle Team', code: 'FEMD-HMTVT' },
  { name: 'F.E.S', code: '18' },
  { name: 'Estate Car & Motor Cycle', code: '18.1' },
  { name: 'Heavy Equipment', code: '18.2' },
  { name: 'Wheel Tractor', code: '18.3' },
  
  // CIVIL & IRRIGATION WORKS
  { name: 'Civil & Irrigation Works Department', code: 'CIWD' },
  { name: 'Civil Works Team', code: 'CIWD-CWT' },
  { name: 'Irrigation Works Team', code: 'CIWD-IWT' },
  
  // FACTORY OPERATIONS SECTOR
  { name: 'Factory Operations Sector', code: 'FOPS' },
  { name: 'Production Department', code: '22' },
  { name: 'Sugar Production Team', code: 'PD-SPT' },
  { name: 'Ethanol & Compost Production Team', code: 'PD-ECPT' },
  
  // TECHNICAL DEPARTMENT
  { name: 'Technical Department', code: '21' },
  { name: 'Mechanical Maintenance Team', code: 'TD-MMT' },
  { name: 'Welding & Fabrication Team', code: 'TD-WFT' },
  { name: 'Power Generation & Utility Maintenance Team', code: 'TD-PGUMT' },
  { name: 'Electrical & Instrumentation Maintenance Team', code: 'TD-EIMT' },
  { name: 'Preventive Maintenance, Extraction and Power Plant', code: '21.1' },
  { name: 'Instrument Workshop', code: '21.2' },
  { name: 'Electrical Workshop', code: '21.3' },
  { name: 'Mechanical Workshop', code: '21.4' },
  { name: 'Fabrication Workshop', code: '21.5' },
  
  // HR MANAGEMENT & SUPPLY SECTOR
  { name: 'HR Management & Supply Sector', code: 'HRMSS' },
  { name: 'HR Management & Training Department', code: '26' },
  { name: 'HR Administration Team', code: 'HRMT-HAT' },
  { name: 'HR Development & Training Team', code: 'HRMT-HDTT' },
  { name: 'Manpower Planning and Training', code: '26.2' },
  { name: 'Employment and Administration', code: '26.3' },
  { name: 'Employee Relation', code: '26.4' },
  
  // PROCUREMENT & LOGISTICS
  { name: 'Procurement & Facility Management Department', code: 'PFMD' },
  { name: 'Facility Management Team', code: 'PFMD-FMT' },
  { name: 'Purchasing Administration & Planning Team', code: 'PFMD-PAPT' },
  { name: 'Purchasing Team', code: 'PFMD-PT' },
  { name: 'Logistics', code: '25' },
  { name: 'Material Requirement Planning', code: '25.1' },
  { name: 'Store Administration', code: '25.2' },
  { name: 'Commercial Department', code: '36.1' },
  
  // HEALTH & MEDICAL SERVICES
  { name: 'Health Service Department', code: '30' },
  { name: 'Medical Service', code: 'HSD-MS' },
  { name: 'Medical Section', code: '30.1' },
  { name: 'Public Health', code: '30.2' },
  
  // FACILITIES & INFRASTRUCTURE
  { name: 'Guest House', code: '27' },
  { name: 'Building', code: '28' },
  { name: 'Park and Lanse', code: '29' },
  { name: 'Security', code: '34' },
  { name: 'Police', code: '38' },
  { name: 'Customs', code: '40' },
  
  // UNIONS & COMMITTEES
  { name: 'W.P.E (Worker Party of Ethiopia)', code: '31' },
  { name: 'Labour Union', code: '32' },
  { name: 'Workers Control Committee', code: '33' },
  
  // TRAINING & DEVELOPMENT CENTERS
  { name: 'T.D.C.', code: '35' },
  { name: 'Wonji – Shoa Training Center', code: '54' },
  
  // ASSOCIATIONS & CLUBS
  { name: 'REWA', code: '36' },
  { name: 'REYA', code: '37' },
  { name: 'Worker Club', code: '50' },
  { name: 'Family Club', code: '51' },
  { name: 'Community Center', code: '52' },
  { name: 'Co-operative Shop', code: '53' },
  
  // ADDITIONAL DEPARTMENTS
  { name: 'Awash Food', code: '57' },
  { name: 'Manager Office', code: '23' },
];

async function seedDepartments() {
  console.log('🌱 Starting department seeding...\n');
  
  try {
    // Get the first organization
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' }
    });
    
    if (!org) {
      console.error('❌ No organization found. Please create an organization first.');
      process.exit(1);
    }
    
    console.log(`✅ Found organization: ${org.name} (${org.id})\n`);
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const dept of departments) {
      try {
        await prisma.department.upsert({
          where: {
            code_organizationId: {
              code: dept.code,
              organizationId: org.id
            }
          },
          update: {
            name: dept.name,
          },
          create: {
            name: dept.name,
            code: dept.code,
            organizationId: org.id,
          }
        });
        created++;
        console.log(`  ✓ ${dept.code.padEnd(12)} - ${dept.name}`);
      } catch (error) {
        if (error.code === 'P2002') {
          skipped++;
          console.log(`  ⊘ ${dept.code.padEnd(12)} - ${dept.name} (already exists)`);
        } else {
          errors++;
          console.error(`  ✗ ${dept.code.padEnd(12)} - ${dept.name}`, error.message);
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Created/Updated: ${created}`);
    console.log(`   ⊘ Skipped: ${skipped}`);
    console.log(`   ✗ Errors: ${errors}`);
    console.log(`   📦 Total: ${departments.length}\n`);
    
    console.log('✨ Department seeding completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Error seeding departments:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDepartments();
