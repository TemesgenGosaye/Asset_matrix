import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    audit_logs: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/gdpr-settings", () => ({
  getGDPRSettings: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { getGDPRSettings } from "@/lib/gdpr-settings";
import { purgeExpiredAuditLogs } from "../gdpr-retention";

describe("purgeExpiredAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes audit logs older than retention period", async () => {
    vi.mocked(getGDPRSettings).mockReturnValue({
      auditLogRetentionDays: 365,
      deletedUserRetentionDays: 90,
      exportRetentionDays: 30,
      updatedAt: null,
    });
    vi.mocked(prisma.audit_logs.deleteMany).mockResolvedValue({ count: 42 });

    const result = await purgeExpiredAuditLogs();

    expect(result).toBe(42);
    expect(prisma.audit_logs.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date("2025-03-01T00:00:00Z"),
        },
      },
    });
  });

  it("uses custom retention period from settings", async () => {
    vi.mocked(getGDPRSettings).mockReturnValue({
      auditLogRetentionDays: 30,
      deletedUserRetentionDays: 90,
      exportRetentionDays: 30,
      updatedAt: null,
    });
    vi.mocked(prisma.audit_logs.deleteMany).mockResolvedValue({ count: 5 });

    const result = await purgeExpiredAuditLogs();

    expect(result).toBe(5);
    expect(prisma.audit_logs.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date("2026-01-30T00:00:00Z"),
        },
      },
    });
  });

  it("returns 0 when no logs to purge", async () => {
    vi.mocked(getGDPRSettings).mockReturnValue({
      auditLogRetentionDays: 365,
      deletedUserRetentionDays: 90,
      exportRetentionDays: 30,
      updatedAt: null,
    });
    vi.mocked(prisma.audit_logs.deleteMany).mockResolvedValue({ count: 0 });

    const result = await purgeExpiredAuditLogs();
    expect(result).toBe(0);
  });
});
