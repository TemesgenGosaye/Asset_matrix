# Pay Rent — House, Shop & Grocery Rent Management

Module for people who rent premises from the factory, under the **Facility &
House** sidebar group at `/facility/pay-rent`.

Unlike the rest of the housing module (which models _occupancy_ through the House
Queue), this module models _money_: a recurring monthly price, a materialised
schedule, receipts, and a payment ledger.

---

## Quick reference

```bash
# 1. Apply the schema (already applied on this database)
npx prisma migrate deploy

# 2. Run it
npm run dev            # http://localhost:3000/facility/pay-rent

# 3. Tests
npx vitest run src/lib/rent          # 153 unit + live-PostgreSQL tests
npx vitest run                       # whole suite (985)

# 4. Live end-to-end verification against a running dev server
node scripts/smoke-test-user.mjs create          # throwaway admin/limited/view-only accounts
$env:SMOKE_EMAIL="pay-rent-smoke@example.invalid"
$env:SMOKE_LIMITED_EMAIL="pay-rent-limited@example.invalid"
$env:SMOKE_VIEWONLY_EMAIL="pay-rent-viewonly@example.invalid"
$env:SMOKE_PASSWORD="SmokeTest-2026!"
node scripts/smoke-pay-rent.mjs                   # 55 API assertions
node scripts/smoke-rent-ui.mjs                    # 24 browser assertions + screenshots
node scripts/smoke-test-user.mjs delete           # remove the throwaway accounts
node scripts/clear-all-locks.mjs                  # if repeated logins tripped the lockout
```

Both smoke scripts create their own records and delete them again afterwards.

---

## Data model

| Table                    | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `rent_renters`           | The renter plus their lease terms. Soft-deleted via `deletedAt`.        |
| `rent_renter_phones`     | 1–3 phone numbers in E.164. Exactly one primary (partial unique index). |
| `rent_installments`      | One row per month of the term. `amountDue` is a **snapshot**.           |
| `rent_payments`          | Append-only receipts. A void sets `voidedAt`; the row is never deleted. |
| `rent_receipt_sequences` | Per-organization, per-year receipt counter.                             |

Enums: `RentType`, `RentInstallmentStatus`, `RentPaymentMethod`, `RentLeaseStatus`.

### Two facts are deliberately NOT stored

- **`OVERDUE`** is derived: `dueDate < today AND status = UNPAID`. There is no
  `OVERDUE` member on the enum, so it cannot go stale or be set by a human.
- **`Overdue` as a lease badge** is likewise derived (`Active` + ≥1 overdue month).

The tracking columns (months paid, total paid, outstanding, next due, overdue
count, contract value) are computed by PostgreSQL aggregates on every read —
`getRentSummary` and `loadInstallmentAggregates` in `src/lib/rent/queries.ts`.
Nothing is denormalised onto the renter row.

### Constraints that carry real weight

These are in the migration, not just in Zod, so an import or a direct SQL write
cannot produce an impossible ledger:

| Constraint                                             | Guards                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `rent_renters_price_positive_check`                    | `monthlyPrice > 0`                                         |
| `rent_renters_term_range_check`                        | `1 <= termMonths <= 120`                                   |
| `rent_renters_national_id_digits_check`                | National ID is digits only                                 |
| `rent_renters_rent_type_detail_check`                  | `Other` requires a description                             |
| `rent_renters_termination_consistency_check`           | Terminated ⇔ `terminatedAt` set                            |
| `rent_installments_paid_requires_receipt_check`        | A PAID month records who, when, how much and which receipt |
| `rent_installments_unpaid_has_no_receipt_check`        | An unpaid month carries no stale receipt                   |
| `rent_installments_voided_requires_reason_check`       | Voiding needs a reason                                     |
| `rent_payments_receipt_format_check`                   | `RENT-2026-000123`                                         |
| `rent_renter_phones_e164_check`                        | `+` then 9–15 digits                                       |
| `rent_receipt_sequences_last_value_non_negative_check` | Counter integrity                                          |

