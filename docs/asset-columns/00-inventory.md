# Asset column inventory and canonical Finance No proposal

## Scope and decisions

- Every asset list/table, form, import template, and export must use one canonical 11-column sequence.
- The system must hold one canonical Finance No per asset.
- Legacy `Finance No (1st)` and `Finance No (2nd)` columns remain in the database and in old workbook data.
- Old columns are not deleted, renamed, or rewritten.
- For existing data and old imports, canonical `Finance No` is `Finance No (2nd)` when nonblank; otherwise `Finance No (1st)`.
- The additive migration below was applied on 2026-11-26 and is recorded as `20261126120000_canonical_finance_no`.

## Production Finance No counts supplied by the user

| Condition                       |   Rows |
| ------------------------------- | -----: |
| Total assets                    | 20,714 |
| Neither finance number present  | 13,214 |
| Only `Finance No (1st)` present |  1,837 |
| Only `Finance No (2nd)` present |  1,353 |
| Both present and identical      |  3,616 |
| Both present and different      |    694 |

The current work uses the one-field rule for all cases. The 694 differing rows are not treated as a conflict workflow; they resolve to `Finance No (2nd)`.

Local database verification before migration had 104 assets and no finance numbers populated.

## Implementation status

- Canonical column definitions live in `src/lib/asset-columns.ts`.
- Register, forms, import preview/template, import writes, export, detail pages, and analytics now use canonical `financeNo`.
- Legacy `Finance No (1st)` / `Finance No (2nd)` workbook headers remain accepted for old imports.
- Optional legacy fields remain hidden by default in the register `Columns` dropdown.
- Rollback SQL is documented only and was not run.

## Canonical sequence

Display and workbook sequence:

1. `S/N0`
2. `Description`
3. `Property No`
4. `Dept`
5. `Finance No`
6. `Condition (1st)`
7. `Location (1st)`
8. `Review Date (1st)`
9. `Condition (2nd)`
10. `Location (2nd)`
11. `Review Date (2nd)`

Machine header keys:

`S/N0`, `Description`, `Property No`, `Dept`, `Finance No`, `Condition (1st)`, `Location (1st)`, `Review Date (1st)`, `Condition (2nd)`, `Location (2nd)`, `Review Date (2nd)`

Grouped table bands:

- `1st Review` over `Condition (1st)`, `Location (1st)`, `Review Date (1st)`
- `2nd Review` over `Condition (2nd)`, `Location (2nd)`, `Review Date (2nd)`

All noncanonical fields remain available as hidden-by-default optional columns after these 11.

## Current fixed-asset master list order

`src/lib/fixed-asset-register.ts:3-21` defines `MASTER_LIST_COLUMNS` in this order:

1. `No.`
2. `Department`
3. `Category Code`
4. `S.No`
5. `Description`
6. `Property No`
7. `Finance No (1st)`
8. `Condition (1st)`
9. `Location (1st)`
10. `Review Date (1st)`
11. `Finance No (2nd)`
12. `Condition (2nd)`
13. `Location (2nd)`
14. `Review Date (2nd)`
15. `Additional Data`
16. `Source Row`
17. `Hidden in Source`

Consumers:

- `src/lib/fixed-asset-register.ts:3-21`, `:29-56`, `:245-317`, `:338-436`, `:438-460`
- `src/lib/fixed-asset-import.ts:5`, `:107-160`, `:162-228`, `:537-621`, `:1138-1218`, `:1220-1248`
- `src/app/api/fixed-assets/export/route.ts:7`, `:58-113`
- `src/app/api/fixed-assets/import/template/route.ts:9-23`
- `src/app/api/fixed-assets/import/preview/route.ts:17-71`

## Current register table order

`src/ui/assets/FixedAssetRegisterClient.tsx:587-618` renders:

1. selection checkbox
2. `No.`
3. `Description`
4. `Department`
5. `Category Code`
6. `Property No`
7. `Condition (1st)`
8. `Condition (2nd)`
9. `Location (1st)`
10. `Location (2nd)`
11. `Review (1st)`
12. `Review (2nd)`
13. `Flags`
14. `Actions`

Finance numbers are not table columns. They appear in search text at `:357` and in the detail drawer at `:889` and `:893`.

Current cell field mapping:

- `No.`: page row index, `:668-671`
- `Description`: `assetname`, `:672`
- `Department`: `sourceDepartment || department?.name`, `:685`
- `Category Code`: `categoryCode`
- `Property No`: `serialnumber`
- `Condition (1st)`: `condition1`
- `Condition (2nd)`: `statusType?.statustypename`
- `Location (1st)`: `location1`
- `Location (2nd)`: `location?.locationname || location2Raw`
- `Review (1st)`: `reviewDate1`
- `Review (2nd)`: `reviewsDate`
- `Flags`: `hiddenInSource`, missing `serialnumber`, ambiguous review dates
- `Actions`: details and asset operations menu

## Current legacy asset table order

`src/app/assets/page.tsx:89-112` supplies the legacy `DashboardTable` columns:

`srno`, `assetname`, `assetcategorytypeid`, `serialnumber`, `statustypeid`, `locationid`, `manufacturerid`, `reviewsDate`, `remark`, `assettag`, `assetid`, `modelid`, `belongsto`, `departmentid`, `purchaseprice`, `supplierid`, `purchasedate`, `requestable`, `mobile`, `specs`, `notes`, `actions`.

`src/ui/assets/DashboardTable.tsx:125-136` defaults visible columns to:

`srno`, `assetname`, `assetcategorytypeid`, `serialnumber`, `statustypeid`, `locationid`, `manufacturerid`, `reviewsDate`, `remark`, `actions`.

