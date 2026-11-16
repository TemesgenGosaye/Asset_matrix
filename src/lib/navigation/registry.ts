/**
 * The single source of truth for application navigation.
 *
 * WHY THIS EXISTS
 *   Navigation used to be an implicit contract: `lib/nav-config.ts` held the
 *   list, `Sidebar.tsx` rendered it, `MobileNav.tsx` rendered its own copy with
 *   extra hardcoded entries, and nothing tied a link to an identity. That made
 *   it impossible to let a user hide a menu item ("preferences") without
 *   inventing a key for it, and impossible to prove the sidebar and the mobile
 *   sheet agreed.
 *
 *   Every item here therefore carries a STABLE `key` — e.g. "overview.dashboard".
 *   The key, not the href or the label, is what user preferences persist. That
 *   means a renamed label, a moved route or a translated string never orphans a
 *   saved preference.
 *
 * WHAT IS NOT HERE
 *   Whether a key is *visible* is a two-part question that this module only
 *   answers with pure functions:
 *     1. permission  — can this role reach the destination at all? (RBAC)
 *     2. preference  — did the user (or the org) turn the link off? (UI only)
 *   Presentation never enforces. Every route re-checks its own permission on the
 *   server; hiding a link is a courtesy, and a user can never reveal a link
 *   their role cannot access, because the RBAC gate runs first and the
 *   preference layer can only subtract.
 */

