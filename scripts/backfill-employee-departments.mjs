/**
 * One-off department backfill for the Employee Management module.
 *
 * WHY THIS EXISTS
 *   All 101 rows in `"Employee"` had `departmentId = NULL` when the module
 *   shipped, which makes the Department column useless on day one. The
 *   database also contains a legacy "Horilla" HR schema
 *   (`employee_employee`, `employee_employeeworkinformation`, `base_department`)
 *   which holds a real department assignment per person. This script attempts
 *   to carry those assignments across.
 *
 * HONEST EXPECTATION
 *   As of the audit this script resolves very few rows, and the report says so.
 *   The two schemas describe different organisations and are joined only on
 *   email:
 *     * 100 of our 101 employees are synthetic seed rows (`EMP0001`..`EMP0100`,
 *       `@example.com`) with no legacy counterpart at all.
 *     * The 1 real employee matches 2 legacy rows that BOTH have a NULL
 *       department, because that email is duplicated in the legacy data.
 *     * The two department taxonomies do not overlap by name
 *       (legacy: IT / HR / Finance / Logistics / QA / HSE ...
 *        ours:   CIVIL WORK / L.P.C.D / CULTIVATION / PLANTATION / ...).
 *   So a correct run reports 0 matched / 101 unmatched and changes nothing.
 *   That is the point: it never guesses.
 *
 * MATCH STRATEGY (in order, first hit wins)
 *   1. Legacy `base_department.name` == our `departments.name`
 *   2. Legacy `base_department.name` == our `departments.code`
 *   3. Normalised (case/space/punctuation-insensitive) name match
 * A hit is only written if it is UNAMBIGUOUS — a name that matches two of our
 * departments is reported as ambiguous and never written.
 *
 * USAGE
 *   node scripts/backfill-employee-departments.mjs                # dry run
 *   node scripts/backfill-employee-departments.mjs --apply        # write
 *   node scripts/backfill-employee-departments.mjs --database=staging
 *
 * The dry run is the default and always safe. Writes happen inside a single
 * transaction, and only `departmentId IS NULL` rows are ever touched, so
 * re-running is idempotent and never overwrites an HR correction.
 */

import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const dbNameOverride = process.argv
  .find((a) => a.startsWith("--database="))
  ?.slice("--database=".length);

/**
 * This script is retired and cannot run any more.
 *
 * Its only join key between our Employee table and the legacy Horilla schema was
 * the email address, and that column was dropped in
 * `20261004000000_drop_employee_email`. The file is kept for the audit report it
 * produced, not as a tool — see the "HONEST EXPECTATION" note above, which
 * recorded that a correct run matched 0 of 101 rows anyway.
 *
 * Failing loudly here beats letting it die on a `column "email" does not exist`
 * SQL error several hundred lines in.
 */
console.error(
  "backfill-employee-departments.mjs is retired and will not run.\n" +
    '  Its join key was Employee.email, dropped by migration\n' +
    "  20261004000000_drop_employee_email. The file remains only as a record of\n" +
    "  the original audit. See docs/ or the migration for the reasoning.",
);
process.exit(2);
const REPORT_PATH = join(process.cwd(), "employee-department-backfill-report.csv");

/** Lowercase, collapse punctuation/whitespace so "Q.A." matches "QA". */
function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected in .env or the environment).");
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
const db = new Client({
  host: url.hostname,
  port: Number(url.port),
  user: url.username,
  password: url.password,
  database: dbNameOverride || url.pathname.slice(1),
});

await db.connect();

