-- ==================================================================================
-- MSF ASSET AND HOUSE PORTAL - DEPARTMENT MASTER BOOK
-- Production-Ready Department Seeding Script
-- ==================================================================================
-- This script populates the departments table with the official organizational structure
-- Each department has a code for reference in assets and other records
-- ==================================================================================

-- Note: Replace 'YOUR_ORG_ID_HERE' with your actual organization UUID before running
-- You can get it from: SELECT id FROM organizations LIMIT 1;

DO $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get the first organization ID (or specify your organization ID)
    SELECT id INTO v_org_id FROM organizations ORDER BY "createdAt" LIMIT 1;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found. Please create an organization first.';
    END IF;

    -- Clear existing departments for clean insert (optional - remove if you want to keep existing)
    -- DELETE FROM department WHERE "organizationId" = v_org_id;

    -- ==================================================================================
    -- TOP LEVEL MANAGEMENT
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Board of Management', 'BOM', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'General Manager / CEO', 'GM', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Board of Directors', '23.4', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- SERVICES & OFFICES
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Audit Service', '55', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Legal Service', '23.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Public Relations & Communication Service', 'PRCS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Change Management Service', 'CMS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Office of the General Manager', 'OGM', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Performance Monitoring Service', 'PMS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Public Relations Service', '23.3.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'General Welfare Service', 'GWS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Estate Service', '23.3', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'General Service', '23.3.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Management Service', '23.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Organization and Methods', '23.2.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Planning Business Development and Budget Preparation', '23.2.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Management Information System', '23.2.3', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Project and Productivity Improvement Office', '56', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Anti Corruption Office', '33.1', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- FINANCE DEPARTMENT (24)
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Finance Department', '24', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cost & Budget Team', 'FD-CBT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'General Accounts Team', 'FD-GAT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'General Accounting', '24.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cost Accounting', '24.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Budget Control and Financial Analysis', '24.3', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- FARM OPERATIONS SECTOR
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Farm Operations Sector', 'FOS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Farm Department', 'FD', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cane Planting & Growth Team A', 'FD-CPGA', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cane Planting & Growth Team B', 'FD-CPGB', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cane Harvesting & Weighing Team', 'FD-CHWT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Weed & Chemical Coordination Team', 'FD-WCCT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Survey', '12', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Civil Work', '13', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'L.P.C.D', '14', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cultivation', '14.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Tillage', '14.2', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- PLANTATION (15)
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Plantation', '15', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Abadir A', '15.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Abadir B', '15.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Abadir C', '15.3', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Abadir Extension', '15.4', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Abadir Fruit', '15.5', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 1st East', '15.6', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 1st Awash', '15.7', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 2nd Chore', '15.8', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 2nd G/Golla', '15.9', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 2nd Kenifa', '15.10', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 3rd Kikan', '15.11', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 3rd South', '15.12', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Merti 3rd R.Land', '15.13', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'North', '15.14', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Railway Culture', '15.15', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- AGRICULTURE & HARVESTING
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Agriculture Research', '16', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Harvesting', '17', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Seed Cane & Irrigation', '17.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Cane Cutting', '17.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Haulage', '17.3', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Fruit', '39', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- FIELD EQUIPMENT SERVICE (18)
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Field Equipment Maintenance Department', 'FEMD', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Wheel Tractor & Equipment Team', 'FEMD-WTET', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Heavy Machinery / Transport Vehicle Team', 'FEMD-HMTVT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'F.E.S', '18', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Estate Car & Motor Cycle', '18.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Heavy Equipment', '18.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Wheel Tractor', '18.3', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- CIVIL & IRRIGATION WORKS DEPARTMENT
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Civil & Irrigation Works Department', 'CIWD', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Civil Works Team', 'CIWD-CWT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Irrigation Works Team', 'CIWD-IWT', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- FACTORY OPERATIONS SECTOR
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Factory Operations Sector', 'FOPS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Production Department', '22', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Sugar Production Team', 'PD-SPT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Ethanol & Compost Production Team', 'PD-ECPT', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- TECHNICAL DEPARTMENT (21)
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Technical Department', '21', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Mechanical Maintenance Team', 'TD-MMT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Welding & Fabrication Team', 'TD-WFT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Power Generation & Utility Maintenance Team', 'TD-PGUMT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Electrical & Instrumentation Maintenance Team', 'TD-EIMT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Preventive Maintenance, Extraction and Power Plant', '21.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Instrument Workshop', '21.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Electrical Workshop', '21.3', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Mechanical Workshop', '21.4', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Fabrication Workshop', '21.5', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- HR MANAGEMENT & SUPPLY SECTOR
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'HR Management & Supply Sector', 'HRMSS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'HR Management & Training Department', '26', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'HR Administration Team', 'HRMT-HAT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'HR Development & Training Team', 'HRMT-HDTT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Manpower Planning and Training', '26.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Employment and Administration', '26.3', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Employee Relation', '26.4', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- PROCUREMENT & LOGISTICS (25)
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Procurement & Facility Management Department', 'PFMD', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Facility Management Team', 'PFMD-FMT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Purchasing Administration & Planning Team', 'PFMD-PAPT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Purchasing Team', 'PFMD-PT', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Logistics', '25', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Material Requirement Planning', '25.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Store Administration', '25.2', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Commercial Department', '36.1', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- HEALTH & MEDICAL SERVICES (30)
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Health Service Department', '30', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Medical Service', 'HSD-MS', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Medical Section', '30.1', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Public Health', '30.2', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- FACILITIES & INFRASTRUCTURE
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Guest House', '27', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Building', '28', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Park and Lanse', '29', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Security', '34', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Police', '38', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Customs', '40', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- UNIONS & COMMITTEES
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'W.P.E (Worker Party of Ethiopia)', '31', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Labour Union', '32', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Workers Control Committee', '33', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- TRAINING & DEVELOPMENT CENTERS
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'T.D.C.', '35', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Wonji – Shoa Training Center', '54', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- ASSOCIATIONS & CLUBS
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'REWA', '36', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'REYA', '37', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Worker Club', '50', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Family Club', '51', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Community Center', '52', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Co-operative Shop', '53', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    -- ==================================================================================
    -- ADDITIONAL DEPARTMENTS
    -- ==================================================================================
    INSERT INTO department (id, name, code, "organizationId", "parentId", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'Awash Food', '57', v_org_id, NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Manager Office', '23', v_org_id, NULL, NOW(), NOW())
    ON CONFLICT (code, "organizationId") DO NOTHING;

    RAISE NOTICE 'Successfully seeded all departments for organization: %', v_org_id;
END $$;