Partial unique indexes (Prisma cannot express `WHERE`, so these are hand-written
like the existing `house_requests` index):

- `rent_renters_active_national_id_key` — one **live** renter per National ID, so
  archiving frees the ID for reuse while the archived record keeps its history.
- `rent_renter_phones_primary_key` — exactly one primary phone per renter.
- `rent_payments_active_installment_key` — one **live** receipt per month.

FKs into the ledger are `ON DELETE RESTRICT`: a renter with payment history
physically cannot be hard-deleted.

---

## The two rules most likely to surprise you

### 1. Clamping is anchored, not cascading

A lease starting on the 31st is due on the 31st of every month that has one:

```
Jan 31 -> Feb 28 -> Mar 31     (not Mar 28)
Jan 31 -> Feb 29 -> Mar 31     (leap year)
```

Cascading would drift a day per short month. Implemented once in
`addMonthsClamped` (`src/lib/rent/schedule.ts`), everything UTC so no server
timezone can move a due date.

### 2. A month is settled in full, or not at all

`amount` is optional; when supplied it must **equal** the installment's
`amountDue`, otherwise the payment is refused with `400 AMOUNT_MISMATCH`.

This is not pedantry. Every "collected" figure in the module sums
`installments.amountDue` for `PAID` rows (`src/lib/rent/queries.ts`), so
accepting a short payment would mark the month `PAID`, report the full invoice
as collected, and make the shortfall uncollectable — a second payment hits
`ALREADY_PAID` and the `rent_payments_active_installment_key` partial unique
index. Partial settlement needs a `PARTIAL` status and an `amountOutstanding`
column; until those exist, over- and under-payment are both refused.

### 3. Payments are atomic and idempotent

A month is settled with a **conditional** update:

```ts
await tx.rentInstallment.updateMany({
  where: { id, organizationId, status: "UNPAID" },   // <- the guard
  data: { status: "PAID", paidAt, paidById, receiptNumber, ... },
});
if (settled.count === 0) throw new RentServiceError("...", 409, "ALREADY_PAID");
```

Under PostgreSQL READ COMMITTED a second concurrent request blocks on the row lock,
then re-evaluates the predicate after the first commits, matches no row and gets
`count: 0`. A double-click can therefore never produce two receipts — verified by
both an integration test and the live smoke test.

Chronological order is enforced in the same locked transaction: only the earliest
`UNPAID` month may be settled, so paying month 12 while month 3 is outstanding
returns `409 OUT_OF_ORDER`. The UI mirrors this by enabling exactly one **Paid**
button.

Receipt numbers come from one atomic statement:

```sql
INSERT INTO rent_receipt_sequences ("organizationId","year","lastValue",...)
VALUES ($1,$2,1,...)
ON CONFLICT ("organizationId","year")
DO UPDATE SET "lastValue" = rent_receipt_sequences."lastValue" + 1
RETURNING "lastValue"
```

No advisory lock, no read-then-write race, and because it runs inside the
payment transaction, a rolled-back payment does not burn a number.

---

## Editing rules

| Change                                          | Effect                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, gender, phones, rent type                 | Always allowed                                                                                                                                                                                                                                                                                                                               |
| `monthlyPrice`                                  | Rewrites **only** `UNPAID` months. A `PAID` month keeps the price it was invoiced.                                                                                                                                                                                                                                                           |
| `startDate` / `termMonths` with **no** payments | Regenerates the schedule.                                                                                                                                                                                                                                                                                                                    |
| `startDate` / `termMonths` **with** payments    | Needs `rent:override_terms` **and** a reason — then still refused with `409 SCHEDULE_FROZEN`, because regenerating would re-date already-issued receipts. Terminate and re-register instead. The UI therefore keeps those inputs disabled for _everyone_ once a payment exists; it does not offer an override that can only ever return 409. |
| Archive                                         | Soft delete only (`deletedAt`). Always reversible.                                                                                                                                                                                                                                                                                           |
| Terminate                                       | Reason + effective date required; unpaid months on/after it become `VOIDED`.                                                                                                                                                                                                                                                                 |

