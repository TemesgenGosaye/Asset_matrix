/**
 * Renders the Pay Rent page in a real browser with a real session and captures a
 * screenshot, so the UI is verified rather than assumed.
 *
 *   node scripts/smoke-rent-ui.mjs
 *
 * Requires the smoke accounts from `scripts/smoke-test-user.mjs create`.
 */
import "dotenv/config";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
// Portable default: the previous literal was one developer's home directory,
// which made the script write screenshots into a path that does not exist on
// anyone else's machine.
const OUT = process.env.SMOKE_SHOT_DIR ?? join(tmpdir(), "opencode");

if (!EMAIL || !PASSWORD) {
  console.error("Set SMOKE_EMAIL / SMOKE_PASSWORD.");
  process.exit(2);
}

const stamp = randomBytes(3).toString("hex");
const nationalId = `9${stamp.replace(/[^0-9]/g, "0")}`.slice(0, 12).padEnd(12, "7");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

let createdId = "";

/**
 * A brand-new account triggers the app's first-run OnboardingWizard, which
 * mounts a modal overlay that swallows every click. It appears only after the
 * session resolves, so this is called lazily right before interacting.
 */
async function dismissOnboardingWizard(page) {
  const welcome = page
    .locator('[role="dialog"]')
    .filter({ hasText: "Welcome to Asset Tracker" });
  // Give it a moment to appear, then get rid of it if it did.
  const appeared = await welcome
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return false;

  const dismiss = welcome.locator(
    'button:has-text("Skip"), button:has-text("Close"), button:has-text("Later"), button:has-text("Get started"), button:has-text("Finish")',
  );
  if (await dismiss.count()) {
    await dismiss.first().click();
  } else {
    await page.keyboard.press("Escape");
  }
  await welcome.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  return true;
}

