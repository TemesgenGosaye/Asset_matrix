#!/usr/bin/env node
/**
 * Verifies the printed rent receipt / lease statement in a real browser.
 *
 * Rasterisation, print CSS, PDF pagination and the stamp's `mix-blend-mode`
 * compositing only behave correctly in a real engine, so this exercises the
 * document end to end: it seeds a 36-month lease, opens both documents, asserts
 * on what actually rendered, checks the page counter against the real measured
 * height, downloads both PDFs, and screenshots each one.
 *
 *   node scripts/smoke-test-user.mjs create
 *   $env:SMOKE_EMAIL="pay-rent-smoke@example.invalid"
 *   $env:SMOKE_PASSWORD="<the throwaway password>"
 *   node scripts/verify-rent-receipt.mjs
 *   node scripts/smoke-test-user.mjs delete
 *
 * Everything it creates is deleted again in the `finally` block.
 */
import "dotenv/config";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const OUT = process.env.SMOKE_SHOT_DIR ?? join(tmpdir(), "opencode");

if (!EMAIL || !PASSWORD) {
  console.error("Set SMOKE_EMAIL / SMOKE_PASSWORD to run this check.");
  process.exit(2);
}

/**
 * Months seeded as paid, and the monthly rent.
 *
 * 3 paid months on a 36-month term is deliberate: the schedule has to overflow
 * one A4 page so the pagination and the page counter are both exercised, while
 * the seeded data stays small enough that the cleanup below is exact.
 */
const MONTHLY_PRICE = "1250.00";
const TERM_MONTHS = 36;
const PAID_MONTHS = 3;
const REFERENCE = "FT-99887";

/**
 * CSS millimetres per pixel at 96dpi.
 *
 * The page counter is derived from the rendered frame's pixel size, so the
 * check has to convert in the same direction to know what it should read.
 */
const PX_PER_MM = 96 / 25.4;

const stamp = randomBytes(3).toString("hex");
const nationalId = `9${stamp.replace(/[^0-9]/g, "0")}`
  .slice(0, 12)
  .padEnd(12, "7");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

