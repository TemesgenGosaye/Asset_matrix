# 00 — Field Inventory & Database Discovery Report

> **Status:** Discovery Complete — Awaiting User Confirmation before Migration & Backfill  
> **Date:** November 25, 2026  
> **Target Environment:** MSF Asset and House Portal (Next.js 16, React 19, Prisma, PostgreSQL Neon, BetterAuth, Tailwind v4)  
> **Database:** PostgreSQL (`DATABASE_NEOND_URL`, Organization `9c0ea419-d7fb-48bf-be11-64b8fc47927f`)  
> **Total Imported Assets:** 20,715 assets across 36 source departments  

---

## 1. Executive Summary & Verification Context

1. **Database Source of Truth**:
   - The PostgreSQL database contains **20,715 assets** imported from the Fixed Asset Master List under organization ID `9c0ea419-d7fb-48bf-be11-64b8fc47927f`.
   - The existing master tables `location`, `statusType`, `assetCategoryType`, `model`, `manufacturer`, and `supplier` currently contain **0 rows**.
   - The `departments` master table contains **83 official MSF departments** (hierarchical, with codes such as `12`, `14.1`, `15`, `15.1`, `21`, `22`, etc.).
   - In `asset`, 7,178 assets already have their `departmentId` populated (matching 14 department names), while 13,537 assets have `departmentId` as null (storing the raw department name in `sourceDepartment`).

2. **Form Discovery**:
   - **Fixed Asset Register Create Form**: `src/app/assets/register/create/page.tsx` rendering `src/ui/assets/FixedAssetForm.tsx` (`mode="create"`).
   - **Fixed Asset Register Edit Form**: `src/app/assets/register/[id]/edit/page.tsx` rendering `src/ui/assets/FixedAssetForm.tsx` (`mode="edit"`).
   - **Standard Asset Create Form**: `src/app/assets/create/page.tsx` rendering `src/app/assets/create/ui/AssetCreateForm.tsx`.
   - **Standard Asset Edit Form**: `src/app/assets/[id]/edit/page.tsx` rendering `src/app/assets/[id]/edit/ui/AssetEditForm.tsx`.
   - **Locations Admin Page**: `src/app/locations/page.tsx` rendering `src/ui/locations/LocationsTable.tsx`.
   - **Relevant APIs & Validators**:
     - Fixed Asset API: `src/app/api/fixed-assets/route.ts` & `src/app/api/fixed-assets/[id]/route.ts`.
     - Asset Core API: `src/app/api/asset/route.ts` (GET, POST, PUT, DELETE) and `src/app/api/asset/validate/route.ts`.
     - Master APIs: `/api/location`, `/api/departments`, `/api/statusType`, `/api/assetCategory`, `/api/manufacturer`, `/api/model`, `/api/supplier`.
     - Zod Validation: `src/lib/validation.ts` (`createAssetSchema`, `updateAssetSchema`).

3. **Core Architectural Imperatives**:
   - **Two Independent Location Fields**: Location (1st) and Location (2nd) must never share state or cascade changes. Choosing, searching, clearing or editing one has zero effect on the other. Each has its own distinct options built from its own column values in the database.
   - **Two Independent Condition Fields**: Condition (1st) and Condition (2nd) are separate selects, independently validated and saved.
   - **Zero Data Loss**: Raw text columns (`location1`, `location2Raw`, `condition1Raw`, `condition2Raw`, `sourceDepartment`, etc.) are preserved verbatim. Relations are additive and nullable.

---

## 2. Real Database Discovery Metrics (20,715 Assets)

The database was queried directly using PostgreSQL aggregate and grouping queries. Below are the verified metrics for each candidate field.

### Column Summary Overview

| Field Name | DB Column | Data Type | Total | Blank / Null | Distinct (Raw) | Distinct (Normalized) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Department** | `sourceDepartment` | varchar(255) | 20,715 | 1 (0.005%) | 36 | 36 | **Should become searchable select** |
| **Department ID** | `departmentId` | uuid | 20,715 | 13,537 (65.3%) | 14 | 14 | Relation to `departments` |
| **Department Code** | `departmentCode` | varchar(20) | 20,715 | 20,714 (99.9%) | 1 | 1 | Derived code |
| **Location (1st)** | `location1` | varchar(500) | 20,715 | 1,968 (9.50%) | **2,611** | **2,476** | **Should become searchable combobox** |
| **Location (2nd)** | `location2Raw` | varchar(500) | 20,715 | 3,074 (14.8%) | **2,350** | **2,260** | **Should become searchable combobox** |
| **Location ID** | `locationid` | uuid | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `location` |
| **Condition (1st)** | `condition1` | varchar(50) | 20,715 | 813 (3.92%) | 3 | 3 | **Should become standard select** |
| **Condition (1st Raw)** | `condition1Raw` | varchar(255) | 20,715 | 813 (3.92%) | 8 | 5 | Raw import column |
| **Condition (2nd Raw)** | `condition2Raw` | varchar(255) | 20,715 | 1,203 (5.81%) | 12 | 8 | **Should become standard select** |
| **Status / Condition ID** | `statustypeid` | uuid | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `statusType` |
| **Category Code** | `categoryCode` | varchar(100) | 20,715 | 2,896 (13.9%) | **264** | **264** | **Should become searchable combobox** |
| **Asset Category ID** | `assetcategorytypeid` | uuid | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `assetCategoryType` |
| **Model ID** | `modelid` | uuid | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `model` |
| **Manufacturer ID** | `manufacturerid` | uuid | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `manufacturer` |
| **Supplier ID** | `supplierid` | uuid | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `supplier` |
| **Assigned To** | `userAssets` | table | 20,715 | 20,715 (100%) | 0 | 0 | Relation to `user` |
| **Description** | `assetname` | varchar | 20,715 | 0 (0%) | 1,958 | 1,860 | **Free text (Keep with validation)** |
| **Property No** | `serialnumber` | varchar | 20,715 | 0 (0%) | 20,715 | 20,715 | **Free text (Keep with validation)** |
| **Asset Tag** | `assettag` | varchar | 20,715 | 0 (0%) | 20,715 | 20,715 | **Free text (Keep with validation)** |
| **Finance No (1st)** | `financeNo1` | varchar(255) | 20,715 | 14,567 (70.3%) | 2,898 | 2,887 | **Free text (Keep with validation)** |
| **Finance No (2nd)** | `financeNo2` | varchar(255) | 20,715 | 15,051 (72.6%) | 2,940 | 2,931 | **Free text (Keep with validation)** |
| **S.No** | `serialNo` | varchar(100) | 20,715 | 152 (0.73%) | 637 | 637 | **Free text (Keep with validation)** |
| **Property Key** | `propertyKey` | varchar(255) | 20,715 | 1 (0.005%) | 20,459 | 20,459 | System composite key |
| **Additional Data** | `additionalData` | text | 20,715 | 17,836 (86.1%) | 2,175 | 2,168 | **Free text (Keep with validation)** |
| **Notes / Remarks** | `notes`, `remark` | text | 20,715 | 20,715 (100%) | 0 | 0 | **Free text (Keep with validation)** |
| **Specs** | `specs` | text | 20,715 | 20,715 (100%) | 0 | 0 | **Free text (Keep with validation)** |

---

### Detailed Value Distributions

#### 1. Department (`sourceDepartment` vs `departments` Master Table)
- **Total rows**: 20,715 | **Blank**: 1 | **Distinct raw**: 36 | **Distinct normalized**: 36
- **Existing `departments` rows**: 83 active official departments in MSF hierarchy.
- **Top 15 values in `sourceDepartment` with counts**:
  1. `Medical`: 2,247
  2. `house`: 1,938
  3. `Plantation`: 1,832 *(Linked to ID `1e5c6411-6da9-40c0-80d1-bbb07d72bc30` - PLANTATION)*
  4. `Guest House`: 1,772 *(Linked to ID `50265583-b437-4e04-82a4-c0c9f756fb58` - GUEST HOUSE)*
  5. `Staf2`: 1,421
  6. `Logestic`: 1,293
  7. `Technical`: 1,211 *(Linked to ID `da253b42-e078-4107-b001-33c4a88656d7` - TECHNICAL)*
  8. `Human Resource`: 1,029
  9. `Resrech`: 957
  10. `Finance`: 887
  11. `FEM`: 870
  12. `Worker club`: 773 *(Linked to ID `c339a6d7-4bc4-4545-a7d7-0953de0df834` - WORKER CLUB)*
  13. `General Manager`: 709
  14. `Facility Management`: 592
  15. `Production`: 408 *(Linked to ID `4aea5644-0e6f-4042-b0ef-91b0a6233708` - PRODUCTION)*
- Remaining 21 departments include: `Purchase` (388), `ICT Mgt Service` (354), `Security` (265, linked), `Ethanol` (253), `Community` (239), `Harvesting` (189, linked), `L.P.C.D` (163, linked), `Civil Work` (155, linked), `Audit Service` (142, linked), `Building` (139, linked), `Legal Service` (98, linked), `Survey` (95), `Anti-Corr` (56), `Office &Factory Bulding` (49), `Irrgation1` (48), `Gender Office` (35), `Police` (30, linked), `Park & Leans` (26), `Code 35` (24), `Code 40` (19), `HIV` (8).

#### 2. Location (1st) (`location1`)
- **Total rows**: 20,715 | **Blank**: 1,968 (9.50%) | **Distinct raw**: 2,611 | **Distinct normalized**: 2,476
- **Existing `location` table rows**: 0
- **Top 20 values in `location1` with counts**:
  1. `Workers Club`: 716
  2. `Library`: 623
  3. `General Manager`: 478
  4. `Guest House Store`: 451
  5. `Coference Room`: 316
  6. `Community Center`: 315
  7. `Guest House`: 276
  8. `Finance Archive`: 264
  9. `Library Room`: 252
  10. `F.E.M.D`: 229
  11. `Field Equipment Team Division`: 226
  12. `Adminstration Office`: 201
  13. `Merti 3rd`: 189
  14. `Clinic`: 187
  15. `Muda korekoro Bite`: 185
  16. `Guest house 2`: 178
  17. `Workers Club Store`: 174
  18. `Technical`: 152
  19. `Civil Work`: 144
  20. `Audit Archive`: 142

#### 3. Location (2nd) (`location2Raw`)
- **Total rows**: 20,715 | **Blank**: 3,074 (14.8%) | **Distinct raw**: 2,350 | **Distinct normalized**: 2,260
- **Existing `location` table rows**: 0
- **Top 20 values in `location2Raw` with counts**:
  1. `Workers Club`: 578
  2. `Field Equipment Team Division`: 350
  3. `Community Center`: 328
  4. `Library Room`: 233
  5. `Guest House Store`: 230
  6. `Muda korekoro Bite`: 205
  7. `Merti 3rd`: 182
  8. `Guest House`: 181
  9. `Technical`: 178
  10. `Coference Room`: 166
  11. `F.E.M.D`: 159
  12. `Civil Work`: 144
  13. `Guest house 2`: 138
  14. `Adminstration Office`: 137
  15. `Merti 1st Awash Camp`: 133
  16. `Wonji Traing Center`: 130
  17. `Admin Archive`: 129
  18. `Library`: 129
  19. `Store`: 126
  20. `G/M/Store`: 124

#### 4. Condition (1st) (`condition1` & `condition1Raw`)
- **Total rows**: 20,715 | **Blank / Null**: 813 (3.92%)
- **Complete list of distinct values in `condition1Raw`**:
  1. `Good`: 15,739
  2. `N/F`: 3,645
  3. `GOOD`: 505
  4. `Goood`: 5
  5. `good`: 4
  6. `N.F`: 2
  7. `God`: 1
  8. `GOood`: 1
  *(Plus `null`: 813)*
- Note: `condition1` was partially mapped on initial import to `Good` (16,254), `N/F` (3,647), and `God` (1).

#### 5. Condition (2nd) (`condition2Raw`)
- **Total rows**: 20,715 | **Blank / Null**: 1,203 (5.81%)
- **Complete list of distinct values in `condition2Raw`**:
  1. `Good`: 13,090
  2. `N/F`: 4,592
  3. `GOOD`: 1,759
  4. `Scrap`: 44
  5. `DEMONSHED`: 14
  6. `Goood`: 5
  7. `good`: 3
  8. `g`: 1
  9. `demonshed`: 1
  10. `n/F`: 1
  11. `Dood`: 1
  12. `N`: 1
  *(Plus `null`: 1,203)*

#### 6. Category Code (`categoryCode`)
- **Total rows**: 20,715 | **Blank / Null**: 2,896 (13.9%) | **Distinct raw**: 264 | **Distinct normalized**: 264
- **Existing `assetCategoryType` rows**: 0
- **Top 15 values in `categoryCode` with counts**:
  1. `6.1`: 2,728
  2. `6.4`: 1,328
  3. `10.44`: 1,026
  4. `7.3`: 1,016
  5. `6.2`: 952
  6. `6.5`: 802
  7. `6.6`: 527
  8. `6.40`: 505
  9. `7.42`: 468
  10. `7.2`: 428
  11. `10.42`: 370
  12. `10.41`: 342
  13. `6.3`: 338
  14. `10.43`: 326
  15. `6.11`: 315

---

## 3. Form Field Inventory & Classification

Below is the verified inventory covering all fields on the Add Asset and Edit Asset forms:

