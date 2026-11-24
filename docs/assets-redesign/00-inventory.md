# 00 — Feature Inventory (BEFORE)

Scope: everything discovered in the current repository that touches the Assets module. This is the baseline for the "no feature loss" checklist. No code was changed during discovery.

## 0. Verification context

- Stack confirmed from `package.json`: Next.js 16.2.4, React 19.2.5, Prisma 7.8.0, PostgreSQL (`pg` 8.20), BetterAuth 1.6.9, Tailwind v4.2.4, ExcelJS 4.4, Zod 4.3, `@tanstack/react-virtual` 3.13.
- Scripts (`package.json:8-45`): `dev`, `build`, `lint` (`eslint src/`), `test` / `test:unit` (`vitest run`), `test:e2e` (`playwright test`), `format:check`, `typecheck` is **not** a dedicated script (use `npx tsc --noEmit`).
- `AGENTS.md:3-7`: this Next.js version has breaking changes; the relevant guide under `node_modules/next/dist/docs/` must be read before writing code (docs tree confirmed present: `01-app`, `02-pages`, `03-architecture`, `04-community`).
- No server actions found (`"use server"` absent under `src`); the module is entirely Route Handler + client fetch based.
- No typecheck script; TypeScript 6.0.3 installed.
- Working tree at discovery: untracked `temp-live.html` only (pre-existing, not ours).

## 1. Routes / files (assets)

| Area                                | File                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List page (server)                  | `src/app/assets/page.tsx`                                                                                                                                                               |
| List loading state                  | `src/app/assets/loading.tsx`                                                                                                                                                            |
| List client wrapper                 | `src/app/assets/ui/AssetsTableClient.tsx`                                                                                                                                               |
| **Actual list table (2,700 lines)** | `src/ui/assets/DashboardTable.tsx`                                                                                                                                                      |
| Bulk checkout dialog                | `src/app/assets/ui/BulkCheckoutModal.tsx` (present but **not imported by the table**)                                                                                                   |
| Detail page                         | `src/app/assets/[id]/page.tsx`                                                                                                                                                          |
| Detail loading                      | `src/app/assets/[id]/loading.tsx`                                                                                                                                                       |
| Detail header / actions             | `src/app/assets/[id]/ui/AssetDetailHeader.tsx`, `AssetDetailActions.tsx`                                                                                                                |
| Detail sub-sections                 | `AssetLifecycle.tsx`, `AssetReservations.tsx`, `AssetTransfers.tsx`, `AssetCheckoutHistory.tsx`                                                                                         |
| Edit page + form                    | `src/app/assets/[id]/edit/page.tsx`, `edit/ui/AssetEditForm.tsx`, `edit/not-found.tsx`                                                                                                  |
| Create page + form                  | `src/app/assets/create/page.tsx`, `create/ui/AssetCreateForm.tsx`                                                                                                                       |
| Attachments / photo gallery         | `src/components/AssetAttachments.tsx`, `src/components/AssetPhotoGallery.tsx`                                                                                                           |
| History timeline                    | `src/components/HistoryTimeline.tsx` (fed by `getEntityHistory`)                                                                                                                        |
| Custom fields                       | `src/components/CustomFieldsSection.tsx`, `CustomFieldValue.tsx`                                                                                                                        |
| Related UI                          | `src/app/assetCategories/**`, `src/app/general-asset/**`, `src/app/duplicates/**`, `src/app/search/**`, `src/app/scanner/**`, `src/app/reports/**`, `src/components/maps/AssetMap*.tsx` |
| Import page                         | `src/app/import/page.tsx`, `src/app/import/ui/ImportPageClient.tsx`                                                                                                                     |
| Asset import wizard                 | `src/app/import/ui/AssetImportWizard.tsx`                                                                                                                                               |
| Import engine                       | `src/lib/excel-import.ts` (1,250 lines)                                                                                                                                                 |

## 2. Assets list — current features (exact locations)

### Data path

