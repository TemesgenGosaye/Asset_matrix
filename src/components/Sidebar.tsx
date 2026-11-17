"use client";

import React, { useEffect, useMemo, useState, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { PanelLeftClose, PanelRightOpen, ChevronDown } from "lucide-react";
import SearchTypeahead from "./SearchTypeahead";
import { useSession, type SessionUser } from "@/lib/auth-client";
import {
  isActivePath,
  resolveNavSections,
  type NavRegistryItem,
  type NavRegistrySection,
} from "@/lib/navigation/registry";
import { useNavigationPreferences } from "@/contexts/NavigationPreferencesContext";
import { useNavLabel } from "@/lib/navigation/labels";
import { useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";
import { BrandLockup, BrandLogo } from "@/components/BrandLockup";
import { BRAND_AM_ONE_LINE } from "@/lib/brand";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Metahara Sugar Factory badge, generated from public/images/msflogo.jpg by
 * scripts/generate-brand-icons.mjs. Kept circular because the artwork is a
 * round seal — a rounded-rect mask would clip the green ring.
 *
 * Re-exported from `BrandLockup` so the whole app chrome shares one lockup
 * rather than three copies that can drift.
 */
export { BrandLogo } from "@/components/BrandLockup";

interface SidebarProps {
  initialCollapsed?: boolean;
  /** Server-resolved permission strings; see AppShell. */
  permissions?: string[];
  /** Server-resolved admin flag, so the nav never flashes admin links. */
  isAdmin?: boolean;
}

/** Nav label resolution is shared with Navigation Settings (lib/navigation/labels). */

const Sidebar = React.memo(function Sidebar({
  initialCollapsed = false,
  permissions,
  isAdmin: isAdminProp,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { data: session, isPending } = useSession();
  const user = session?.user as SessionUser | undefined;
  const isAdmin = isAdminProp ?? !!user?.isadmin;
  const { hiddenKeyList } = useNavigationPreferences();
  const labelFor = useNavLabel();
  const t = useT();

  const permissionSet = useMemo(
    () => (permissions ? new Set(permissions) : null),
    [permissions],
  );

  // The server resolves permissions, the admin flag and the hidden keys, so the
  // first client render is already correct. The `isPending` guard only matters
  // when this component is used without the server props (tests, previews).
  const navReady = typeof isAdminProp === "boolean" || !isPending;

  const filteredSections = useMemo<NavRegistrySection[]>(() => {
    if (!navReady) return [];
    return resolveNavSections({
      isAdmin,
      permissions: permissionSet,
      hiddenKeys: new Set(hiddenKeyList),
    });
  }, [isAdmin, navReady, permissionSet, hiddenKeyList]);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("sidebar:collapsed");
    if (stored !== null) {
      const storedCollapsed = stored === "true";
      setCollapsed((prev) =>
        prev === storedCollapsed ? prev : storedCollapsed,
      );
    } else {
      window.localStorage.setItem(
        "sidebar:collapsed",
        String(initialCollapsed),
      );
    }
  }, [initialCollapsed]);

  const activeMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const visit = (items: NavRegistryItem[]) => {
      items.forEach((item) => {
        map.set(item.key, isActivePath(pathname, item.href, item.exact));
        if (item.children) visit(item.children);
      });
    };
    filteredSections.forEach((section) => visit(section.items));
    return map;
  }, [pathname, filteredSections]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeGroups = new Set<string>();
    filteredSections.forEach((section) => {
      section.items.forEach((item) => {
        if (!item.children?.length) return;
        const active =
          activeMap.get(item.key) ||
          item.children.some((child) => activeMap.get(child.key));
        if (active) activeGroups.add(item.key);
      });
    });
    if (activeGroups.size) {
      setExpanded((prev) => {
        const next = new Set(prev);
        activeGroups.forEach((k) => next.add(k));
        return next;
      });
    }
  }, [activeMap, filteredSections, pathname]);

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderLeaf = (item: NavRegistryItem) => {
    const Icon = item.icon;
    const active = activeMap.get(item.key);
    const label = labelFor(item);
    const linkClasses = cn(
      "group flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
      collapsed && "justify-center px-2",
      active
        ? "bg-primary text-primary-foreground font-medium shadow-sm"
        : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground",
    );
    const content = (
      <Link href={item.href} className={linkClasses}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.key}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return <React.Fragment key={item.key}>{content}</React.Fragment>;
  };

  const renderItems = (section: NavRegistrySection) => (
    <div className="space-y-0.5">
      {section.items.map((item) => {
        if (item.children?.length) {
          const Icon = item.icon;
          const label = labelFor(item);
          const active =
            activeMap.get(item.key) ||
            item.children.some((child) => activeMap.get(child.key));
          const open = expanded.has(item.key);

          if (collapsed) {
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsed(false);
                      setExpanded((prev) => new Set(prev).add(item.key));
                      if (typeof window !== "undefined") {
                        window.localStorage.setItem(
                          "sidebar:collapsed",
                          "false",
                        );
                        document.cookie =
                          "sidebar_collapsed=false; path=/; max-age=31536000";
                      }
                    }}
                    className={cn(
                      "group flex w-full items-center justify-center rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground",
                    )}
                    aria-label={label}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{label}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Collapsible
              key={item.key}
              open={open}
              onOpenChange={() => toggleGroup(item.key)}
            >
              <CollapsibleTrigger
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "text-chrome-foreground font-medium"
                    : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate text-left">{label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                    !open && "-rotate-90",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-0.5 space-y-0.5">
                {item.children.map((child) => renderLeaf(child))}
              </CollapsibleContent>
            </Collapsible>
          );
        }
        return renderLeaf(item);
      })}
    </div>
  );

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className={cn(
        "app-chrome hidden shadow-sm transition-[width] duration-300 ease-in-out lg:flex lg:flex-col",
        "border-r",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* ─── Header: App identity ─── */}
      {collapsed ? (
        <div className="flex h-14 shrink-0 flex-col items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setCollapsed(false);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("sidebar:collapsed", "false");
                    document.cookie =
                      "sidebar_collapsed=false; path=/; max-age=31536000";
                  }
                }}
                className="border-chrome-border bg-chrome-hover hover:bg-chrome-hover focus-visible:ring-ring focus-visible:ring-offset-chrome flex h-8 w-8 items-center justify-center rounded-full border ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Expand sidebar"
              >
                <BrandLogo className="h-8 w-8" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Expand sidebar — Workspace
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <div className="[&_.text-muted-foreground]:text-chrome-muted flex flex-1 items-center justify-between gap-2">
            <BrandLockup size="md" subtitle="Workspace" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCollapsed((prev) => {
                  const next = !prev;
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(
                      "sidebar:collapsed",
                      String(next),
                    );
                    document.cookie = `sidebar_collapsed=${next}; path=/; max-age=31536000`;
                  }
                  return next;
                });
              }}
              aria-label="Collapse sidebar"
              className="text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground h-7 w-7 p-0"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Separator className="bg-chrome-border mx-3 w-auto" />

      {/* ─── Search ─── */}
      {!collapsed && (
        <div className="[&_input]:border-chrome-border [&_input]:bg-chrome-hover/60 [&_input]:text-chrome-foreground [&_input]:placeholder:text-chrome-muted [&_input]:focus-visible:ring-ring [&_svg]:text-chrome-muted px-3 py-2">
          <SearchTypeahead />
        </div>
      )}

      {/* ─── Navigation groups ─── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filteredSections.map((section) => {
          const hasActiveChild = section.items.some((item) => {
            if (activeMap.get(item.key)) return true;
            return item.children?.some((child) => activeMap.get(child.key));
          });

          if (section.collapsible && !collapsed) {
            return (
              <Collapsible
                key={section.key}
                defaultOpen={hasActiveChild}
                className="mb-2"
              >
                <CollapsibleTrigger className="group text-chrome-muted hover:text-chrome-foreground flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-semibold tracking-wider uppercase transition-colors">
                  {section.titleKey ? t(section.titleKey) : section.title}
                  <ChevronDown className="text-chrome-muted h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>{renderItems(section)}</CollapsibleContent>
              </Collapsible>
            );
          }

          return (
            <div key={section.key} className="mb-2">
              {!collapsed && (
                <p className="text-chrome-muted px-2.5 py-1.5 text-xs font-semibold tracking-wider uppercase">
                  {section.titleKey ? t(section.titleKey) : section.title}
                </p>
              )}
              {renderItems(section)}
            </div>
          );
        })}
      </div>

      <Separator className="bg-chrome-border mx-3 w-auto" />

      {/* ─── Version & Attribution ─── */}
      {!collapsed && (
        <div className="text-chrome-muted space-y-0.5 pb-2 text-center text-[10px]">
          <p>v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}</p>
          <p className="text-[9px] font-medium opacity-75">Powered by Mark</p>
        </div>
      )}
    </aside>
  );
});

export default Sidebar;
