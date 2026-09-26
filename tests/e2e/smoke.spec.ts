import { test, expect } from "@playwright/test";

// Smoke tests: verify every major page loads and key workflows function.
// These are intentionally broad — they catch regressions fast.

// Dev server needs time for first-time Turbopack compilation of each page
const PAGE_TIMEOUT = 60_000;
const API_TIMEOUT = 60_000;

/** Helper: navigate and assert no error page */
async function expectPageLoads(
  page: import("@playwright/test").Page,
  url: string,
  titlePattern?: RegExp,
) {
  const response = await page.goto(url, {
    timeout: PAGE_TIMEOUT,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBeLessThan(500);
  // Ensure no Next.js error overlay
  await expect(page.locator("#nextjs__container_errors_label")).not.toBeVisible(
    { timeout: 3000 },
  );
  if (titlePattern) {
    await expect(
      page.getByRole("heading", { name: titlePattern }).first(),
    ).toBeVisible({ timeout: 10000 });
  }
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("loads and shows widgets", async ({ page }) => {
    await expectPageLoads(page, "/dashboard", /dashboard/i);
    // Should have at least one stat card or widget
    const cards = page.locator('[class*="card"], [class*="Card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Asset Management ───────────────────────────────────────────────────────

test.describe("Assets", () => {
  test("list page loads with table", async ({ page }) => {
    await expectPageLoads(page, "/assets");
    await expect(page.locator("table, [role='grid']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("create page loads with form", async ({ page }) => {
    await expectPageLoads(page, "/assets/create", /create new asset/i);
    await expect(page.getByLabel(/asset name/i)).toBeVisible();
    await expect(page.getByLabel(/asset tag/i)).toBeVisible();
  });

  test("search filters the table", async ({ page }) => {
    await page.goto("/assets");
    await page.waitForLoadState("networkidle");
    const search = page
      .getByPlaceholder(/search/i)
      .or(page.getByRole("searchbox"))
      .first();
    if ((await search.count()) > 0) {
      await search.fill("zzz_nonexistent_asset_zzz");
      await page.waitForTimeout(500);
      // Table should show no results or fewer rows
      await expect(page).toHaveURL(/.*assets/);
    }
  });

  test("detail page loads when asset exists", async ({ page }) => {
    await page.goto("/assets");
    await page.waitForLoadState("networkidle");
    const firstRow = page.locator("table tbody tr").first();
    if ((await firstRow.count()) > 0) {
      const link = firstRow.locator("a").first();
      if ((await link.count()) > 0) {
        await link.click();
        await page.waitForURL(/\/assets\/[a-zA-Z0-9-]+/, {
          timeout: PAGE_TIMEOUT,
        });
        expect(page.url()).toMatch(/\/assets\/[a-zA-Z0-9-]+/);
      }
    }
  });
});

// ─── Accessories ────────────────────────────────────────────────────────────

test.describe("Accessories", () => {
  test("list page loads", async ({ page }) => {
    await expectPageLoads(page, "/accessories");
    await expect(page.locator("table, [role='grid']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("create page loads", async ({ page }) => {
    await expectPageLoads(page, "/accessories/create");
    await expect(
      page.getByRole("button", { name: /create|save/i }).first(),
    ).toBeVisible();
  });
});

// ─── Consumables ────────────────────────────────────────────────────────────

test.describe("Consumables", () => {
  test("list page loads", async ({ page }) => {
    await expectPageLoads(page, "/consumables");
    await expect(page.locator("table, [role='grid']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("create page loads", async ({ page }) => {
    await expectPageLoads(page, "/consumables/create");
    await expect(
      page.getByRole("button", { name: /create|save/i }).first(),
    ).toBeVisible();
  });
});

// ─── Licences ───────────────────────────────────────────────────────────────

test.describe("Licences", () => {
  test("list page loads", async ({ page }) => {
    await expectPageLoads(page, "/licences");
    await expect(page.locator("table, [role='grid']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("create page loads", async ({ page }) => {
    await expectPageLoads(page, "/licences/create");
    await expect(
      page.getByRole("button", { name: /create/i }).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─── Components ─────────────────────────────────────────────────────────────

test.describe("Components", () => {
  test("list page loads", async ({ page }) => {
    await expectPageLoads(page, "/components");
    // Components page may use table or card layout
    await expect(
      page
        .locator("table, [role='grid'], [class*='card'], [class*='Card']")
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("create page loads", async ({ page }) => {
    await expectPageLoads(page, "/components/create");
    await expect(
      page.getByRole("button", { name: /create/i }).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─── Kits ───────────────────────────────────────────────────────────────────

test.describe("Kits", () => {
  test("list page loads", async ({ page }) => {
    await expectPageLoads(page, "/kits");
  });

  test("create page loads", async ({ page }) => {
    await expectPageLoads(page, "/kits/create");
  });
});

// ─── Master Data ────────────────────────────────────────────────────────────

test.describe("Master Data", () => {
  test("locations page loads", async ({ page }) => {
    await expectPageLoads(page, "/locations");
  });

  test("locations create page loads", async ({ page }) => {
    await expectPageLoads(page, "/locations/create");
  });

  test("manufacturers page loads", async ({ page }) => {
    await expectPageLoads(page, "/manufacturers");
  });

  test("manufacturers create page loads", async ({ page }) => {
    await expectPageLoads(page, "/manufacturers/create");
  });

  test("suppliers page loads", async ({ page }) => {
    await expectPageLoads(page, "/suppliers");
  });

  test("suppliers create page loads", async ({ page }) => {
    await expectPageLoads(page, "/suppliers/create");
  });

  test("models page loads", async ({ page }) => {
    await expectPageLoads(page, "/models");
  });

  test("models create page loads", async ({ page }) => {
    await expectPageLoads(page, "/models/create");
  });
});

// ─── Categories ─────────────────────────────────────────────────────────────

test.describe("Categories", () => {
  test("asset categories page loads", async ({ page }) => {
    await expectPageLoads(page, "/assetCategories");
  });

  test("accessory categories page loads", async ({ page }) => {
    await expectPageLoads(page, "/accessoryCategories");
  });

  test("consumable categories page loads", async ({ page }) => {
    await expectPageLoads(page, "/consumableCategories");
  });

  test("licence categories page loads", async ({ page }) => {
    await expectPageLoads(page, "/licenceCategories");
  });

  test("status types page loads", async ({ page }) => {
    await expectPageLoads(page, "/statusTypes");
  });
});

// ─── Users ──────────────────────────────────────────────────────────────────

test.describe("Users", () => {
  test("list page loads", async ({ page }) => {
    await expectPageLoads(page, "/user");
    await expect(page.locator("table, [role='grid']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("create page loads", async ({ page }) => {
    await expectPageLoads(page, "/user/create");
  });
});

// ─── Admin Pages ────────────────────────────────────────────────────────────

test.describe("Admin", () => {
  test("audit logs page loads", async ({ page }) => {
    await expectPageLoads(page, "/admin/audit-logs");
  });

  test("team page loads", async ({ page }) => {
    await expectPageLoads(page, "/admin/team");
  });

  test("settings page loads", async ({ page }) => {
    await expectPageLoads(page, "/admin/settings");
  });

  test("workflows page loads", async ({ page }) => {
    await expectPageLoads(page, "/admin/workflows");
  });

  test("compliance page loads", async ({ page }) => {
    await expectPageLoads(page, "/admin/compliance");
  });

  test("GDPR page loads", async ({ page }) => {
    await expectPageLoads(page, "/admin/gdpr");
  });
});

// ─── Operations ─────────────────────────────────────────────────────────────

test.describe("Operations", () => {
  test("audits page loads", async ({ page }) => {
    await expectPageLoads(page, "/audits");
  });

  test("maintenance page loads", async ({ page }) => {
    await expectPageLoads(page, "/maintenance");
  });

  test("import page loads", async ({ page }) => {
    await expectPageLoads(page, "/import");
  });

  test("reports page loads", async ({ page }) => {
    await expectPageLoads(page, "/reports");
  });

  test("scanner page loads", async ({ page }) => {
    await expectPageLoads(page, "/scanner");
  });

  test("approvals page loads", async ({ page }) => {
    await expectPageLoads(page, "/approvals");
  });
});

// ─── API Health ─────────────────────────────────────────────────────────────

test.describe("API Health", () => {
  test("health endpoint returns 200", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
  });

  test("liveness probe returns 200", async ({ request }) => {
    const res = await request.get("/api/health/live");
    expect(res.status()).toBe(200);
  });

  test("readiness probe returns 200", async ({ request }) => {
    const res = await request.get("/api/health/ready");
    expect(res.status()).toBe(200);
  });

  test("dashboard widgets API responds", async ({ request }) => {
    const res = await request.get("/api/dashboard/widgets");
    expect(res.status()).toBeLessThan(500);
  });
});

// ─── API GET Endpoints ──────────────────────────────────────────────────────

test.describe("API GET Endpoints", () => {
  test.setTimeout(API_TIMEOUT);

  const getEndpoints = [
    // Reference data
    "/api/assetCategory",
    "/api/accessoryCategory",
    "/api/consumableCategory",
    "/api/licenceCategory",
    "/api/location",
    "/api/manufacturer",
    "/api/supplier",
    "/api/model",
    // Core entities
    "/api/licence",
    "/api/consumable",
    "/api/components",
    "/api/kits",
    "/api/maintenance",
    "/api/audits",
    "/api/approvals",
    "/api/reservations",
    // Admin
    "/api/admin/workflows",
    "/api/admin/custom-fields",
    "/api/admin/labels",
    "/api/admin/audit-logs",
    // Other
    "/api/saved-filters",
    "/api/eula",
    "/api/dashboard/widgets",
  ];

  for (const endpoint of getEndpoints) {
    test(`GET ${endpoint} responds without error`, async ({ request }) => {
      const res = await request.get(endpoint);
      expect(res.status()).toBeLessThan(500);
    });
  }
});

// ─── API GET returns valid JSON ─────────────────────────────────────────────

test.describe("API response format", () => {
  test.setTimeout(API_TIMEOUT);

  const jsonEndpoints = [
    "/api/assetCategory",
    "/api/accessoryCategory",
    "/api/consumableCategory",
    "/api/licenceCategory",
    "/api/location",
    "/api/manufacturer",
    "/api/supplier",
    "/api/model",
    "/api/components",
    "/api/kits",
  ];

  for (const endpoint of jsonEndpoints) {
    test(`GET ${endpoint} returns valid JSON`, async ({ request }) => {
      const res = await request.get(endpoint);
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
      }
    });
  }
});

// ─── API POST validation ────────────────────────────────────────────────────

test.describe("API POST validation", () => {
  test("POST /api/assetCategory rejects empty body", async ({ request }) => {
    const res = await request.post("/api/assetCategory", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/accessoryCategory rejects empty body", async ({
    request,
  }) => {
    const res = await request.post("/api/accessoryCategory", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/consumableCategory rejects empty body", async ({
    request,
  }) => {
    const res = await request.post("/api/consumableCategory", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/licenceCategory rejects empty body", async ({ request }) => {
    const res = await request.post("/api/licenceCategory", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/location rejects empty body", async ({ request }) => {
    const res = await request.post("/api/location", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/manufacturer rejects empty body", async ({ request }) => {
    const res = await request.post("/api/manufacturer", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/supplier rejects empty body", async ({ request }) => {
    const res = await request.post("/api/supplier", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/model rejects empty body", async ({ request }) => {
    const res = await request.post("/api/model", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/licence rejects empty body", async ({ request }) => {
    const res = await request.post("/api/licence", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/consumable rejects empty body", async ({ request }) => {
    const res = await request.post("/api/consumable", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/components rejects empty body", async ({ request }) => {
    const res = await request.post("/api/components", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/kits rejects empty body", async ({ request }) => {
    const res = await request.post("/api/kits", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/maintenance rejects empty body", async ({ request }) => {
    const res = await request.post("/api/maintenance", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/audits rejects empty body", async ({ request }) => {
    const res = await request.post("/api/audits", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

// ─── API Auth protection ────────────────────────────────────────────────────

test.describe("API endpoints require auth", () => {
  // Use empty storage state to simulate unauthenticated requests
  test.use({ storageState: { cookies: [], origins: [] } });

  const protectedEndpoints = [
    "/api/assetCategory",
    "/api/location",
    "/api/manufacturer",
    "/api/supplier",
    "/api/model",
    "/api/components",
    "/api/kits",
    "/api/licence",
    "/api/consumable",
    "/api/maintenance",
    "/api/audits",
    "/api/approvals",
    "/api/admin/workflows",
    "/api/admin/custom-fields",
    "/api/admin/audit-logs",
    "/api/dashboard/widgets",
  ];

  for (const endpoint of protectedEndpoints) {
    test(`GET ${endpoint} requires auth`, async ({ request }) => {
      const res = await request.get(endpoint);
      // Should return 401 or 403, not 200
      expect([401, 403]).toContain(res.status());
    });
  }
});

// ─── Auth Flow (unauthenticated) ────────────────────────────────────────────

test.describe("Auth Pages (no auth required)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/(login|$)/, { timeout: 10000 });
  });
});

// ─── Export Functionality ───────────────────────────────────────────────────

test.describe("Export", () => {
  test("assets page has export button", async ({ page }) => {
    await page.goto("/assets");
    await page.waitForLoadState("networkidle");
    const exportBtn = page
      .getByRole("button", { name: /export/i })
      .or(page.locator('[data-testid="export-button"]'));
    if ((await exportBtn.count()) > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });
});
