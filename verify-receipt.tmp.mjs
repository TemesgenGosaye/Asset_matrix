import "dotenv/config";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, statSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const OUT = join(tmpdir(), "opencode");

const stamp = randomBytes(3).toString("hex");
const nationalId = `9${stamp.replace(/[^0-9]/g, "0")}`.slice(0, 12).padEnd(12, "7");

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
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? " -- " + extra : ""}`);
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#username", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });

  const welcome = page.locator('[role="dialog"]').filter({ hasText: "Welcome to Asset Tracker" });
  if (await welcome.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
    const d = welcome.locator('button:has-text("Skip"), button:has-text("Close"), button:has-text("Later"), button:has-text("Get started"), button:has-text("Finish")');
    if (await d.count()) await d.first().click();
    else await page.keyboard.press("Escape");
    await welcome.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  }

  const seed = await page.evaluate(async (nid) => {
    const post = async (p, b) => {
      const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const c = await post("/api/rent", {
      firstName: "Receipt", lastName: "Verification", gender: "male",
      nationalId: nid, phones: [{ phone: "0912345678", isPrimary: true }],
      rentType: "Shop", monthlyPrice: "1250.00", startDate: "2026-01-31", termMonths: 36,
    });
    if (c.status !== 201) return { error: c };
    const id = c.body.renter.id;
    for (const m of [1, 2, 3]) {
      await post(`/api/rent/${id}/payments`, { monthNumber: m, method: "BankTransfer", paidOn: `2026-0${m}-28`, referenceNumber: "FT-99887" });
    }
    return { id };
  }, nationalId);
  if (seed.error) throw new Error("seed failed " + JSON.stringify(seed.error));
  createdId = seed.id;
  console.log("seeded a 36-month lease with 3 paid months\n");

  await page.goto(`${BASE}/facility/pay-rent`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("main button:visible", { hasText: "Receipt Verification" }).first().click();
  const detail = page.getByRole("dialog", { name: /Receipt Verification/ });
  await detail.waitFor({ state: "visible", timeout: 30_000 });

  const readDoc = async () => {
    const doc = page.locator(".rent-receipt-print");
    await doc.waitFor({ state: "attached", timeout: 15_000 });
    const text = ((await doc.textContent()) ?? "").replace(/\s+/g, " ");
    const stamped = await doc.evaluate((el) => el.querySelectorAll('[data-print-overlay="true"]').length);
    const overlays = await doc.evaluate((el) => Array.from(el.querySelectorAll('[data-print-overlay="true"]')).map((n) => ({
      opacity: n.style.opacity,
      position: getComputedStyle(n).position,
      top: n.style.top,
    })));
    return { text, stamped, overlays };
  };

  // ---------------- STATEMENT ----------------
  await detail.locator('button:has-text("Print statement")').click();
  const stmt = page.getByRole("dialog", { name: "Lease Statement" });
  await stmt.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1200);

  const s = await readDoc();
  check("statement: MSF logo", (await page.locator(".rent-receipt-print img").count()) > 0);
  check("statement: MSF brand cell", /METAHARA SUGAR FACTORY/.test(s.text));
  check("statement: rent office signature block", /ለኪራ አስተዳደር/.test(s.text));
  check("statement: bilingual title", /የቤት\//.test(s.text));
  check("statement: amount in words", /birr only, being the total rent schedulable/.test(s.text));
  check("statement: never-re-issued footer", /RE-USED/i.test(s.text));
  check("statement: national id", new RegExp(nationalId).test(s.text));
  check("statement: reconciliation block", /Total paid/.test(s.text) && /Outstanding/.test(s.text));
  check("statement: stamp + name seal present", s.stamped === 2, JSON.stringify(s.overlays));

  await stmt.screenshot({ path: `${OUT}/receipt-statement.png` });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    stmt.locator('button:has-text("Download PDF")').click(),
  ]);
  const pdfPath = `${OUT}/statement-download.pdf`;
  await download.saveAs(pdfPath);
  const bytes = readFileSync(pdfPath);
  const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("statement PDF paginates beyond one page", pages > 1, `${pages} pages, ${Math.round(statSync(pdfPath).size / 1024)} KB`);

  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(900);
  check("print CSS reveals the document", await page.locator(".rent-receipt-print").isVisible());
  const shot = await page.locator(".rent-receipt-print").screenshot({ path: `${OUT}/statement-print-media.png` }).then(() => true).catch((e) => { console.log("  " + e.message.split("\n")[0]); return false; });
  check("print-media capture rendered", shot);
  await page.emulateMedia({ media: "screen" });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  // ---------------- SINGLE RECEIPT ----------------
  await detail.locator('tbody tr:has-text("RENT-") button').first().click();
  const rcpt = page.getByRole("dialog", { name: "Rent Receipt" });
  await rcpt.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1200);

  const r = await readDoc();
  check("receipt: RENT RECEIPT title", /RENT RECEIPT/.test(r.text));
  check("receipt: receipt number", /RENT-\d{4}-\d{6}/.test(r.text));
  check("receipt: amount in words", /In words:/.test(r.text));
  check("receipt: reference number", /FT-99887/.test(r.text));
  check("receipt: renter acknowledgement", /I, the undersigned/.test(r.text));
  check("receipt: method shown", /Bank Transfer|BankTransfer/.test(r.text));
  check("receipt: stamp + name seal present", r.stamped === 2);
  check("receipt: narrowed to the paid month only", /RENT-\d{4}-\d{6}/.test(r.text) && !/\b36\b\s*months?\s*settled.*39/.test(r.text));

  await rcpt.screenshot({ path: `${OUT}/receipt-single.png` });

  const [dl2] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    rcpt.locator('button:has-text("Download PDF")').click(),
  ]);
  const p2 = `${OUT}/receipt-download.pdf`;
  await dl2.saveAs(p2);
  const b2 = readFileSync(p2);
  const pg2 = (b2.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("single receipt PDF is one page", pg2 === 1, `${pg2} pages, ${Math.round(statSync(p2).size / 1024)} KB`);

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("run completed", false, e instanceof Error ? e.message : String(e));
} finally {
  if (createdId) {
    const pool = new Client({ connectionString: process.env.DATABASE_URL });
    await pool.connect();
    const { rows } = await pool.query(`SELECT "id" FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."rent_installments" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."rent_renter_phones" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."audit_logs" WHERE "entityId" = $1::uuid OR ("entityId" = ANY($2::uuid[]) AND entity = 'rent_payment')`, [createdId, rows.map((x) => x.id)]);
    await pool.query(`DELETE FROM "public"."rent_renters" WHERE "id" = $1::uuid`, [createdId]);
    await pool.end();
    console.log("\ncleaned up");
  }
  await browser.close();
}

console.log(results.every(Boolean) ? "\n=== RECEIPT VERIFIED ===" : "\n=== RECEIPT CHECKS FAILED ===");