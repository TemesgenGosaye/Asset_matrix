import "dotenv/config";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const OUT = join(tmpdir(), "opencode");
const stamp = randomBytes(3).toString("hex");
const nationalId = `9${stamp.replace(/[^0-9]/g, "0")}`.slice(0, 12).padEnd(12, "7");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
let createdId = "";

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#username", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
  const w = page.locator('[role="dialog"]').filter({ hasText: "Welcome to Asset Tracker" });
  if (await w.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
    const d = w.locator('button:has-text("Skip"), button:has-text("Close"), button:has-text("Later"), button:has-text("Get started"), button:has-text("Finish")');
    if (await d.count()) await d.first().click(); else await page.keyboard.press("Escape");
    await w.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  }

  const seed = await page.evaluate(async (nid) => {
    const post = async (p, b) => {
      const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const c = await post("/api/rent", {
      firstName: "Print", lastName: "Probe", gender: "female", nationalId: nid,
      phones: [{ phone: "0912345678", isPrimary: true }], rentType: "Grocery",
      monthlyPrice: "1250.00", startDate: "2026-01-31", termMonths: 12,
    });
    if (c.status !== 201) return { error: c };
    const id = c.body.renter.id;
    await post(`/api/rent/${id}/payments`, { monthNumber: 1, method: "Cash", paidOn: "2026-01-28" });
    return { id };
  }, nationalId);
  if (seed.error) throw new Error("seed " + JSON.stringify(seed.error));
  createdId = seed.id;

  await page.goto(`${BASE}/facility/pay-rent`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("main button:visible", { hasText: "Print Probe" }).first().click();
  const detail = page.getByRole("dialog", { name: /Print Probe/ });
  await detail.waitFor({ state: "visible", timeout: 30_000 });
  await detail.locator('button:has-text("Print statement")').click();
  const stmt = page.getByRole("dialog", { name: "Lease Statement" });
  await stmt.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);

  const doc = page.locator(".rent-receipt-print");
  console.log("attached:", await doc.count());
  console.log("visible (screen media):", await doc.isVisible());

  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(1000);
  const printInfo = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll(".rent-receipt-print"));
const el = all[0];
const parentInfo = el ? { parent: el.parentElement?.tagName, parentDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : null, inDialog: !!el.closest("[role=dialog]"), count: all.length } : null;
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const bodyKids = Array.from(document.body.children).map((n) => ({
      cls: n.className?.toString().slice(0, 40), display: getComputedStyle(n).display,
    }));
    const found = [];
for (const sheet of Array.from(document.styleSheets)) {
  let list; try { list = sheet.cssRules; } catch (e) { found.push({ href: sheet.href, blocked: true }); continue; }
  const walk = (rl, cond) => { for (const r of Array.from(rl)) {
    const sel = r.selectorText || r.cssText?.slice(0, 60) || "";
    if (sel.includes("rent-receipt-print")) found.push({ href: (sheet.href||"inline").split("/").pop(), cond: cond ?? "all", css: r.cssText.slice(0, 200) });
    if (r.cssRules) walk(r.cssRules, r.conditionText || cond);
  } };
  walk(list, null);
}
const rules = found;
for (const sheet of Array.from(document.styleSheets)) {
  let list; try { list = sheet.cssRules; } catch { continue; }
  const walk = (rl, cond) => { for (const r of Array.from(rl)) {
    if (r.cssRules) { walk(r.cssRules, r.conditionText || cond); continue; }
    if (!r.selectorText || !r.style?.display) continue;
    try { if (!el.matches(r.selectorText)) continue; } catch { continue; }
    rules.push({ sel: r.selectorText, cond: cond || "all", display: r.style.display, imp: r.style.getPropertyPriority("display") });
  } };
  walk(list, null);
}
return { found: true, display: cs.display, important: cs.getPropertyPriority("display"), matchesPrint: window.matchMedia("print").matches, parentInfo, sheetCount: document.styleSheets.length, rules };
  });
  console.log("print media:", JSON.stringify(printInfo, null, 1));
  const diag = await page.evaluate(() => {
  const el = document.querySelector(".rent-receipt-print");
  const hits = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list; try { list = sheet.cssRules; } catch { continue; }
    const walk = (rl, cond, media) => { for (const r of Array.from(rl)) {
      if (r.cssRules) { walk(r.cssRules, r.conditionText || cond, (r.media && r.media.mediaText) || media); continue; }
      if (!r.selectorText || !r.style) continue;
      const d = r.style.getPropertyValue("display");
      if (!d) continue;
      let m = false; try { m = el.matches(r.selectorText); } catch {}
      if (m) hits.push({ sel: r.selectorText, disp: d, imp: r.style.getPropertyPriority("display"), media: media || "", cond: cond || "" });
    }};
    walk(list, null, null);
  }
  el.style.setProperty("display", "block", "important");
  const c1 = getComputedStyle(el).display;
  el.style.removeProperty("display");
  const st = document.createElement("style");
  st.textContent = "@media print { .rent-receipt-print { display: block !important; } }";
  document.head.appendChild(st);
  const c2 = getComputedStyle(el).display;
  const after = { inlineImportant: c1, viaInjectedSheet: c2, cls: el.className, tag: el.tagName, rect: el.getBoundingClientRect().height, bodyFirst: Array.from(document.body.children).map(n=>n.tagName+"."+(n.className||"").toString().slice(0,30)).slice(0,6) };
  return { hits, after };
});
for (const h of diag.hits) console.log(`RULE media=[${h.media}] sel=${h.sel} display=${h.disp} imp=${h.imp}`); console.log("AFTER " + JSON.stringify(diag.after));
await page.pdf({ path: `${OUT}/print-probe.pdf`, format: "A4", printBackground: true });
await page.pdf({ path: `${OUT}/print-probe-noforce.pdf`, format: "A4", printBackground: true });
  console.log("print pdf KB:", Math.round(statSync(`${OUT}/print-probe.pdf`).size / 1024));
  await page.emulateMedia({ media: "screen" });
} catch (e) {
  console.log("FAIL", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  if (createdId) {
    const pool = new Client({ connectionString: process.env.DATABASE_URL });
    await pool.connect();
    const { rows } = await pool.query(`SELECT "id" FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."rent_payments" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."rent_installments" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."rent_renter_phones" WHERE "renterId" = $1::uuid`, [createdId]);
    await pool.query(`DELETE FROM "public"."audit_logs" WHERE "entityId" = $1::uuid OR ("entityId" = ANY($2::uuid[]) AND entity='rent_payment')`, [createdId, rows.map((r) => r.id)]);
    await pool.query(`DELETE FROM "public"."rent_renters" WHERE "id" = $1::uuid`, [createdId]);
    await pool.end();
    console.log("cleaned up");
  }
  await browser.close();
}