import {
  LayoutDashboard,
  Users,
  UsersRound,
  Boxes,
  Puzzle,
  ClipboardList,
  Factory,
  Truck,
  MapPin,
  BadgeCheck,
  Layers,
  FolderOpen,
  FolderCog,
  FolderKey,
  Tags,
  CircleDot,
  Ticket,
  ClipboardCheck,
  QrCode,
  Upload,
  Wrench,
  Settings,
  Zap,
  Shield,
  ShieldCheck,
  BarChart3,
  FileSearch,
  Cpu,
  Package,
  SearchCheck,
  Filter,
  CalendarDays,
  HelpCircle,
  Copy,
  ShoppingCart,
  Home,
  ListOrdered,
  Warehouse,
  KeyRound,
  Archive,
  SlidersHorizontal,
  Bell,
  FileText,
  Banknote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface NavRegistryItem {
  /**
   * Stable, globally-unique identity. Persisted in user preferences, so it must
   * never be reused for a different destination and never renamed once shipped.
   */
  key: string;
  /** Default (English) label. Used when no `labelKey` is set or resolves. */
  label: string;
  /** Catalog key resolved through `useT()`; falls back to `label`. */
  labelKey?: string;
  href: string;
  icon: LucideIcon;
  /** Match the route exactly rather than by prefix (see `isActivePath`). */
  exact?: boolean;
  /** Hidden from non-admins, regardless of permissions. */
  adminOnly?: boolean;
  /** Hidden unless the signed-in user holds this permission. */
  permission?: Permission;
  /**
   * Locked items can never be hidden. Reserved for Dashboard and the Settings
   * entry so a user can always get back to the page that unhides things.
   */
  locked?: boolean;
  /**
   * Registry default, overriding the section's. `false` means the item starts
   * hidden for everyone; `true` re-shows an item inside a hidden section.
   */
  defaultVisible?: boolean;
  /** Secondary line rendered under the label in Navigation Settings. */
  description?: string;
  /** Nested links. Hiding the parent hides every child. */
  children?: NavRegistryItem[];
}

export interface NavRegistrySection {
  /** Stable section identity, e.g. "overview". */
  key: string;
  title: string;
  /** Catalog key for the section heading, e.g. "nav.section.overview". */
  titleKey?: string;
  /** Rendered as a collapsible group in the sidebar. */
  collapsible?: boolean;
  /**
   * Section-wide default visibility. Items inherit this unless they set their
   * own `defaultVisible`. `false` means the whole group starts hidden, which is
   * how "only Overview, Housing and Administration are on" is expressed.
   */
  defaultVisible?: boolean;
  items: NavRegistryItem[];
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const NAV_REGISTRY: readonly NavRegistrySection[] = [
  {
    key: "overview",
    title: "Overview",
    titleKey: "nav.section.overview",
    items: [
      {
        key: "overview.dashboard",
        label: "Dashboard",
        labelKey: "nav.dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
        locked: true,
      },
      {
        key: "overview.notifications",
        label: "Notifications",
        href: "/notifications",
        icon: Bell,
      },
      {
        key: "tools.search",
        label: "Advanced Search",
        href: "/search",
        icon: Filter,
      },
    ],
  },
  {
    key: "housing",
    title: "Housing",
    items: [
      {
        key: "house.hams-dashboard",
        label: "Dashboard",
        href: "/dashboard/house-allocation",
        icon: LayoutDashboard,
      },
      {
        key: "house.employees",
        label: "Employees",
        href: "/employees",
        icon: UsersRound,
        adminOnly: true,
      },
      {
        key: "house.allocation",
        label: "Allocation",
        href: "/house-request",
        icon: ClipboardList,
        children: [
          {
            key: "house.request",
            label: "House Request",
            href: "/house-request",
            icon: FileText,
          },
          {
            key: "house.register",
            label: "House Register",
            href: "/household/register",
            icon: Home,
          },
          {
            key: "house.queue",
            label: "House Queue",
            href: "/house-queue",
            icon: ListOrdered,
          },
        ],
      },
      {
        key: "house.tenancy",
        label: "Tenancy",
        href: "/houses/allocated",
        icon: KeyRound,
        children: [
          {
            key: "house.allocated",
            label: "Allocated",
            href: "/houses/allocated",
            icon: KeyRound,
          },
          {
            key: "house.terminated",
            label: "Terminated",
            href: "/houses/terminated",
            icon: Archive,
          },
          {
            key: "house.inspections",
            label: "Inspections",
            href: "/houses/inspections",
            icon: ClipboardCheck,
          },
          {
            key: "house.pay-rent",
            label: "Pay Rent",
            href: "/houses/pay-rent",
            icon: Banknote,
            permission: "rent:view",
          },
        ],
      },
      {
        key: "house.setup",
        label: "Setup",
        href: "/house-queue/config",
        icon: SlidersHorizontal,
        adminOnly: true,
        children: [
          {
            key: "house.queue-config",
            label: "Queue Config",
            href: "/house-queue/config",
            icon: SlidersHorizontal,
            adminOnly: true,
          },
        ],
      },
    ],
  },
  {
    key: "people",
    title: "People",
    items: [
      {
        key: "overview.users",
        label: "Users",
        labelKey: "nav.users",
        href: "/user",
        icon: Users,
        adminOnly: true,
      },
      {
        key: "overview.employees",
        label: "Employees",
        href: "/employee",
        icon: UsersRound,
        adminOnly: true,
      },
    ],
  },
  {
    key: "inventory",
    title: "Asset and Inventory",
    items: [
      {
        key: "overview.assets",
        label: "Assets",
        labelKey: "nav.assets",
        href: "/assets",
        icon: Boxes,
      },
      {
        key: "overview.general-asset",
        label: "General Asset",
        href: "/general-asset",
        icon: Warehouse,
        defaultVisible: false,
      },
      {
        key: "overview.accessories",
        label: "Accessories",
        labelKey: "nav.accessories",
        href: "/accessories",
        icon: Puzzle,
        defaultVisible: false,
      },
      {
        key: "inventory.components",
        label: "Components",
        labelKey: "nav.components",
        href: "/components",
        icon: Cpu,
        adminOnly: true,
        defaultVisible: false,
      },
      {
        key: "inventory.licences",
        label: "Licences",
        labelKey: "nav.licences",
        href: "/licences",
        icon: BadgeCheck,
        defaultVisible: false,
      },
      {
        key: "tools.procurement",
        label: "Procurement",
        href: "/procurement",
        icon: ShoppingCart,
        adminOnly: true,
        defaultVisible: false,
      },
      {
        key: "inventory.suppliers",
        label: "Suppliers",
        labelKey: "nav.suppliers",
        href: "/suppliers",
        icon: Truck,
        adminOnly: true,
        defaultVisible: false,
      },
      {
        key: "inventory.locations",
        label: "Locations",
        labelKey: "nav.locations",
        href: "/locations",
        icon: MapPin,
        adminOnly: true,
        defaultVisible: false,
      },
    ],
  },
  {
    key: "operations",
    title: "Operations",
    defaultVisible: false,
    items: [
      {
        key: "tools.tickets",
        label: "Ticket",
        href: "/user/tickets",
        icon: Ticket,
      },
      {
        key: "tools.reservations",
        label: "Reservations",
        href: "/reservations",
        icon: CalendarDays,
      },
      {
        key: "tools.approvals",
        label: "Approvals",
        labelKey: "nav.approvals",
        href: "/approvals",
        icon: ClipboardCheck,
        adminOnly: true,
      },
      {
        key: "tools.maintenance",
        label: "Maintenance",
        href: "/maintenance",
        icon: Wrench,
        adminOnly: true,
      },
      {
        key: "tools.audits",
        label: "Audits",
        labelKey: "nav.audits",
        href: "/audits",
        icon: SearchCheck,
        adminOnly: true,
      },
      {
        key: "tools.kits",
        label: "Kits",
        labelKey: "nav.kits",
        href: "/kits",
        icon: Package,
        adminOnly: true,
      },
    ],
  },
  {
    key: "master-data",
    title: "Master Data",
    collapsible: true,
    defaultVisible: false,
    items: [
      {
        key: "inventory.consumables",
        label: "Consumables",
        labelKey: "nav.consumables",
        href: "/consumables",
        icon: ClipboardList,
      },
      {
        key: "inventory.manufacturers",
        label: "Manufacturers",
        labelKey: "nav.manufacturers",
        href: "/manufacturers",
        icon: Factory,
        adminOnly: true,
      },
      {
        key: "categories.models",
        label: "Models",
        labelKey: "nav.models",
        href: "/models",
        icon: Tags,
        adminOnly: true,
      },
      {
        key: "categories.status-types",
        label: "Status Types",
        labelKey: "nav.statusTypes",
        href: "/statusTypes",
        icon: CircleDot,
        adminOnly: true,
      },
      {
        key: "categories.group",
        label: "Categories",
        href: "/assetCategories",
        icon: Layers,
        adminOnly: true,
        children: [
          {
            key: "categories.asset",
            label: "Asset Categories",
            labelKey: "nav.assetCategories",
            href: "/assetCategories",
            icon: Layers,
            adminOnly: true,
          },
          {
            key: "categories.accessory",
            label: "Accessory Categories",
            labelKey: "nav.accessoryCategories",
            href: "/accessoryCategories",
            icon: FolderOpen,
            adminOnly: true,
          },
          {
            key: "categories.consumable",
            label: "Consumable Categories",
            labelKey: "nav.consumableCategories",
            href: "/consumableCategories",
            icon: FolderCog,
            adminOnly: true,
          },
          {
            key: "categories.component",
            label: "Component Categories",
            labelKey: "nav.componentCategories",
            href: "/componentCategories",
            icon: Cpu,
            adminOnly: true,
          },
          {
            key: "categories.licence",
            label: "Licence Categories",
            labelKey: "nav.licenceCategories",
            href: "/licenceCategories",
            icon: FolderKey,
            adminOnly: true,
          },
        ],
      },
    ],
  },
  {
    key: "tools",
    title: "Tools",
    titleKey: "nav.section.tools",
    defaultVisible: false,
    items: [
      {
        key: "tools.scanner",
        label: "QR Scanner",
        labelKey: "nav.qrScanner",
        href: "/scanner",
        icon: QrCode,
        defaultVisible: true,
      },
      {
        key: "tools.import",
        label: "Import",
        href: "/import",
        icon: Upload,
        adminOnly: true,
        defaultVisible: true,
      },
      {
        key: "tools.duplicates",
        label: "Duplicates",
        href: "/duplicates",
        icon: Copy,
        adminOnly: true,
        defaultVisible: true,
      },
      {
        key: "tools.help",
        label: "Help",
        href: "/help",
        icon: HelpCircle,
        defaultVisible: true,
      },
    ],
  },
  {
    key: "insights",
    title: "Insights",
    items: [
      {
        key: "administration.reports",
        label: "Reports",
        labelKey: "nav.reports",
        href: "/reports",
        icon: BarChart3,
        adminOnly: true,
      },
      {
        key: "administration.tco",
        label: "TCO Analysis",
        href: "/tco",
        icon: BarChart3,
        adminOnly: true,
      },
    ],
  },
  {
    key: "administration",
    title: "Administration",
    titleKey: "nav.section.administration",
    collapsible: true,
    defaultVisible: true,
    items: [
      {
        key: "administration.workflows",
        label: "Workflows",
        labelKey: "nav.workflows",
        href: "/admin/workflows",
        icon: Zap,
        adminOnly: true,
      },
      {
        key: "administration.audit-logs",
        label: "Audit Logs",
        labelKey: "nav.auditLogs",
        href: "/admin/audit-logs",
        icon: FileSearch,
        adminOnly: true,
      },
      {
        key: "administration.gdpr",
        label: "GDPR",
        labelKey: "nav.gdpr",
        href: "/admin/gdpr",
        icon: Shield,
        adminOnly: true,
      },
      {
        key: "administration.compliance",
        label: "Compliance",
        labelKey: "nav.compliance",
        href: "/admin/compliance",
        icon: ShieldCheck,
        adminOnly: true,
      },
      {
        key: "administration.team",
        label: "Team",
        href: "/admin/team",
        icon: UsersRound,
        adminOnly: true,
      },
      {
        key: "administration.settings",
        label: "Admin Settings",
        labelKey: "nav.adminSettings",
        href: "/admin/settings",
        icon: Settings,
        adminOnly: true,
      },
    ],
  },
];

/** Keys rendered in the mobile bottom bar, in order. Housing leads. */
export const PRIMARY_NAV_KEYS: readonly string[] = [
  "house.request",
  "house.queue",
  "house.allocated",
  "house.terminated",
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Route match used for the active state, shared by sidebar and mobile nav. */
export function isActivePath(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  const cleanHref = href.split("?")[0];
  if (exact) return pathname === cleanHref;
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

/** Every item in a section tree, parents before children, depth-first. */
export function flattenSectionItems(
  sections: readonly NavRegistrySection[],
): NavRegistryItem[] {
  const out: NavRegistryItem[] = [];
  const visit = (items: readonly NavRegistryItem[]) => {
    for (const item of items) {
      out.push(item);
      if (item.children?.length) visit(item.children);
    }
  };
  for (const section of sections) visit(section.items);
  return out;
}

/** Every key in the whole registry (including nested children). */
export function getAllNavKeys(): string[] {
  return flattenSectionItems(NAV_REGISTRY).map((item) => item.key);
}

/** Keys that can never be hidden. */
export function getLockedNavKeys(): ReadonlySet<string> {
  return new Set(
    flattenSectionItems(NAV_REGISTRY)
      .filter((item) => item.locked)
      .map((item) => item.key),
  );
}

/**
 * Keys hidden by the registry itself (items that opt out of the default).
 *
 * Visibility resolves section-first: an item follows its section's
 * `defaultVisible` unless it declares its own, and a hidden parent drags its
 * children down with it. Locked items are never reported (the preference layer
 * would only strip them again) and neither are their descendants.
 */
export function getRegistryDefaultHiddenKeys(): ReadonlySet<string> {
  const hidden = new Set<string>();
  const visit = (
    items: readonly NavRegistryItem[],
    inherited: boolean,
  ): void => {
    for (const item of items) {
      // A locked item is always shown, so it can never darken its subtree.
      const visible = item.locked ? true : (item.defaultVisible ?? inherited);
      if (!visible) hidden.add(item.key);
      if (item.children?.length) visit(item.children, visible);
    }
  };
  for (const section of NAV_REGISTRY) {
    visit(section.items, section.defaultVisible ?? true);
  }
  return hidden;
}

/** Look up a single item anywhere in the registry. */
export function findNavItem(key: string): NavRegistryItem | undefined {
  return flattenSectionItems(NAV_REGISTRY).find((item) => item.key === key);
}

/**
 * Drop everything the signed-in user must not see.
 *
 * Two independent gates, in order:
 *   1. `adminOnly`  — hidden from non-admins (unchanged legacy behaviour);
 *   2. `permission` — hidden unless the user's role grants it.
 *
 * `permissions` is the caller's permission set. Admins implicitly hold every
 * permission, so a null/empty set never hides anything from them. Sections that
 * end up empty are dropped so no orphaned group header is rendered.
 */
export function getAccessibleSections(
  isAdmin: boolean,
  permissions?: ReadonlySet<string> | null,
): NavRegistrySection[] {
  return NAV_REGISTRY.reduce<NavRegistrySection[]>((acc, section) => {
    const items = section.items
      .map((item) => filterItem(item, isAdmin, permissions))
      .filter((item): item is NavRegistryItem => item !== null);
    if (items.length > 0) acc.push({ ...section, items });
    return acc;
  }, []);
}

function filterItem(
  item: NavRegistryItem,
  isAdmin: boolean,
  permissions?: ReadonlySet<string> | null,
): NavRegistryItem | null {
  if (item.adminOnly && !isAdmin) return null;
  // Fail CLOSED: while `permissions` is undefined (session still resolving) a
  // naive `&& permissions` short-circuit would let every gated item through, so
  // a Standard User briefly saw links like Pay Rent before they disappeared.
  if (item.permission && !isAdmin && !permissions?.has(item.permission)) {
    return null;
  }
  const children = item.children
    ?.map((child) => filterItem(child, isAdmin, permissions))
    .filter((child): child is NavRegistryItem => child !== null);
  return children ? { ...item, children } : item;
}

/**
 * Resolve which keys end up hidden.
 *
 * Precedence: an explicit user preference wins outright; otherwise the org
 * default; otherwise the registry default. Because only HIDDEN keys are stored,
 * the most-specific source that exists is authoritative — which is what lets a
 * user re-show a link their organisation chose to hide by saving their own list.
 *
 * Locked keys are always removed, whatever the caller stored, so a stale or
 * hand-crafted payload can never lock the user out of Settings.
 */
export function resolveHiddenKeys(source: {
  userHidden?: readonly string[] | null;
  orgHidden?: readonly string[] | null;
}): Set<string> {
  const authoritative =
    source.userHidden ??
    source.orgHidden ??
    Array.from(getRegistryDefaultHiddenKeys());
  const locked = getLockedNavKeys();
  return new Set(authoritative.filter((key) => !locked.has(key)));
}

/**
 * Apply a hidden-key set to an already RBAC-filtered tree.
 *
 * A hidden parent removes it and its children. A visible parent whose children
 * are all hidden is dropped too ("hide a parent that has zero visible
 * children"). Sections left without items are dropped.
 */
export function applyHiddenKeys(
  sections: readonly NavRegistrySection[],
  hidden: ReadonlySet<string>,
): NavRegistrySection[] {
  return sections.reduce<NavRegistrySection[]>((acc, section) => {
    const items = section.items
      .map((item) => applyHiddenToItem(item, hidden))
      .filter((item): item is NavRegistryItem => item !== null);
    if (items.length > 0) acc.push({ ...section, items });
    return acc;
  }, []);
}

function applyHiddenToItem(
  item: NavRegistryItem,
  hidden: ReadonlySet<string>,
): NavRegistryItem | null {
  if (!item.locked && hidden.has(item.key)) return null;

  if (item.children?.length) {
    const children = item.children
      .map((child) => applyHiddenToItem(child, hidden))
      .filter((child): child is NavRegistryItem => child !== null);
    // A parent whose every child is hidden is itself hidden.
    if (children.length === 0) return null;
    return { ...item, children };
  }

  return item;
}

/** The full pipeline: RBAC gate → preference gate → prune. */
export function resolveNavSections(input: {
  isAdmin: boolean;
  permissions?: ReadonlySet<string> | null;
  hiddenKeys: ReadonlySet<string>;
}): NavRegistrySection[] {
  return applyHiddenKeys(
    getAccessibleSections(input.isAdmin, input.permissions),
    input.hiddenKeys,
  );
}

/** Resolve the mobile bottom-bar keys against a resolved section tree. */
export function resolvePrimaryItems(
  sections: readonly NavRegistrySection[],
): NavRegistryItem[] {
  const byKey = new Map(
    flattenSectionItems(sections).map((item) => [item.key, item]),
  );
  return PRIMARY_NAV_KEYS.map((key) => byKey.get(key)).filter(
    (item): item is NavRegistryItem => item !== undefined,
  );
}
