"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import { usePathname } from "next/navigation";
import { Menu, Settings, UserPen, LogOut, ChevronDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSession, signOut, type SessionUser } from "@/lib/auth-client";
import {
  isActivePath,
  resolveNavSections,
  resolvePrimaryItems,
  type NavRegistryItem,
  type NavRegistrySection,
} from "@/lib/navigation/registry";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useNavigationPreferences } from "@/contexts/NavigationPreferencesContext";
import { useT } from "@/lib/i18n/react";

interface MobileNavProps {
  /** Server-resolved permission strings; see AppShell. */
  permissions?: string[];
  /** Server-resolved admin flag, so the nav never flashes admin links. */
  isAdmin?: boolean;
}

export default React.memo(function MobileNav({
  permissions,
  isAdmin: isAdminProp,
}: MobileNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: session, isPending } = useSession();
  const user = session?.user as SessionUser | undefined;
  const isAdmin = isAdminProp ?? !!user?.isadmin;
  const { hiddenKeyList } = useNavigationPreferences();
  const t = useT();

  const permissionSet = useMemo(
    () => (permissions ? new Set(permissions) : null),
    [permissions],
  );

  const navReady = typeof isAdminProp === "boolean" || !isPending;

  const filteredSections = useMemo<NavRegistrySection[]>(() => {
    if (!navReady) return [];
    return resolveNavSections({
      isAdmin,
      permissions: permissionSet,
      hiddenKeys: new Set(hiddenKeyList),
    });
  }, [isAdmin, navReady, permissionSet, hiddenKeyList]);

  const primaryItems = useMemo(
    () => resolvePrimaryItems(filteredSections),
    [filteredSections],
  );

  // The scan shortcut lives in the registry too, so hiding "QR Scanner" hides it
  // here as well as in the sidebar; it is only in the bar if it survived the
  // RBAC and preference gates.
  const scanItem = useMemo(
    () => findVisibleItem(filteredSections, "tools.scanner"),
    [filteredSections],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeGroups = new Set<string>();
    filteredSections.forEach((section) => {
      section.items.forEach((item) => {
        if (!item.children?.length) return;
        const active =
          isActivePath(pathname, item.href, item.exact) ||
          item.children.some((child) => isActivePath(pathname, child.href, child.exact));
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
  }, [filteredSections, pathname]);

  function label(item: { label: string; labelKey?: string }): string {
    if (!item.labelKey) return item.label;
    const translated = t(item.labelKey);
    return translated === item.labelKey ? item.label : translated;
  }

  function renderSheetLeaf(item: NavRegistryItem) {
    const Icon = item.icon;
    const active = isActivePath(pathname, item.href, item.exact);
    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={() => setSheetOpen(false)}
        className={cn(
          "touch-target flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{label(item)}</span>
      </Link>
    );
  }

  function renderSheetItem(item: NavRegistryItem) {
    if (!item.children?.length) return renderSheetLeaf(item);
    const Icon = item.icon;
    const open = expanded.has(item.key);
    const active =
      isActivePath(pathname, item.href, item.exact) ||
      item.children.some((child) => isActivePath(pathname, child.href, child.exact));
    return (
      <Collapsible
        key={item.key}
        open={open}
        onOpenChange={(next) =>
          setExpanded((prev) => {
            const s = new Set(prev);
            if (next) s.add(item.key);
            else s.delete(item.key);
            return s;
          })
        }
      >
        <CollapsibleTrigger
          className={cn(
            "touch-target flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            active
              ? "text-primary"
              : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground",
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="flex-1 truncate text-left">{label(item)}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-0.5 space-y-0.5">
          {item.children.map((child) => renderSheetLeaf(child))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <nav
      className="pb-safe border-chrome-border bg-chrome/95 supports-[backdrop-filter]:bg-chrome/85 text-chrome-foreground fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around px-1">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href, item.exact);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "touch-target flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-chrome-muted hover:text-chrome-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-primary")} />
              <span>{label(item)}</span>
            </Link>
          );
        })}

        {scanItem && (
          <Link
            href={scanItem.href}
            className={cn(
              "touch-target flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors",
              isActivePath(pathname, scanItem.href)
                ? "text-primary"
                : "text-chrome-muted hover:text-chrome-foreground",
            )}
          >
            <scanItem.icon
              className={cn(
                "h-5 w-5",
                isActivePath(pathname, scanItem.href) && "text-primary",
              )}
            />
            <span>Scan</span>
          </Link>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="text-chrome-muted hover:text-chrome-foreground touch-target flex h-auto flex-col items-center justify-center gap-0.5 rounded-none px-2 py-2 text-[10px] font-medium transition-colors hover:bg-transparent"
              aria-label="Open full navigation menu"
            >
              <Menu className="h-5 w-5" />
              <span>More</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="border-chrome-border bg-chrome text-chrome-foreground w-[280px] overflow-y-auto p-0 pb-16"
          >
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>
                <BrandLockup size="sm" asLink={false} />
              </SheetTitle>
            </SheetHeader>
            <div className="px-2 py-2">
              {filteredSections.map((section) => (
                <div key={section.key} className="mb-4">
                  <p className="text-chrome-muted px-3 pb-1.5 text-xs font-semibold tracking-wide uppercase">
                    {section.titleKey ? t(section.titleKey) : section.title}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => renderSheetItem(item))}
                  </div>
                </div>
              ))}
            </div>

            {user && (
              <>
                <Separator className="bg-chrome-border mx-3" />
                <div className="px-2 py-3">
                  <p className="text-chrome-muted px-3 pb-2 text-xs font-semibold tracking-wide uppercase">
                    Account
                  </p>
                  <div className="mb-2 px-3">
                    <p className="text-sm font-medium">
                      {user.firstname} {user.lastname}
                    </p>
                    <p className="text-chrome-muted text-xs">
                      {user.email || user.username}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <Link
                      href="/settings/navigation"
                      onClick={() => setSheetOpen(false)}
                      className="touch-target text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                    >
                      <Settings className="h-5 w-5 shrink-0" />
                      Navigation Settings
                    </Link>
                    <Link
                      href={`/user/${user.id}/settings`}
                      onClick={() => setSheetOpen(false)}
                      className="touch-target text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                    >
                      <Settings className="h-5 w-5 shrink-0" />
                      Settings
                    </Link>
                    <Link
                      href={`/user/${user.id}/edit`}
                      onClick={() => setSheetOpen(false)}
                      className="touch-target text-chrome-muted hover:bg-chrome-hover hover:text-chrome-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                    >
                      <UserPen className="h-5 w-5 shrink-0" />
                      Edit Profile
                    </Link>
                    <button
                      onClick={() => {
                        setSheetOpen(false);
                        signOut();
                      }}
                      className="touch-target text-destructive hover:bg-destructive/10 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                    >
                      <LogOut className="h-5 w-5 shrink-0" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
});

/**
 * Find a visible item anywhere in a resolved section tree, children included.
 * Kept local because only the mobile bar needs it.
 */
function findVisibleItem(
  sections: readonly NavRegistrySection[],
  key: string,
): NavRegistryItem | undefined {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.key === key) return item;
      const child = item.children?.find((c) => c.key === key);
      if (child) return child;
    }
  }
  return undefined;
}
