import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAssignedStatusId,
  resolveAvailableStatusId,
} from "../asset-status-resolver";

const statusType = {
  findFirst: vi.fn(),
  create: vi.fn(),
};

const client = { statusType } as never;

beforeEach(() => {
  vi.clearAllMocks();
  statusType.create.mockImplementation(async ({ data }) => ({
    statustypeid: `created-${data.normalizedName}`,
  }));
});

describe("asset status resolver", () => {
  it("prefers Assigned over Active for assignment", async () => {
    statusType.findFirst.mockResolvedValueOnce({
      statustypeid: "assigned-id",
    });

    await expect(resolveAssignedStatusId(client, "org-1")).resolves.toBe(
      "assigned-id",
    );
    expect(statusType.create).not.toHaveBeenCalled();
  });

  it("uses Active when Assigned is missing instead of an alphabetical fallback", async () => {
    statusType.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ statustypeid: "active-id" });

    await expect(resolveAssignedStatusId(client, "org-1")).resolves.toBe(
      "active-id",
    );
    expect(statusType.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { statustypename: "asc" } }),
    );
  });

  it("creates an Assigned master only when neither Assigned nor Active exists", async () => {
    statusType.findFirst.mockResolvedValue(null);

    await expect(resolveAssignedStatusId(client, "org-1")).resolves.toBe(
      "created-assigned",
    );
    expect(statusType.create).toHaveBeenCalledWith({
      data: {
        statustypename: "Assigned",
        normalizedName: "assigned",
        isActive: true,
        organizationId: "org-1",
      },
      select: { statustypeid: true },
    });
  });

  it("creates an Available master when no available alias exists", async () => {
    statusType.findFirst.mockResolvedValue(null);

    await expect(resolveAvailableStatusId(client, null)).resolves.toBe(
      "created-available",
    );
    expect(statusType.create).toHaveBeenCalledWith({
      data: {
        statustypename: "Available",
        normalizedName: "available",
        isActive: true,
        organizationId: null,
      },
      select: { statustypeid: true },
    });
  });
});
