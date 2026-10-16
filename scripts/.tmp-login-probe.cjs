// @ts-check
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("response", async (r) => {
    if (r.url().includes("/api/auth/sign-in")) {
      console.log(r.status(), await r.text().catch(() => "<no body>"));
    }
  });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 240000 });
  await page.locator("#username").fill("e2e_probe_admin");
  await page.locator("#password").fill("SmokeTest!2026");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(6000);
  console.log("url:", page.url());
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });