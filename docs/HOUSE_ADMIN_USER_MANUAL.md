# HOUSING ALLOCATION MANAGEMENT SYSTEM (HAMS)

## Complete Professional User Manual

**Version:** 1.0  
**Last Updated:** October 7, 2026  
**System:** AssetTracker - House Administration Module

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Getting Started](#2-getting-started)
3. [House Request Management](#3-house-request-management)
4. [House Queue & Allocation](#4-house-queue--allocation)
5. [House Register Management](#5-house-register-management)
6. [Release Workflow](#6-release-workflow)
7. [Inspection Management](#7-inspection-management)
8. [Engine Configuration](#8-engine-configuration)
9. [Reporting & Analytics](#9-reporting--analytics)
10. [Permissions & Access Control](#10-permissions--access-control)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. SYSTEM OVERVIEW

### 1.1 What is HAMS?

The Housing Allocation Management System (HAMS) is a comprehensive enterprise solution for managing residential housing allocation for employees. The system handles the complete lifecycle from employee housing requests through allocation, occupancy, and eventual release with damage assessment.

### 1.2 Key Features

- **Intelligent Priority Queue**: Dual-engine system combining Multi-Criteria Decision Analysis (MCDA) priority ranking with smart house recommendations
- **Automated Eligibility**: Job grade-based automatic eligibility determination
- **Complete Lifecycle Management**: From request to allocation to release with inspection
- **Damage Assessment**: Structured handback inspection with cost tracking
- **Audit Trail**: Complete transaction history for compliance
- **Excel Import/Export**: Bulk operations for house register management
- **Configurable Rules**: Versioned engine configuration for weights, eligibility bands, and recommendation rules

### 1.3 System Architecture

**Core Components:**

1. **House Request System**: Employee application gateway
2. **House Queue Engine**: Dual-engine priority & recommendation system
3. **House Register**: Inventory of all housing units
4. **Allocation Ledger**: Decision history and current assignments
5. **Release Workflow**: Multi-stage termination process
6. **Inspection System**: Damage assessment that finalises a house release
7. **Engine Configuration**: Versioned policy management

---

## 2. GETTING STARTED

### 2.1 Access Requirements

**Required Permissions:**

- house_queue:view - View the house queue
- house_queue:allocate - Approve/reassign houses
- house_queue:manage - Skip, defer, release operations
- household:view - View house register
- household:add - Add new houses
- household:edit - Edit existing houses
- house_inspection:view - View inspections
- house_inspection:edit - Conduct inspections

### 2.2 Navigating the Interface

**Main Menu Locations:**

- **Dashboard** → Housing Overview (KPIs, occupancy, alerts)
- **Admin** → House Queue (priority queue management)
- **Admin** → House Register (inventory management)
- **Admin** → House Requests (application management)
- **Admin** → House Inspections (handback management)
- **Admin** → Engine Config (policy configuration)

---

## 3. HOUSE REQUEST MANAGEMENT

### 3.1 Overview

House Requests are the entry ticket to the housing queue. Only employees with an active (submitted) request appear in the priority queue.

### 3.2 Submitting a Request

**Process:**

1. Navigate to **House Requests** → **New Request**
2. Enter Employee ID and click **Lookup**
3. System validates eligibility:
   - Job grade must qualify (see Eligibility Rules below)
   - Employee must not have an existing allocation
   - Employee must not have another active request
4. Review pre-populated employee information
5. Enter **Remarks** (minimum 10 characters, required justification)
6. Click **Submit Request**

**Eligibility Rules:**

| Job Grade         | House Category       |
| ----------------- | -------------------- |
| 18+               | Staff (SA-SE houses) |
| 15-17             | Category A           |
| 12-14             | Category B           |
| 10-11             | Category C           |
| 7-9               | Category D           |
| 1-6               | Category E           |
| 0, null, negative | Not Eligible         |

### 3.3 Request Statuses

- **Submitted**: Active request, employee is in the queue
- **Cancelled**: Closed request, employee removed from queue

### 3.4 Cancelling a Request

1. Navigate to **House Requests**
2. Find the request in the list
3. Click **Actions** → **Cancel**
4. Confirm cancellation
5. Employee is immediately removed from queue

---

## 4. HOUSE QUEUE & ALLOCATION

### 4.1 Queue Overview

The House Queue is a **live computed view** that ranks all employees with active requests by priority and recommends the best available house for each.

**Key Principles:**

- Queue is **read-only** - recomputed on every view
- **No caching** - always reflects current data
- Entry **gated by House Request** - no request = not in queue
- Ranks within **job grade intervals**, not individual grades

### 4.2 Understanding the Dual-Engine System

#### Engine A: MCDA Priority Ranking

Ranks employees **within their job grade interval** using weighted criteria:

| Criterion          | Default Weight | Description                                     |
| ------------------ | -------------- | ----------------------------------------------- |
| **Service Years**  | 40%            | Length of service (whole years since hire date) |
| **Marital Status** | 25%            | Married=3, Widowed=2, Divorced=1, Single=0      |
| **Disability**     | 20%            | 1=yes, 0=no                                     |
| **Gender**         | 15%            | Equal by default (both=1)                       |

**Process:**

1. Each criterion is min-max normalized to [0,1] within the cohort
2. Normalized values × weights = composite score (0-1 range)
3. Higher score = higher priority

**Tie-Breaking Chain** (deterministic):

1. Composite score (highest wins)
2. Service years (more wins)
3. Hire date (earlier wins)
4. Employee number (ascending)

#### Engine B: House Recommendation

Selects the **best available house** from the employee's eligible category:

**Ranking Rules** (configurable):

1. **Regular before Guest** (default: enabled)
2. **Location** (default: ascending alphabetical)
3. **House Number** (default: numeric-aware, e.g., A2 before A10)
4. **HID** (final anchor)

**Important:** Each house is recommended to only ONE employee per pass (priority order).

### 4.3 Queue Statuses

**Derived Statuses** (computed live):
-

ot_eligible: Job grade doesn't qualify

- waiting: Eligible but no decision made
-

o_house_available: Eligible but no houses in their category
-

eady_for_allocation: Eligible with available house

**Persisted Statuses** (in allocation ledger):

- llocated: House assigned to employee
-

elease_pending / RELEASE_PENDING: Release initiated, awaiting inspection

- pending_inspection / PENDING_INSPECTION: Inspection scheduled/ongoing
- skipped: Permanently excluded from queue
- deferred: Temporarily postponed
-

eleased: House vacated and returned to pool

- erminated: Reason-coded release (archived)

### 4.4 Allocation Actions

#### 4.4.1 Approve/Assign

**When to Use:** Allocate a house to an employee

**Process:**

1. Navigate to **House Queue**
2. Locate employee (use filters/search if needed)
3. Click **Approve** or **Assign**
4. System shows recommended house (or select different house)
5. Confirm allocation
6. Status changes to llocated
7. House marked as occupied
8. Audit entry created

**Transfer/Reassignment:**

- Same action used to move allocated employee to different house
- System tracks previous house, move count, and move date
- Old house becomes available (unless released)

#### 4.4.2 Skip

**When to Use:** Permanently exclude employee from queue (policy decision)

**Process:**

1. Select employee from queue
2. Click **Skip**
3. Enter reason (optional, max 500 characters)
4. Confirm skip
5. Employee status changes to skipped
6. Remains out of queue until manually reactivated

#### 4.4.3 Defer

**When to Use:** Temporarily postpone allocation (e.g., employee on leave)

**Process:**

1. Select employee from queue
2. Click **Defer**
3. Enter reason (optional)
4. Confirm defer
5. Status changes to deferred
6. Can be reactivated later

---

## 5. HOUSE REGISTER MANAGEMENT

### 5.1 Overview

The House Register is the **authoritative inventory** of all housing units. Every house in the queue's recommendation pool comes from this register.

### 5.2 House Identification

**House ID (HID):**

- Format: 106-90-NNN (e.g., 106-90-001)
- Auto-generated by system
- Canonical identifier for all operations

**House Number:**

- Format: Family prefix + numeric suffix
- **Staff Houses**: SA1-SA999, SB1-SB999, SC1-SC999, SD1-SD999, SE1-SE999
- **Category Houses**: A1-A999, B1-B999, C1-C999, D1-D999, E1-E999
- Must match house type (validated on creation)

### 5.3 House Types & Categories

| House Type | Staff Category | House Number Prefix | Example          |
| ---------- | -------------- | ------------------- | ---------------- |
| **Staff**  | A              | SA                  | SA1, SA12, SA123 |
| **Staff**  | B              | SB                  | SB1, SB2         |
| **Staff**  | C              | SC                  | SC5              |
| **Staff**  | D              | SD                  | SD10             |
| **Staff**  | E              | SE                  | SE3              |
| **A**      | n/a            | A                   | A1, A15          |
| **B**      | n/a            | B                   | B7               |
| **C**      | n/a            | C                   | C2               |
| **D**      | n/a            | D                   | D9               |
| **E**      | n/a            | E                   | E4               |

### 5.4 House Statuses

- **Active**: Ready for occupancy, appears in available pool
- **Inactive**: Under maintenance, removed from pool
- **PendingInspection**: Vacated, awaiting inspection completion
- **UnderMaintenance**: Post-inspection, damage found

### 5.5 Occupancy Status

- **Vacant**: No current allocation
- **Occupied**: Allocated to employee

### 5.6 Adding a House

**Process:**

1. Navigate to **House Register** → **Add House**
2. Enter house details:
   - **House Number**: Follow naming convention (validated)
   - **House Type**: Staff, A, B, C, D, or E
   - **Staff Category**: Required only for Staff houses (A-E)
   - **R/G Type**: Regular or Guest
   - **Location**: Optional location name
   - **Status**: Active (default) or Inactive
   - **Inside Items**: Bed/Chair/Locker/Table counts (optional)
   - **Damage Information**: Required only if Status=Inactive
3. Click **Save**
4. System auto-generates HID (106-90-NNN format)
5. SR No auto-assigned
6. Default occupancy status: Vacant

### 5.7 Editing a House

1. Navigate to **House Register**
2. Find house (search/filter)
3. Click **Edit**
4. Modify allowed fields:
   - Location name
   - R/G Type
   - Inside item counts
   - Status (Active/Inactive)
   - Damage information (if Inactive)
5. **Cannot modify**: HID, House Number, House Type (locked after creation)
6. Click **Save**

### 5.8 Deactivating a House

**When to Use:** House needs maintenance/repair

**Process:**

1. Select house from register
2. Click **Deactivate**
3. **Required:** Check at least ONE damage item:
   - Window
   - Door
   - Water Panel
   - Roof
   - Wall
   - Electricity
4. Enter Damage Notes (optional, max 1000 chars)
5. Confirm deactivation
6. Status changes to Inactive
7. House removed from available pool
8. Cannot be allocated until reactivated

### 5.9 Bulk Import (Excel)

**When to Use:** Import multiple houses at once

**Process:**

1. Download template from **House Register** → **Import** → **Download Template**
2. Fill Excel file:
   - **Required Columns**: House Number, House Type, R/G Type
   - **Conditional**: Staff Category (required if House Type=Staff)
   - **Optional**: HID, Location, Status, Item Counts, Damage info
3. Upload file
4. Select import mode:
   - **Add**: Only create new houses
   - **Update**: Only modify existing houses (requires Edit permission)
   - **Add + Update**: Both operations
5. Review validation results:
   - ✅ Valid rows shown in green
   - ❌ Invalid rows shown in red with error messages
6. Click **Confirm Import**
7. System processes in transaction
8. Review summary: created/updated/failed counts

**Common Import Errors:**

- House number family mismatch (e.g., A1 for Staff house)
- Missing Staff Category for Staff houses
- Duplicate house number/HID
- Invalid damage checklist (Inactive without damage)
- Invalid R/G Type value

---

## 6. RELEASE WORKFLOW

### 6.1 Overview

The Release Workflow is a **two-gate process** for terminating house allocations. The gates ensure no vacated house returns to the pool without proper inspection and authorization.

**Safety Property:** House stays OUT of pool from release initiation until the handback inspection is completed.

### 6.2 Release Reasons (Branches)

- **TRANSFER**: Employee moving to different house (REASSIGN action, not Release Workflow)
- **EMPLOYEE_LEAVE**: Employee leaving organization
- **RETIREMENT**: Employee retiring

### 6.3 Release Process

#### Step 1: Initiate Release

**Who:** House Queue Manager

**Process:**

1. Navigate to **House Queue**
2. Select allocated employee
3. Click **Release** **Initiate**
4. Select reason branch:
   - Employee Leave
   - Retirement
5. Enter optional reason note (max 500 chars)
6. Click **Initiate Release**
7. Allocation status RELEASE_PENDING
8. House status PendingInspection
9. Inspection auto-scheduled (next working day at 10:00 AM)

#### Step 2: Schedule Inspection (Auto or Manual)

**Who:** Facility Manager

**Auto-Scheduling:**

- System calculates next working day at 10:00 AM
- Skips weekends (Saturday/Sunday)
- Respects Ethiopian public holidays

**Manual Rescheduling:**

1. Navigate to **House Inspections**
2. Find pending inspection
3. Click **Reschedule**
4. Select inspector (optional)
5. Choose date (YYYY-MM-DD)
6. Save

#### Step 3: Complete Inspection — this finalises the release

**Who:** Assigned Inspector

**Process:**

1. Navigate to **House Inspections** **My Inspections**
2. Select inspection
3. Complete damage checklist:

**Damage Items:**

- Window
- Door
- Water Panel
- Roof
- Wall
- Electricity

4. For each damaged item, enter **repair cost** (ETB):
   - Required for damaged items
   - Must be positive amount
   - Maximum 2 decimals (e.g., 1250.50)
   - System calculates total automatically

5. Complete inside items checklist:
   - Bed count
   - Chairs count
   - Locker count
   - Tables count
   - Check "Inside Items OK" if all present

6. Enter Condition Note (optional, max 1000 chars)
7. Upload photos (optional)
8. Click **Complete Inspection**

**What happens on completion (all in one transaction):**

- Validates all damaged items have costs
- Records the damage assessment and the inspection resolution
- Allocation status `released`, with a `terminatedAt` timestamp
- House status `Active` (no damage) or `UnderMaintenance` (damage found)
- House returns to the available pool if `Active`
- The allocation is filed on the **Terminated Houses** page

**Validation Rules:**

- Damaged item WITHOUT cost Rejected, nothing is written
- OK item with cost Accepted (cost ignored)
- No costs entered but items checked Rejected
- Completing an already-completed inspection Rejected
- Release no longer pending Rejected, the house is NOT returned to the pool

**Why this is safe:** releasing the house and recording the termination happen in a
single database transaction. Either both happen or neither does, so a house can
never be listed as terminated while still out of the pool, nor returned to the pool
without being archived.

### 6.4 Termination Receipt

**What:** Signed document printing damage snapshot

**When Generated:** On first print after inspection completion

**Contents:**

- Receipt No (form serial number)
- Employee information
- House information
- Damage checklist with costs
- Total damage cost
- Condition note
- Inspection completion date
- Print date and count

**Important:** Receipt is **frozen snapshot**:

- Reprint shows SAME data as original
- Later inspection changes do NOT affect printed receipt
- Ensures signed document integrity

**Where it is printed:** the **Receipt** button on the Inspections page and the
same button on the **Terminated Houses** archive print one identical document
(form OF/MSF/HRSM/293), from the same snapshot. The archive holds no separate
version. Printing becomes available only once the handback inspection is done
and marked complete; before that the button is withheld and says why.

---

## 7. INSPECTION MANAGEMENT

### 7.1 Overview

Inspections are the **handback verification** step in the Release Workflow. Every house termination (Employee Leave, Retirement) triggers an inspection.

### 7.2 Inspection Lifecycle

1. **Scheduled**: Auto-created by release execution
2. **In Progress**: Inspector assigned and conducting inspection
3. **Completed**: Checklist filled and saved; the release is finalised in the same
   step, archiving the allocation and returning the house to stock

### 7.3 Viewing Inspections

**All Inspections:**

1. Navigate to **House Inspections**
2. View list with filters:
   - Status (Scheduled/Completed)
   - Inspector
   - Date range
   - House

**My Inspections (Inspector View):**

1. Navigate to **House Inspections** → **My Inspections**
2. Shows only inspections assigned to you
3. Sorted by scheduled date

### 7.4 Damage Cost Guidelines

**Fixed Part Damage:**

| Component   | Typical Range (ETB) |
| ----------- | ------------------- |
| Window      | 500 - 5,000         |
| Door        | 1,000 - 8,000       |
| Water Panel | 800 - 3,000         |
| Roof        | 2,000 - 15,000      |
| Wall        | 1,500 - 10,000      |
| Electricity | 500 - 4,000         |

**Inside Items:**

- Deducted from employee final settlement
- Tracked as count deltas (expected vs found)
- Not included in damage cost total

### 7.5 Inspection Reports

**Available Reports:**

- **Pending Inspections**: All scheduled, not completed
- **Completed Inspections**: By date range, inspector, outcome
- **Damage Cost Summary**: Total costs per period
- **House Condition Trends**: Damage frequency over time

---

## 8. ENGINE CONFIGURATION

### 8.1 Overview

Engine Configuration is the **versioned policy system** that controls:

1. **MCDA Weights**: Priority criteria importance
2. **Eligibility Bands**: Job grade → house category mapping
3. **Recommendation Rules**: House selection preferences

**Key Principles:**

- **Versioned**: Every config change creates new version
- **Draft → Preview → Publish** workflow
- **Rollback-friendly**: Old versions archived, not deleted
- **Live vs Draft**: Draft changes don't affect queue until published

### 8.2 Configuration Lifecycle

**Statuses:**

- **draft**: Work in progress, not visible to queue
- **active**: Currently running, affects all allocations
- **archived**: Historical version, replaced by newer publish

**Constraints:**

- At most ONE active version per organization
- At most ONE draft version per organization
- Publishing supersedes previous active (archives it)

### 8.3 Editing Configuration

**Who:** Admin role required for weights/eligibility; Manager+ for recommendation rules

**Process:**

1. Navigate to **Admin** → **Engine Config**
2. Click **Edit** (creates/updates draft)
3. Modify sections (see below)
4. Click **Save Draft** (no impact on live queue)
5. Click **Preview** to see simulation results
6. Click **Publish** to activate
7. Previous active version archived

### 8.4 MCDA Weights Configuration

**Rules:**

- All weights must sum to exactly 1.0
- Each weight: 0.0 to 0.7 (single weight cap)
- Four criteria: serviceYears, maritalStatus, disability, gender

**Default Values:**
`serviceYears: 0.4 (40%)
maritalStatus: 0.25 (25%)
disability: 0.2 (20%)
gender: 0.15 (15%)`

**Customization Example:**
`// Emphasize seniority more
serviceYears: 0.5
maritalStatus: 0.2
disability: 0.2
gender: 0.1`

**Impact:** **HIGH** - Reorders entire active queue

### 8.5 Eligibility Bands Configuration

**Rules:**

- Bands must cover all grades 1-999 without gaps
- Grade 0 / null always ineligible (invariant)
- Each band: category, gradeMin, gradeMax (null=unbounded)
- Categories: Staff, A, B, C, D, E

**Default Bands:**
`json
[
  { "category": "Staff", "gradeMin": 18, "gradeMax": null },
  { "category": "A", "gradeMin": 15, "gradeMax": 17 },
  { "category": "B", "gradeMin": 12, "gradeMax": 14 },
  { "category": "C", "gradeMin": 10, "gradeMax": 11 },
  { "category": "D", "gradeMin": 7, "gradeMax": 9 },
  { "category": "E", "gradeMin": 1, "gradeMax": 6 }
]
`

**Customization Example:**
`json
// Expand Category A to include grade 14
[
  { "category": "Staff", "gradeMin": 18, "gradeMax": null },
  { "category": "A", "gradeMin": 14, "gradeMax": 17 },  // Changed
  { "category": "B", "gradeMin": 10, "gradeMax": 13 },  // Adjusted
  { "category": "C", "gradeMin": 7, "gradeMax": 9 },    // Adjusted
  { "category": "D", "gradeMin": 4, "gradeMax": 6 },    // Adjusted
  { "category": "E", "gradeMin": 1, "gradeMax": 3 }     // Adjusted
]
`

**Impact:** **CRITICAL** - Changes who is eligible at all

### 8.6 Recommendation Rules Configuration

**Options:**

1. **preferRegularOverGuest** (boolean):
   - rue (default): Regular houses ranked before Guest houses
   - alse: Both treated equally

2. **locationSortDirection** (string):
   - "asc" (default): Ascending alphabetical (A → Z)
   - "desc": Descending (Z → A)

3. **houseNumberSortMode** (string):
   - "numeric_aware" (default): A2 before A10 (correct numeric order)
   - "lexical": A10 before A2 (string comparison)

**Impact:** **LOW** - Affects recommendation order within eligible pool, not priority ranking

### 8.7 Preview Mode

**Purpose:** Simulate config changes before publishing

**Process:**

1. Edit draft configuration
2. Click **Preview**
3. System computes queue with DRAFT config
4. Compare side-by-side:
   - Active config result (left)
   - Draft config result (right)
5. Review changes:
   - Eligibility changes (newly eligible/ineligible)
   - Priority rank changes
   - Recommendation changes
6. Decide: Publish or continue editing

### 8.8 Publishing Configuration

**Pre-Publish Checklist:**

- ✅ Draft validated (weights sum to 1, bands cover all grades, no gaps)
- ✅ Preview reviewed
- ✅ Impact understood (especially for HIGH/CRITICAL blast radius)
- ✅ Authorization obtained (admin re-auth for weights/eligibility)

**Process:**

1. Click **Publish**
2. System prompts re-authentication (if admin-only section changed)
3. Enter credentials
4. Confirm publish
5. System:
   - Archives current active version
   - Promotes draft to active
   - Increments version number
   - Creates audit entries (field-level changes)
6. Queue recomputes with new config on next view

**Rollback:**

1. Navigate to **Engine Config** → **Version History**
2. Select previous version
3. Click **Restore as Draft**
4. Review and publish (becomes new version)

---

## 9. REPORTING & ANALYTICS

### 9.1 Housing Dashboard

**Location:** Dashboard → Housing Overview

**Widgets:**

1. **KPIs:**
   - Total Houses
   - Occupied Houses
   - Vacant Houses
   - Houses Under Maintenance
   - Occupancy Rate (%)

2. **Occupancy by Category Chart:**
   - Bar chart showing occupied/vacant per category (Staff, A-E)

3. **Queue Statistics:**
   - Total Requests
   - Ready for Allocation
   - No House Available
   - Not Eligible

4. **Recent Activity Feed:**
   - Latest allocations
   - Latest releases
   - Latest inspections
   - Timestamp and user

5. **Alerts:**
   - Pending inspections overdue
   - Houses needing maintenance
   - Queue congestion (ready but no houses)

### 9.2 Available Reports

**House Register Reports:**

- House Inventory (all houses, filterable)
- Vacant Houses (by category)
- Occupied Houses (with occupant details)
- Inactive Houses (maintenance list)
- House Utilization by Location

**Queue Reports:**

- Full Queue Snapshot (all requesters, ranked)
- By Grade Interval (Staff, A-E separate tables)
- By Status (ready/allocated/waiting/no house)
- Priority Score Breakdown (MCDA components)

**Allocation Reports:**

- Active Allocations (current assignments)
- Allocation History (all decisions, archived)
- Transfer History (reassignments)
- Released Houses (vacated)

**Inspection Reports:**

- Pending Inspections Worklist
- Completed Inspections (by date range)
- Damage Cost Summary (by period, by part)
- Termination Receipts (printable archive)

**Audit Reports:**

- Allocation Audit Trail (who approved what when)
- Config Change History (field-level diffs)
- Request Audit Log (submissions, cancellations)

### 9.3 Exporting Data

**Formats Supported:**

- Excel (.xlsx)
- CSV
- PDF (reports only)

**Process:**

1. Navigate to report
2. Apply filters (optional)
3. Click **Export** → Select format
4. Download file

---

## 10. PERMISSIONS & ACCESS CONTROL

### 10.1 Role-Based Permissions

**House Queue Permissions:**

- house_queue:view - View queue, basic read access
- house_queue:allocate - Approve, reassign houses
- house_queue:manage - Skip, defer, release actions
- house_queue:audit - View audit trail

**House Register Permissions:**

- household:view - View house register
- household:add - Create houses
- household:edit - Edit houses
- household:delete - Deactivate houses (soft delete)
- household:import - Excel bulk import

**House Request Permissions:**

- house_request:view - View requests
- house_request:submit - Submit new requests (self-service)
- house_request:manage - Cancel any request

**House Inspection Permissions:**

- house_inspection:view - View inspections
- house_inspection:edit - Complete inspections
- house_inspection:schedule - Assign inspectors, reschedule

**Engine Config Permissions:**

- engine_config:view - View config versions
- engine_config:edit_recommendation - Edit recommendation rules
- engine_config:edit_admin - Edit weights/eligibility (admin only)
- engine_config:publish - Publish changes

### 10.2 Recommended Role Assignments

| Role                   | Permissions                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Employee**           | house_request:submit (self-service)                                                                     |
| **HR Clerk**           | house_queue:view, household:view, house_request:view                                                    |
| **HR Manager**         | Above + house_queue:allocate, household:edit, house_request:manage                                      |
| **Facility Inspector** | house_inspection:view, house_inspection:edit                                                            |
| **Facility Manager**   | Above + house_inspection:schedule, household:edit                                                       |
| **House Admin**        | house_queue:_, household:_, house_request:_, house_inspection:_, engine_config:view/edit_recommendation |
| **System Admin**       | All permissions + engine_config:edit_admin, engine_config:publish                                       |

### 10.3 Self-Service Features

**Employees can:**

- Submit their own house request
- View their request status
- Cancel their own request

**Managers can:**

- View team members' allocations
- Submit requests on behalf of team

---

## 11. TROUBLESHOOTING

### 11.1 Common Issues & Solutions

#### Issue: Employee not appearing in queue

**Possible Causes:**

1. No active house request submitted
2. Request cancelled
3. Job grade not eligible
4. Employee archived/inactive

**Solution:**

1. Check if request exists: Navigate to **House Requests** → Search employee
2. If no request: Submit new request
3. Check eligibility: Verify job grade against eligibility rules
4. Check employee status: Must be active employment status

#### Issue: No houses available for category

**Possible Causes:**

1. All houses in category already allocated
2. Houses deactivated (maintenance)
3. House register empty for that category

**Solution:**

1. Check register: Navigate to **House Register** → Filter by category
2. Check occupancy: Review allocated houses
3. Consider releasing unused houses
4. Add new houses to register if needed

#### Issue: A released house is not showing on Terminated Houses

**Possible Causes:**

1. The handback inspection has not been completed yet
2. The release was raised on the wrong employee

**Solution:**

1. Open **House Inspections** and look for a pending inspection on that house.
   A release is only _terminated_ once its inspection is completed; until then the
   allocation is `RELEASE_PENDING` and the house is deliberately held out of the pool.
2. If no inspection exists, the release was never executed — re-run it from the
   House Queue.
3. The Terminated Houses page lists every allocation that has a termination
   timestamp, so a completed release always appears there regardless of the
   employee's current allocation status.

#### Issue: Cannot complete inspection

**Possible Causes:**

1. Damaged item without cost
2. Invalid cost format (>2 decimals)
3. Negative cost value
4. Required fields missing

**Solution:**

1. Enter repair cost for ALL damaged items
2. Use format: 1250.50 (max 2 decimals)
3. Costs must be positive
4. Check required fields: At least one damage item if anything checked

#### Issue: Import fails with validation errors

**Possible Causes:**

1. House number family mismatch
2. Missing Staff Category for Staff houses
3. Duplicate house number/HID
4. Invalid R/G Type value
5. Inactive status without damage checklist

**Solution:**

1. Match house number prefix to house type (SA-SE for Staff, A-E for categories)
2. Always provide Staff Category (A-E) when House Type=Staff
3. Ensure unique house numbers and HIDs
4. Use exact values: "Regular" or "Guest"
5. Check at least one damage item when Status=Inactive

#### Issue: Queue not updating after allocation

**Possible Causes:**

1. Browser cache issue
2. Session stale

**Solution:**

1. Refresh page (F5)
2. Log out and log back in
3. Clear browser cache if persistent

#### Issue: Cannot publish engine config

**Possible Causes:**

1. Weights don't sum to 1.0
2. Eligibility bands have gaps
3. Single weight exceeds 0.7
4. Missing admin authorization

**Solution:**

1. Check weight sum: Must equal exactly 1.0
2. Review bands: Must cover grades 1-999 without gaps
3. No single weight above 0.7
4. Re-authenticate with admin credentials for weights/eligibility changes

### 11.2 Performance Tips

**For Large Queues (>500 employees):**

1. Use filters to narrow view (grade, status)
2. Use search to find specific employees
3. Export to Excel for offline analysis

**For Bulk Operations:**

1. Use Excel import instead of manual entry
2. Import in batches (<500 rows per file)
3. Schedule imports during off-peak hours

**For Reports:**

1. Apply date range filters
2. Export large reports rather than viewing inline
3. Use PDF for archive copies, Excel for data analysis

### 11.3 Data Integrity Checks

**Regular Maintenance:**

- **Monthly**: Audit orphaned allocations (allocated but house no longer exists)
- **Quarterly**: Review deferred/skipped requests (reactivate if appropriate)
- **Annually**: Archive old terminated allocations
- **As needed**: Reconcile house register with physical inventory

### 11.4 Backup & Recovery

**Automated Backups:**

- Database backed up daily at 2:00 AM
- 30-day retention
- Offsite replication

**Manual Exports:**

- Regular export of house register (weekly recommended)
- Export queue snapshots before major config changes
- Export allocation history monthly

**Recovery Scenarios:**

- Accidental allocation: Use audit trail to identify, manually reverse
- Wrong config published: Rollback to previous version
- House deleted: Restore from backup (contact admin)

---

## APPENDICES

### A. Glossary

**HID (House ID)**: Canonical house identifier, format 106-90-NNN

**MCDA (Multi-Criteria Decision Analysis)**: The priority ranking algorithm used by Engine A

**Engine A**: The MCDA-based priority ranking system (who gets a house first)

**Engine B**: The house recommendation system (which house to offer)

**House Request**: Employee's application to join the housing queue

**Allocation**: The decision to assign a specific house to a specific employee

**Release Workflow**: The multi-stage process for terminating a house allocation

**Inspection**: The handback verification that occurs when a house is vacated.
Completing it IS the finalisation: it archives the allocation and returns the
house to stock in one transaction.

**Termination Receipt**: The frozen damage assessment printed after inspection completion

**Engine Config**: The versioned policy system controlling weights, eligibility, and rules

**Job Grade Interval**: The band of job grades that compete in the same priority cohort (e.g., 12-14)

**Cohort**: The group of employees within the same job grade interval who are ranked against each other

**Inside Items**: Movable furniture (beds, chairs, lockers, tables) that leave with the tenant

### B. Keyboard Shortcuts

| Action        | Shortcut                       |
| ------------- | ------------------------------ |
| Search/Filter | Ctrl+F or /                    |
| Refresh Page  | F5                             |
| New Request   | Alt+N (on House Requests page) |
| Save Draft    | Ctrl+S (on Edit pages)         |
| Export        | Ctrl+E (on Report pages)       |
| Help          | F1 or ?                        |

### C. Contact Information

**Technical Support:** support@example.com

**House Admin Team:** housing@example.com

**Facility Management:** facilities@example.com

**Emergency (After Hours):** +251-XXX-XXXXXXX

---

## DOCUMENT HISTORY

| Version | Date        | Changes                      | Author                    |
| ------- | ----------- | ---------------------------- | ------------------------- |
| 1.0     | Oct 7, 2026 | Initial comprehensive manual | System Documentation Team |

---

**End of User Manual**
