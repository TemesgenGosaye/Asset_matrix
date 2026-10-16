/**
 * End-to-end smoke test for the Pay Rent module against the RUNNING dev server.
 *
 * Drives the real HTTP surface: BetterAuth sign-in -> /api/rent create ->
 * /api/rent/[id] detail -> payment -> totals -> export -> void -> reprice ->
 * permission denial -> schedule override -> terminate -> archive/restore ->
 * audit. Nothing is mocked and nothing is written behind the API's back, so this
 * proves the whole stack works together.
 *
 * ORDERING IS SIGNIFICANT. The permission phase must run while the lease is still
 * Active and has payments recorded, because:
 *   - `rent:pay` needs an unpaid month to settle;
 *   - the schedule-override guard reports TERMS_LOCKED only on an active lease.
 *
 * Creates its own records and deletes them again afterwards.
 *
 * Provision the accounts first:
 *   node scripts/smoke-test-user.mjs create
 */
import "dotenv/config";
import { Client } from "pg";
import { randomBytes } from "node:crypto";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL;
const LIMITED_EMAIL = process.env.SMOKE_LIMITED_EMAIL;
const VIEWONLY_EMAIL = process.env.SMOKE_VIEWONLY_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set SMOKE_EMAIL / SMOKE_PASSWORD to run the smoke test.");
  process.exit(2);
}

// The limited and view-only accounts are what prove the server enforces RBAC
// and masks National IDs. Both phases were previously optional, so a green run
// could mean "authorization was never exercised" while still printing PASSED.
if (!LIMITED_EMAIL || !VIEWONLY_EMAIL) {
  console.error(
    "Set SMOKE_LIMITED_EMAIL and SMOKE_VIEWONLY_EMAIL too - without them the\n" +
      "  authorization and masking phases are skipped and a green run proves nothing.",
  );
  process.exit(2);
}

const stamp = randomBytes(3).toString("hex");
// Digits only: the module's centralised National ID rule accepts digits only, so
// a hex suffix (which can contain a-f) would be rejected by the API under test.
const nationalId = `9${stamp.replace(/[^0-9]/g, "0")}`.slice(0, 12).padEnd(12, "7");

let cookie = "";
let createdId = "";