| Form Field | UI Form Location | DB Column | Current Widget | Action Required | Target Widget & Master Table |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Department** | FixedAssetForm, AssetCreateForm, AssetEditForm | `departmentId` (relates to `Department`), `sourceDepartment` | Native `<select>` / Radix `<Select>` | **Convert to Searchable Combobox** | Combobox populated from `departments` table (scoped to org, department code displayed) |
| **Location (1st)** | FixedAssetForm | `location1` (text), to add `location1Id` | Free text `<Input>` | **Convert to Searchable Combobox** | Combobox with debounced server search from `location` master (Location 1st slice) |
| **Location (2nd)** | FixedAssetForm, AssetCreateForm, AssetEditForm | `location2Raw` (text), `locationid` (FK to `location`) | Free text `<Input>` / empty `<select>` | **Convert to Searchable Combobox** | Combobox with debounced server search from `location` master (Location 2nd slice), 100% independent of Location 1st |
| **Condition (1st)** | FixedAssetForm | `condition1` (text), `condition1Raw` (text) | Free text `<Input>` | **Convert to Standard Select** | Standard select populated from distinct Condition 1st master set (Good, N/F) |
| **Condition (2nd)** | FixedAssetForm, AssetCreateForm, AssetEditForm | `condition2Raw` (text), `statustypeid` (FK to `statusType`) | Free text `<Input>` / empty `<select>` | **Convert to Standard Select** | Standard select populated from `statusType` master (Good, N/F, Scrap, Demolished), 100% independent of Condition 1st |
| **Category Code** | FixedAssetForm | `categoryCode` (text), to link `assetcategorytypeid` | Free text `<Input>` | **Convert to Searchable Combobox** | Combobox with debounced server search from `assetCategoryType` master |
| **Asset Type / Category** | AssetCreateForm, AssetEditForm | `assetcategorytypeid` (FK to `assetCategoryType`) | `SelectWithQuickCreate` | **Keep & Upgrade** | Connect to `assetCategoryType` master populated from `categoryCode` |
| **Status** | AssetCreateForm, AssetEditForm | `statustypeid` (FK to `statusType`) | `SelectWithQuickCreate` | **Keep & Upgrade** | Connect to `statusType` master populated from condition entries |
| **Brand / Manufacturer**| AssetCreateForm, AssetEditForm | `manufacturerid` (FK to `manufacturer`) | `SelectWithQuickCreate` | **Keep & Upgrade** | Searchable combobox; master table currently has 0 rows |
| **Model** | AssetCreateForm, AssetEditForm | `modelid` (FK to `model`) | `SelectWithQuickCreate` | **Keep & Upgrade** | Searchable combobox; master table currently has 0 rows |
| **Supplier** | AssetCreateForm, AssetEditForm | `supplierid` (FK to `supplier`) | `SelectWithQuickCreate` | **Keep & Upgrade** | Searchable combobox; master table currently has 0 rows |
| **Assigned To** | AssetDetailActions / Checkout | `userAssets` | Dialog `<Select>` | **Keep & Upgrade** | Searchable combobox populated from `user` table |
| **Description** | FixedAssetForm, AssetCreateForm, AssetEditForm | `assetname` | Free text `<Input>` | **Keep as Free Text** | Text input with required validation |
| **Property No** | FixedAssetForm, AssetCreateForm, AssetEditForm | `serialnumber` | Free text `<Input>` | **Keep as Free Text** | Text input with unique PID validation |
| **Asset Tag** | AssetCreateForm, AssetEditForm | `assettag` | Free text `<Input>` | **Keep as Free Text** | Text input with unique tag validation |
| **Finance No (1st)** | FixedAssetForm | `financeNo1` | Free text `<Input>` | **Keep as Free Text** | Text input with validation |
| **Finance No (2nd)** | FixedAssetForm | `financeNo2` | Free text `<Input>` | **Keep as Free Text** | Text input with validation |
| **S.No** | FixedAssetForm | `serialNo` | Free text `<Input>` | **Keep as Free Text** | Text input with validation |
| **Review Date (1st)** | FixedAssetForm | `reviewDate1` | Date `<Input type="date">` | **Keep as Date Picker** | Date picker |
| **Review Date (2nd)** | FixedAssetForm | `reviewsDate` | Date `<Input type="date">` | **Keep as Date Picker** | Date picker |
| **Additional Data** | FixedAssetForm | `additionalData` | Free text `<Textarea>` | **Keep as Free Text** | Multi-line text area |
| **Notes / Remarks** | AssetCreateForm, AssetEditForm | `notes`, `remark`, `specs` | Free text `<Textarea>` | **Keep as Free Text** | Multi-line text area |
| **Hidden In Source** | FixedAssetForm | `hiddenInSource` | `<Checkbox>` | **Keep as Checkbox** | Boolean checkbox |