- `src/app/assets/page.tsx:25-32` — requires organization context, redirects to `/login` without a user; derives `isAdmin`.
- `:34-57` — 22 column definitions: `srno`, `assetname`, `assetcategorytypeid`, `serialnumber`, `statustypeid`, `locationid`, `manufacturerid`, `reviewsDate`, `remark`, `assettag`, `assetid`, `modelid`, `belongsto`, `departmentid`, `purchaseprice`, `supplierid`, `purchasedate`, `requestable`, `mobile`, `specs`, `notes`, `actions`.
- `:59-66` — page-size options `20 / 25 / 50 / 75 / 100 / all`.
- `:68-90` — `Promise.all` of `getAssets()`, `getLocation()`, `getUsers()`, `getStatus()`, `getManufacturers()`, `getModel()`, `getCategories()`, `getUserAssets()`, `getDepartments()`, `getSuppliers()`.
- `src/lib/data.ts:181-185` — `getAssets()` calls `prisma.asset.findMany({ where })` with **no pagination**: every asset is loaded into the page props (critical for 20,714 rows).
- `:92-99` — Decimal `purchaseprice` sanitized to `number` for client props.
- `:101-133` — non-admin self-service filter: assigned assets + requested assets (`ItemRequest` pending/approved/return_pending) + assets in statuses whose name contains "available".
- `src/app/assets/ui/AssetsTableClient.tsx:1-18` — dynamic import of `DashboardTable` with `ssr: false` inside `Suspense`.

### Table behavior (`src/ui/assets/DashboardTable.tsx`)

- `:161-202` — URL-synced state via `useUrlState`: `search`, `page`, `pageSize`, `status`. Sort is **client-only** state (not shareable).
- `:207-218` — persisted visible columns via `usePersistentState("columns:assets:v3", …)` (localStorage).
- `:219-222` — local `assetsData`, `userAssetsData` copies; refreshable.
- `:224-252` — dialog state: assign, QR, status, delete, label, bulk status, bulk department, request, return; delete mode; assignment confirmation.
- `:254-276` — fetch `/api/status-transitions` to constrain allowed status changes (fallback: all statuses).
- `:278-279`, `:817-841` — `@tanstack/react-virtual` used **only in "All" mode** (maxHeight 600, overscan 15, measured rows).
- `:281-311` — single status update via `PUT /api/asset/updateStatus` + local state patch.
- `:315-350` — single delete via `DELETE /api/asset/deleteAsset` + local state patch.
- `:352-456` — assign/unassign via `POST /api/userAssets/assign`, `DELETE /api/userAssets/unassign` (status patched locally Active/Available).
- `:458-491` — bulk status change: parallel `PUT /api/asset/updateStatus` per selected id.
- `:493-539` — bulk department change: parallel `PUT /api/asset` with two-step confirmation dialog + audit-log note; updates `departmentId`/`departmentCode` locally.
- `:556-569` — QR canvas download (`QRCodeCanvas`, canvas → data URL).
- `:575-606` — central modal dispatcher (`assign`, `status`, `delete`, `delete-bulk`, `qrcode`, `label`).
- `:608-624` — column visibility; `srno` forced first.
- `:626-690` — **client-side** search across assetname, tag, serial/PID, remark, specs, notes, assetid, category, manufacturer, model, status, department name/code; status filter.
- `:692-698` — client-side slicing for pagination; `:700-815` client-side sort with special resolvers for relations/dates/numbers/booleans and `localeCompare({numeric:true})`.
- `:824-829` — `srNoMap` gives continuous numbering across pages.
- `:843-1202` — `renderCell` renderers for every column (links, badges, formatted dates/currency, relation lookups, truncation with `title` tooltips).
- `:1064-1180` — row actions menu: **View Details**, **Edit** (admin), **Assign User** (admin, `requestable` only), **Request** (non-admin, not assigned, requestable/available), **Return** (non-admin, assigned to me), **Change Status** (admin), **QR Code**, **Print Label**, **Delete** (admin).
- `:1204-1220` — rows-per-page + search callbacks.
- `:1222-1346` — refresh: `GET /api/asset` + `GET /api/userAssets`, 401 → `/login`, 30s focus/visibility guard, keyboard shortcut `r` (ignored while typing).
- `:1348-1630` — toolbar: search input (autofocus), Status multi-filter dropdown, sort `Select` (Newest/Oldest/Name A–Z/Z–A/Tag A–Z/Z–A), Columns dropdown, `SavedFilters` (entity `asset`), admin **Bulk Edit** dropdown (Change Status, Change Department, Print Labels, Download QR Sheet, Delete Entries), Refresh, **Add New** (admin), total count, relative "Last updated", rows-per-page selector.
- `:1632-1678` — footer: selection count, Previous/Page X of Y/Next; "Showing all … (virtual scroll)" message.
- `:1680-1924` — mobile (<lg) **card view** with the same fields and the same row actions (duplicated logic, including non-admin Request/Return).
- `:1926-2140` — desktop table: sticky header in virtual mode, checkbox column with indeterminate state, per-row checkbox, `role`-less `<Table>` primitives; empty state text "No assets found"; `hidden lg:block` (no horizontal-scroll sticky identity columns).
- `:2142-2244` — assign dialog (select user; Assign/Update/Remove; warning when assigned).
- `:2245-2338` — delete dialog (single/bulk, permanent-remove warning, assigned-user warning, explicit "delete anyway" checkbox for bulk assigned).
- `:2339-2369` — QR dialog (canvas, download, white background).
- `:2371-2493` — status dialog with workflow constraints, disabled current status, assignment-dependent Available/Active rules, explanation text.
- `:2495-2507` — `PrintLabelDialog` (single or all selected).
- `:2509-2548` — bulk status dialog.
- `:2550-2639` — bulk department dialog (select → confirm, audit-log messaging).
- `:2641-2649` — `RequestItemDialog` (entity `asset`).
- `:2651-2697` — return request dialog (`POST /api/requests` with `status: "return_pending"`).
- **Not present in the list today**: export button (export only lives in Reports), check-out/check-in (detail page only), grouping, condition badge, density toggle, department/category/location/date filters, review-date range, select-all-matching, skeleton/error/no-results states (only `loading.tsx` + plain "No assets found"), ARIA grid roles.