function ok(label, condition, extra = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${extra ? ` -- ${extra}` : ""}`);
  if (!condition) process.exitCode = 1;
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      // BetterAuth rejects a sign-in whose Origin is not in
      // BETTERAUTH_TRUSTED_ORIGINS, so always send the app's own origin.
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(";")[0];
    if (pair) cookie = cookie ? `${cookie}; ${pair}` : pair;
  }
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

/**
 * Sign in as `email`, run `fn`, then restore the previous session.
 *
 * Pass `keep = true` for the initial admin sign-in so its cookie stays installed
 * as the session every later request uses.
 */
async function asUser(email, fn, keep = false) {
  const previous = cookie;
  cookie = "";
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(";")[0];
    if (pair) cookie = cookie ? `${cookie}; ${pair}` : pair;
  }
  const signedIn = res.ok;
  try {
    await fn(signedIn);
  } finally {
    if (!keep) cookie = previous;
  }
}

/** The schedule, month 1 first. */
async function installments() {
  const res = await api(`/api/rent/${createdId}`);
  return res.body?.installments ?? [];
}

console.log(`\n=== Pay Rent smoke test against ${BASE} ===\n`);

// ---------------------------------------------------------------------------
// 1. Authenticate
// ---------------------------------------------------------------------------
await asUser(EMAIL, async (signedIn) => {
  ok("admin signs in", signedIn);
  if (!signedIn) process.exit(1);
}, true);

// ---------------------------------------------------------------------------
// 2. Read endpoints
// ---------------------------------------------------------------------------
{
  const summary = await api("/api/rent/summary");
  ok("GET /api/rent/summary", summary.status === 200, `status ${summary.status}`);
  ok(
    "summary money is a decimal string, not a float",
    /^\d+\.\d{2}$/.test(summary.body?.totalCollected ?? ""),
    `totalCollected=${summary.body?.totalCollected}`,
  );

  const list = await api("/api/rent?page=1&pageSize=5");
  ok("GET /api/rent (paginated)", list.status === 200, `status ${list.status}`);
  ok(
    "list envelope has pagination",
    Array.isArray(list.body?.data) &&
      typeof list.body?.total === "number" &&
      typeof list.body?.page === "number",
    `total=${list.body?.total}`,
  );
}

// ---------------------------------------------------------------------------
// 3. Validation
// ---------------------------------------------------------------------------
{
  const bad = await api("/api/rent", {
    method: "POST",
    body: JSON.stringify({ firstName: "A" }),
  });
  ok("POST /api/rent rejects invalid input with 422", bad.status === 422, `status ${bad.status}`);

  const badPhone = await api("/api/rent", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Bad",
      lastName: "Phone",
      gender: "female",
      nationalId,
      phones: [{ phone: "12345", isPrimary: true }],
      rentType: "Shop",
      monthlyPrice: "100",
      startDate: "2026-01-01",
      termMonths: 12,
    }),
  });
  ok(
    "POST /api/rent rejects an invalid Ethiopian phone with 422",
    badPhone.status === 422,
    `status ${badPhone.status}`,
  );
}

// ---------------------------------------------------------------------------
// 4. Create -> full schedule in the same transaction
// ---------------------------------------------------------------------------
{
  const payload = {
    firstName: "Smoke",
    lastName: "Tester",
    gender: "female",
    nationalId,
    phones: [
      { phone: "0912345678", isPrimary: true },
      { phone: "0712345678", isPrimary: false },
    ],
    rentType: "Shop",
    monthlyPrice: "1250.00",
    startDate: "2026-01-31",
    termMonths: 12,
  };
  const res = await api("/api/rent", { method: "POST", body: JSON.stringify(payload) });
  ok("POST /api/rent creates a renter", res.status === 201, `status ${res.status}`);
  createdId = res.body?.renter?.id ?? "";

  const schedule = res.body?.installments ?? [];
  ok("schedule generated in full", schedule.length === 12, `${schedule.length} rows`);
  ok(
    "schedule starts on the rent start date",
    schedule[0]?.dueDate === "2026-01-31",
    `month 1 due ${schedule[0]?.dueDate}`,
  );
  ok(
    "month-end clamping applied (31 Jan -> 28 Feb)",
    schedule[1]?.dueDate === "2026-02-28",
    `month 2 due ${schedule[1]?.dueDate}`,
  );
  ok(
    "clamping is anchored, so March returns to the 31st",
    schedule[2]?.dueDate === "2026-03-31",
    `month 3 due ${schedule[2]?.dueDate}`,
  );
  ok(
    "phones normalised to E.164",
    JSON.stringify(res.body?.renter?.phones ?? []).includes("+251912345678"),
  );
  ok(
    "totals are computed, not denormalised",
    res.body?.renter?.totals?.totalContractValue === "15000.00" &&
      res.body?.renter?.totals?.outstanding === "15000.00",
    `contract=${res.body?.renter?.totals?.totalContractValue}`,
  );

  const dupe = await api("/api/rent", { method: "POST", body: JSON.stringify(payload) });
  ok("duplicate National ID -> 409", dupe.status === 409, `status ${dupe.status}`);
}

// ---------------------------------------------------------------------------
// 5. Chronological payment order
// ---------------------------------------------------------------------------
{
  const months = await installments();
  const res = await api(`/api/rent/${createdId}/payments`, {
    method: "POST",
    body: JSON.stringify({
      installmentId: months[2].id,
      method: "Cash",
      paidOn: "2026-03-15",
    }),
  });
  ok(
    "paying month 3 before month 1 -> 409 OUT_OF_ORDER",
    res.status === 409 && res.body?.code === "OUT_OF_ORDER",
    `${res.status} ${res.body?.code}`,
  );
}

// ---------------------------------------------------------------------------
// 6. Payment, totals, and the double-pay guard
// ---------------------------------------------------------------------------
let receiptNumber = "";
{
  const months = await installments();
  const paid = await api(`/api/rent/${createdId}/payments`, {
    method: "POST",
    body: JSON.stringify({
      installmentId: months[0].id,
      method: "Cash",
      paidOn: "2026-01-31",
      referenceNumber: "SMOKE-1",
    }),
  });
  ok("record payment for month 1", paid.status === 201, `status ${paid.status}`);
  receiptNumber = paid.body?.receiptNumber ?? "";

  // A month is settled in FULL or not at all. Under-paying used to mark the
  // month PAID while every "collected" aggregate reported the full invoice,
  // silently forgiving the shortfall and making it uncollectable.
  const short = await api(`/api/rent/${createdId}/payments`, {
    method: "POST",
    body: JSON.stringify({ installmentId: months[1].id, method: "Cash", amount: "1.00" }),
  });
  ok(
    "paying less than the month is invoiced -> 400 AMOUNT_MISMATCH",
    short.status === 400 && short.body?.code === "AMOUNT_MISMATCH",
    `${short.status} ${short.body?.code}`,
  );
  ok(
    "receipt number matches RENT-<year>-<6 digits>",
    /^RENT-\d{4}-\d{6}$/.test(receiptNumber),
    receiptNumber,
  );

  const after = await api(`/api/rent/${createdId}`);
  ok(
    "months paid / total paid / outstanding all moved",
    after.body?.renter?.totals?.monthsPaid === 1 &&
      after.body?.renter?.totals?.totalPaid === "1250.00" &&
      after.body?.renter?.totals?.outstanding === "13750.00",
    `paid=${after.body?.renter?.totals?.totalPaid} outstanding=${after.body?.renter?.totals?.outstanding}`,
  );

  // Two simultaneous requests for the SAME month.
  const race = await Promise.all([
    api(`/api/rent/${createdId}/payments`, {
      method: "POST",
      body: JSON.stringify({ installmentId: months[1].id, method: "Cash", paidOn: "2026-02-28" }),
    }),
    api(`/api/rent/${createdId}/payments`, {
      method: "POST",
      body: JSON.stringify({ installmentId: months[1].id, method: "Cash", paidOn: "2026-02-28" }),
    }),
  ]);
  const created = race.filter((r) => r.status === 201).length;
  const conflicted = race.filter((r) => r.status === 409).length;
  ok(
    "concurrent double-pay -> exactly one 201 and one 409",
    created === 1 && conflicted === 1,
    `${created} created / ${conflicted} conflict`,
  );

  const afterRace = await api(`/api/rent/${createdId}`);
  ok(
    "totals reflect a SINGLE payment for month 2",
    afterRace.body?.renter?.totals?.monthsPaid === 2 &&
      afterRace.body?.renter?.totals?.totalPaid === "2500.00",
    `monthsPaid=${afterRace.body?.renter?.totals?.monthsPaid}`,
  );
}

// ---------------------------------------------------------------------------
// 7. Export
// ---------------------------------------------------------------------------
{
  const csv = await api("/api/rent/export?format=csv&search=Smoke");
  ok("GET /api/rent/export?format=csv", csv.status === 200, `status ${csv.status}`);
  ok(
    "csv is a file download",
    String(csv.headers.get("content-type")).includes("csv"),
    String(csv.headers.get("content-type")),
  );

  const xlsx = await api("/api/rent/export?format=xlsx");
  ok("GET /api/rent/export?format=xlsx", xlsx.status === 200, `status ${xlsx.status}`);
  ok(
    "xlsx content type",
    String(xlsx.headers.get("content-type")).includes("spreadsheetml"),
    String(xlsx.headers.get("content-type")),
  );
}

// ---------------------------------------------------------------------------
// 8. Void
// ---------------------------------------------------------------------------
let paymentId = "";
{
  const months = await installments();
  const target = months.find((i) => i.receiptNumber === receiptNumber);
  paymentId = target?.payments?.[0]?.id ?? "";

  const noReason = await api(`/api/rent/payments/${paymentId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason: "" }),
  });
  ok("void without a reason -> 422", noReason.status === 422, `status ${noReason.status}`);

  const voided = await api(`/api/rent/payments/${paymentId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason: "Smoke test reversal" }),
  });
  ok("void payment", voided.status === 200, `status ${voided.status}`);
  ok(
    "month reopened and outstanding restored",
    voided.body?.renter?.totals?.monthsPaid === 1 &&
      voided.body?.renter?.totals?.totalPaid === "1250.00",
    `monthsPaid=${voided.body?.renter?.totals?.monthsPaid}`,
  );

  const monthsAfter = await installments();
  const keptReceipt = monthsAfter
    .flatMap((i) => i.payments ?? [])
    .some((p) => p.receiptNumber === receiptNumber && p.voidedAt);
  ok("voided receipt is kept, never deleted", keptReceipt);

  const twice = await api(`/api/rent/payments/${paymentId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason: "again" }),
  });
  ok("voiding twice -> 409", twice.status === 409, `status ${twice.status}`);
}