`DashboardTable` rendering and cell mapping:

- headers at `:1933-1979` and `:2054-2101`
- search at `:626-666`; no finance fields
- sort at `:700-804`
- cell rendering at `:843-1183`
- mobile cards at `:1683-1837`

## Current asset form order

`src/ui/assets/FixedAssetForm.tsx` renders finance fields separately:

- `Finance No (2nd)` input at `:446-452`
- `Finance No (1st)` input at `:466-472`
- state fields at `:45`, `:49`
- empty state at `:69`, `:73`
- edit load at `:156`, `:160`
- submit payload at `:228`, `:235`

The canonical form must expose one `Finance No` input.

## Current import and export mapping

Header aliases in `src/lib/fixed-asset-import.ts:107-126` include:

- `financeno1st` → `Finance No (1st)`
- `financeno2nd` → `Finance No (2nd)`

`mapMasterListRow` in `src/lib/fixed-asset-register.ts:245-317`:

- `financeNo1` from `Finance No (1st)` at `:298`
- `financeNo2` from `Finance No (2nd)` at `:305`

Create/update writes in `src/lib/fixed-asset-import.ts`:

- create: `:561`, `:568`
- update: `:596`, `:603`
- rollback restore: `:1183-1184`

Export mapping in `src/app/api/fixed-assets/export/route.ts:63-85`:

- `Finance No (1st)` from `financeNo1` at `:71`
- `Finance No (2nd)` from `financeNo2` at `:78`

Template sample in `src/lib/fixed-asset-import.ts:1220-1248` contains both `old.ma` and `8.3.5-883`.

Canonical import/export behavior:

- Old 17-column workbook headers remain accepted.
- Parsed canonical value is `Finance No (2nd)` when nonblank, otherwise `Finance No (1st)`.
- Template and export emit one `Finance No` column.
- No conflict report is produced.

## Other finance-number consumers

- Search: `src/lib/fixed-asset-register.ts:353-367` searches `financeNo1` and `financeNo2`.
- PATCH whitelist: `src/app/api/fixed-assets/[id]/route.ts:89-90`.
- UI type: `src/ui/assets/asset-types.ts:26-27`.
- Analytics fallback: `src/lib/fixed-asset-analytics/service.ts:313-327`, line `:317` uses only `financeNo1`.
- Docs describing the old two-field contract: `docs/assets-redesign/01-field-mapping.md`, `docs/assets-redesign/01a-schema-diff.md`, `docs/assets-redesign/02-api.md`, `docs/dropdowns/00-inventory.md`.

Asset-related tables/lists without finance fields, recorded for the shared-column rollout:

- `src/app/assets/[id]/page.tsx:403-512`
- `src/app/assets/[id]/ui/AssetTransfers.tsx:515-551`
- `src/app/assets/[id]/ui/AssetReservations.tsx:277-353`
- `src/app/assets/[id]/ui/AssetCheckoutHistory.tsx:352-380`
- `src/app/assets/[id]/ui/AssetAssignment.tsx:28-34`, `:180-214`
- `src/ui/assets/FixedAssetImportWizard.tsx:530-557`, `:655-679`, `:712-752`
- `src/app/import/ui/AssetImportWizard.tsx:623-641`
- `src/app/import/ui/ImportPageClient.tsx:37-47`, `:229-237`, `:448-476`
- `src/app/reports/ui/WarrantyReport.tsx:254-312`
- `src/app/reports/ui/DepreciationReport.tsx:274-314`
- `src/app/reports/ui/ReportsPage.tsx:366-401`, `:552-573`
- `src/components/PrintLabelDialog.tsx:73-82`, `:143-198`
- `src/components/dashboard/fixed-asset-analytics/FixedAssetAnalyticsDashboard.tsx:95-112`, `:617-644`, `:776-789`
- `src/ui/general-asset/GeneralAssetClient.tsx:293-403`, `:664-683`
- `src/app/user/[id]/page.tsx:292-331`, `:354-408`
- `src/app/duplicates/ui/DuplicatesPage.tsx:201-233`
- `src/app/maintenance/ui/MaintenancePageClient.tsx:288-337`
- `src/app/reservations/MyItemRequestsClient.tsx:133-142`, `:223-229`
- `src/app/search/ui/AdvancedSearchClient.tsx:502-548`
- `src/lib/search-fields.ts:33-42`
- `src/components/dashboard/DashboardGrid.tsx:635-657`, `:948-975`
- `src/app/scanner/ui/ScannerPageClient.tsx:381-418`

## Applied additive schema change

Prisma schema addition near `prisma/schema.prisma:574-581`:

```prisma
financeNo String? @db.VarChar(255)
```

Applied migration path:

`prisma/migrations/20261126120000_canonical_finance_no/migration.sql`

Applied SQL:

```sql
ALTER TABLE "asset"
  ADD COLUMN IF NOT EXISTS "financeNo" VARCHAR(255);

UPDATE "asset"
SET "financeNo" = COALESCE(
  NULLIF(BTRIM("financeNo2"), ''),
  NULLIF(BTRIM("financeNo1"), '')
)
WHERE "financeNo" IS NULL;

CREATE INDEX IF NOT EXISTS "asset_financeNo_trgm_idx"
  ON "asset" USING gin ("financeNo" gin_trgm_ops);
```

Rollback for this additive change:

```sql
DROP INDEX IF EXISTS "asset_financeNo_trgm_idx";
ALTER TABLE "asset" DROP COLUMN IF EXISTS "financeNo";
```

No existing column is dropped or rewritten. A trigger is not proposed because code will write the canonical field directly and legacy fields must remain untouched.
