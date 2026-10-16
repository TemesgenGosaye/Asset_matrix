/**
 * Theme switcher smoke test.
 *
 * Verifies the parts unit tests cannot: that the picker actually applies a
 * theme class to <html>, that the choice survives a reload, that a `dark:`
 * utility is live on every dark theme, and that the server accepts the new
 * theme ids and rejects a bogus one.
 *
 *   node scripts/smoke-themes.mjs
 *
 * Env: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD
 */

import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL ?? "pay-rent-smoke@example.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokeTest-2026!";

/**
 * Every theme the picker offers.
 *
 * `class` is the SINGLE theme class `<html>` must end up with. For `system` that
 * is `light` when the OS reports light, because next-themes writes the resolved
 * theme onto the element — which is why "System" and "Light" share it and why
 * the exclusivity assertion below still holds.
 */
const THEMES = [
  { label: "System", id: "system", class: "light", bg: "rgb(255, 255, 255)" },
  { label: "Light", id: "light", class: "light", bg: "rgb(255, 255, 255)" },
  { label: "Paper", id: "paper", class: "paper", bg: null },
  { label: "Dark", id: "dark", class: "dark", bg: null },
  { label: "OLED", id: "oled", class: "oled", bg: "rgb(0, 0, 0)" },
  { label: "Midnight", id: "midnight", class: "midnight", bg: null },
  { label: "Forest", id: "forest", class: "forest", bg: null },
  {
    label: "High Contrast",
    id: "contrast",
    class: "contrast",
    bg: "rgb(0, 0, 0)",
  },
];

/** Dark theme classes that must be cleared when leaving a dark theme. */
const DARK_CLASSES = ["dark", "oled", "midnight", "forest", "contrast"];

let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};
const check = (cond, m) => (cond ? ok(m) : bad(m));

const htmlClasses = (page) =>
  page.evaluate(() => Array.from(document.documentElement.classList));

const storedTheme = (page) =>
  page.evaluate(() => window.localStorage.getItem("msf-theme"));

console.log(`\n=== Theme smoke test against ${BASE} ===\n`);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(m.text());
});

// ---------------------------------------------------------------- sign in
// The sign-in form is client-driven and its fallback is a GET that silently
// lands on /login with the password in the query string. Seeding the session
// cookie via the API is what the other smoke tests do, and it cannot produce
// that misleading "signed in" state.
const signIn = await context.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASSWORD },
});
check(signIn.ok(), `signed in as ${EMAIL} (${signIn.status()})`);

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
console.log(`Landed on ${new URL(page.url()).pathname}\n`);

/**
 * The first-visit onboarding dialog opens over the app and traps pointer events,
 * so it has to be dismissed before the navbar is reachable. Not theme-specific,
 * but the picker cannot be clicked through it.
 */
const welcome = page.locator('[role="dialog"][data-state="open"]').first();
if (await welcome.count()) {
  const close = welcome.locator("button").last();
  await close.click({ timeout: 15_000 }).catch(async () => {
    await page.keyboard.press("Escape");
  });
  await page.waitForTimeout(700);
  check(
    (await page.locator('[role="dialog"][data-state="open"]').count()) === 0,
    "dismissed the onboarding dialog blocking the navbar",
  );
}

// ---------------------------------------------------------- picker exists
const trigger = page.locator('button[aria-label^="Appearance:"]');
check(
  (await trigger.count()) === 1,
  "navbar exposes a single appearance trigger",
);

// ------------------------------------------------------- apply each theme
for (const { label, id, class: wantClass, bg } of THEMES) {
  await trigger.click();
  const item = page.locator(`[role="menuitemradio"][data-theme-id="${id}"]`);
  const found = (await item.count()) === 1;
  if (!found) {
    bad(`"${label}" is not offered in the menu`);
    await page.keyboard.press("Escape");
    continue;
  }
  await item.click();
  await page.waitForTimeout(350);

  const classes = await htmlClasses(page);
  const stored = await storedTheme(page);

  // Regression guard: next-themes only clears the names it knows about, so
  // without an explicit `themes` list the classes pile up and the LAST token
  // block in the stylesheet wins no matter which row was clicked. Assert
  // exclusivity, not just presence.
  const themeClasses = classes.filter((c) =>
    [...DARK_CLASSES, "light", "paper"].includes(c),
  );
  check(
    themeClasses.length === 1 && themeClasses[0] === wantClass,
    `${label}: <html> has exactly the one theme class "${wantClass}" (${JSON.stringify(themeClasses)})`,
  );
  check(stored === id, `${label}: localStorage msf-theme = ${stored}`);

  // The decisive check: what the user actually SEES. Class presence alone was
  // what let the stacking bug pass.
  const bodyBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  if (bg) {
    check(bodyBg === bg, `${label}: body background is ${bodyBg} (want ${bg})`);
  }
  check(
    bodyBg !== "rgba(0, 0, 0, 0)",
    `${label}: body background actually painted (${bodyBg})`,
  );

  // The real point of the custom variant: a dark: utility must be live here.
  if (wantClass && DARK_CLASSES.includes(wantClass)) {
    const probe = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "probe hidden dark:block";
      document.body.appendChild(el);
      const shown = getComputedStyle(el).display !== "none";
      el.remove();
      return shown;
    });
    check(probe, `${label}: "dark:block" utility is active`);
  }

  // Accessibility: the chosen row must be the checked one.
  await trigger.click();
  const checkedId = await page.evaluate(() => {
    const el = document.querySelector(
      '[role="menuitemradio"][data-state="checked"]',
    );
    return el?.getAttribute("data-theme-id") ?? null;
  });
  check(checkedId === id, `${label}: checked row is "${checkedId}"`);
  await page.keyboard.press("Escape");
}

// --------------------------------------------------------- reload persists
await trigger.click();
await page.locator('[role="menuitemradio"][data-theme-id="forest"]').click();
await page.waitForTimeout(600);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
check(
  (await htmlClasses(page)).includes("forest"),
  "Forest survives a full page reload",
);
check(
  (await page.locator('button[aria-label^="Appearance:"]').innerText()).includes(
    "Forest",
  ),
  "trigger still reads 'Forest' after reload",
);

// ---------------------------------------------------------- server agrees
const prefs = await page.evaluate(async () => {
  const res = await fetch("/api/user/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: "oled" }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
});
check(prefs.status === 200, `PUT theme=oled -> ${prefs.status}`);
check(prefs.body?.theme === "oled", `server stored theme=${prefs.body?.theme}`);

const bogus = await page.evaluate(async () => {
  const res = await fetch("/api/user/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: "neon" }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
});
check(bogus.status === 422, `PUT theme=neon rejected -> ${bogus.status}`);

// ------------------------------------------------------------- no console noise
const noisy = pageErrors.filter(
  (e) => !/favicon|Failed to load resource|404/i.test(e),
);
check(noisy.length === 0, `no console/page errors${noisy.length ? `: ${noisy[0]}` : ""}`);

await browser.close();

console.log(
  failures === 0
    ? "\nAll theme smoke checks passed.\n"
    : `\n${failures} theme smoke check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