// ---------------------------------------------------------------------------
// 9. Price change affects only unpaid months
// ---------------------------------------------------------------------------
{
  const res = await api(`/api/rent/${createdId}`, {
    method: "PATCH",
    body: JSON.stringify({ monthlyPrice: "1500.00" }),
  });
  ok("PATCH /api/rent/[id] changes the price", res.status === 200, `status ${res.status}`);

  const months = res.body?.installments ?? [];
  const paidMonth = months.find((i) => i.status === "PAID");
  const unpaid = months.filter((i) => i.status === "UNPAID");
  ok(
    "the PAID month keeps the price it was invoiced",
    paidMonth?.amountDue === "1250.00",
    `paid month=${paidMonth?.amountDue}`,
  );
  ok(
    "every UNPAID month took the new price",
    unpaid.length > 0 && unpaid.every((i) => i.amountDue === "1500.00"),
    `${unpaid.length} unpaid months`,
  );
}

// ---------------------------------------------------------------------------
// 10. Permission enforcement and personal-data masking
//
//     The admin bypasses RBAC, so it proves nothing about authorisation. These
//     assertions run as narrowly-scoped roles and prove the SERVER refuses what
//     the role does not grant - not merely that the UI hides it.
//
//     Must run while the lease is Active with payments recorded.
// ---------------------------------------------------------------------------
{
  await asUser(VIEWONLY_EMAIL, async (signedIn) => {
    ok("view-only user signs in", signedIn);
    const detail = await api(`/api/rent/${createdId}`);
    ok("rent:view -> detail is 200", detail.status === 200, `status ${detail.status}`);
    ok(
      "National ID is MASKED for a role without sensitive view",
      detail.body?.renter?.nationalIdMasked === true &&
        /^\*+\d{4}$/.test(detail.body?.renter?.nationalId ?? ""),
      `nationalId=${detail.body?.renter?.nationalId}`,
    );
    ok(
      "the masked value is not the real National ID",
      detail.body?.renter?.nationalId !== nationalId,
    );

    // Searching BY the National ID must not find the renter for a role that may
    // not read it: the mask reveals the last four digits, so a `contains` filter
    // let a caller walk prefixes and rebuild the value they were denied.
    const byId = await api(`/api/rent?search=${encodeURIComponent(nationalId)}&pageSize=100`);
    ok(
      "National ID search returns nothing for a masked-only role",
      !(byId.body?.data ?? []).some((r) => r.id === createdId),
      `matches=${(byId.body?.data ?? []).length}`,
    );

    const pay = await api(`/api/rent/${createdId}/payments`, {
      method: "POST",
      body: JSON.stringify({ installmentId: detail.body?.installments?.[0]?.id, method: "Cash" }),
    });
    ok("view-only cannot pay -> 403", pay.status === 403, `status ${pay.status}`);
  });
}

