import { chromium } from "@playwright/test";
import { statSync } from "node:fs";
import { join, tmpdir } from "node:path";

const OUT = join(tmpdir(), "opencode");
const browser = await chromium.launch();
const page = await browser.newPage();

// Does print media work in this harness at all?
await page.setContent(`<!doctype html><html><head><style>
  @media print { body { background:#000; } }
  .x { color:#000; }
</style></head><body><div class="rent-receipt-print" style="display:none">VISIBLE-IN-PRINT</div></body></html>`);

await page.pdf({ path: `${OUT}/probe-print.pdf`, printBackground: true });
await page.pdf({ path: `${OUT}/probe-noprintmedia.pdf`, media: "screen", printBackground: true });
console.log("print-media pdf KB:", Math.round(statSync(`${OUT}/probe-print.pdf`).size / 1024));
console.log("screen-media pdf KB:", Math.round(statSync(`${OUT}/probe-noprintmedia.pdf`).size / 1024));

await page.emulateMedia({ media: "print" });
const a = await page.evaluate(() => getComputedStyle(document.querySelector(".rent-receipt-print")).display);
console.log("display after emulateMedia(print):", a);

await page.emulateMedia({ media: null });
const b = await page.evaluate(() => getComputedStyle(document.querySelector(".rent-receipt-print")).display);
console.log("display after emulateMedia(null):", b);

await browser.close();