`rent:override_terms` is deliberately **not** granted to the Asset Manager role —
see `DEFAULT_ROLES.manager` in `src/lib/rbac.ts`.

---

## API

All routes are authenticated, org-scoped and permission-checked on the server.

| Method | Path                                  | Permission                                                 |
| ------ | ------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/rent`                           | `rent:view`                                                |
| POST   | `/api/rent`                           | `rent:create`                                              |
| GET    | `/api/rent/[id]`                      | `rent:view`                                                |
| PATCH  | `/api/rent/[id]`                      | `rent:update` (+ `rent:override_terms` for schedule edits) |
| DELETE | `/api/rent/[id]`                      | `rent:archive`                                             |
| POST   | `/api/rent/[id]/restore`              | `rent:archive`                                             |
| POST   | `/api/rent/[id]/terminate`            | `rent:terminate`                                           |
| POST   | `/api/rent/[id]/payments`             | `rent:pay`                                                 |
| POST   | `/api/rent/payments/[paymentId]/void` | `rent:void`                                                |
| GET    | `/api/rent/summary`                   | `rent:view`                                                |
| GET    | `/api/rent/export?format=csv\|xlsx`   | `rent:export`                                              |

Status codes:

| Status | Meaning                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Malformed JSON, an unparseable uuid, or a business rule (`INVALID_ID`, `INVALID_START_DATE`, `AMOUNT_MISMATCH`, `REASON_REQUIRED`, `NOT_ARCHIVED`)                                                 |
| 401    | Unauthenticated                                                                                                                                                                                    |
| 403    | Missing permission (`FORBIDDEN`), or `TERMS_LOCKED` — a schedule change without `rent:override_terms`                                                                                              |
| 404    | Not found, or belongs to another organization (cross-tenant reads are 404, never 403, so ids cannot be probed)                                                                                     |
| 409    | Conflict: `DUPLICATE` / `DUPLICATE_NATIONAL_ID`, `OUT_OF_ORDER`, `ALREADY_PAID`, `ALREADY_VOIDED`, `ALREADY_TERMINATED`, `INSTALLMENT_VOIDED`, `LEASE_TERMINATED`, `SCHEDULE_FROZEN`, `REFERENCED` |
| 422    | Schema validation, or `CONSTRAINT_VIOLATION` when a database CHECK rejected the row. Carries `details: [{ field, message }]` where a field is identifiable                                         |
| 500    | Unexpected. Logged in full, reported opaquely                                                                                                                                                      |

**No rate limiting is implemented.** There is no 429. `POST
/api/rent/[id]/payments` takes a `FOR UPDATE` row lock and `GET /api/rent/export`
materialises up to 10,000 rows, so both are worth throttling before this module
is exposed beyond a trusted internal network.

Every error body is `{ error, code }`, plus `details` on 422s. `code` is stable
and machine-readable; the client can branch on it (`OUT_OF_ORDER`,
`ALREADY_PAID`, `SCHEDULE_FROZEN`, `TERMS_LOCKED`, …) rather than matching prose.

### National ID masking

Masked in the **query layer** (not the route) so an unmasked value cannot leak
through a list, detail, export or receipt. `rent:sensitive_view` reveals it;
`rent:update` and `rent:terminate` imply it.

API-key callers must carry a sensitive scope explicitly. The admin short-circuit
is a **session-only** bypass and is evaluated _after_ the `apiKeyScopes` branch,
matching `requirePermission`, whose documented policy is that scope enforcement
applies to all callers including admins.

Searching by National ID is offered only to callers who may read it
(`buildRenterWhere` takes `canSeeSensitive`). The mask reveals the last four
digits, so a `contains` filter available to a `rent:view`-only caller would let
them walk prefixes and rebuild the value they were denied. Name and phone search
remain available to everyone.

Exports carry `X-Export-National-Id-Masked` so the client knows which happened.
National ID and phone numbers are never written to the application log — the
audit entry records `nationalIdMasked: true` instead, and there is a test
asserting the log contains neither value.

**Phones are not masked.** `toRenterDto` masks the National ID only, and phone
numbers appear in the clear in the list, detail and CSV/XLSX export. That is a
deliberate, currently asymmetric policy rather than an oversight — flag it to the
business if full phone masking is wanted.

---

## File map

```
prisma/schema.prisma                                  4 enums, 5 models, Org back-relations
prisma/migrations/20261003000000_add_pay_rent_module/  hand-written, idempotent SQL

