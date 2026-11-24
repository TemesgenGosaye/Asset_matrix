# 02 — Fixed Asset Register API (additive)

All new endpoints are additive; no existing `/api/asset*`, `/api/import/asset`, or `/api/export` contract was changed. Every new route returns `404` unless `FEATURE_FIXED_ASSET_REGISTER=true` (`fixedAssetRegister` flag in `src/lib/feature-flags.ts`).

Auth: session or API key via `requirePermission`. API keys still require explicit scopes even for admins. All reads/writes are org-scoped via `getFixedAssetContext` (`user.organizationId` → `getOrganizationContext().organization.id`).

## Read endpoints

### `GET /api/fixed-assets`

Permission: `asset:view`.

Query params (all optional):

| Param                    | Meaning                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `search`                 | Case-insensitive match across description, raw description, Property No, S.No, both Finance Nos, both locations, Additional Data |
| `departments`            | Comma-separated department ids **or** legacy source names                                                                        |
| `categoryCodes`          | Comma-separated category codes                                                                                                   |
| `conditions`             | Comma-separated condition values (1st raw/normalized or 2nd status name/raw)                                                     |
| `locations`              | Free-text location match (1st/2nd)                                                                                               |
| `reviewFrom`, `reviewTo` | ISO date range applied to 1st or 2nd review date                                                                                 |
| `missingProperty`        | `true` → rows with no Property No                                                                                                |
| `hidden`                 | `true` → rows hidden in the Excel source                                                                                         |
| `needsReview`            | `true` → ambiguous dates or blank 1st condition                                                                                  |
| `sortBy`                 | `department`, `description`, `categoryCode`, `propertyNo`, `condition1`, `reviewDate1`, `reviewDate2`, `created`                 |
| `sortOrder`              | `asc` / `desc`                                                                                                                   |
| `page`, `pageSize`       | Server-side pagination; `pageSize` capped at 25,000                                                                              |
| `groupBy`                | `none`, `department`, `categoryCode`, `condition1` → adds facet counts                                                           |

Response: `{ items, total, page, pageSize, pageCount, facets }`. Non-admins are restricted to assigned assets plus assets in statuses whose name contains "available" (same self-service rule as the legacy page).

### `GET /api/fixed-assets/[id]`

Permission: `asset:view`. Returns `{ item }` with department, status, location, category, manufacturer, model and supplier relations.

### `PATCH /api/fixed-assets/[id]`

Permission: `asset:edit`; blocked in demo mode. Whitelist: `categoryCode`, `serialNo`, `condition1`, `condition1Raw`, `location1`, `location2Raw`, `condition2Raw`, `reviewDate2Raw`, `financeNo1`, `financeNo2`, `additionalData`, `hiddenInSource`, `reviewDate1`, `reviewsDate`. Writes `audit_logs` with before/after diff.

### `GET /api/fixed-assets/export?…`

Permission: `asset:view`. Accepts the same filters plus `ids=comma,separated,ids` for selected rows. Streams an `.xlsx` workbook named `Master List` with the exact 17 headers and order from `MASTER_LIST_COLUMNS`, grouped/sorted by the query, `dd/mm/yyyy` dates and UTF-8 Amharic-safe text. No legacy export column is removed.

## Import endpoints

### `GET /api/fixed-assets/import/template`

Permission: `import:execute`. Returns a one-sheet `.xlsx` template with the exact 17 headers and a sample row.

### `POST /api/fixed-assets/import/preview`

Permission: `import:execute`. FormData: `file`, optional `sheetName`, optional `headerRow` (default `1`). Auto-detects `Master List`. Returns `{ sheets, sheetName, headers, mappings, summary, preview }` with up to 8 sample rows and per-row warnings/errors. No database writes.

### `POST /api/fixed-assets/import/commit`

Permission: `import:execute`; blocked in demo mode. FormData: `file`, optional `sheetName`, `headerRow`, `mode`.

- `mode=dry-run`: validates every row and returns error/warning counts without writing.
- `mode=commit`: creates one `ImportJob` (`entityType: "fixed_asset_register"`) and one `ImportRowResult` per row, inside a single interactive transaction with a 10-minute timeout. Existing assets matched by exact Property No are updated with `previousValues` snapshots; duplicates are reported and never auto-merged. Missing Property No values receive a deterministic `UNKNOWN-<dept>-<row>` placeholder and a warning so the globally unique `serialnumber`/`assettag` constraints stay intact.

Response: `{ batchId, totalRows, successCount, errorCount, skippedCount, results[] }`.

### `GET /api/fixed-assets/import/history?take=50`

Permission: `asset:view`. Lists register import jobs for the org with row counts.

### `POST /api/fixed-assets/import/[id]/rollback`

Permission: `asset:edit`; blocked in demo mode. Restores whitelisted fields from `ImportRowResult.previousValues`, marks the job `rolled_back`, and writes an audit entry. Cannot run twice.

## UI routes

| Route                        | Purpose                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/assets`                    | Legacy table when flag off; register when flag on                                                                 |
| `/assets/register/create`    | Master List create form (posts base fields to `/api/asset`, then master fields to `PATCH /api/fixed-assets/[id]`) |
| `/assets/register/[id]/edit` | Same flow with `PUT /api/asset`                                                                                   |
| `/assets/register/import`    | Preview/validate/commit/rollback wizard                                                                           |

## Migration status

The schema and SQL migration are written at `prisma/migrations/20261124210000_fixed_asset_register/migration.sql` but **have not been applied**. Apply only after explicit approval; `npx prisma generate` was run locally to update the generated client types without touching the database.
