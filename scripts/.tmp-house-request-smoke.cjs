// @ts-check
/**
 * Smoke-drive the redesigned House Request page in the running dev server.
 */
const { chromium } = require("@playwright/test");
const path = require("node:path");

const BASE = "http://localhost:3000";
const OUT = "C:/Users/THEWAR~1/AppData/Local/Temp/opencode";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 240000 });
  await page.locator("#username").fill("e2e_probe_admin");
  await page.locator("#password").fill("SmokeTest!2026");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 });
  console.log("logged in →", page.url());

  // ── State 1: the empty page ─────────────────────────────────────────────
  await page.goto(`${BASE}/house-request`, { waitUntil: "networkidle", timeout: 240000 });
  await page.screenshot({ path: path.join(OUT, "hr-1-empty.png"), fullPage: true });
  console.log("rail:", (await page.locator('nav[aria-label="Progress"]').innerText()).replace(/\n+/g, " | "));
  console.log("current step:", (await page.locator('[aria-current="step"]').innerText()).replace(/\n+/g, " "));

  // ── The people search ───────────────────────────────────────────────────
  await page.getByLabel("Employee ID").fill("temesgen");
  try {
    await page.locator('[role="listbox"]').waitFor({ timeout: 30000 });
    const rows = page.locator('[role="option"]');
    console.log("suggestions:", await rows.count());
    console.log("first:", (await rows.first().innerText()).replace(/\n+/g, " · "));
    console.log("last:", (await rows.last().innerText()).replace(/\n+/g, " · "));
    await page.screenshot({ path: path.join(OUT, "hr-2-search.png") });
  } catch {
    console.log("NO SUGGESTIONS RENDERED");
    await page.screenshot({ path: path.join(OUT, "hr-2-search.png") });
  }

  // ── State 2: the resolved record ────────────────────────────────────────
  await page.locator('[role="option"]').first().click();
  await page.waitForSelector("#remarks", { timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "hr-3-resolved.png"), fullPage: true });

  const bar = page.getByRole("button", { name: /request a house/i });
  console.log("sticky bar visible:", await bar.isVisible());
  console.log("sticky bar:", (await bar.locator("xpath=../..").innerText()).replace(/\n+/g, " | "));
  console.log("submit disabled while empty:", await bar.isDisabled());
  console.log("rail now:", (await page.locator('nav[aria-label="Progress"]').innerText()).replace(/\n+/g, " | "));

  const advisory = page.locator("#house-request-reason > div").first();
  if (await advisory.count()) {
    console.log("advisory:", (await advisory.innerText()).replace(/\s+/g, " "));
  } else {
    console.log("advisory: (none — queue not readable or still loading)");
  }

  // ── Register facts ──────────────────────────────────────────────────────
  const facts = page.getByRole("button", { name: /insert register facts/i });
  if (await facts.count()) {
    await facts.click();
    console.log("reason after insert:\n---\n" + (await page.locator("#remarks").inputValue()) + "\n---");
    console.log("submit enabled after insert:", !(await bar.isDisabled()));
  }

  await page.screenshot({ path: path.join(OUT, "hr-4-filled.png"), fullPage: true });

  // ── Mobile ──────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "hr-5-mobile.png") });

  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });