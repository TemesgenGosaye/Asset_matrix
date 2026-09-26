# Test Script — v0.7.0 Feature Verification

## Prerequisites

- Deploy to test environment (Vercel)
- Migration runs successfully (`prisma migrate deploy`)
- Set env vars:
  - `SUPER_ADMIN_EMAILS=your-email@example.com`
  - `CRON_SECRET=some-random-secret`
  - `SELF_HOSTED` should NOT be set (or set to `false`)

---

## 1. TCO Dashboard

### 1.1 Navigation

- [ ] As admin, check sidebar — "TCO Analysis" should appear in the nav
- [ ] Click it — should navigate to `/tco`

### 1.2 TCO Page Content

- [ ] 4 summary cards visible: Total Purchase Cost, Maintenance Cost, Depreciation Loss, Current Fleet Value
- [ ] If you have assets with purchase prices, values should be non-zero
- [ ] Category breakdown table should show categories with sortable columns
- [ ] Click column headers to sort
- [ ] Stacked bar chart should render (if you have categorized assets with costs)

### 1.3 Empty State

- [ ] If the org has no assets with prices, the page should still load without errors
- [ ] Values should show $0.00

---

## 2. Procurement Workflow

### 2.1 Navigation

- [ ] As admin, check sidebar — "Procurement" should appear
- [ ] Click it — should navigate to `/procurement`

### 2.2 Create Purchase Request

- [ ] Click "New Request" button
- [ ] Fill in:
  - Title: "Q3 Laptop Refresh"
  - Description: "Replace aging laptops for engineering team"
  - Priority: "High"
- [ ] Add line items:
  - Item 1: Type=Asset, Description="Dell Latitude 5550", Qty=5, Unit Cost=1200
  - Item 2: Type=Accessory, Description="USB-C Dock", Qty=5, Unit Cost=150
  - Item 3: Type=Consumable, Description="Laptop Bags", Qty=5, Unit Cost=50
- [ ] Verify running total shows $7,000.00 (5*1200 + 5*150 + 5\*50)
- [ ] Click "Save as Draft" — should redirect to request detail page

### 2.3 Submit for Approval

- [ ] On the request detail page, verify status shows "Draft"
- [ ] Click "Submit for Approval"
- [ ] Status should change to "Pending Approval"
- [ ] "Submit" button should disappear

### 2.4 Approve Request

- [ ] As an admin, the "Approve" and "Reject" buttons should be visible
- [ ] Click "Approve"
- [ ] Status should change to "Approved"

### 2.5 Reject Flow (separate test)

- [ ] Create another request, submit it
- [ ] Click "Reject" — a dialog should appear asking for a reason
- [ ] Enter a reason and confirm
- [ ] Status should change to "Cancelled"

### 2.6 Generate Purchase Order

- [ ] On the approved request, click "Generate Purchase Order"
- [ ] Should create a PO with number like `PO-202605-0001`
- [ ] Request status should change to "Ordered"
- [ ] PO link(s) should appear on the request detail page

### 2.7 View Purchase Order

- [ ] Click the PO link — should navigate to `/procurement/orders/[id]`
- [ ] PO details shown: PO number, supplier (if set), status, line items, total
- [ ] "Download PDF" button visible

### 2.8 Download PO PDF

- [ ] Click "Download PDF"
- [ ] PDF should open/download with:
  - "Purchase Order" header
  - PO number
  - Line items table
  - Grand total
  - Notes (if any)

### 2.9 Receive Goods

- [ ] On the PO detail page, click "Record Receipt"
- [ ] Enter received quantities for each item
- [ ] Submit receipt
- [ ] PO status should update (partially_received or received)
- [ ] For asset-type items: verify new assets were auto-created
  - Go to Assets page — new assets should appear with names from the PO items
  - Purchase price should match the estimated unit cost

### 2.10 Purchase Order List

- [ ] Go to `/procurement/orders`
- [ ] All created POs should be listed
- [ ] Status badges should reflect current state

---

## 3. Organization Scoping (Regression)

### 3.1 Shared Table Scoping

- [ ] Create a manufacturer as Org A admin
- [ ] Log in as a different org (Org B) — manufacturer should NOT be visible
- [ ] Same for suppliers, models, locations, categories, status types

---

## 4. Security (Regression)

### 4.1 CSV Injection

- [ ] Create an asset with name `=1+1`
- [ ] Export assets as CSV
- [ ] Open in Excel — the cell should show `'=1+1` (text, not formula result `2`)

### 4.2 Organization Management

- [ ] As a non-super-admin, the "Organizations" tab should be hidden in admin settings
- [ ] As a super-admin (email in `SUPER_ADMIN_EMAILS`), the tab should be visible

---

## Quick Smoke Test (5-minute version)

If you're short on time, verify these critical paths:

1. [ ] `/tco` page loads with charts
2. [ ] `/procurement` page loads, can create a request with items
3. [ ] Can approve request and generate PO
4. [ ] PO PDF downloads
5. [ ] Goods receipt creates assets automatically