const tableExists = async (name) => {
  const r = await db.query("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${name}`]);
  return r.rows[0].ok;
};

// ── Guard: the legacy tables may not exist on a fresh install ────────────────
const hasLegacy =
  (await tableExists("employee_employee")) &&
  (await tableExists("employee_employeeworkinformation")) &&
  (await tableExists("base_department"));

if (!hasLegacy) {
  console.log(
    "Legacy Horilla tables are not present on this database.\n" +
      "Nothing to backfill from — report will show every employee as unmatched.",
  );
}

const departments = await db.query(
  `SELECT id, "organizationId", code, name FROM public.departments ORDER BY name`,
);

// Department lookup maps are built PER ORGANIZATION, so a legacy name can never
// resolve to a department belonging to a different organisation.
const deptIndex = new Map(); // organizationId -> { byExactName, byExactCode, byNormalized }
const indexFor = (organizationId) => {
  let idx = deptIndex.get(organizationId);
  if (idx) return idx;
  idx = { byExactName: new Map(), byExactCode: new Map(), byNormalized: new Map() };
  const add = (m, k, d) => {
    if (!k) return;
    if (m.has(k)) m.set(k, null); // ambiguous → never auto-applied
    else m.set(k, d);
  };
  for (const d of departments.rows) {
    if (d.organizationId !== organizationId) continue;
    add(idx.byExactName, d.name, d);
    add(idx.byExactCode, d.code, d);
    add(idx.byNormalized, normalizeName(d.name), d);
  }
  deptIndex.set(organizationId, idx);
  return idx;
};

const resolveDepartment = (legacyName, organizationId) => {
  if (!legacyName) return { dept: null, how: null };
  const idx = indexFor(organizationId);
  const exact = idx.byExactName.get(legacyName) ?? idx.byExactCode.get(legacyName);
  if (exact) return { dept: exact, how: "exact name/code" };
  const norm = idx.byNormalized.get(normalizeName(legacyName));
  if (norm) return { dept: norm, how: "normalised name" };
  return { dept: null, how: null };
};

// ── Build the candidate map ──────────────────────────────────────────────────
const candidates = new Map(); // our employeeId -> { dept, legacyName, how }
const notes = [];

if (hasLegacy) {
  const legacy = await db.query(`
    SELECT
      ee.id::text                AS legacy_employee_id,
      ee.email                   AS legacy_email,
      w."department_id_id"::text  AS legacy_department_id,
      bd.department               AS legacy_department_name
    FROM public.employee_employee ee
    LEFT JOIN public.employee_employeeworkinformation w
           ON w."employee_id_id" = ee.id
    LEFT JOIN public.base_department bd
           ON bd.id::text = w."department_id_id"::text
  `);

  const byEmail = new Map();
  for (const row of legacy.rows) {
    const k = String(row.legacy_email ?? "").trim().toLowerCase();
    if (!k) continue;
    byEmail.set(k, [...(byEmail.get(k) ?? []), row]);
  }

  // A single legacy employee can have several work-information rows. Collapse
  // them to ONE department name; if they disagree, the person is ambiguous and
  // is skipped rather than guessed.
  const uniqueDeptPerEmployee = new Map();
  for (const [email, rows] of byEmail) {
    if (rows.length > 1) {
      const ids = rows.map((r) => r.legacy_employee_id);
      const names = new Set(rows.map((r) => r.legacy_department_name ?? null));
      if (names.size > 1) {
        notes.push(
          `AMBIGUOUS EMAIL "${email}" matches ${rows.length} legacy rows (ids ${ids.join(
            ", ",
          )}) with conflicting departments (${[...names].filter(Boolean).join(", ")}) — skipped.`,
        );
        continue;
      }
      const shared = [...names][0];
      if (!shared) {
        notes.push(
          `duplicate legacy rows for "${email}" (ids ${ids.join(", ")}) all have no ` +
            `department assigned — nothing to backfill.`,
        );
        uniqueDeptPerEmployee.set(email, null);
        continue;
      }
      notes.push(
        `duplicate legacy rows for "${email}" (ids ${ids.join(", ")}) agree on department ` +
          `"${shared}" — using it.`,
      );
      uniqueDeptPerEmployee.set(email, shared);
      continue;
    }
    uniqueDeptPerEmployee.set(email, rows[0].legacy_department_name);
  }

  // Store the legacy name UNRESOLVED. Department lookup is org-scoped and the
  // target organisation is only known once we walk our own employee rows.
  for (const [email, legacyName] of uniqueDeptPerEmployee) {
    if (legacyName) candidates.set(email, { legacyName });
  }
}

// ── Walk every employee ──────────────────────────────────────────────────────
const employees = await db.query(
  `SELECT id, "organizationId", "employeeNumber", firstname, lastname, email,
          "departmentId" AS existing_department
     FROM public."Employee"
    ORDER BY "employeeNumber"`,
);

const rows = [];
let matched = 0;
let alreadySet = 0;
let unmatched = 0;

for (const e of employees.rows) {
  if (e.existing_department) {
    alreadySet++;
    continue;
  }
  const email = String(e.email ?? "").trim().toLowerCase();
  const hit = candidates.get(email);
  // Re-resolve against THIS employee's organization so a legacy name can never
  // resolve to a department owned by a different organisation.
  const resolved = hit ? resolveDepartment(hit.legacyName, e.organizationId) : { dept: null, how: null };
  if (hit && resolved.dept) {
    matched++;
    rows.push({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      name: `${e.firstname} ${e.lastname}`.trim(),
      email: e.email,
      legacyDepartment: hit.legacyName,
      ourDepartment: resolved.dept.name,
      ourDepartmentCode: resolved.dept.code,
      ourDepartmentId: resolved.dept.id,
      matchedBy: resolved.how,
      status: "MATCHED",
      reason: "",
    });
  } else {
    unmatched++;
    rows.push({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      name: `${e.firstname} ${e.lastname}`.trim(),
      email: e.email,
      legacyDepartment: hit?.legacyName ?? "",
      ourDepartment: "",
      ourDepartmentCode: "",
      ourDepartmentId: "",
      matchedBy: "",
      status: "UNMATCHED",
      reason: hit
        ? `Legacy department "${hit.legacyName}" has no unambiguous match in this organization — left NULL by design.`
        : "No unambiguous legacy department for this employee — left NULL by design.",
    });
  }
}

const total = (await db.query(`SELECT count(*)::int AS n FROM public."Employee"`)).rows[0].n;
const setCount = (await db.query(
  `SELECT count(*)::int AS n FROM public."Employee" WHERE "departmentId" IS NOT NULL`,
)).rows[0].n;

// ── Write (only with --apply) ────────────────────────────────────────────────
if (APPLY) {
  const toWrite = rows.filter((x) => x.status === "MATCHED");
  if (toWrite.length > 0) {
    await db.query("BEGIN");
    try {
      let written = 0;
      for (const r of toWrite) {
        if (!r.ourDepartmentId) {
          throw new Error(`refusing to write NULL department for ${r.employeeNumber}`);
        }
        const res = await db.query(
          `UPDATE public."Employee" SET "departmentId" = $1
            WHERE id = $2 AND "departmentId" IS NULL AND "organizationId" = (
              SELECT "organizationId" FROM public."Employee" WHERE id = $2)`,
          [r.ourDepartmentId, r.employeeId],
        );
        written += res.rowCount;
      }
      await db.query("COMMIT");
      console.log(`\nCommitted ${written} department assignment(s).`);
    } catch (e) {
      await db.query("ROLLBACK");
      console.error("Rolled back:", e.message);
      process.exitCode = 1;
    }
  } else {
    console.log("\nNo matches to write.");
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const cols = [
  "employeeId",
  "employeeNumber",
  "name",
  "email",
  "legacyDepartment",
  "ourDepartment",
  "ourDepartmentCode",
  "ourDepartmentId",
  "matchedBy",
  "status",
  "reason",
];
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [
  cols.join(","),
  ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
].join("\n");
writeFileSync(REPORT_PATH, csv + "\n", "utf8");

console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} — employee department backfill`);
console.log("─".repeat(60));
console.log(`employees total                : ${total}`);
console.log(`already had a department       : ${setCount}`);
console.log(`matched from legacy            : ${matched}`);
console.log(`unmatched (left NULL)          : ${unmatched}`);
console.log(`our departments available      : ${departments.rows.length}`);
if (notes.length) {
  console.log("\nNotes:");
  for (const n of notes) console.log("  - " + n);
}
console.log(`\nreport written to: ${REPORT_PATH}`);
if (!APPLY && matched > 0) {
  console.log("\nRe-run with --apply to write these matches.");
} else if (!APPLY) {
  console.log(
    "\nNothing to write. This is the expected outcome for the current data —\n" +
      "the legacy and current employee sets are effectively disjoint. Set the\n" +
      "Department column by hand in the UI, or re-run after loading real\n" +
      "employee data that shares emails with the legacy system.",
  );
}

await db.end();
