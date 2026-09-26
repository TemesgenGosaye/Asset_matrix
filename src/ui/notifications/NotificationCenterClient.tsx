"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import {
  Search,
  Loader2,
  CheckCheck,
  Check,
  Trash2,
  Inbox,
  BellRing,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CATEGORY_IDS, notificationCategoryStyle } from "./category-styles";

interface NotificationData {
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

interface ApiResponse {
  notifications: NotificationData[];
  total: number;
  unreadCount: number;
  byCategory: Record<string, number>;
  page: number;
  limit: number;
}

const PAGE_SIZE = 15;

function formatRelative(dateString: string): string {
  const then = new Date(dateString).getTime();
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Client cache of the fetched feed (kept across renders; server is truth). */
const feedCache = new Map<string, ApiResponse>();

export default function NotificationCenterClient() {
  const router = useRouter();
  const [status, setStatus] = useState<"unread" | "read" | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Normalize the search state so an empty query still runs on enter.
  const [appliedSearch, setAppliedSearch] = useState("");

  const [feed, setFeed] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const requestSeq = useRef(0);

  const cacheKey = useMemo(
    () => JSON.stringify({ status, category, search: appliedSearch, page }),
    [status, category, appliedSearch, page],
  );

  const fetchPage = useCallback(
    async (key: string, seq: number) => {
      const { status: s, category: c, search: q, page: p } = JSON.parse(key);
      setLoading(true);
      try {
        const url = new URL("/api/notifications", window.location.origin);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("page", String(p));
        url.searchParams.set("status", s);
        url.searchParams.set("category", c);
        if (q) url.searchParams.set("search", q);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Request failed");
        const data: ApiResponse = await res.json();
        if (seq !== requestSeq.current) return; // stale
        feedCache.set(key, data);
        setFeed(data);
      } catch (error) {
        console.error("Failed to load notifications:", error);
        if (seq === requestSeq.current) {
          toast.error("Failed to load notifications");
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  // Load a page whenever the filter set or the page changes.
  useEffect(() => {
    requestSeq.current++;
    const seq = requestSeq.current;
    fetchPage(cacheKey, seq);
  }, [cacheKey, fetchPage]);

  // Re-fetch when restored from navigation (router.refresh() no-op on client nav).
  useEffect(() => {
    const onFocus = () => {
      const key = JSON.stringify({
        status,
        category,
        search: appliedSearch,
        page: 1,
      });
      requestSeq.current++;
      const seq = requestSeq.current;
      feedCache.delete(key);
      fetchPage(key, seq);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status, category, appliedSearch, fetchPage]);

  const unread = feed?.unreadCount ?? 0;
  const byCategory = feed?.byCategory ?? {};

  const applyFilters = (next: {
    status?: typeof status;
    category?: string;
    page?: number;
  }) => {
    if (next.status !== undefined) {
      setStatus(next.status);
      setPage(1);
    }
    if (next.category !== undefined) {
      setCategory(next.category);
      setPage(1);
    }
    if (next.page !== undefined) setPage(next.page);
  };

  const submitSearch = () => {
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const markRead = (id: string) => {
    // Optimistic local update
    setFeed((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(
          0,
          prev.unreadCount - (prev.notifications.find((n) => n.id === id)?.readAt ? 0 : 1),
        ),
      };
    });
    void fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
  };

  const markUnread = (id: string) => {
    setFeed((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, readAt: null } : n,
        ),
        unreadCount: prev.unreadCount + 1,
      };
    });
    void fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: false }),
    });
  };

