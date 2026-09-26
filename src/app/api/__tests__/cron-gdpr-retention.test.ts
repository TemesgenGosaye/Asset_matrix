import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/gdpr-retention", () => ({
  purgeExpiredAuditLogs: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { purgeExpiredAuditLogs } from "@/lib/gdpr-retention";
import { GET } from "../cron/gdpr-retention/route";

function createRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost:3000/api/cron/gdpr-retention", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/gdpr-retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 without auth header", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const res = await GET(createRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("purges audit logs with valid auth", async () => {
    vi.mocked(purgeExpiredAuditLogs).mockResolvedValue(42);

    const res = await GET(createRequest("Bearer test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.deletedAuditLogs).toBe(42);
  });

  it("returns 500 on error", async () => {
    vi.mocked(purgeExpiredAuditLogs).mockRejectedValue(new Error("DB error"));

    const res = await GET(createRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
  });
});