---

## 4. Proposed Condition Grouping for Review

The database contains spelling and case variants of Condition in both 1st and 2nd review columns. In accordance with Rule 3, the proposed mapping groups obvious typographical errors and case differences into clean master entries while leaving the raw original columns untouched.

### Condition (1st Review)
| Raw Value in DB | Occurrence Count | Proposed Master Value | Rationale |
| :--- | :--- | :--- | :--- |
| `Good` | 15,739 | **Good** | Standard spelling |
| `GOOD` | 505 | **Good** | Uppercase variant |
| `Goood` | 5 | **Good** | Obvious typo (extra 'o') |
| `good` | 4 | **Good** | Lowercase variant |
| `GOood` | 1 | **Good** | Mixed-case typo |
| `God` | 1 | **Good** | Obvious single-letter omission typo |
| `N/F` | 3,645 | **N/F** | Standard Not Functioning acronym |
| `N.F` | 2 | **N/F** | Punctuation variant |
| `null` / blank | 813 | *(null / unassigned)* | Left blank; untouched |

### Condition (2nd Review)
| Raw Value in DB | Occurrence Count | Proposed Master Value | Rationale |
| :--- | :--- | :--- | :--- |
| `Good` | 13,090 | **Good** | Standard spelling |
| `GOOD` | 1,759 | **Good** | Uppercase variant |
| `Goood` | 5 | **Good** | Obvious typo (extra 'o') |
| `good` | 3 | **Good** | Lowercase variant |
| `g` | 1 | **Good** | Single-letter abbreviation for Good |
| `Dood` | 1 | **Good** | Single-letter keyboard typo ('D' adjacent to 'G') |
| `N/F` | 4,592 | **N/F** | Standard Not Functioning acronym |
| `n/F` | 1 | **N/F** | Lowercase variant |
| `N` | 1 | **N/F** | Single-letter abbreviation for N/F |
| `Scrap` | 44 | **Scrap** | Standard condition |
| `DEMONSHED` | 14 | **Demolished** | MSF inventory term for demolished building/asset |
| `demonshed` | 1 | **Demolished** | Lowercase variant |
| `null` / blank | 1,203 | *(null / unassigned)* | Left blank; untouched |

---

## 5. Proposed Schema & Architectural Plan for Confirmation

### Reversible, Additive Schema Additions
To maintain complete backward compatibility and enforce the strict independence between Location (1st) and Location (2nd), we propose:
1. **Location Relations**:
   - `locationid` already exists on `model asset` (FK to `location`). We will designate `locationid` as the relation for **Location (2nd)** (matching `FixedAssetForm` where `locationid` is currently assigned to 2nd review location, preserving existing relations).
   - Add nullable column `location1Id` (Uuid, FK to `location`) to `model asset` for **Location (1st)**.
   - Raw columns `location1` and `location2Raw` remain completely untouched.
2. **Category Code Relations**:
   - `assetcategorytypeid` already exists on `model asset` (FK to `assetCategoryType`).
   - `categoryCode` remains untouched.
   - Master entries in `assetCategoryType` will store both `assetTypeCode` (e.g. `6.1`) and `assetcategorytypename` (e.g. `6.1`).
3. **Master Entry Fields Required by Spec**:
   - In `location`: ensure columns `locationname`, `normalizedName` (or `normalizedLocationName`), `isActive` (boolean default true), `usageCount` (integer default 0), `organizationId` (Uuid).
   - In `statusType`: `statustypename`, `normalizedName`, `color`, `organizationId`, `isDefault`, `isActive`, `usageCount`.
   - In `assetCategoryType`: `assetcategorytypename`, `assetTypeCode`, `normalizedName`, `organizationId`, `isActive`, `usageCount`.
   - All additions are additive, nullable, and non-destructive.

---

## 6. Next Steps (Holding for User Confirmation)

In compliance with the Process instructions:
> *"Stop for my confirmation after discovery (inventory and distinct-value report) and before applying any migration, the condition grouping or the backfill."*

We are **stopping here** for your explicit approval before proceeding to:
1. Presenting the exact Prisma schema diff and raw migration SQL.
2. Running the idempotent master list builder script to populate `location`, `statusType`, and `assetCategoryType` from distinct database values.
3. Applying the condition grouping mapping.
4. Running the backfill to link asset foreign keys (`departmentId`, `location1Id`, `locationid`, `statustypeid`, `assetcategorytypeid`) while leaving all raw text intact.
