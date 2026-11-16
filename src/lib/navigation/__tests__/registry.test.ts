import { describe, it, expect } from "vitest";
import {
  NAV_REGISTRY,
  PRIMARY_NAV_KEYS,
  applyHiddenKeys,
  findNavItem,
  flattenSectionItems,
  getAllNavKeys,
  getAccessibleSections,
  getLockedNavKeys,
  getRegistryDefaultHiddenKeys,
  isActivePath,
  resolveHiddenKeys,
  resolveNavSections,
  resolvePrimaryItems,
} from "../registry";

describe("NAV_REGISTRY integrity", () => {
  it("gives every item a globally-unique key", () => {
    const keys = getAllNavKeys();
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("gives every item a non-empty label, href and icon", () => {
    for (const item of flattenSectionItems(NAV_REGISTRY)) {
      expect(item.key).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.icon).toBeTruthy();
    }
  });

  it("looks every key up via findNavItem", () => {
    for (const key of getAllNavKeys()) {
      expect(findNavItem(key)?.key).toBe(key);
    }
  });

  it("locks Dashboard so a user can never lock themselves out", () => {
    const locked = getLockedNavKeys();
    expect(locked.has("overview.dashboard")).toBe(true);
  });

  it("never lists a locked key as a registry default hidden", () => {
    const defaultHidden = getRegistryDefaultHiddenKeys();
    for (const locked of getLockedNavKeys()) {
      expect(defaultHidden.has(locked)).toBe(false);
    }
  });

  it("ships the configured default views on and everything else off", () => {
    const hidden = getRegistryDefaultHiddenKeys();

    // Overview: only Dashboard, Users, Employees and Assets start on.
    for (const key of [
      "overview.dashboard",
      "overview.users",
      "overview.employees",
      "overview.assets",
    ]) {
      expect(hidden.has(key)).toBe(false);
    }
    expect(hidden.has("overview.general-asset")).toBe(true);
    expect(hidden.has("overview.accessories")).toBe(true);

    // House Admin: every item starts on.
    for (const key of [
      "house.hams-dashboard",
      "house.register",
      "house.queue",
      "house.request",
      "house.allocated",
      "house.terminated",
      "house.inspections",
      "house.pay-rent",
      "house.queue-config",
      "overview.notifications",
    ]) {
      expect(hidden.has(key)).toBe(false);
    }

    // Overview also ships Advanced Search on.
    expect(hidden.has("tools.search")).toBe(false);

    // Tools: only QR Scanner, Import, Duplicates and Help start on.
    for (const key of [
      "tools.scanner",
      "tools.import",
      "tools.duplicates",
      "tools.help",
    ]) {
      expect(hidden.has(key)).toBe(false);
    }
    for (const key of [
      "tools.tickets",
      "tools.maintenance",
      "tools.kits",
      "tools.audits",
      "tools.reservations",
      "tools.approvals",
      "tools.procurement",
    ]) {
      expect(hidden.has(key)).toBe(true);
    }

    // Administration: every item starts on.
    for (const key of [
      "administration.reports",
      "administration.tco",
      "administration.workflows",
      "administration.audit-logs",
      "administration.gdpr",
      "administration.compliance",
      "administration.team",
      "administration.settings",
    ]) {
      expect(hidden.has(key)).toBe(false);
    }

    // Inventory and Categories stay off.
    expect(hidden.has("inventory.consumables")).toBe(true);
    expect(hidden.has("categories.asset")).toBe(true);
  });

  it("references only known keys from the primary (mobile) bar", () => {
    const known = new Set(getAllNavKeys());
    for (const key of PRIMARY_NAV_KEYS) {
      expect(known.has(key)).toBe(true);
    }
  });
});

describe("isActivePath", () => {
  it("matches by prefix for a non-exact item", () => {
    expect(isActivePath("/assets/123", "/assets")).toBe(true);
    expect(isActivePath("/assets", "/assets")).toBe(true);
  });

  it("does not match a sibling route that merely shares a prefix", () => {
    expect(isActivePath("/assets-report", "/assets")).toBe(false);
  });

  it("matches exactly when the item is marked exact", () => {
    expect(isActivePath("/dashboard", "/dashboard", true)).toBe(true);
    expect(isActivePath("/dashboard/house-allocation", "/dashboard", true)).toBe(
      false,
    );
  });
});

describe("getAccessibleSections (RBAC gate)", () => {
  it("hides adminOnly items from non-admins", () => {
    const sections = getAccessibleSections(false, new Set());
    const keys = flattenSectionItems(sections).map((i) => i.key);
    expect(keys).not.toContain("overview.users");
    expect(keys).not.toContain("overview.employees");
    expect(keys).toContain("overview.dashboard");
  });

  it("shows adminOnly items to admins", () => {
    const keys = flattenSectionItems(getAccessibleSections(true, null)).map(
      (i) => i.key,
    );
    expect(keys).toContain("overview.users");
    expect(keys).toContain("administration.settings");
  });

  it("fails closed while permissions are still resolving", () => {
    // `undefined` means "session not resolved yet" — a permission-gated item
    // must not leak through just because the set is missing.
    const keys = flattenSectionItems(
      getAccessibleSections(false, undefined),
    ).map((i) => i.key);
    expect(keys).not.toContain("house.pay-rent");
  });

  it("grants permission-gated items only when the permission is held", () => {
    const without = flattenSectionItems(
      getAccessibleSections(false, new Set()),
    ).map((i) => i.key);
    expect(without).not.toContain("house.pay-rent");

    const withPerm = flattenSectionItems(
      getAccessibleSections(false, new Set(["rent:view"])),
    ).map((i) => i.key);
    expect(withPerm).toContain("house.pay-rent");
  });

  it("drops sections that end up with no accessible items", () => {
    const sections = getAccessibleSections(false, new Set());
    // Every item in the Categories section is adminOnly, so a non-admin gets a
    // tree without that section rather than an empty group header.
    expect(sections.map((s) => s.key)).not.toContain("categories");
    for (const section of sections) {
      expect(section.items.length).toBeGreaterThan(0);
    }
    expect(sections.length).toBeGreaterThan(0);
  });
});

describe("resolveHiddenKeys (precedence)", () => {
  it("prefers the user preference over the org default", () => {
    const resolved = resolveHiddenKeys({
      userHidden: ["overview.assets"],
      orgHidden: ["overview.accessories"],
    });
    expect(resolved.has("overview.assets")).toBe(true);
    expect(resolved.has("overview.accessories")).toBe(false);
  });

  it("falls back to the org default when the user has never saved", () => {
    const resolved = resolveHiddenKeys({
      userHidden: null,
      orgHidden: ["overview.assets"],
    });
    expect(resolved.has("overview.assets")).toBe(true);
  });

  it("honours an explicit empty user list over the org default", () => {
    // An empty array is a deliberate "I want everything" choice, not absent.
    const resolved = resolveHiddenKeys({ userHidden: [], orgHidden: ["overview.assets"] });
    expect(resolved.size).toBe(0);
  });

  it("falls back to the registry default when neither source exists", () => {
    const resolved = resolveHiddenKeys({ userHidden: null, orgHidden: null });
    expect(resolved).toEqual(new Set(getRegistryDefaultHiddenKeys()));
  });

  it("strips locked keys whatever the caller stored", () => {
    const resolved = resolveHiddenKeys({
      userHidden: ["overview.dashboard", "overview.assets"],
    });
    expect(resolved.has("overview.dashboard")).toBe(false);
    expect(resolved.has("overview.assets")).toBe(true);
  });
});

describe("applyHiddenKeys (preference gate)", () => {
  it("removes a hidden item", () => {
    const sections = applyHiddenKeys(NAV_REGISTRY, new Set(["overview.assets"]));
    const keys = flattenSectionItems(sections).map((i) => i.key);
    expect(keys).not.toContain("overview.assets");
  });

  it("never removes a locked item even if it is in the hidden set", () => {
    const sections = applyHiddenKeys(
      NAV_REGISTRY,
      new Set(["overview.dashboard"]),
    );
    const keys = flattenSectionItems(sections).map((i) => i.key);
    expect(keys).toContain("overview.dashboard");
  });

  it("drops a parent whose every child is hidden", () => {
    const withChildren = applyHiddenKeys(
      [
        {
          key: "test",
          title: "Test",
          items: [
            {
              key: "test.parent",
              label: "Parent",
              href: "/parent",
              icon: NAV_REGISTRY[0].items[0].icon,
              children: [
                {
                  key: "test.child-a",
                  label: "Child A",
                  href: "/a",
                  icon: NAV_REGISTRY[0].items[0].icon,
                },
                {
                  key: "test.child-b",
                  label: "Child B",
                  href: "/b",
                  icon: NAV_REGISTRY[0].items[0].icon,
                },
              ],
            },
          ],
        },
      ],
      new Set(["test.child-a", "test.child-b"]),
    );
    expect(withChildren).toHaveLength(0);
  });

  it("drops sections that end up empty", () => {
    const icon = NAV_REGISTRY[0].items[0].icon;
    const synthetic = [
      {
        key: "custom",
        title: "Custom",
        items: [
          { key: "custom.one", label: "One", href: "/one", icon },
          { key: "custom.two", label: "Two", href: "/two", icon },
        ],
      },
    ];
    const pruned = applyHiddenKeys(
      synthetic,
      new Set(["custom.one", "custom.two"]),
    );
    expect(pruned).toHaveLength(0);
  });
});

describe("resolveNavSections (full pipeline)", () => {
  it("applies RBAC before the preference layer", () => {
    const sections = resolveNavSections({
      isAdmin: false,
      permissions: new Set(),
      hiddenKeys: new Set(["overview.assets"]),
    });
    const keys = flattenSectionItems(sections).map((i) => i.key);
    expect(keys).not.toContain("overview.assets");
    expect(keys).not.toContain("overview.users");
    expect(keys).toContain("overview.dashboard");
  });

  it("can never reveal an item the role cannot access", () => {
    const sections = resolveNavSections({
      isAdmin: false,
      permissions: new Set(),
      hiddenKeys: new Set(),
    });
    const keys = flattenSectionItems(sections).map((i) => i.key);
    expect(keys).not.toContain("administration.settings");
    expect(keys).not.toContain("house.queue-config");
  });

  it("survives a user who has hidden every optional menu", () => {
    const hidden = new Set(
      getAllNavKeys().filter((k) => !getLockedNavKeys().has(k)),
    );
    const sections = resolveNavSections({
      isAdmin: true,
      permissions: null,
      hiddenKeys: hidden,
    });
    const keys = flattenSectionItems(sections).map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining(["overview.dashboard"]),
    );
    expect(sections.length).toBeGreaterThan(0);
  });
});

describe("resolvePrimaryItems", () => {
  it("returns only the primary items still visible", () => {
    const sections = resolveNavSections({
      isAdmin: true,
      permissions: null,
      hiddenKeys: new Set(["house.queue"]),
    });
    const keys = resolvePrimaryItems(sections).map((i) => i.key);
    expect(keys).not.toContain("house.queue");
    expect(keys).toContain("house.request");
  });

  it("leads the mobile bar with the Housing shortcuts", () => {
    const sections = resolveNavSections({
      isAdmin: false,
      permissions: new Set(),
      hiddenKeys: new Set(),
    });
    const keys = resolvePrimaryItems(sections).map((i) => i.key);
    expect(keys).toEqual([
      "house.request",
      "house.queue",
      "house.allocated",
      "house.terminated",
    ]);
  });
});
