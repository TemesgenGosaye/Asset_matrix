"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useOptimistic,
  useTransition,
} from "react";
import Link from "next/link";
import { useSession, signOut, type SessionUser } from "@/lib/auth-client";
import GlobalSearch from "./GlobalSearch";
import {
  Search,
  X,
  Loader2,
  Bell,
  Check,
  Settings,
  User,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
// NotificationIcon replaced with lucide Bell
import { cn } from "@/lib/utils";
import ThemeSwitcher from "./ThemeSwitcher";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import { TOGGLE_ASSISTANT_EVENT } from "@/lib/ai/events";
import { notify } from "@/lib/feedback/notify";
import { notificationCategoryStyle } from "@/ui/notifications/category-styles";

interface Notification {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  icon: string | null;
  link: string | null;
  metadata: string | null;
  readAt: string | null;
  createdAt: string;
}

function formatTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const Navigation = React.memo(function Navigation() {
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  // Notification state — single source of truth so list and badge stay atomic
  type NotifState = {
    notifications: Notification[];
    unreadCount: number;
  };

  type OptimisticAction =
    | { type: "markRead"; id: string }
    | { type: "markAllReadDisplayed" }
    | { type: "delete"; id: string }
    | { type: "deleteAll" };

  const [state, setState] = useState<NotifState>({
    notifications: [],
    unreadCount: 0,
  });
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [optimisticState, applyOptimistic] = useOptimistic<
    NotifState,
    OptimisticAction
  >(state, (current, action): NotifState => {
    switch (action.type) {
      case "markRead": {
        const target = current.notifications.find((n) => n.id === action.id);
        const wasUnread = target?.readAt == null;
        return {
          notifications: current.notifications.map((n) =>
            n.id === action.id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
          unreadCount: wasUnread
            ? Math.max(0, current.unreadCount - 1)
            : current.unreadCount,
        };
      }
      case "markAllReadDisplayed": {
        const displayedPending = current.notifications.filter(
          (n) => n.readAt == null,
        ).length;
        return {
          notifications: current.notifications.map((n) =>
            n.readAt == null ? { ...n, readAt: new Date().toISOString() } : n,
          ),
          unreadCount: Math.max(0, current.unreadCount - displayedPending),
        };
      }
      case "delete": {
        const target = current.notifications.find((n) => n.id === action.id);
        const wasUnread = target?.readAt == null;
        return {
          notifications: current.notifications.filter(
            (n) => n.id !== action.id,
          ),
          unreadCount: wasUnread
            ? Math.max(0, current.unreadCount - 1)
            : current.unreadCount,
        };
      }
      case "deleteAll":
        return { notifications: [], unreadCount: 0 };
    }
  });

  // Fetch notifications (server is source of truth; replaces both list + count)
  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;

    setNotificationsLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=10");
      if (response.ok) {
        const data = await response.json();
        setState({
          notifications: data.notifications || [],
          unreadCount: data.unreadCount || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [session?.user?.id]);

  // When a notification clears this, the unread count on next poll will drop.
  // Read notification id to know if the PATCH was successful:
  const markAsRead = (id: string) => {
    startTransition(async () => {
      applyOptimistic({ type: "markRead", id });
      try {
        const response = await fetch(`/api/notifications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        });
        if (!response.ok) throw new Error("Request failed");
        setState((prev) => {
          const target = prev.notifications.find((n) => n.id === id);
          const wasUnread = target?.readAt == null;
          return {
            notifications: prev.notifications.map((n) =>
              n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
            ),
            unreadCount: wasUnread
              ? Math.max(0, prev.unreadCount - 1)
              : prev.unreadCount,
          };
        });
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        notify.error("Couldn't mark as read");
        // Optimistic update auto-reverts when this transition ends
      }
    });
  };

  // Mark every unread notification as read via the server endpoint — single
  // request instead of one PATCH per shown row.
  const markAllReadDisplayed = () => {
    const pendingCount = optimisticState.unreadCount;
    if (pendingCount === 0) return;

    startTransition(async () => {
      applyOptimistic({ type: "markAllReadDisplayed" });
      try {
        const response = await fetch("/api/notifications/read-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error("Request failed");
        setState((prev) => ({
          notifications: prev.notifications.map((n) =>
            n.readAt == null ? { ...n, readAt: new Date().toISOString() } : n,
          ),
          unreadCount: 0,
        }));
      } catch (error) {
        console.error("Failed to mark all notifications as read:", error);
        notify.error("Couldn't mark all as read");
        fetchNotifications();
      }
    });
  };

  // Delete single notification — optimistic
  const deleteNotification = (id: string) => {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      try {
        const response = await fetch(`/api/notifications/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Request failed");
        setState((prev) => {
          const target = prev.notifications.find((n) => n.id === id);
          const wasUnread = target?.readAt == null;
          return {
            notifications: prev.notifications.filter((n) => n.id !== id),
            unreadCount: wasUnread
              ? Math.max(0, prev.unreadCount - 1)
              : prev.unreadCount,
          };
        });
        notify.success("Notification deleted");
      } catch (error) {
        console.error("Failed to delete notification:", error);
        notify.error("Failed to delete notification");
      }
    });
  };

  // Delete all notifications — optimistic
  const deleteAllNotifications = () => {
    startTransition(async () => {
      applyOptimistic({ type: "deleteAll" });
      try {
        const response = await fetch("/api/notifications", {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Request failed");
        setState({ notifications: [], unreadCount: 0 });
        notify.success("All notifications deleted");
      } catch (error) {
        console.error("Failed to delete all notifications:", error);
        notify.error("Failed to delete notifications");
      }
    });
  };

  // Fetch notifications on mount and poll every 30s for new ones.
  // The initial fetch is deferred off the critical path (idle callback) so it
  // does not block first paint / navigation.
  useEffect(() => {
    if (!session?.user?.id) return;

    let rafId: number | null = null;
    const idleCb =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(() => fetchNotifications(), { timeout: 2000 })
        : (rafId = requestAnimationFrame(() => fetchNotifications()));

    const POLL_INTERVAL = 30_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(fetchNotifications, POLL_INTERVAL);
      }
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Pause polling when the tab is hidden to save requests
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchNotifications();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (typeof requestIdleCallback === "function" && idleCb) {
        cancelIdleCallback(idleCb);
      } else if (rafId) {
        cancelAnimationFrame(rafId);
      }
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    // `nav-mesh` supplies the fill (see globals.css) and `--shadow-sm` the lift,
    // which together raise the bar above the canvas without any backdrop filter.
    // It replaced the old `bg-background/95 backdrop-blur-sm`: `main` is the
    // scroll container, not the page, so nothing ever passed underneath this bar
    // and the blur had nothing to sample — it cost a backdrop filter on every
    // frame for no visible difference.
    <nav className="nav-mesh border-border border-b shadow-[var(--shadow-sm)]">
      <div className="flex h-16 items-center px-4 md:px-6">
        <div className="flex flex-1 items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-foreground text-lg font-bold">
              የመተሐራ ስኳር ፋብሪካ
            </span>
            <span className="text-foreground text-lg font-bold">
              የንብረትና የቤት አስተዳደር ፖርታል
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Global Search Button */}
          <Button
            variant="outline"
            className="text-muted-foreground hidden w-64 items-center gap-2 md:flex"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="bg-muted pointer-events-none hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-xs font-medium opacity-100 select-none sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-5 w-5" />
          </Button>

          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

          <DropdownMenu
            onOpenChange={(open) => {
              if (open) fetchNotifications();
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {optimisticState.unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                    {optimisticState.unreadCount > 99
                      ? "99+"
                      : optimisticState.unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold">Notifications</span>
                <div className="flex items-center gap-1">
                  {optimisticState.unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-7 text-xs"
                      onClick={markAllReadDisplayed}
                    >
                      Mark all read
                    </Button>
                  )}
                  {notificationsLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                </div>
              </div>
              <DropdownMenuSeparator />

              {optimisticState.notifications.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  <Bell className="text-muted-foreground/30 mx-auto mb-2 h-8 w-8" />
                  <p>All caught up</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {optimisticState.notifications.map((notification) => {
                    const isUnread = notification.readAt == null;
                    const timeAgo = formatTimeAgo(notification.createdAt);
                    const style = notificationCategoryStyle(
                      notification.category,
                    );
                    const Icon = style.icon;
                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          "group flex gap-3 border-b px-3 py-2.5 last:border-0",
                          isUnread && "bg-primary/5",
                        )}
                      >
                        <div className="mt-1.5 shrink-0">
                          {isUnread ? (
                            <span className="bg-primary block h-2 w-2 rounded-full" />
                          ) : (
                            <span className="block h-2 w-2" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              isUnread && "font-medium",
                            )}
                          >
                            {notification.title}
                          </p>
                          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
                            {notification.body
                              .replace(/<[^>]*>/g, "")
                              .slice(0, 120)}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                style.className,
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              {style.label}
                            </span>
                            <span className="text-muted-foreground/60 text-[11px]">
                              {timeAgo}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {isUnread && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Mark as read"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-6 w-6"
                            title="Dismiss"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {optimisticState.notifications.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      href="/notifications"
                      className="text-muted-foreground cursor-pointer justify-center text-xs"
                    >
                      View all notifications
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-muted-foreground cursor-pointer justify-center text-xs"
                    onClick={deleteAllNotifications}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : null}
                    Delete all notifications
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Meri · System Assistant Trigger ─── */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent(TOGGLE_ASSISTANT_EVENT));
              }
            }}
            className="border-primary/30 text-primary hover:border-primary/60 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
            title={`Open ${ASSISTANT_BRAND.lockup} (Ctrl+J)`}
            aria-label={`Open ${ASSISTANT_BRAND.latin}, the system assistant`}
          >
            <Sparkles className="text-primary h-4 w-4" />
            <span className="hidden md:inline">{ASSISTANT_BRAND.name}</span>
          </Button>

          {/* ─── Dark / Light Mode Toggle ─── */}
          <ThemeSwitcher />

          {/* ─── User Account Avatar ─── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring relative h-9 w-9 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Account menu"
              >
                <User className="h-5 w-5" strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-medium">
                  {user?.firstname} {user?.lastname}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {user?.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/user/${user?.id}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/user/${user?.id}`}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/user/tickets">
                  <Bell className="mr-2 h-4 w-4" />
                  My Tickets
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
});

export default Navigation;
