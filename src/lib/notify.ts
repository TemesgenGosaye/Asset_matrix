/**
 * Enterprise in-app notification hub.
 *
 * The single catch-all channel for *in-app* ("pull") notifications, fully
 * decoupled from the email queue (`notification_queue`). Every system event
 * should emit through `notify()`/`notifyUsers()` so the bell and the
 * Notification Center see one consistent, typed, de-duplicated feed.
 *
 * Server-only module (imports Prisma).
 */

import prisma from "./prisma";
import { logger } from "./logger";
import type { Prisma } from "@prisma/client";

/** Categories drive the icon + colour rendering on the client. */
export const NOTIFICATION_CATEGORIES = {
  asset: { label: "Assets" },
  licence: { label: "Licences" },
  maintenance: { label: "Maintenance" },
  stock: { label: "Stock" },
  ticket: { label: "Tickets" },
  reservation: { label: "Reservations" },
  request: { label: "Requests" },
  house: { label: "Houses" },
  access: { label: "Account" },
  system: { label: "System" },
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export interface NotifyInput {
  /** Recipients (user ids). */
  userIds: string[];
  /** Machine-readable event type, e.g. "license_expiry". */
  type: string;
  /** Display category, drives icon/colour. */
  category?: NotificationCategory;
  /** Short bold title. */
  title: string;
  /** Plain-text body (client strips HTML anyway). */
  body: string;
  /** Optional deep-link the user is routed to when the notification is opened. */
  link?: string;
  /** Optional lucide icon hint stored with the row (client maps category → icon by default). */
  icon?: string;
  /** Free-form JSON metadata. */
  metadata?: Record<string, unknown>;
  /**
   * De-duplication window (ms). When set, a notification of the same `type`
   * (+ same `link`) received within the window is skipped — prevents cron
   * spam. Default 0 = always write.
   */
  dedupeWindowMs?: number;
  /** Optional transaction client to keep the write atomic with caller work. */
  tx?: Prisma.TransactionClient;
}

const db = (tx?: Prisma.TransactionClient) => tx ?? prisma;

/**
 * Write in-app notifications for the given users. Never throws — notification
 * delivery must not break the triggering business operation.
 */
export async function notifyUsers(input: NotifyInput): Promise<number> {
  const {
    userIds,
    type,
    category = "system",
    title,
    body,
    link,
    icon,
    metadata,
    dedupeWindowMs = 0,
    tx,
  } = input;

  if (!userIds.length) return 0;

  try {
    const client = db(tx);

    // Check for existing notification of same type (+ link) inside the window.
    if (dedupeWindowMs > 0) {
      const cutoff = new Date(Date.now() - dedupeWindowMs);
      const existing = await client.app_notification.findFirst({
        where: {
          userId: { in: userIds },
          type,
          ...(link ? { link } : {}),
          createdAt: { gte: cutoff },
        },
        select: { id: true },
      });
      if (existing) return 0;
    }

    const data: Prisma.app_notificationCreateManyInput[] = userIds.map(
      (userId) => ({
        userId,
        type,
        category,
        title,
        body,
        link: link ?? null,
        icon: icon ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      }),
    );

    await client.app_notification.createMany({ data });
    return data.length;
  } catch (error) {
    logger.error("notifyUsers failed", { type, userIds: userIds.length, error });
    return 0;
  }
}

/** Notify every active admin in the app (used by cross-tenant/system events). */
export async function notifyAdmins(input: Omit<NotifyInput, "userIds">) {
  const admins = await prisma.user.findMany({
    where: { isadmin: true, isActive: true },
    select: { userid: true },
  });
  return notifyUsers({ ...input, userIds: admins.map((a) => a.userid) });
}

/** Notify every active admin within an organization. */
export async function notifyOrgAdmins(
  organizationId: string,
  input: Omit<NotifyInput, "userIds">,
) {
  const admins = await prisma.user.findMany({
    where: { organizationId, isadmin: true, isActive: true },
    select: { userid: true },
  });
  return notifyUsers({ ...input, userIds: admins.map((a) => a.userid) });
}

/** Mark a single notification read/unread (returns false if not owned). */
export async function setNotificationRead(
  userId: string,
  id: string,
  read: boolean,
): Promise<boolean> {
  const n = await prisma.app_notification.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!n) return false;
  await prisma.app_notification.update({
    where: { id },
    data: { readAt: read ? new Date() : null },
  });
  return true;
}

/** Mark every unread notification of the user as read. */
export async function markAllRead(
  userId: string,
  category?: NotificationCategory,
): Promise<number> {
  const result = await prisma.app_notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(category ? { category } : {}),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Unread count for the bell badge. */
export async function unreadCount(
  userId: string,
  category?: NotificationCategory,
): Promise<number> {
  return prisma.app_notification.count({
    where: {
      userId,
      readAt: null,
      ...(category ? { category } : {}),
    },
  });
}

export interface ListNotificationsParams {
  userId: string;
  status?: "unread" | "read" | "all";
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch notifications with filters + counts. Returns the page plus the
 * unread badge count and per-category totals for the filter chips.
 */
export async function listNotifications(params: ListNotificationsParams) {
  const { userId, status, category, search, limit = 20, offset = 0 } = params;

  const where: Prisma.app_notificationWhereInput = { userId };
  if (status === "unread") where.readAt = null;
  if (status === "read") where.readAt = { not: null };
  if (category && category !== "all") where.category = category;
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { body: { contains: q, mode: "insensitive" } },
    ];
  }

  const [notifications, total, unread] = await Promise.all([
    prisma.app_notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.app_notification.count({ where }),
    prisma.app_notification.count({ where: { userId, readAt: null } }),
  ]);

  // Per-category totals (respecting status/search where feasible).
  const groupBy = await prisma.app_notification.groupBy({
    by: ["category"],
    where: {
      userId,
      ...(status === "unread" ? { readAt: null } : {}),
      ...(status === "read" ? { readAt: { not: null } } : {}),
      ...(search && search.trim()
        ? {
            OR: [
              { title: { contains: search.trim(), mode: "insensitive" as const } },
              { body: { contains: search.trim(), mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { category: "desc" } },
  });

  const byCategory = Object.fromEntries(
    groupBy.map((g) => [g.category, g._count._all ?? 0]),
  );

  return {
    notifications,
    total,
    unread,
    byCategory,
    limit,
    offset,
  };
}

/** Remove a single notification the user owns. */
export async function deleteNotification(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.app_notification.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

/** Remove all (optionally category-filtered) notifications for the user. */
export async function deleteAllNotifications(
  userId: string,
  category?: string,
): Promise<number> {
  const result = await prisma.app_notification.deleteMany({
    where: { userId, ...(category && category !== "all" ? { category } : {}) },
  });
  return result.count;
}

/**
 * Prune stale read notifications (retention). Optional scheduled call.
 */
export async function pruneNotifications(
  olderThanDays = 60,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.app_notification.deleteMany({
    where: { readAt: { not: null, lt: cutoff } },
  });
  return result.count;
}