{
  await asUser(LIMITED_EMAIL, async (signedIn) => {
    ok("limited user signs in", signedIn);

    const list = await api("/api/rent?page=1&pageSize=5");
    ok("rent:view -> list is 200", list.status === 200, `status ${list.status}`);

    const detail = await api(`/api/rent/${createdId}`);
    ok("rent:view -> detail is 200", detail.status === 200, `status ${detail.status}`);
    ok(
      "rent:update implies an UNMASKED National ID",
      detail.body?.renter?.nationalIdMasked === false &&
        detail.body?.renter?.nationalId === nationalId,
      `nationalId=${detail.body?.renter?.nationalId}`,
    );

    const unpaid = (detail.body?.installments ?? []).find((i) => i.status === "UNPAID");
    const paid = await api(`/api/rent/${createdId}/payments`, {
      method: "POST",
      body: JSON.stringify({ installmentId: unpaid?.id, method: "Cash" }),
    });
    ok("rent:pay -> payment is 201", paid.status === 201, `status ${paid.status}`);

    for (const [label, path, method, body] of [
      ["rent:create", "/api/rent", "POST", { firstName: "No", lastName: "Access" }],
      ["rent:export", "/api/rent/export?format=csv", "GET", undefined],
      ["rent:void", "/api/rent/payments/x/void", "POST", { reason: "nope" }],
      ["rent:terminate", `/api/rent/${createdId}/terminate`, "POST", { reason: "nope" }],
      ["rent:archive", `/api/rent/${createdId}`, "DELETE", {}],
    ]) {
      const res = await api(path, { method, body });
      ok(`${label} -> 403 for a role without it`, res.status === 403, `status ${res.status}`);
    }

    const override = await api(`/api/rent/${createdId}`, {
      method: "PATCH",
      body: JSON.stringify({ startDate: "2026-03-01", reason: "Smoke test" }),
    });
    ok(
      "rent:override_terms missing -> 403 TERMS_LOCKED",
      override.status === 403 && override.body?.code === "TERMS_LOCKED",
      `${override.status} ${override.body?.code}`,
    );
  });
}

// ---------------------------------------------------------------------------
// 11. The elevated grant does not unlock a schedule rewrite
// ---------------------------------------------------------------------------
{
  const res = await api(`/api/rent/${createdId}`, {
    method: "PATCH",
    body: JSON.stringify({ startDate: "2026-02-01", reason: "Smoke test" }),
  });
  // The admin bypasses RBAC, so it DOES hold `rent:override_terms` and clears the
  // permission gate - and is then refused by the later guard, because
  // regenerating the schedule would re-date an already-issued receipt.
  ok(
    "admin with the elevated grant is refused by SCHEDULE_FROZEN",
    res.status === 409 && res.body?.code === "SCHEDULE_FROZEN",
    `${res.status} ${res.body?.code}`,
  );
}