src/lib/rent/
  constants.ts   vocabulary, bounds, labels, badge variants, resolveDisplayStatus
  money.ts       Prisma.Decimal helpers; money crosses the wire as a decimal string
  money-display.ts  formatEtb/formatEtbNumber/isZeroAmount - NO Prisma import, so
                    browser components can format an amount without dragging
                    @prisma/client into the client bundle
  validators.ts  NATIONAL_ID_RULE + ETHIOPIAN_PHONE_RULE as DATA; masking; phone list
  schedule.ts    addMonthsClamped, generateRentSchedule, isOverdue, parseDateOnly
  schemas.ts     Zod, mirroring the DB CHECK constraints field for field
  types.ts       client-safe DTOs, query state, toSearchParams
  access.ts      sensitive-data predicate, capability map
  queries.ts     read layer + the SQL aggregates (incl. the two-CTE summary)
  service.ts     all mutations: create/update/pay/void/terminate/archive/restore
  api.ts         auth + org + validation + error mapping helpers
  export.ts      CSV/XLSX columns, statement shaping

src/app/api/rent/…        8 route files
src/app/facility/pay-rent/page.tsx   server component: gate, capabilities, summary
src/ui/rent/
  PayRentClient.tsx        owns the Gregorian/Ethiopian calendar toggle
  RentersTable.tsx         server-paginated register, filters, export, row actions
  RenterFormDialog.tsx     create/edit (fields mounted fresh per open)
  RenterDetailDialog.tsx   terms, schedule, receipts, print, void, terminate
  RecordPaymentDialog.tsx  confirm a payment
  VoidPaymentDialog.tsx    confirm a reversal
  TerminateLeaseDialog.tsx confirm a termination
  RentReceiptPrint.tsx     receipt/statement print + multi-page PDF, house stamps
  status-badges.tsx        status pills, months-paid bar
  format.ts                ETB/date/phone formatting, Ethiopian calendar

src/ui/receipt/
  house-style.tsx          the shared printed-form tokens (palette, frame, stamps)
  document-qr.tsx          QR codes on forms, as SVG data URIs

