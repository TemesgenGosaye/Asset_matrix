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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  PanelLeftClose,
  PanelRightOpen,
  ChevronDown,
  Boxes,
  Puzzle,
  ClipboardList,
  BadgeCheck,
  MapPin,
  User,
} from "lucide-react";
import { PlusIcon as SidebarPlusIcon } from "../ui/Icons";
import SearchTypeahead from "./SearchTypeahead";
import { useSession, type SessionUser } from "@/lib/auth-client";
import {
  navSections,
  isActivePath,
  filterSectionsForUser,
} from "@/lib/nav-config";
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
}

const Sidebar = React.memo(function Sidebar({
  initialCollapsed = false,
  permissions,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { data: session, isPending } = useSession();
  const user = session?.user as SessionUser | undefined;
  const isAdmin = !!user?.isadmin;

  const permissionSet = useMemo(
    () => (permissions ? new Set(permissions) : null),
    [permissions],
  );

  const filteredSections = useMemo(
    () =>
      isPending
        ? []
        : filterSectionsForUser(navSections, isAdmin, permissionSet),
    [isAdmin, isPending, permissionSet],
  );

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
    filteredSections.forEach((section) => {
      section.items.forEach((item) => {
        map.set(item.href, isActivePath(pathname, item.href, item.exact));
      });
    });
    return map;
  }, [pathname, filteredSections]);

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className={cn(
        "border-border bg-card/80 hidden border-r backdrop-blur-sm transition-[width] duration-300 ease-in-out lg:flex lg:flex-col",
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
                className="border-border bg-card hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-full ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Expand sidebar"
              >
                <BrandLogo className="h-8 w-8" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Expand sidebar — {BRAND_AM_ONE_LINE}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <div className="flex flex-1 items-center justify-between gap-2">
            <BrandLockup size="md" subtitle={isAdmin ? "Admin" : "Workspace"} />
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
              className="h-7 w-7 p-0"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Separator className="mx-3 w-auto" />

      {/* ─── Search ─── */}
      {!collapsed && (
        <div className="px-3 py-2">
          <SearchTypeahead />
        </div>
      )}

      {/* ─── Navigation groups ─── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filteredSections.map((section) => {
          const hasActiveChild = section.items.some((item) =>
            activeMap.get(item.href),
          );

          const renderItems = () => (
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = activeMap.get(item.href);
                const linkClasses = cn(
                  "group flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                );
                const content = (
                  <Link href={item.href} className={linkClasses}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <React.Fragment key={item.href}>{content}</React.Fragment>
                );
              })}
            </div>
          );

          if (section.collapsible && !collapsed) {
            return (
              <Collapsible
                key={section.title}
                defaultOpen={hasActiveChild}
                className="mb-2"
              >
                <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors">
                  {section.title}
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>{renderItems()}</CollapsibleContent>
              </Collapsible>
            );
          }

          return (
            <div key={section.title} className="mb-2">
              {!collapsed && (
                <p className="text-muted-foreground px-2.5 py-1.5 text-xs font-medium tracking-wide uppercase">
                  {section.title}
                </p>
              )}
              {renderItems()}
            </div>
          );
        })}
      </div>

      {/* ─── Quick create dropdown (admin only) ─── */}
      {isAdmin && (
        <div className="px-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className={cn("w-full", collapsed && "w-10 p-0")}
              >
                <SidebarPlusIcon
                  className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"}
                />
                {!collapsed && "Quick Create"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/assets/create">
                  <Boxes className="mr-2 h-4 w-4" />
                  New Asset
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accessories/create">
                  <Puzzle className="mr-2 h-4 w-4" />
                  New Accessory
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/consumables/create">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  New Consumable
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/licences/create">
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  New Licence
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/user/create">
                  <User className="mr-2 h-4 w-4" />
                  New User
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/locations/create">
                  <MapPin className="mr-2 h-4 w-4" />
                  New Location
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Separator className="mx-3 w-auto" />

      {/* ─── Version ─── */}
      {!collapsed && (
        <p className="text-muted-foreground/50 pb-2 text-center text-[10px]">
          v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
        </p>
      )}
    </aside>
  );
});

export default Sidebar;