// ---------------------------------------------------------------------------
// 12. Terminate
// ---------------------------------------------------------------------------
{
  const res = await api(`/api/rent/${createdId}/terminate`, {
    method: "POST",
    body: JSON.stringify({
      reason: "Smoke test termination",
      effectiveDate: "2026-01-01",
    }),
  });
  ok("terminate lease", res.status === 200, `status ${res.status}`);
  ok(
    "lease is Terminated and remaining months voided",
    res.body?.renter?.status === "Terminated" &&
      (res.body?.installments ?? []).some((i) => i.status === "VOIDED"),
    `voidedMonths=${res.body?.voidedMonths}`,
  );

  const payAfter = await api(`/api/rent/${createdId}/payments`, {
    method: "POST",
    body: JSON.stringify({ installmentId: res.body?.installments?.[0]?.id, method: "Cash" }),
  });
  ok(
    "paying a terminated lease -> 409",
    payAfter.status === 409,
    `${payAfter.status} ${payAfter.body?.code}`,
  );
}

// ---------------------------------------------------------------------------
// 13. Archive / restore
// ---------------------------------------------------------------------------
{
  const archived = await api(`/api/rent/${createdId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason: "Smoke test archive" }),
  });
  ok("archive renter", archived.status === 200, `status ${archived.status}`);

  const list = await api("/api/rent?search=Smoke");
  ok(
    "archived renter hidden from the live list",
    !(list.body?.data ?? []).some((r) => r.id === createdId),
  );

  const restored = await api(`/api/rent/${createdId}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  ok("restore renter", restored.status === 200, `status ${restored.status}`);
}

// ---------------------------------------------------------------------------
// 14. Audit trail (read straight from PostgreSQL)
// ---------------------------------------------------------------------------
{
  const pool = new Client({ connectionString: process.env.DATABASE_URL });
  await pool.connect();

  const logs = await pool.query(
    `SELECT action, entity, details FROM "public"."audit_logs"
      WHERE "entityId" = $1::uuid AND entity IN ('rent_renter','rent_payment')
      ORDER BY "createdAt" ASC`,
    [createdId],
  );
  const actions = new Set(logs.rows.map((r) => r.action));
  ok(
    "create / update / terminate / archive all audited",
    ["CREATE", "UPDATE", "TERMINATE", "DELETE"].every((a) => actions.has(a)),
    [...actions].join(","),
  );

  const serialised = JSON.stringify(logs.rows.map((r) => r.details));
  ok(
    "no National ID and no phone number in the audit log",
    !serialised.includes(nationalId) && !serialised.includes("+251912345678"),
  );

  await pool.end();
}

// ---------------------------------------------------------------------------
// Cleanup: delete only what this run created, children first.
// ---------------------------------------------------------------------------
if (createdId) {
  const pool = new Client({ connectionString: process.env.DATABASE_URL });
  await pool.connect();
  // Audit rows are keyed by entityId, which is the renter for renter events but
  // the PAYMENT for pay/void events - so both sets must be collected, or the
  // payment audit rows outlive the run.
  const { rows } = await pool.query(
    `SELECT "id" FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`,
    [createdId],
  );
  const paymentIds = rows.map((r) => r.id);

  await pool.query(`DELETE FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`, [createdId]);
  await pool.query(`DELETE FROM "public"."rent_installments" WHERE "renterId" = $1::uuid`, [createdId]);
  await pool.query(`DELETE FROM "public"."rent_renter_phones" WHERE "renterId" = $1::uuid`, [createdId]);
  await pool.query(
    `DELETE FROM "public"."audit_logs"
      WHERE "entityId" = $1::uuid
         OR ("entityId" = ANY($2::uuid[]) AND entity = 'rent_payment')`,
    [createdId, paymentIds],
  );
  await pool.query(`DELETE FROM "public"."rent_renters" WHERE "id" = $1::uuid`, [createdId]);
  await pool.end();
  console.log(`\ncleaned up renter ${createdId}`);
} else {
  // Nothing to clean up, but say so rather than leaving the reader wondering
  // whether the run created anything at all.
  console.log("\nnothing was created; nothing to clean up");
}

console.log(
  process.exitCode ? "\n=== SMOKE TEST FAILED ===" : "\n=== SMOKE TEST PASSED ===",
);