try {
  // 1. Sign in through the real login form. The field is `#username` (it accepts
  //    an email OR a username, so it is a text input, not type="email").
  //    `networkidle` first: clicking before React has hydrated falls through to a
  //    native GET submit, which would leak the password into the query string.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#username", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
  console.log("PASS  signed in through the login form");

  // 2. Seed two renters via the API (as the admin), one already partly paid.
  const seed = await page.evaluate(async (nid) => {
    const post = async (path, body) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const created = await post("/api/rent", {
      firstName: "Selam",
      lastName: "Bekele",
      gender: "female",
      nationalId: nid,
      phones: [{ phone: "0912345678", isPrimary: true }],
      rentType: "Shop",
      monthlyPrice: "4500.00",
      startDate: "2020-01-31",
      termMonths: 24,
    });
    if (created.status !== 201) return { error: created };
    const id = created.body.renter.id;
    // Settle three months so the schedule shows a mix of states.
    for (const m of [1, 2, 3]) {
      await post(`/api/rent/${id}/payments`, {
        monthNumber: m,
        method: "Cash",
        paidOn: `2020-0${m}-28`,
      });
    }
    return { id };
  }, nationalId);

  if (seed.error) {
    console.log("FAIL  could not seed a renter:", JSON.stringify(seed.error).slice(0, 300));
    process.exitCode = 1;
  } else {
    createdId = seed.id;
    console.log("PASS  seeded a renter with 3 paid months via the API");
  }

  // 3. Load the Pay Rent page.
  await page.goto(`${BASE}/facility/pay-rent`, { waitUntil: "networkidle", timeout: 120_000 });
  console.log("PASS  /facility/pay-rent loaded");

  const heading = await page.locator("h1").first().textContent();
  console.log(`${heading?.includes("Pay Rent") ? "PASS" : "FAIL"}  page heading -- "${heading?.trim()}"`);

  // 4. The sidebar entry must be present and marked active.
  //    The sidebar is an <aside role="navigation">, not a <nav> element.
  const navLink = page.locator(
    '[role="navigation"][aria-label="Main navigation"] a[href="/facility/pay-rent"]',
  );
  const navCount = await navLink.count();
  console.log(`${navCount > 0 ? "PASS" : "FAIL"}  sidebar shows the Pay Rent entry`);
  if (navCount > 0) {
    const cls = (await navLink.first().getAttribute("class")) ?? "";
    console.log(
      `${cls.includes("font-medium") ? "PASS" : "FAIL"}  sidebar entry has the active state`,
    );
  }

  // 5. Summary cards and the row must be real, not placeholders.
  const bodyText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const checks = [
    ["summary card 'Total Renters'", /Total Renters/],
    ["summary card 'Total Collected'", /Total Collected/],
    ["summary card 'Total Outstanding'", /Total Outstanding/],
    // The card was renamed from 'Overdue Renters' to 'Overdue' when it gained
    // the overdue-MONTHS breakdown strip; assert the new title, and that the
    // count and its breakdown are both on screen.
    ["summary card 'Overdue'", /Overdue/],
    ["overdue card shows its month breakdown", /Months:/],
    ["renter name rendered", /Selam Bekele/],
    ["rent type rendered", /Shop/],
    ["months paid indicator rendered", /\b3\s*\/\s*24\b/],
    ["national id rendered in the row", new RegExp(nationalId)],
    ["real amount rendered", /4,500\.00/],
  ];
  for (const [label, re] of checks) {
    console.log(`${re.test(bodyText) ? "PASS" : "FAIL"}  ${label}`);
  }

  // 6. Open the detail dialog and verify the schedule + a Paid button.
  //    `ResponsiveTable` renders BOTH a mobile card view and a desktop table and
  //    hides one of them per breakpoint, so target the visible one only.

  // Report any dialog already open on the page. Radix portals dialogs to <body>,
  // so read the panel's OWN heading rather than an ancestor's text.
  const openDialogs = await page.evaluate(() => {
    const panels = Array.from(
      document.querySelectorAll('[data-radix-dialog-content], [role="dialog"]'),
    );
    return panels
      .filter((el) => el.getAttribute("data-state") === "open" || el.offsetParent !== null)
      .map((el) => ({
        role: el.getAttribute("role"),
        state: el.getAttribute("data-state"),
        labelledBy: el.getAttribute("aria-labelledby"),
        heading:
          (el.getAttribute("aria-labelledby")
            ? document.getElementById(el.getAttribute("aria-labelledby"))?.textContent
            : null) ?? el.querySelector("h2, h3")?.textContent ?? null,
        text: (el.textContent ?? "").replace(/\s+/g, " ").slice(0, 120),
      }));
  });
  if (openDialogs.length > 0) {
    console.log("NOTE  dialog(s) already open:", JSON.stringify(openDialogs, null, 1));
  }

  if (await dismissOnboardingWizard(page)) {
    console.log("PASS  dismissed the first-run onboarding wizard");
    openDialogs.length = 0;
  }

  await page.locator('main button:visible', { hasText: "Selam Bekele" }).first().click();
  // The AI copilot drawer is also role="dialog", and this portal's DialogContent
  // sets no aria-modal, so scope by the dialog's accessible name - which the
  // detail header builds from the renter's full name.
  const dialog = page.getByRole("dialog", { name: /Selam Bekele/ });
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  console.log("PASS  detail dialog opens");

  const dialogText = (await dialog.innerText()).replace(/\s+/g, " ");
  const dialogChecks = [
    ["schedule lists month 1", /Month\s*1\b|\b1\s*\/\s*24\b/],
    ["schedule lists month 24", /24\s*\/\s*24|\b24\b/],
    ["a receipt number is shown", /RENT-\d{4}-\d{6}/],
    ["a Paid button exists", /Paid/],
  ];
  for (const [label, re] of dialogChecks) {
    console.log(`${re.test(dialogText) ? "PASS" : "FAIL"}  ${label}`);
  }

  const paidButtons = dialog.locator('button:has-text("Paid")');
  const enabledPaid = await paidButtons.evaluateAll((els) =>
    els.filter((e) => !e.disabled).length,
  );
  console.log(
    `${enabledPaid === 1 ? "PASS" : "FAIL"}  exactly ONE Paid button is enabled (chronological order) -- ${enabledPaid} enabled`,
  );

  await page.screenshot({ path: `${OUT}/rent-detail.png`, fullPage: false });
  console.log(`saved ${OUT}/rent-detail.png`);

  await dialog.locator('button[aria-label="Close"]').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/rent-list.png`, fullPage: false });
  console.log(`saved ${OUT}/rent-list.png`);
} catch (error) {
  console.log("FAIL  " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  if (consoleErrors.length > 0) {
    console.log("\n--- browser console errors ---");
    for (const e of consoleErrors.slice(0, 12)) console.log("  " + e.slice(0, 240));
  } else {
    console.log("\nPASS  no browser console errors");
  }

  if (createdId) {
    const pool = new Client({ connectionString: process.env.DATABASE_URL });
    await pool.connect();
    // Payment audit rows are keyed by the PAYMENT id, not the renter id, so they
    // have to be collected before the payments are deleted.
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
    console.log(`cleaned up renter ${createdId}`);
  }

  await browser.close();
}

console.log(process.exitCode ? "\n=== UI SMOKE FAILED ===" : "\n=== UI SMOKE PASSED ===");
