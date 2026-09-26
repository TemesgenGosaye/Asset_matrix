-- Metahara Sugar Factory Department Master Seed
-- Official department structure with hierarchical relationships

-- Get organization ID (will be used in all inserts)
DO $$
DECLARE
    org_id UUID;
BEGIN
    SELECT id INTO org_id FROM organizations ORDER BY "createdAt" LIMIT 1;
    
    IF org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found. Please create an organization first.';
    END IF;
    
    -- TOP LEVEL MANAGEMENT
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), 'BOM', 'Board of Management', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), 'GM', 'General Manager / CEO', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- MANAGER OFFICE (23)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '23', 'Manager Office', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- MANAGER OFFICE SUB-DEPARTMENTS
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.1', 'Legal Service', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.2', 'Management Service', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- MANAGEMENT SERVICE SUB-DEPARTMENTS (23.2.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.2.1', 'Organization and Methods', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23.2' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.2.2', 'Planning Business Development and Budget Preparation', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23.2' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.2.3', 'Management Information System', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23.2' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- ESTATE SERVICE (23.3)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.3', 'Estate Service', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.3.1', 'General Service', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23.3' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.3.2', 'Public Relation', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23.3' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- BOARD OF DIRECTORS
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '23.4', 'Board of Directors', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '23' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- INDEPENDENT SERVICES
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '55', 'Audit Service', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '56', 'Project and Productivity Improvement Office', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- SURVEY & CIVIL (12-14)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '12', 'Survey', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '13', 'Civil Work', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '14', 'L.P.C.D', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '14.1', 'Cultivation', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '14' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '14.2', 'Tillage', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '14' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- PLANTATION (15) - Parent first
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '15', 'Plantation', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- PLANTATION SUB-DEPARTMENTS (15.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.1', 'Abadir A', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.2', 'Abadir B', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.3', 'Abadir C', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.4', 'Abadir Extension', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.5', 'Abadir Fruit', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.6', 'Merti 1st East', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.7', 'Merti 1st Awash', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.8', 'Merti 2nd Chore', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.9', 'Merti 2nd G/Golla', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.10', 'Merti 2nd Kenifa', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.11', 'Merti 3rd Kikan', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.12', 'Merti 3rd South', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.13', 'Merti 3rd R.Land', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.14', 'North', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '15.15', 'Railway Culture', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '15' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- AGRICULTURE RESEARCH & HARVESTING (16-17)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '16', 'Agriculture Research', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '17', 'Harvesting', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- HARVESTING SUB-DEPARTMENTS (17.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '17.1', 'Seed Cane & Irrigation', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '17' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '17.2', 'Cane Cutting', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '17' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '17.3', 'Haulage', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '17' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- FIELD EQUIPMENT SERVICE (18)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '18', 'F.E.S', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- FES SUB-DEPARTMENTS (18.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '18.1', 'Estate Car & Motor Cycle', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '18' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '18.2', 'Heavy Equipment', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '18' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '18.3', 'Wheel Tractor', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '18' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- TECHNICAL DEPARTMENT (21)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '21', 'Technical', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- TECHNICAL SUB-DEPARTMENTS (21.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '21.1', 'Preventive Maintenance, Extraction and Power Plant', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '21' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '21.2', 'Instrument Workshop', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '21' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '21.3', 'Electrical Workshop', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '21' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '21.4', 'Mechanical Workshop', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '21' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '21.5', 'Fabrication Workshop', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '21' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- PRODUCTION (22)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '22', 'Production', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- FINANCE DEPARTMENT (24)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '24', 'Finance Department', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- FINANCE SUB-DEPARTMENTS (24.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '24.1', 'General Accounting', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '24' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '24.2', 'Cost Accounting', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '24' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '24.3', 'Budget Control and Financial Analysis', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '24' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- LOGISTICS (25)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '25', 'Logistics', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- LOGISTICS SUB-DEPARTMENTS (25.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '25.1', 'Material Requirement Planning', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '25' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '25.2', 'Store Administration', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '25' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- HUMAN RESOURCE DEPARTMENT (26)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '26', 'Human Resource Department', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- HR SUB-DEPARTMENTS (26.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '26.2', 'Manpower Planning and Training', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '26' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '26.3', 'Employment and Administration', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '26' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '26.4', 'Employee Relation', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '26' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- FACILITIES (27-29)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '27', 'Guest House', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '28', 'Building', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '29', 'Park and Lanse', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- MEDICAL SERVICE (30)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '30', 'Medical Service', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- MEDICAL SUB-DEPARTMENTS (30.x)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '30.1', 'Medical Section', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '30' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '30.2', 'Public Health', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '30' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- UNIONS & COMMITTEES (31-33)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '31', 'W.P.E (Worker Party of Ethiopia)', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '32', 'Labour Union', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '33', 'Workers Control Committee', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '33.1', 'Anti Corruption Office', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '33' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- SECURITY & ENFORCEMENT (34-40)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '34', 'Security', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '35', 'T.D.C.', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '36', 'REWA', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '37', 'REYA', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '38', 'Police', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '39', 'Fruit', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '40', 'Customes', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '36.1', 'Commercial Department', org_id, d.id, true, NOW(), NOW()
    FROM departments d WHERE d.code = '36' AND d."organizationId" = org_id
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- CLUBS & COMMUNITY (50-54)
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES 
        (gen_random_uuid(), '50', 'Worker Club', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '51', 'Family Club', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '52', 'Community Center', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '53', 'Co-operative Shop', org_id, NULL, true, NOW(), NOW()),
        (gen_random_uuid(), '54', 'Wonji – Shoa Training Center', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    -- ADDITIONAL DEPARTMENTS
    INSERT INTO departments (id, code, name, "organizationId", "parentId", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '57', 'Awash Food', org_id, NULL, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();
    
    RAISE NOTICE '✓ Metahara Sugar Factory departments seeded successfully!';
END $$;
