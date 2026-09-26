import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  BadgeCheck,
  Wrench,
  Package,
  Ticket,
  CalendarDays,
  ClipboardList,
  Home,
  KeyRound,
  BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationCategoryStyle {
  label: string;
  icon: LucideIcon;
  className: string;
  iconClassName: string;
}

const RAW: Record<string, Omit<NotificationCategoryStyle, "iconClassName">> = {
  asset: {
    label: "Assets",
    icon: Boxes,
    className:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20",
  },
  licence: {
    label: "Licences",
    icon: BadgeCheck,
    className:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  },
  stock: {
    label: "Stock",
    icon: Package,
    className:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  },
  ticket: {
    label: "Tickets",
    icon: Ticket,
    className:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  },
  reservation: {
    label: "Reservations",
    icon: CalendarDays,
    className:
      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-cyan-500/20",
  },
  request: {
    label: "Requests",
    icon: ClipboardList,
    className:
      "bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-orange-500/20",
  },
  house: {
    label: "Houses",
    icon: Home,
    className:
      "bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/20",
  },
  access: {
    label: "Account",
    icon: KeyRound,
    className:
      "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
  },
  system: {
    label: "System",
    icon: BellRing,
    className:
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-slate-500/20",
  },
};

export const CATEGORY_IDS = Object.keys(RAW);

export const notificationCategoryStyle = (
  category: string,
): NotificationCategoryStyle => {
  const base = RAW[category] ?? RAW.system;
  return {
    ...base,
    iconClassName: cn(base.className, "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1"),
  };
};

export const categoryLabel = (category: string) =>
  (RAW[category] ?? RAW.system).label;