## 3. Detail page features (`src/app/assets/[id]/page.tsx`)

- `:78-99` — context/isAdmin, `getAssetById`, Decimal sanitization.
- `:102-165` — parallel fetches: location, department, users, statuses, manufacturers, models, categories, suppliers, assignments, `getEntityHistory("asset", id)`, depreciation settings, maintenance schedules (5), custom field definitions/values, active approved ItemRequest for Return.
- `:167-186` — depreciation calculation; `:188-201` — warranty status.
- UI sections confirmed by imports/headings: header (name, tag, PID), `AssetDetailActions` (assign, QR, duplicate, return, print), separators, detail field grid, custom field values, `HistoryTimeline`, `AssetAttachments`, `AssetLifecycle` (maintenance/lifecycle), `AssetReservations`, `AssetTransfers` (transfer history + transfer dialog), `AssetCheckoutHistory` (checkout/checkin + history), `ReturnItemButton`.
- `src/app/assets/[id]/ui/AssetCheckoutHistory.tsx:184-239` — checkout/checkin actions using `/api/asset/checkout`.
- `src/app/assets/[id]/ui/AssetDetailActions.tsx:105` — duplicate asset action.

## 4. Create / Edit forms

- Create (`src/app/assets/create/ui/AssetCreateForm.tsx`): template selector (`/api/asset-templates`), quick-create for category/model/status/supplier/manufacturer, fields — Asset Type*, Asset Name*, Status, Department, Requestable, Mobile, Asset Tag* (+ generate/suggest via `/api/asset/nextTag`, `/api/asset/lookup-serial`), PID/Property ID* (with `/api/asset/nextPid` generation), Brand, Model, Reviews Date, Remark, custom fields, collapsed procurement/finance section (Supplier, Purchase Price, Purchase Date, Warranty Months, Warranty Expires), submit/cancel/reset, post-create assign dialog.
- Edit (`src/app/assets/[id]/edit/ui/AssetEditForm.tsx`): same sections minus template; unsaved-changes navigation guard; PID uniqueness inline check; custom fields via `/api/custom-fields/values`.
- Both post to `/api/asset` (`POST` / `PUT`). No Condition (1st/2nd), Category Code, S.No, Finance No, Additional Data, Source Row, Hidden in Source fields today.

## 5. API routes (all existing contracts must survive)