  const markAllRead = () => {
    if (unread === 0) return;
    const before = unread;
    setFeed((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.readAt ? n : { ...n, readAt: new Date().toISOString() },
        ),
        unreadCount: 0,
      };
    });
    startTransition(async () => {
      try {
        const res = await fetch("/api/notifications/read-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: category === "all" ? undefined : category }),
        });
        if (!res.ok) throw new Error("Request failed");
        toast.success("All notifications marked as read");
      } catch {
        // Restore from the cached value
        setFeed((prev) =>
          prev ? { ...prev, unreadCount: before } : prev,
        );
        toast.error("Failed to mark all as read");
      }
    });
  };

  const deleteOne = (id: string) => {
    const target = feed?.notifications.find((n) => n.id === id);
    const wasUnread = target && !target.readAt;
    setFeed((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.filter((n) => n.id !== id),
        total: Math.max(0, prev.total - 1),
        unreadCount: wasUnread
          ? Math.max(0, prev.unreadCount - 1)
          : prev.unreadCount,
      };
    });
    void fetch(`/api/notifications/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) toast.error("Failed to delete notification");
    });
  };

  const clearAll = () => {
    const before = feed ?? undefined;
    setFeed((prev) =>
      prev
        ? { ...prev, notifications: [], total: 0, unreadCount: 0 }
        : prev,
    );
    startTransition(async () => {
      try {
        const url = new URL("/api/notifications", window.location.origin);
        if (category !== "all") url.searchParams.set("category", category);
        const res = await fetch(url.toString(), { method: "DELETE" });
        if (!res.ok) throw new Error("Request failed");
        toast.success("Notifications cleared");
      } catch {
        setFeed(before ?? null);
        toast.error("Failed to clear notifications");
      }
    });
  };

  const go = (link: string | null, id: string) => {
    if (link) {
      router.push(link);
    } else {
      markRead(id);
    }
  };

  const notifications = feed?.notifications ?? [];
  const total = feed?.total ?? 0;
  const hasMore = notifications.length < total || page * PAGE_SIZE < total;

  // Tabs derive from status.
  const tabValue = status;

  return (
    <div className="border-default-200 rounded-xl border bg-background">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-xl font-bold">
            <BellRing className="h-5 w-5" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {unread > 0 ? (
              <>
                You have <span className="text-foreground font-medium">{unread}</span>{" "}
                unread notification{unread === 1 ? "" : "s"}
              </>
            ) : (
              "You're all caught up"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={isPending}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
          {total > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={clearAll}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 border-b p-5">
        <Tabs value={tabValue} onValueChange={(v) => applyFilters({ status: v as typeof status })}>
          <TabsList>
            <TabsTrigger value="all">
              All
              <span className="text-muted-foreground ml-1.5 text-xs">({total})</span>
            </TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              <span className="text-muted-foreground ml-1.5 text-xs">({unread})</span>
            </TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={category === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => applyFilters({ category: "all" })}
          >
            All categories
          </Button>
          {CATEGORY_IDS.filter((id) => byCategory[id]).map((id) => {
            const style = notificationCategoryStyle(id);
            const Icon = style.icon;
            return (
              <Button
                key={id}
                variant={category === id ? "secondary" : "ghost"}
                size="sm"
                className="text-muted-foreground gap-1.5"
                onClick={() => applyFilters({ category: id })}
              >
                <Icon className="h-3.5 w-3.5" />
                {style.label}
                <span className="text-xs opacity-60">{byCategory[id]}</span>
              </Button>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
          className="flex max-w-sm items-center gap-2"
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications..."
            className="h-9"
          />
          <Button type="submit" size="sm" variant="secondary">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* List */}
      <div className="min-h-64">
        {loading && notifications.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title="No notifications"
            description={
              appliedSearch
                ? "No notifications match your current filters."
                : "Notifications from every system event will appear here."
            }
          />
        ) : (
          <div>
            <div className="divide-y">
              {notifications.map((n) => {
                const isUnread = n.readAt == null;
                const style = notificationCategoryStyle(n.category);
                const Icon = style.icon;
                const day = formatFullDate(n.createdAt);
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "group flex cursor-pointer gap-3 p-4 transition-colors hover:bg-accent/40",
                      isUnread && "bg-primary/[0.04]",
                    )}
                    onClick={() => go(n.link, n.id)}
                  >
                    <span className={style.iconClassName}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {isUnread && (
                          <span className="bg-primary inline-block h-2 w-2 shrink-0 rounded-full" />
                        )}
                        <span
                          className={cn(
                            "text-foreground text-sm leading-snug",
                            isUnread && "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="text-muted-foreground ml-auto text-xs">
                          {formatRelative(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm leading-relaxed">
                          {n.body}
                        </p>
                      )}
                      <p className="text-muted-foreground/60 mt-1 text-xs">
                        {style.label} · {day}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {isUnread ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Mark as read"
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead(n.id);
                          }}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Mark as unread"
                          onClick={(e) => {
                            e.stopPropagation();
                            markUnread(n.id);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-7 w-7"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOne(n.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => applyFilters({ page: page - 1 })}
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-muted-foreground text-sm">
                Page {page}
                {hasMore ? ` of ${Math.ceil(total / PAGE_SIZE)}` : ""} · {total} total
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => applyFilters({ page: page + 1 })}
              >
                Next
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}