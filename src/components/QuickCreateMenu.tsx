"use client";

/**
 * Primary "create" action.
 *
 * WHERE IT LIVES: the application bar, on the right of the brand, before the
 * search and account controls. That is the one place a primary action can be
 * reached from every screen without scrolling, on every viewport (the sidebar
 * rail is desktop-only and collapses to a mobile tab bar), and it sits with
 * the other global actions instead of floating below a long list of links.
 *
 * It used to live at the BOTTOM of the sidebar rail, under the navigation
 * groups — the least reachable position in the app for the action people use
 * most, and one that disappeared entirely on small screens.
 *
 * The trigger is a labelled primary button with a chevron, so it reads as
 * "create something" and opens a menu of WHAT. The label is hidden on the
 * narrowest screens, where the plus glyph carries the meaning.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Boxes,
  ChevronDown,
  ClipboardList,
  MapPin,
  PackagePlus,
  Puzzle,
  User,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Event that opens the create menu from anywhere in the app.
 *
 * The keyboard handler lives in `KeyboardShortcuts`, which has no access to
 * this component's state, so it asks for the menu with an event - the same
 * pattern the AI assistant uses (`TOGGLE_ASSISTANT_EVENT`).
 */
export const OPEN_QUICK_CREATE_EVENT = "msf:open-quick-create";

/**
 * The things users can create from here.
 *
 * Grouped by what the record IS: the asset estate, then the people and the
 * places. A separator between the groups does more for scanning than one flat
 * list of items.
 */
const CREATE_GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof Boxes }[];
}[] = [
  {
    label: "Requests",
    items: [{ href: "/house-request", label: "House Request", icon: Home }],
  },
  {
    label: "Asset estate",
    items: [
      { href: "/assets/create", label: "New Asset", icon: Boxes },
      { href: "/accessories/create", label: "New Accessory", icon: Puzzle },
      {
        href: "/consumables/create",
        label: "New Consumable",
        icon: ClipboardList,
      },
      { href: "/licences/create", label: "New Licence", icon: BadgeCheck },
    ],
  },
  {
    label: "People & places",
    items: [
      { href: "/user/create", label: "New User", icon: User },
      { href: "/locations/create", label: "New Location", icon: MapPin },
    ],
  },
];

export default function QuickCreateMenu({
  className,
  label = "Create",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  // The "C" shortcut opens the menu from wherever the user is.
  useEffect(() => {
    const openMenu = () => setOpen(true);
    window.addEventListener(OPEN_QUICK_CREATE_EVENT, openMenu);
    return () => window.removeEventListener(OPEN_QUICK_CREATE_EVENT, openMenu);
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className={cn(
            "bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 rounded-md shadow-sm transition-colors",
            className,
          )}
        >
          <PackagePlus className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          <span className="sr-only">Create a new record</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {CREATE_GROUPS.map((group, index) => (
          <div key={group.label}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} className="cursor-pointer">
                  <item.icon className="text-muted-foreground mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