| Endpoint                                             | Methods        | Permission / notes                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/asset`                                         | GET, POST, PUT | GET `asset:view` (`:79`); supports `?id`, `statusId`, full-text `search` with ILIKE fallback (`:110-134`), cursor pagination (`:136-160`), offset pagination (`:162-179`), otherwise **returns all** (`:164-167`). POST `asset:create` (`:196`), PUT `asset:edit` (`:311`) with `createAuditLogWithDiff` (`:374`). |
| `/api/asset/addAsset`                                | POST           | `asset:create`, audit log (`:38-92`)                                                                                                                                                                                                                                                                               |
| `/api/asset/getAsset`                                | GET            | `asset:view`                                                                                                                                                                                                                                                                                                       |
| `/api/asset/validate`                                | GET            | `requireApiAuth`                                                                                                                                                                                                                                                                                                   |
| `/api/asset/updateStatus`                            | PUT            | `asset:edit`, demo-mode block, workflow checks (`:15-205`)                                                                                                                                                                                                                                                         |
| `/api/asset/deleteAsset`                             | DELETE         | `asset:delete`, demo-mode block                                                                                                                                                                                                                                                                                    |
| `/api/asset/checkout`                                | GET, POST      | `requireApiAuth` / demo-mode; check out to user/location/asset; audit log                                                                                                                                                                                                                                          |
| `/api/asset/checkout/[id]`                           | GET, PUT       | `asset:assign`; check-in / return endpoint                                                                                                                                                                                                                                                                         |
| `/api/asset/checkout/bulk`                           | POST           | `asset:assign`; batch checkout with success/failed arrays                                                                                                                                                                                                                                                          |
| `/api/asset/transfers`                               | GET, POST      | `requireApiAdmin`                                                                                                                                                                                                                                                                                                  |
| `/api/asset/reservations`                            | GET, POST, PUT | reservation workflow                                                                                                                                                                                                                                                                                               |
| `/api/asset/attachments`                             | GET, POST      | `requireApiAuth`, demo-mode block                                                                                                                                                                                                                                                                                  |
| `/api/asset/attachments/[id]`                        | DELETE, PATCH  | `requireApiAuth`                                                                                                                                                                                                                                                                                                   |
| `/api/asset/attachments/file/[filename]`             | GET            | `requireApiAuth`                                                                                                                                                                                                                                                                                                   |
| `/api/asset/qrcode/[id]`                             | GET            | `requireApiAuth` (PDF/QR)                                                                                                                                                                                                                                                                                          |
| `/api/asset/qrcode/bulk`                             | POST           | `requireApiAuth` (QR sheet PDF)                                                                                                                                                                                                                                                                                    |
| `/api/asset/nextTag`                                 | GET            | `requireApiAuth`                                                                                                                                                                                                                                                                                                   |
| `/api/asset/nextPid`                                 | GET            | `requireApiAuth`                                                                                                                                                                                                                                                                                                   |
| `/api/asset/lookup-serial`                           | GET            | `requireApiAuth`                                                                                                                                                                                                                                                                                                   |
| `/api/assets/[id]/health-score`                      | GET            | health score                                                                                                                                                                                                                                                                                                       |
| `/api/userAssets/assign`, `/api/userAssets/unassign` | POST / DELETE  | assignment                                                                                                                                                                                                                                                                                                         |
| `/api/status-transitions`                            | GET            | workflow transitions                                                                                                                                                                                                                                                                                               |
| `/api/requests`                                      | POST           | request / return requests                                                                                                                                                                                                                                                                                          |
| `/api/export?entity=assets&format=csv\|xlsx`         | GET            | `requireApiAuth`; columns at `src/app/api/export/route.ts:28-41`; CSV streamed, XLSX full fetch (`:502-568`); **called from Reports**, not from Assets list                                                                                                                                                        |
| `/api/import/preview`                                | POST           | `import:execute`; sheet/header/column preview (`route.ts:18-100`)                                                                                                                                                                                                                                                  |
| `/api/import/asset`                                  | POST           | `import:execute`, demo-mode block; transaction-safe `createMany` insert; `ImportJob`; audit log; webhooks; Slack/Teams; cache invalidation (`route.ts:20-457`)                                                                                                                                                     |
| `/api/import/template`                               | GET            | template workbook generation                                                                                                                                                                                                                                                                                       |
| `/api/import`                                        | GET, POST      | generic import history/list                                                                                                                                                                                                                                                                                        |
| `/api/custom-fields/values`                          | POST           | custom field values                                                                                                                                                                                                                                                                                                |
| `/api/asset-templates`                               | GET/…          | create-form templates                                                                                                                                                                                                                                                                                              |

## 6. Import features (current)

- `AssetImportWizard.tsx:31` steps: `upload → sheet → mapping → importing → results`.
- Upload step (`:382-433`): `FileDropZone`, template link `/api/import/template?entityType=asset`, size display.
- Sheet step (`:434-499`): detects multiple sheets, user chooses one.
- Mapping step (`:500-640`): dropdown per field with auto-suggest; 16 `AssetImportFieldId`s (`src/lib/excel-import.ts:18-65`); **required**: `srNo`, `assetType`, `pid`, `condition`, `location`, `brand`, `reviewDate`, `notes` (`:71-86`).
- Import step (`:641-700`): posts FormData to `/api/import/asset`.
- Results (`:701-742`): successCount/errorCount, error details.
- Engine (`src/lib/excel-import.ts`): ExcelJS parse (`:1`), limits `MAX_IMPORT_FILE_SIZE = 20MB`, `MAX_IMPORT_ROWS = 25,000`, preview 8, reported errors 500 (`:8-12`), alias auto-mapping (`:92-226`), Zod request schemas (`:232-260`), reference resolution, in-file + DB duplicate detection, transactional insert (`/api/import/asset:244-380`).
- Import history: `/api/import` GET + `ImportPageClient.tsx:286` (generic), `ImportJob` model.
- **Gaps for the master list**: no "Master List" sheet auto-detection, no raw value retention, no department alias table, no 1st/2nd review groups, no mixed date parsing, no dry-run/commit split, no chunked/resumable job, no row results table, no rollback, no mapping template persistence, no department mapping step, no file hash.

## 7. Prisma data model facts

- `Asset` model is **`asset`** (`prisma/schema.prisma:485-546`); PK `assetid` UUID. `assettag` **and** `serialnumber` are each globally `@unique` (`:488-489`) — Property No maps to `serialnumber`/`assettag`, uniqueness cannot be weakened.
- Existing fields (`:486-513`): `assetname`, `assettag`, `serialnumber`, `modelid`, `specs`, `notes`, `purchaseprice`, `purchasedate`, `mobile`, `requestable`, `assetcategorytypeid`, `statustypeid`, `supplierid`, `locationid`, `manufacturerid`, `organizationId`, `creation_date`, `change_date`, `expectedEndOfLife`, `warrantyExpires`, `warrantyMonths`, `reviewsDate`, `remark`, `departmentId`, `departmentCode`, `externalId`, `externalSource`.
- Relations (`:514-530`): category, location, manufacturer, model, organization, status, supplier, department, attachments, maintenance, reservations, transfers, checkouts, component checkouts, userAssets, audit entries.
- Indexes (`:532-544`): assetname, status, category, location, organization, creation_date, model, supplier, manufacturer, departmentId, `(organizationId, creation_date)`, externalId, externalSource. **No** `(orgId, departmentId)` composite, no Property No composite (global unique exists), no condition/category-code composite.
- `Department` (`:163-191`): `id`, `name`, `code`, `description`, `isActive`, `organizationId`, hierarchy (`parentId`/`children`), `sortOrder`; `@@unique([code, organizationId])`; relation `assets asset[]`; seeded from the official master book (`DEPARTMENT_MASTER_BOOK.md`, 141 departments; legacy Excel has 36 sheet names such as `Logestic`, `Resrech`, `Irrgation1`, `house`, `Staf2`, `Office &Factory Bulding`). **No alias field today.**
- `statusType` (`:1010-1024`): `statustypeid`, `statustypename`, `color`, `isDefault`, `organizationId`, transitions. This is the only "Condition" concept; values used by the UI are Active/Available/Pending/Lost-Stolen/Out for Repair/Archived (`DashboardTable.tsx:107-123`).
- `ImportJob` (`:394-414`): userId, entityType, fileName, fileSize, totalRows, processedRows, successCount, errorCount, status, errors Json, startedAt, completedAt, createdAt. **No** orgId, fileHash, mode/options, or per-row results.
- `audit_logs` (`:633-651`): userId, action, entity, entityId, details, ipAddress, userAgent, createdAt; helper `createAuditLog`/`createAuditLogWithDiff` in `src/lib/audit-log.ts:36-155`. `getEntityHistory` in `src/lib/data.ts:721-724`.
- `AuditEntry` (`:1600-1620`) is per-campaign scan state (status/location/notes) — **not** a general field-history table. No first-review history source exists for the (1st) columns.
- `assetCategoryType` (`:588-600`) has `assetTypeCode` — the only candidate for "Category Code".
- `location` (`:812-839`): `locationid`, `locationname`, hierarchy, org.
- PostgreSQL FTS: `/api/asset` queries `"search_vector"` but **no migration creates a `search_vector` column or GIN index on `asset`**; the raw query is wrapped in `.catch()` and falls back to ILIKE. Employee tables do have trigram indexes (`prisma/migrations/00000000000000_baseline/migration.sql:2914-2920`).
- All migrations are squashed into one baseline directory: `prisma/migrations/00000000000000_baseline/migration.sql`. `prisma/set-schema.mjs` + `prisma generate` run during `npm run build`.

## 8. Auth / permissions / organization scoping

- `getOrganizationContext` (`src/lib/organization-context.ts`) used in all asset pages; `strictOrgWhere()` in `getAssets`/`getDepartments`; `scopeToOrganization` in API routes.
- `requireApiAuth`, `requireApiAdmin`, `requireSuperAdmin`, `requirePermission`, `requireNotDemoMode` in `src/lib/api-auth.ts` (`:85`, `:143`, `:152`, `:169`, `:205`, `:12`).
- Permission constants in `src/lib/permissions.ts:6-10`: `asset:view`, `asset:create`, `asset:edit`, `asset:delete`, `asset:assign`; import uses `import:execute` (see route imports).
- `requirePermission` (`:205-240`): session admins bypass RBAC; API keys require explicit scopes even for admins.
- UI gating: `isAdmin` prop from `getOrganizationContext().isAdmin` controls Edit/Assign/Status/Delete/Add New/Bulk Edit; non-admin self-service filtering is in `page.tsx:101-133` and repeated in `refreshData` (`DashboardTable.tsx:1262-1283`).
- Demo mode blocks writes via `requireNotDemoMode()`.
- Feature flags exist (`src/lib/feature-flags.ts:12-49`, env-driven via `getBoolEnvVar`) but **no asset-register flag** yet — natural place for the rollback toggle.

## 9. Styling / design language

- Tailwind v4 tokens in `src/app/globals.css:22-112`: semantic colors (`background`, `foreground`, `primary`, `muted`, `destructive`, `success-*`, `warning-*`, `info-*`, `chrome-*`), **brass** `--color-brass-300: #e8c874`, `-400: #d4b357`, `-500: #c9a227`, `-600: #a8861d` (`:93-97`), radius/breakpoint tokens, custom `dark` variant (`:15-20`). Ethiopic font stack declared at `:32-34` ("Noto Sans Ethiopic", Nyala, "Abyssinica SIL").
- shadcn-style primitives in `src/components/ui/` (`table`, `button`, `badge`, `checkbox`, `dialog`, `dropdown-menu`, `select`, `input`, `card`, `textarea`, `separator`, `tabs`, `popover`, `tooltip`, `progress`, `switch`, etc.); `components.json` present.
- Existing table uses `text-muted-foreground`, `font-mono`, `tabular-nums`, `capitalize`, `truncate` with `title`, `Badge` variants; no sticky first columns; zebra striping not present.
- Dark/light via `next-themes` class strategy; `dark:` utilities throughout.
- i18n: strings are inline English with selected Amharic labels (e.g. `Assets: ንብረቶች` at `page.tsx:143`); no general extraction/i18n framework in this module.