let createdId = "";
const results = [];
const check = (label, ok, extra = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${extra ? " -- " + extra : ""}`,
  );
};

/**
 * Read the portalled print copy, which is what actually gets printed.
 *
 * Measuring `.rent-receipt-print` rather than the dialog preview is the whole
 * point: the print CSS hides the rest of the app and shows only this, so it is
 * the copy a person would hold.
 */
const readDoc = async () => {
  const doc = page.locator(".rent-receipt-print");
  await doc.waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForTimeout(600);
  const text = ((await doc.textContent()) ?? "").replace(/\s+/g, " ");
  const stamped = await doc.evaluate(
    (el) => el.querySelectorAll('[data-print-overlay="true"]').length,
  );
  const rows = await doc.locator("tbody tr").count();
  // The portalled copy is `display: none` on screen, so its box is null; the
  // preview inside the dialog is the same width and the same content, and is
  // what the page counter measures off.
  const box = await page
    .locator('[role="dialog"] [data-document-frame]')
    .first()
    .boundingBox()
    .catch(() => null);
  // The masthead reads "ገጽ / Page  1 / N", so the total is the second number.
  const pageCounter = (text.match(/ገጽ \/ Page\s*1 \/ (\d+)/) ?? [])[1] ?? "?";
  return { text, stamped, rows, box, pageCounter };
};

/** Read a downloaded PDF's page count straight out of its raw bytes. */
const pdfPageCount = (path) => {
  const bytes = readFileSync(path).toString("latin1");
  return (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
};

try {
  await page.goto(`${BASE}/login`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.fill("#username", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), {
    timeout: 60_000,
  });

  // The first-run welcome dialog blocks the page; dismiss whatever it offers.
  const welcome = page
    .locator('[role="dialog"]')
    .filter({ hasText: "Welcome to Asset Tracker" });
  if (
    await welcome
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false)
  ) {
    const d = welcome.locator(
      'button:has-text("Skip"), button:has-text("Close"), button:has-text("Later"), button:has-text("Get started"), button:has-text("Finish")',
    );
    if (await d.count()) await d.first().click();
    else await page.keyboard.press("Escape");
    await welcome.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  }

  const seed = await page.evaluate(
    async ({ nid, price, months, term }) => {
      const post = async (p, b) => {
        const r = await fetch(p, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        });
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const c = await post("/api/rent", {
        firstName: "Receipt",
        lastName: "Verification",
        gender: "male",
        nationalId: nid,
        phones: [{ phone: "0912345678", isPrimary: true }],
        rentType: "Shop",
        rentTypeDetail: "Main market",
        monthlyPrice: price,
        startDate: "2026-01-31",
        termMonths: term,
      });
      if (c.status !== 201) return { error: c };
      const id = c.body.renter.id;
      for (let m = 1; m <= months; m++) {
        await post(`/api/rent/${id}/payments`, {
          monthNumber: m,
          method: "BankTransfer",
          paidOn: `2026-0${m}-28`,
          referenceNumber: "FT-99887",
        });
      }
      return { id };
    },
    {
      nid: nationalId,
      price: MONTHLY_PRICE,
      months: PAID_MONTHS,
      term: TERM_MONTHS,
    },
  );
  if (seed.error) throw new Error("seed failed " + JSON.stringify(seed.error));
  createdId = seed.id;
  console.log(
    `seeded a ${TERM_MONTHS}-month lease with ${PAID_MONTHS} paid months\n`,
  );

  await page.goto(`${BASE}/facility/pay-rent`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page
    .locator("main button:visible", { hasText: "Receipt Verification" })
    .first()
    .click();
  const detail = page.getByRole("dialog", { name: /Receipt Verification/ });
  await detail.waitFor({ state: "visible", timeout: 30_000 });

  // ---------------- STATEMENT ----------------
  await detail.locator('button:has-text("Print statement")').click();
  const stmt = page.getByRole("dialog", { name: "Lease Statement" });
  await stmt.waitFor({ state: "visible", timeout: 30_000 });

  const s = await readDoc();
  check(
    "statement: logo image",
    (await page.locator(".rent-receipt-print img").count()) > 0,
  );
  check(
    "statement: stamp + name seal both stamped",
    s.stamped === 2,
    `${s.stamped} print overlays`,
  );
  check("statement: MSF brand cell", /METAHARA SUGAR FACTORY/.test(s.text));
  check("statement: rent office signature block", /ኪራይ አስተዳደር/.test(s.text));
  check("statement: bilingual title", /የኪራይ የኪራ ሂሳብ/.test(s.text));
  check("statement: form reference in the masthead", /OF\/MSF\/PHA\/RENT-01/.test(s.text));
  check(
    "statement: all 36 months listed",
    s.rows >= TERM_MONTHS,
    `${s.rows} rows`,
  );
  check("statement: national id", new RegExp(nationalId).test(s.text));
  check("statement: never-re-issued footer", /RE-USED/i.test(s.text));

  // The amount in words is the reason the wording is written out at all: a
  // figure in digits can be altered by hand, a figure in words cannot - but
  // only while the two name the same amount. On a statement that amount is
  // everything received so far (PAID_MONTHS x monthly), not the contract
  // value, so the wording has to track the figure beside it.
  const totalReceived = (Number(MONTHLY_PRICE) * PAID_MONTHS).toLocaleString(
    "en-US",
    { minimumFractionDigits: 2 },
  );
  check(
    "statement: total received written in Amharic words",
    s.text.includes("ብር ብቻ"),
    totalReceived,
  );
  check(
    "statement: total received written in English words",
    /three thousand seven hundred fifty birr only/.test(s.text),
    totalReceived,
  );
  check(
    "statement: words and figures describe one amount",
    s.text.includes(totalReceived),
    `${totalReceived} must appear as both words and digits`,
  );

  // Sections are titled bilingually, which is what lets an auditor jump to a part.
  const sectionTitles = [
    "ተከራይ / Renter",
    "ክፍያ / Payment",
    "የክፍያ መርሃ ግብር / Schedule",
    "ማጠቃለያ / Reconciliation",
    "ማረጋገጫና ፊርማ / Attestation",
  ].filter((t) => s.text.includes(t));
  check(
    "statement: sections titled bilingually",
    sectionTitles.length === 5,
    `${sectionTitles.length}/5`,
  );
  check(
    "statement: reconciliation totals present",
    /ያልተከፍለ \/ Outstanding/.test(s.text),
  );

  // The page counter must reflect the real height, not a hard-coded 1/1.
  // The frame is 186mm wide by declaration, so its measured pixel width gives
  // the scale factor needed to read its height back in millimetres.
  const printableMm = 297 - 16; // one A4 less the @page margin in globals.css
  const pxPerMm = s.box ? s.box.width / 186 : PX_PER_MM;
  const expectedPages =
    s.box && pxPerMm > 0
      ? Math.max(1, Math.ceil(s.box.height / (printableMm * pxPerMm)))
      : 1;
  console.log(
    `INFO  statement frame ${Math.round(s.box?.width ?? 0)}x${Math.round(s.box?.height ?? 0)}px ` +
      `= ${Math.round((s.box?.height ?? 0) / pxPerMm)}mm tall, counter reads "${s.pageCounter}", expected ${expectedPages}`,
  );
  check(
    "statement: page counter matches the measured content height",
    Number(s.pageCounter) === expectedPages,
    `counter "${s.pageCounter}", measured ${expectedPages}`,
  );
  check(
    "statement: page counter is above 1, so it is not hard-coded",
    Number(s.pageCounter) > 1,
    `reads "${s.pageCounter}"`,
  );

  await stmt.screenshot({ path: `${OUT}/receipt-statement.png` });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    stmt.locator('button:has-text("Download PDF")').click(),
  ]);
  const pdfPath = `${OUT}/statement-download.pdf`;
  await download.saveAs(pdfPath);
  const pages = pdfPageCount(pdfPath);
  check(
    "statement PDF paginates beyond one page",
    pages > 1,
    `${pages} pages, ${Math.round(statSync(pdfPath).size / 1024)} KB`,
  );
  check(
    "statement PDF page count matches the printed counter",
    String(pages) === String(s.pageCounter),
    `pdf ${pages} vs counter ${s.pageCounter}`,
  );

  // Print path (the browser's own pagination, not the PDF writer).
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(800);
  check(
    "print CSS reveals the document",
    await page.locator(".rent-receipt-print").isVisible(),
  );
  const overlayPositions = await page
    .locator(".rent-receipt-print [data-print-overlay]")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).position));
  check(
    "print CSS pins the stamp so it cannot repeat per page",
    overlayPositions.every((p) => p === "absolute"),
    overlayPositions.join(", "),
  );
  await page.emulateMedia({ media: "screen" });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // ---------------- SINGLE RECEIPT ----------------
  await detail.locator('tbody tr:has-text("RENT-") button').first().click();
  const rcpt = page.getByRole("dialog", { name: "Rent Receipt" });
  await rcpt.waitFor({ state: "visible", timeout: 30_000 });

  const r = await readDoc();
  check("receipt: Rent Receipt title", /Rent Receipt\s+\(\w+\)/.test(r.text));
  check("receipt: receipt number", /RENT-\d{4}-\d{6}/.test(r.text));
  check("receipt: reference number", new RegExp(REFERENCE).test(r.text));
  check(
    "receipt: renter acknowledgement",
    /I acknowledge this statement as a correct record of my rent account\./.test(
      r.text,
    ),
  );
  check(
    "receipt: stamp + name seal both stamped",
    r.stamped === 2,
    `${r.stamped} print overlays`,
  );
  check(
    "receipt: month's amount in Amharic words",
    r.text.includes("አንድ ሺህ ሁለት መቶ ሃምሳ ብር ብቻ"),
  );
  check(
    "receipt: month's amount in English words",
    /one thousand two hundred fifty birr only/.test(r.text),
  );
// Three signatories: the renter, the cashier who took the cash, and the rent
  // admin. Only the renter is named - the ledger records no operator.
  for (const party of [
    "ተከራይ / Renter",
    "ገንዘብ ያዥ / Cashier",
    "ኪራይ አስተዳደር / Rent Admin",
  ]) {
    check(`receipt: ${party} signature line`, r.text.includes(party));
  }
  check(
    "receipt: schedule narrowed to one month",
    /RENT-\d{4}-\d{6}/.test(r.text) && !/\b2 \/ 36\b/.test(r.text),
  );
  check(
    "receipt: page counter reads 1 of 1",
    r.pageCounter === "1",
    `reads "${r.pageCounter}"`,
  );

  await rcpt.screenshot({ path: `${OUT}/receipt-single.png` });

  const [dl2] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    rcpt.locator('button:has-text("Download PDF")').click(),
  ]);
  const p2 = `${OUT}/receipt-download.pdf`;
  await dl2.saveAs(p2);
  const pg2 = pdfPageCount(p2);
  check("single receipt PDF is one page", pg2 === 1, `${pg2} pages`);

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("run completed", false, e instanceof Error ? e.message : String(e));
} finally {
  if (createdId) {
    const pool = new Client({ connectionString: process.env.DATABASE_URL });
    await pool.connect();
    const { rows } = await pool.query(
      `SELECT "id" FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`,
      [createdId],
    );
    await pool.query(
      `DELETE FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`,
      [createdId],
    );
    await pool.query(
      `DELETE FROM "public"."rent_installments" WHERE "renterId" = $1::uuid`,
      [createdId],
    );
    await pool.query(
      `DELETE FROM "public"."rent_renter_phones" WHERE "renterId" = $1::uuid`,
      [createdId],
    );
    await pool.query(
      `DELETE FROM "public"."audit_logs" WHERE "entityId" = $1::uuid OR ("entityId" = ANY($2::uuid[]) AND entity = 'rent_payment')`,
      [createdId, rows.map((x) => x.id)],
    );
    await pool.query(
      `DELETE FROM "public"."rent_renters" WHERE "id" = $1::uuid`,
      [createdId],
    );
    await pool.end();
    console.log("\ncleaned up");
  }
  await browser.close();
}

console.log(
  results.every(Boolean)
    ? "\n=== RECEIPT VERIFIED ==="
    : "\n=== RECEIPT CHECKS FAILED ===",
);