tests/setup/test-env.ts    loads .env before the Prisma singleton (ESM ordering)
scripts/smoke-*.mjs        live end-to-end verification
```

---

## The printed document

`RentReceiptPrint` follows the print architecture already established by
`src/ui/houses/AllocationReceiptPrint.tsx`: a preview dialog plus a print-only
copy portalled into `<body>` under `.rent-receipt-print`, which the global print
CSS shows while hiding the rest of the app. `window.print()` needs no pop-up
window, so it is not blocked.

The document frame, colour tokens, **Facility & House Administration rubber
stamp** (`መተሐራ ስኳር ፋብሪካ` / `ፋሲሊቲ እና ቤት አስተዳደር`) and **issuer name seal**
(`ለበታ ጃርሴ`, `የፋ.ሲ.ቲ ማኔጅመንት ቡድን መሪ`) are the same house style the
allocation receipts use, so a rent receipt on paper is indistinguishable from a
house handover form. Both documents carry the MSF logo, a bilingual
English/Amharic title strip with a page counter, and a footer stating that
receipt numbers are issued once and never re-used.

### The shared house style

Those tokens used to be copy-pasted between `RentReceiptPrint.tsx` and
`AllocationReceiptPrint.tsx`, which meant a change to the stamp or the palette
had to be made twice and could silently drift. They now live in
**`src/ui/receipt/house-style.tsx`**, and both receipt components import from
it. It knows about a _form_, not about houses or rent: palette, font stacks,
frame, cell styles, both stamps, the brand lockup, the fill-line and mono
helpers.

`AllocationReceiptPrint.tsx` keeps its own overrides where the handover
checklist genuinely needs them — a wider brand cell and a larger body size for
its seven-column grid. Everything else is read from the shared module.

### Design rules on the printed document

- **The amount appears twice** — as figures, and written out in words in both
  Amharic and English (`src/lib/rent/amount-words.ts`). A figure written only
  in digits can be altered by hand without the alteration being visible; one
  written in words cannot. Amharic leads, because that is the language the
  receipt is signed in. The two sit side by side in one full-width amount
  strip: words on the left, the figure inverted on the right. Both are derived
  from the same `amountPaid`, never stated separately — words and digits have
  to name **one** amount, or the cross-check they exist for detects nothing. On
  a receipt that is the month's rent; on a statement it is everything received
  so far.
- **Sections are titled bilingually** (ተከራይ / Renter, ክፍያ / Payment, የክፍያ መርሃ
  ግብር / Schedule, ማጠቃለያ / Reconciliation, ማረጋገጫና ፊርማ / Attestation), so
  the renter, the rent office and a later auditor can each jump to the part they
  need without reading the whole page.
- **Nothing is signed that the ledger cannot support.** `rent_payments` has no
  `recordedBy` column, so the cashier and the rent admin sign on blank dotted
  rules (`Dots`) rather than being named by whoever happened to open the dialog.
  Only the renter's name is printed. Adding a `recordedBy` column would let the
  document name the operator who took the cash.
- **The stamp never sits over a figure.** `StampOverlay` takes a placement
  rather than hard-coding one: a one-month receipt has blank paper in its lower
  half, so the stamp goes there (`lower-left`); a full-term statement is dense
  from top to bottom, so the stamp moves into the right-hand gutter.
- **The page counter is measured, not declared.** A `ResizeObserver` measures
  the rendered frame and divides by the printable A4 height, so a 120-month
  statement reads `ገጽ / Page 1 / 4` instead of a hard-coded `1 / 1`.

Layout: masthead (form number `OF/MSF/PHA/RENT-01`, issue number, page counter),
a title bar carrying the document's name against its own receipt number, the
amount strip, the renter's particulars beside the payment detail, the schedule,
the reconciliation, the attestation, and a foot carrying the never-re-used
notice, the ledger note and a QR of the receipt number.

**The QR encodes the receipt number alone** (`src/ui/receipt/document-qr.tsx`).
That is the one field that identifies the document without restating the
renter's name and rent, so a photograph of the code discloses nothing the
visible page does not already show. The number is also printed in plain type
under the code, for when the code will not scan. It is built as an SVG data URI
applied as a `background-image`, and the module matrix comes from `qrcode`'s
synchronous `create()` — the async `toDataURL`/`toString` entry points would
leave a hole in the page until they resolved and make the preview reflow.

Two documents:

- **Receipt** — one settled month: the amount in words and in figures, the
  payment detail (method, reference, status), an Amharic acknowledgement, and
  **three** signature blocks — the renter, the cashier (`ገንዘብ ያዥ / Cashier`)
  and the rent admin (`ኪራይ አስተዳደር / Rent Admin`) — with the name seal over
  the rent admin's line. The receipt's own month is banded in the schedule so a
  reader finds it immediately.
- **Statement** — the whole term, one line per month with status and receipt
  number, then a reconciliation block (total paid / contract value /
  outstanding) plus the ledger count, so the numbers cannot be edited. The
  payment block follows the most recent live receipt, because a statement has no
  single subject.

**PDF export paginates.** The earlier implementation scaled the entire canvas to
fit a single A4 page, which rendered a 120-month statement at roughly 4pt type.
It now slices the canvas into full-resolution page-height bands and emits one
`addPage()` per band, so a long statement stays legible across as many pages as
it needs and rows are never shrunk to fit. Print uses the browser's own
pagination, where `@page` margins and `thead { display: table-header-group }`
repeat the schedule header on every page.

## Testing notes

`vitest.config.ts` had only one line changed: `include` gained
`src/**/*.test.tsx`, so component render tests are collected. `setupFiles: []`,
`environment: "node"` and the coverage block are untouched, so no existing test
changes behaviour. The database-backed suites import
`tests/setup/test-env.ts` as their **first** import, because ESM evaluates
imports before any statement in the body — an inline `dotenv.config()` would run
after `@/lib/prisma` had already built its `pg.Pool` from an empty
`DATABASE_URL`.

### Receipt tests

Three suites cover the printed document:

- `src/lib/rent/__tests__/amount-words.test.ts` — the Amharic and English
  wording, including the irregular tens (`ሰባ` alone, `ሰባት` before a ones
  word) and the `fifty-zero` case English rules forbid.
- `src/ui/rent/__tests__/RentReceiptPrint.render.test.tsx` — renders
  `RentDocument` through `renderToStaticMarkup` and asserts on the markup: the
  amount in words in both languages, both stamps present as the _exact_ data
  URIs the house style defines, numbered sections, three signatories, the
  schedule narrowed to one month. The dialog and the print portal are out of
  scope; what is checked is the document a person signs.
- `scripts/verify-rent-receipt.mjs` — the end-to-end check, in a real browser
  (see below).

`RentDocument` is exported so the render test can reach it without a DOM
portal in the way. The preview, the print copy and the PDF all render that one
component, so a change to it shows up in all three.

### Browser verification

`scripts/verify-rent-receipt.mjs` seeds a 36-month lease with 3 paid months,
opens both documents, and asserts on what actually rendered — including that
the page counter matches the measured content height, that the stamp is pinned
to `position: absolute` under print CSS, and that the downloaded PDF's page
count agrees with the printed counter. It needs the throwaway accounts:

```powershell
$env:SMOKE_PASSWORD="<the throwaway password>"
node scripts/smoke-test-user.mjs create
node scripts/verify-rent-receipt.mjs
node scripts/smoke-test-user.mjs delete
```

`smoke-test-user.mjs` refuses to run against a non-local `DATABASE_URL`, since
it writes a known-password administrator. Everything the verification script
creates is deleted in its `finally` block.

The audit suite mocks `createAuditLog` because that helper reads `headers()` from
`next/headers`, which throws outside a request scope and makes the write
deliberately silent. Asserting on `audit_logs` rows from a script would prove
nothing; mocking proves _which_ entry is written, with which actor and details —
including that personal data is absent.

Integration tests create their own organization and delete only their own rows.
The shared development database is never truncated.

---

## Assumptions made

1. **Ethiopian mobile numbers only** (09/07 prefixes, +251). Ethiopian fixed lines
   are not accepted. Centralised in `ETHIOPIAN_PHONE_RULE`.
2. **National ID is digits only, 4–20 digits**, with no fixed length — real
   Ethiopian ID documents vary, and rejecting an unfamiliar length at the finance
   counter is worse than storing it. Centralised in `NATIONAL_ID_RULE`.
3. **A price change reprices every `UNPAID` month, including already-overdue ones.**
   The requirement said "unpaid future months"; the intent that matters is "never
   paid ones", and restating a settled debt is the failure mode worth avoiding.
4. **Only mobile payments are accepted** (no top-ups, no part-year proration).
   A `monthNumber` must be settled at its full invoiced amount; a partial amount is
   accepted by the schema but capped at `amountDue`.
5. **No hard delete, ever.** Renters archive, installments void, payments are
   voided-but-kept. Receipt numbers are therefore never re-issued.
6. **Schedule regeneration is refused once money exists**, even with the elevated
   permission, because it would re-date issued receipts. Terminate + re-register
   is the supported path.
7. **The portal has no Amharic locale** (its i18n store covers en/de/fr/es/nl), so
   no Amharic label set was added. The Ethiopian-calendar display toggle _was_
   added, since it is orthogonal to i18n and matches the existing Amharic date
   literals in `AllocationReceiptPrint`.
8. **Rate limiting follows the project's existing pattern** — the module does not
   invent a new limiter. The bespoke precedent is the manual-run cooldown in
   `house-queue/config/service.ts`.