## 10. Tests

- Unit: `vitest` (`vitest.config.ts`, `environment: node`, aliases `@ → src`); asset-related unit test `src/app/api/__tests__/asset-crud.test.ts`; fixture `tests/setup/fixtures/assets.ts`; mocks `tests/setup/prisma-mock.ts`.
- E2E: Playwright specs `tests/e2e/asset-crud.spec.ts`, `asset-lifecycle.spec.js`, `table-functionality.spec.js`, `forms.spec.js`, `accessibility.spec.ts`, `theme-switching.spec.js`, `responsive-layout.spec.js`, `navigation.spec.js`, `smoke.spec.ts`; config `playwright.config.js`.
- No tests for importer normalization, department aliases, grouping, or master-list format yet.
- `docs/TEST_SCRIPT.md`, `TESTING.md` exist as guidance.

## 11. Risks already visible

1. `getAssets()` loads all rows into server props and the client does filtering/sort/pagination — will not scale to 20,714 rows.
2. Global uniqueness on `assettag` and `serialnumber` conflicts with duplicate Property No values in the Excel; duplicates must be detected/reported, never silently merged or constraint weakened.
3. The existing importer rejects rows with missing PID/asset type/condition/location/brand/review date — the Excel contains rows without Property No/Description/S.No.
4. No field-history table exists for the (1st) review group; it must be sourced from `ImportRowResult.raw` (new) / audit details, otherwise shown blank as specified.
5. `search_vector` is queried but not created by any migration; adding a real FTS/trigram index needs care (reversible, additive).
6. `AssetImportWizard` and `ImportPageClient` own the current import UX; any new master-list importer must be additive so existing import types keep working.
7. 141 canonical departments vs 36 legacy source names require a confirmed alias/mapping step; unknown names must not auto-create.
